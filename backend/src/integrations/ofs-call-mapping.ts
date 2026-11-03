// Mapeamento de linhas do relatorio de atividades do OFS para chamados (criar/atualizar/finalizar).
// Veio da antiga sincronizacao do Google Drive (removida em 2026-11-03): os dados agora chegam pela extensao da Rede.
import { createHash, randomUUID } from 'node:crypto';
import type { DriveCallSource } from '../store.js';
import type { Call, EditableCallFields } from '../types.js';
import { inferNeighborhood, resolveOltRegion } from './wuzapi/noc-consolidation.js';

const validActivityTypes = new Set(['manutencao corretiva de rede', 'manutencao de rede field', 'reparo corretivo', 'acionamento field', 'noc acesso', 'noc access', 'noc tx', 'noc backbone']);

type DriveRow = Record<string, string>;

function normalize(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function normalizeHeader(value: unknown) {
  return normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeOrder(value: unknown) {
  return normalize(value).replace(/^bdesk[-\s]*/, '').replace(/[^a-z0-9]/g, '');
}

function value(row: DriveRow, ...headers: string[]) {
  for (const header of headers) {
    if (row[header] !== undefined && row[header] !== null && String(row[header]).trim() !== '') return String(row[header]).trim();
  }
  const aliases = new Set(headers.map(normalizeHeader));
  const match = Object.entries(row).find(([header, content]) => aliases.has(normalizeHeader(header)) && content !== null && String(content).trim() !== '');
  return match ? String(match[1]).trim() : '';
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

export function buildRowIdentifiers(row: DriveRow) {
  return [
    ['os', value(row, 'Ordem de Serviço', 'Ordem de Servico', 'Número da Ordem', 'Numero da Ordem', 'OS', 'Ordem', 'Nº OS', 'Número OS', 'Numero OS')],
    ['bdesk', value(row, 'BDESK', 'BDesk')],
    ['office-track', value(row, 'Office Track', 'OS OT', 'OT')],
    ['os-casa-cliente', value(row, 'OS Casa Cliente')],
    ['contrato', value(row, 'Contrato', 'Numero do Contrato')],
    ['cliente', value(row, 'Número do Cliente', 'Numero do Cliente', 'Cliente')],
  ].map(([kind, raw]) => ({ kind, raw, normalized: normalizeOrder(raw) })).filter((entry) => entry.normalized);
}

export function buildRowIdentity(row: DriveRow) {
  const identifiers = buildRowIdentifiers(row);
  const primary = identifiers[0];
  return primary ? `${primary.kind}:${primary.normalized}` : '';
}

export function getCallIdentifiers(call: Call) {
  return [call.orderNumber, call.bdesk, call.officeTrack, ...(call.sourceIdentifiers || [])].map((candidate) => normalizeOrder(candidate)).filter(Boolean);
}

export function indexCallIdentifiers(calls: Call[]) {
  const index = new Map<string, Call>();
  for (const call of calls) {
    for (const identifier of getCallIdentifiers(call)) {
      if (!index.has(identifier)) index.set(identifier, call);
    }
  }
  return index;
}

export function addCallIdentifiers(index: Map<string, Call>, call: Call) {
  for (const identifier of getCallIdentifiers(call)) {
    if (!index.has(identifier)) index.set(identifier, call);
  }
}

export function removeCallIdentifiers(index: Map<string, Call>, call: Call) {
  for (const identifier of getCallIdentifiers(call)) {
    if (index.get(identifier)?.id === call.id) index.delete(identifier);
  }
}

export function findMatchingCall(index: Map<string, Call>, row: DriveRow) {
  for (const { normalized } of buildRowIdentifiers(row)) {
    const call = index.get(normalized);
    if (call) return call;
  }
  return undefined;
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
  const explicitNeighborhood = normalizeNeighborhood(value(row, 'Bairro', 'Bairro do Cliente', 'Bairro Cliente', 'Neighborhood', 'District'), city);
  if (!address || !city) return { address, bairro: explicitNeighborhood, city };

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

  const neighborhood = explicitNeighborhood || normalizeNeighborhood(parts[cityIndex - 1], city) || inferNeighborhood(address) || '';
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

export function isDriveRowEligible(row: DriveRow) {
  return driveRowSkipReason(row) === undefined;
}

export type DriveRowSkipReason = 'unsupported-activity' | 'pending' | 'non-compliance';
export function driveRowSkipReason(row: DriveRow): DriveRowSkipReason | undefined {
  const statusText = normalize(value(row, 'Status da Atividade', 'Status'));
  const activityType = normalize(value(row, 'Tipo de Atividade', 'Tipo'));
  const reason = normalize(value(row, 'Motivo de Encerramento das atividades', 'Motivo de Encerramento', 'Motivo'));
  if (!validActivityTypes.has(activityType) && !activityType.includes('field')) return 'unsupported-activity';
  if (statusText === 'pendente') return 'pending';
  if (reason.includes('nao cumprimento')) return 'non-compliance';
  return undefined;
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

export function buildDriveSource(row: DriveRow, fileId: string, fileName: string): DriveCallSource {
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
  const openingDate = parseReferenceDate(value(row, 'Data Abertura', 'Data de Abertura'));
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

  if (openingDate) changes.openedAt = `${openingDate}T00:00:00-03:00`;

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
  const fieldsToCompare = ['orderNumber', 'bdesk', 'officeTrack', 'client', 'type', 'reason', 'region', 'city', 'address', 'bairro', 'ofsStatus', 'olt', 'slotPon', 'status', 'openedAt', 'executedAt', 'result', 'cancellationReason', 'notes'] as const;
  for (const field of fieldsToCompare) {
    const current = String(existing[field] ?? '');
    const next = String(candidate[field] ?? '');
    if (current !== next) return true;
  }
  return false;
}

export function shouldSkipDriveUpdate(existing: Call, fingerprint: string, candidate: Partial<EditableCallFields>) {
  return existing.source === 'google-drive'
    && existing.sourceFingerprint === fingerprint
    && !hasMeaningfulCallChange(existing, candidate);
}
