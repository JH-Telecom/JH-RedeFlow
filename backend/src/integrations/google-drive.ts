import { google } from 'googleapis';
import { createHash, randomUUID } from 'node:crypto';
import { createDriveCall, listCalls, recordDriveCallSnapshot, recordDriveSyncRun, updateCall, type DriveCallSource } from '../store.js';
import type { Call, EditableCallFields, User } from '../types.js';
import { parseImport } from '../imports/parser.js';
import { inferNeighborhood, resolveOltRegion } from './wuzapi/noc-consolidation.js';

const defaultFolderId = '1m9m2atkUrxwb2v9xzTLgqebOQ4GQJue-';
const validActivityTypes = new Set(['manutencao corretiva de rede', 'manutencao de rede field', 'reparo corretivo']);
const systemActor: User = { id: 'system-google-drive', name: 'Google Drive - Base histórica operacional', email: 'system@jhtelecom.com', roleId: 'system', active: true, createdAt: new Date(0).toISOString() };

type DriveRow = Record<string, string>;

function normalize(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function normalizeOrder(value: unknown) {
  return normalize(value).replace(/^bdesk[-\s]*/, '').replace(/[^a-z0-9]/g, '');
}

function value(row: DriveRow, ...headers: string[]) {
  for (const header of headers) {
    if (row[header] !== undefined && row[header] !== null && String(row[header]).trim() !== '') return String(row[header]).trim();
  }
  return '';
}

function rowFingerprint(row: DriveRow) {
  const canonical = Object.fromEntries(Object.entries(row).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key.trim(), String(entry).trim()]));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function parseFinishedAt(dateValue: string, timeValue: string) {
  const date = dateValue.trim();
  const time = timeValue.trim();
  const dateMatch = date.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  const timeMatch = time.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!dateMatch || !timeMatch) return undefined;
  const year = Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[1]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return undefined;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}-03:00`;
}

function getDriveClient() {
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawCredentials) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON nao configurada.');
  const credentials = JSON.parse(rawCredentials) as { client_email: string; private_key: string };
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  return google.drive({ version: 'v3', auth });
}

function buildRowIdentifiers(row: DriveRow) {
  return [
    ['os', value(row, 'Ordem de Serviço', 'Ordem de Servico', 'Número da Ordem', 'Numero da Ordem', 'OS', 'Ordem', 'Nº OS', 'Número OS', 'Numero OS')],
    ['bdesk', value(row, 'BDESK', 'BDesk')],
    ['office-track', value(row, 'Office Track', 'OS OT', 'OT')],
    ['os-casa-cliente', value(row, 'OS Casa Cliente')],
    ['contrato', value(row, 'Contrato', 'Numero do Contrato')],
    ['cliente', value(row, 'Número do Cliente', 'Numero do Cliente', 'Cliente')],
  ].map(([kind, raw]) => ({ kind, raw, normalized: normalizeOrder(raw) })).filter((entry) => entry.normalized);
}

function buildRowIdentity(row: DriveRow) {
  const identifiers = buildRowIdentifiers(row);
  const primary = identifiers[0];
  return primary ? `${primary.kind}:${primary.normalized}` : '';
}

function matchesCall(call: Call, row: DriveRow) {
  const keys = buildRowIdentifiers(row).map((entry) => entry.normalized);
  if (!keys.length) return false;
  const callKeys = [call.orderNumber, call.bdesk, call.officeTrack, ...(call.sourceIdentifiers || [])].map((candidate) => normalizeOrder(candidate)).filter(Boolean);
  return keys.some((key) => callKeys.includes(key));
}

function parseReferenceDate(dateValue: string) {
  const match = dateValue.trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!match) return undefined;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const month = Number(match[2]);
  const day = Number(match[1]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function normalizeNeighborhood(valueText: string, city: string) {
  const candidate = valueText.replace(/^\d+[A-Z]?\s*/i, '').trim();
  const normalized = candidate.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const normalizedCity = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!normalized || normalized === normalizedCity || /^\d+$/.test(normalized) || /^(?:SP|UF|CEP|APTO|APARTAMENTO|BLOCO|BL|N\/A|NA|SEM BAIRRO)$/i.test(normalized)) return '';
  return normalized;
}

function parseDriveLocation(row: DriveRow) {
  const rawAddress = value(row, 'Endereço', 'Endereco', 'Endereço do Cliente', 'Endereco do Cliente', 'Endereço de Instalação', 'Endereco de Instalacao', 'Endereco da OS', 'Endereço OS');
  let address = rawAddress.replace(/^CLT[_\s-]*/i, '').replace(/\s+/g, ' ').trim();
  const duplicateStreetPrefix = /^(RUA|AVENIDA|AV\.?|ALAMEDA|TRAVESSA|ESTRADA|RODOVIA)\s+\1\b/i;
  while (duplicateStreetPrefix.test(address)) address = address.replace(duplicateStreetPrefix, '$1').trim();

  let city = value(row, 'Cidade', 'Municipio', 'Município', 'City');
  const state = value(row, 'Estado', 'UF', 'Estado UF');
  const suffix = address.match(/,\s*([^,]+?)\s*-\s*([A-Z]{2})\s*$/i);
  const normalizedCity = normalize(city);
  if ((!city || ['nao informada', 'nao informado', 'n/a', 'na'].includes(normalizedCity)) && suffix) city = suffix[1].trim();
  if (!address || !city) return { address, bairro: '', city };

  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  const normalizedCityName = normalizeOrder(city);
  const normalizedState = normalizeOrder(state || suffix?.[2] || '');
  let cityIndex = -1;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    const normalizedPart = normalizeOrder(part);
    if (normalizedPart === normalizedCityName || (normalizedPart.startsWith(normalizedCityName) && (!normalizedState || normalizedPart.endsWith(normalizedState)))) {
      cityIndex = index;
      break;
    }
  }
  if (cityIndex < 1) return { address, bairro: '', city };

  const neighborhood = normalizeNeighborhood(parts[cityIndex - 1], city) || inferNeighborhood(address) || '';
  return { address, bairro: neighborhood, city };
}

function normalizeDriveStatus(valueText: string) {
  const status = normalize(valueText);
  if (!status) return 'desconhecido';
  if (['concluido', 'finalizado', 'encerrado', 'executado', 'fechado', 'ok', 'resolved', 'resolvedo'].includes(status)) return 'finalizado';
  if (['cancelado', 'cancelada', 'canceled'].includes(status)) return 'cancelado';
  if (['pendente', 'aberto', 'ativo', 'em andamento', 'em progresso'].includes(status)) return 'aberto';
  return status;
}

export function buildDriveCall(row: DriveRow): Call | undefined {
  const identifiers = buildRowIdentifiers(row);
  const primary = identifiers[0];
  if (!primary) return undefined;
  const statusText = normalizeDriveStatus(value(row, 'Status da Atividade', 'Status'));
  const status: Call['status'] | undefined = statusText === 'finalizado' ? 'Finalizado' : statusText === 'cancelado' ? 'Cancelado' : statusText === 'aberto' ? 'Aberto' : undefined;
  if (!status) return undefined;

  const order = value(row, 'Ordem de Serviço', 'Ordem de Servico', 'Número da Ordem', 'Numero da Ordem', 'OS', 'Ordem', 'Nº OS', 'Número OS', 'Numero OS');
  const bdesk = value(row, 'BDESK', 'BDesk');
  const officeTrack = value(row, 'Office Track', 'OfficeTrack', 'OS OT', 'OT');
  const orderNumber = order || (bdesk ? `BDESK-${bdesk}` : '') || officeTrack || primary.raw;
  const type = value(row, 'Tipo de Atividade', 'Tipo');
  const isField = normalize(type).includes('field');
  const location = parseDriveLocation(row);
  const olt = value(row, 'OLT');
  const referenceDate = parseReferenceDate(value(row, 'Data Abertura', 'Data de Abertura', 'Data'));
  const ofsStatus = value(row, 'Status OFS', 'OFS Status', 'Status da Atividade OFS', 'Status da Atividade');
  const result = value(row, 'Motivo de Encerramento das atividades', 'Motivo de Encerramento', 'Motivo');
  const executedAt = parseFinishedAt(value(row, 'Data', 'Data-Fim', 'Data Fim', 'Data de Finalizacao', 'Data de Finalização'), value(row, 'Fim', 'Hora Fim', 'Horário Fim', 'Horario Fim'));

  return {
    id: randomUUID(), orderNumber, bdesk, officeTrack,
    client: isField ? value(row, 'Nome', 'Nome do Cliente', 'Cliente', 'Assinante') : value(row, 'Nome do Cliente', 'Cliente', 'Assinante'),
    type,
    reason: value(row, 'Motivo', 'Motivo de Encerramento das atividades', 'Motivo de Encerramento'),
    region: resolveOltRegion(olt).region || value(row, 'Regiao', 'Região', 'Regiao Atual', 'Região Atual', 'Regiao Operacional', 'Região Operacional'),
    city: location.city,
    address: location.address, bairro: location.bairro,
    ofsStatus: ofsStatus || undefined,
    olt, slotPon: value(row, 'Slot/PON', 'Slot PON', 'Placa/PON', 'Placa PON', 'PON'),
    status, openedAt: referenceDate ? `${referenceDate}T00:00:00-03:00` : new Date().toISOString(),
    executedAt, result: result || undefined, cancellationReason: status === 'Cancelado' ? result || undefined : undefined,
    notes: result || 'Importado da base historica do Google Drive.',
    source: 'google-drive', sourceIdentity: buildRowIdentity(row), sourceIdentifiers: identifiers.map((entry) => entry.normalized),
  };
}

function buildDriveSource(row: DriveRow, fileId: string, fileName: string): DriveCallSource {
  return {
    identity: buildRowIdentity(row),
    identifiers: buildRowIdentifiers(row).map((entry) => entry.normalized),
    fileId,
    fileName,
    referenceDate: parseReferenceDate(value(row, 'Data')),
    fingerprint: rowFingerprint(row),
    payload: row,
  };
}

export function buildDriveUpdate(row: DriveRow, existing: Call) {
  const statusText = normalizeDriveStatus(value(row, 'Status da Atividade', 'Status'));
  const activityType = value(row, 'Tipo de Atividade', 'Tipo');
  const resultValue = value(row, 'Motivo de Encerramento das atividades', 'Motivo de Encerramento', 'Motivo');
  const rawRegion = value(row, 'Regiao', 'Região', 'Regiao Atual', 'Região Atual', 'Regiao Operacional', 'Região Operacional');
  const location = parseDriveLocation(row);
  const rawCity = location.city || value(row, 'Cidade', 'Municipio', 'Município', 'City');
  const olt = value(row, 'OLT') || existing.olt;
  const ofsStatus = value(row, 'Status OFS', 'OFS Status', 'Status da Atividade OFS', 'Status da Atividade');
  const rawType = activityType || existing.type;
  const nextStatus: 'Aberto' | 'Finalizado' | 'Cancelado' | undefined = statusText === 'finalizado' ? 'Finalizado' : statusText === 'cancelado' ? 'Cancelado' : statusText === 'aberto' ? 'Aberto' : undefined;
  const executedAt = parseFinishedAt(value(row, 'Data', 'Data-Fim', 'Data Fim', 'Data de Finalizacao', 'Data de Finalização'), value(row, 'Fim', 'Hora Fim', 'Horário Fim', 'Horario Fim')) || existing.executedAt;
  const notes = (() => {
    if (!resultValue) return existing.notes;
    const normalizedResult = resultValue.trim();
    if (!normalizedResult) return existing.notes;
    if (existing.notes.toLowerCase().includes(normalizedResult.toLowerCase())) return existing.notes;
    return existing.notes ? `${existing.notes}\n${normalizedResult}` : normalizedResult;
  })();

  const changes: Partial<EditableCallFields> = {
    type: rawType || existing.type,
    reason: value(row, 'Motivo', 'Motivo de Encerramento das atividades', 'Motivo de Encerramento') || existing.reason,
    region: resolveOltRegion(olt).region || rawRegion || existing.region,
    city: rawCity || existing.city,
    address: location.address || existing.address || '',
    bairro: location.bairro || existing.bairro || '',
    ofsStatus: ofsStatus || existing.ofsStatus,
    olt,
    slotPon: value(row, 'Slot/PON', 'Slot PON', 'Placa/PON', 'Placa PON', 'PON') || existing.slotPon,
    notes,
  };

  if (normalize(rawType).includes('field')) {
    const clientName = value(row, 'Nome', 'Nome do Cliente', 'Cliente', 'Assinante');
    if (clientName) changes.client = clientName;
  }

  if (nextStatus) changes.status = nextStatus;
  if (executedAt) changes.executedAt = executedAt;
  if (resultValue) changes.result = resultValue;
  if (nextStatus === 'Cancelado') changes.cancellationReason = resultValue || value(row, 'Motivo de Cancelamento', 'Motivo Cancelamento');
  else if (nextStatus) changes.cancellationReason = null;

  const order = value(row, 'Ordem de Serviço', 'Ordem de Servico', 'Número da Ordem', 'Numero da Ordem', 'OS', 'Ordem', 'Nº OS', 'Número OS', 'Numero OS');
  const bdesk = value(row, 'BDESK', 'BDesk');
  const officeTrack = value(row, 'Office Track', 'OfficeTrack', 'OS OT', 'OT');
  if (order) changes.orderNumber = order;
  if (bdesk) changes.bdesk = bdesk;
  if (officeTrack) changes.officeTrack = officeTrack;

  return changes;
}

export function hasMeaningfulCallChange(existing: Call, candidate: Partial<EditableCallFields>) {
  const fieldsToCompare = ['orderNumber', 'bdesk', 'officeTrack', 'client', 'type', 'reason', 'region', 'city', 'address', 'bairro', 'ofsStatus', 'olt', 'slotPon', 'status', 'executedAt', 'result', 'cancellationReason', 'notes'] as const;
  for (const field of fieldsToCompare) {
    const current = String(existing[field] ?? '');
    const next = String(candidate[field] ?? '');
    if (current !== next) return true;
  }
  return false;
}

export type DriveSyncResult = {
  files: number;
  rows: number;
  processed: number;
  newRecords: number;
  updated: number;
  finalised: number;
  cancelled: number;
  unchanged: number;
  unmatched: number;
  skipped: number;
  errors: string[];
};

export async function syncCallsFromDrive(): Promise<DriveSyncResult> {
  const startedAt = new Date().toISOString();
  const drive = getDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || defaultFolderId;
  const files: Array<{ id?: string | null; name?: string | null; modifiedTime?: string | null }> = [];
  let pageToken: string | undefined;
  do {
    const response = await drive.files.list({ q: `'${folderId}' in parents and trashed = false and mimeType = 'text/csv'`, fields: 'nextPageToken,files(id,name,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: 1000, pageToken });
    files.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  const result: DriveSyncResult = { files: files.length, rows: 0, processed: 0, newRecords: 0, updated: 0, finalised: 0, cancelled: 0, unchanged: 0, unmatched: 0, skipped: 0, errors: [] };
  const stagedRows = new Map<string, { row: DriveRow; fileId: string; fileName: string }>();

  for (const file of [...files].reverse()) {
    if (!file.id || !file.name) continue;
    try {
      const media = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
      const base64 = Buffer.from(media.data as ArrayBuffer).toString('base64');
      const parsed = parseImport(file.name, base64);

      for (const row of parsed.rows as DriveRow[]) {
        result.rows += 1;
        const identity = buildRowIdentity(row);
        if (!identity) {
          result.unmatched += 1;
          continue;
        }
        if (stagedRows.has(identity)) {
          result.unchanged += 1;
        }
        stagedRows.set(identity, { row, fileId: file.id, fileName: file.name });
      }
    } catch (error) {
      result.errors.push(`${file.name}: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    }
  }

  const calls = await listCalls();
  for (const { row, fileId, fileName } of stagedRows.values()) {
    const statusText = normalize(value(row, 'Status da Atividade', 'Status'));
    const activityType = normalize(value(row, 'Tipo de Atividade', 'Tipo'));
    const reason = normalize(value(row, 'Motivo de Encerramento das atividades', 'Motivo de Encerramento', 'Motivo'));
    if (!validActivityTypes.has(activityType) || statusText === 'pendente' || reason.includes('nao cumprimento')) {
      result.skipped += 1;
      continue;
    }

    const sourceData = buildDriveSource(row, fileId, fileName);
    let matchingCall = calls.find((candidate) => matchesCall(candidate, row));
    if (!matchingCall) {
      const importedCall = buildDriveCall(row);
      if (!importedCall) {
        result.unmatched += 1;
        continue;
      }
      const created = await createDriveCall(importedCall, sourceData);
      matchingCall = created.call;
      if (created.created) {
        calls.push(matchingCall);
        result.processed += 1;
        result.newRecords += 1;
        if (matchingCall.status === 'Finalizado') result.finalised += 1;
        if (matchingCall.status === 'Cancelado') result.cancelled += 1;
        continue;
      }
    }

    if (matchingCall.source === 'google-drive' && matchingCall.sourceFingerprint === sourceData.fingerprint) {
      result.unchanged += 1;
      continue;
    }

    const update = buildDriveUpdate(row, matchingCall);
    const previousStatus = matchingCall.status;
    let updatedCall = matchingCall;
    if (hasMeaningfulCallChange(matchingCall, update)) {
      const persistedCall = await updateCall(matchingCall.id, update, systemActor);
      if (!persistedCall) {
        result.skipped += 1;
        continue;
      }
      updatedCall = persistedCall;
    }
    await recordDriveCallSnapshot(matchingCall.id, sourceData);
    const sourcedCall: Call = { ...updatedCall, source: 'google-drive', sourceIdentity: sourceData.identity, sourceIdentifiers: sourceData.identifiers, sourceFileId: sourceData.fileId, sourceFileName: sourceData.fileName, sourceReferenceDate: sourceData.referenceDate, sourceFingerprint: sourceData.fingerprint, sourceProcessedAt: new Date().toISOString() };
    const callIndex = calls.findIndex((candidate) => candidate.id === matchingCall!.id);
    if (callIndex >= 0) calls[callIndex] = sourcedCall;

    result.processed += 1;
    result.updated += 1;
    if (previousStatus !== 'Finalizado' && sourcedCall.status === 'Finalizado') result.finalised += 1;
    if (previousStatus !== 'Cancelado' && sourcedCall.status === 'Cancelado') result.cancelled += 1;
  }

  await recordDriveSyncRun(startedAt, result);
  return result;
}
