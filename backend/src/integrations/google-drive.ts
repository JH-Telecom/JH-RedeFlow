import { google } from 'googleapis';
import { listCalls, updateCall } from '../store.js';
import type { Call, EditableCallFields, User } from '../types.js';
import { parseImport } from '../imports/parser.js';

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

function rowSignature(row: DriveRow) {
  const identity = [
    value(row, 'Ordem de Serviço', 'OS', 'Ordem', 'Nº OS', 'Numero OS'),
    value(row, 'BDESK', 'BDesk'),
    value(row, 'Office Track', 'OS OT', 'OT'),
    value(row, 'Status da Atividade', 'Status'),
    value(row, 'Tipo de Atividade', 'Tipo'),
    value(row, 'Motivo de Encerramento das atividades', 'Motivo de Encerramento', 'Motivo'),
    value(row, 'Data'),
    value(row, 'Fim'),
  ].join('|');
  return normalizeOrder(identity) || identity.trim();
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
    value(row, 'Ordem de Serviço', 'OS', 'Ordem', 'Nº OS', 'Numero OS'),
    value(row, 'BDESK', 'BDesk'),
    value(row, 'Office Track', 'OS OT', 'OT'),
    value(row, 'OS Casa Cliente', 'OS Casa Cliente'),
    value(row, 'Contrato', 'Numero do Contrato'),
    value(row, 'Número do Cliente', 'Numero do Cliente', 'Cliente'),
  ].map((entry) => normalizeOrder(entry)).filter(Boolean);
}

function matchesCall(call: Call, row: DriveRow) {
  const keys = buildRowIdentifiers(row);
  if (!keys.length) return false;
  const callKeys = [call.orderNumber, call.bdesk, call.officeTrack].map((candidate) => normalizeOrder(candidate)).filter(Boolean);
  return keys.some((key) => callKeys.includes(key));
}

function normalizeDriveStatus(valueText: string) {
  const status = normalize(valueText);
  if (!status) return 'desconhecido';
  if (['concluido', 'finalizado', 'encerrado', 'executado', 'fechado', 'ok', 'resolved', 'resolvedo'].includes(status)) return 'finalizado';
  if (['cancelado', 'cancelada', 'canceled'].includes(status)) return 'cancelado';
  if (['pendente', 'aberto', 'ativo', 'em andamento', 'em progresso'].includes(status)) return 'aberto';
  return status;
}

function buildDriveUpdate(row: DriveRow, existing: Call) {
  const statusText = normalizeDriveStatus(value(row, 'Status da Atividade', 'Status'));
  const activityType = value(row, 'Tipo de Atividade', 'Tipo');
  const resultValue = value(row, 'Motivo de Encerramento das atividades', 'Motivo de Encerramento', 'Motivo');
  const rawRegion = value(row, 'Regiao', 'Região', 'Regiao Atual', 'Região Atual');
  const rawCity = value(row, 'Cidade', 'Municipio', 'Município');
  const rawType = activityType || existing.type;
  const nextStatus: 'Aberto' | 'Finalizado' | 'Cancelado' | undefined = statusText === 'finalizado' ? 'Finalizado' : statusText === 'cancelado' ? 'Cancelado' : statusText === 'aberto' ? 'Aberto' : undefined;
  const executedAt = parseFinishedAt(value(row, 'Data'), value(row, 'Fim')) || existing.executedAt;
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
    region: rawRegion || existing.region,
    city: rawCity || existing.city,
    notes,
  };

  if (nextStatus) changes.status = nextStatus;
  if (executedAt) changes.executedAt = executedAt;
  if (resultValue) changes.result = resultValue;

  const order = value(row, 'Ordem de Serviço', 'OS', 'Ordem', 'Nº OS', 'Numero OS');
  if (order) {
    const candidate = /^bdesk[-\s]/i.test(order) ? { bdesk: order } : { orderNumber: order };
    Object.assign(changes, candidate);
  }

  return changes;
}

function hasMeaningfulCallChange(existing: Call, candidate: Partial<EditableCallFields>) {
  const fieldsToCompare = ['orderNumber', 'bdesk', 'officeTrack', 'type', 'reason', 'region', 'city', 'olt', 'slotPon', 'status', 'executedAt', 'result', 'notes'] as const;
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
  skipped: number;
  errors: string[];
};

export async function syncCallsFromDrive(): Promise<DriveSyncResult> {
  const drive = getDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || defaultFolderId;
  const response = await drive.files.list({ q: `'${folderId}' in parents and trashed = false and mimeType = 'text/csv'`, fields: 'files(id,name,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: 1000 });
  const files = response.data.files || [];
  const calls = await listCalls();
  const seenRows = new Set<string>();
  const result: DriveSyncResult = { files: files.length, rows: 0, processed: 0, newRecords: 0, updated: 0, finalised: 0, cancelled: 0, unchanged: 0, skipped: 0, errors: [] };

  for (const file of files) {
    if (!file.id || !file.name) continue;
    try {
      const media = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
      const base64 = Buffer.from(media.data as ArrayBuffer).toString('base64');
      const parsed = parseImport(file.name, base64);

      for (const row of parsed.rows as DriveRow[]) {
        result.rows += 1;
        const signature = rowSignature(row);
        if (!signature || seenRows.has(signature)) {
          result.unchanged += 1;
          continue;
        }
        seenRows.add(signature);

        const statusText = normalize(value(row, 'Status da Atividade', 'Status'));
        const activityType = normalize(value(row, 'Tipo de Atividade', 'Tipo'));
        const reason = normalize(value(row, 'Motivo de Encerramento das atividades', 'Motivo de Encerramento', 'Motivo'));
        if (!validActivityTypes.has(activityType) || statusText === 'pendente' || reason.includes('nao cumprimento')) {
          result.skipped += 1;
          continue;
        }

        const matchingCall = calls.find((candidate) => matchesCall(candidate, row));
        if (!matchingCall) {
          result.skipped += 1;
          continue;
        }

        const update = buildDriveUpdate(row, matchingCall);
        if (!hasMeaningfulCallChange(matchingCall, update)) {
          result.unchanged += 1;
          continue;
        }

        const finalisedStatus = update.status === 'Finalizado';
        const cancelledStatus = update.status === 'Cancelado';
        const updatedCall = await updateCall(matchingCall.id, update, systemActor);
        if (!updatedCall) {
          result.skipped += 1;
          continue;
        }

        result.processed += 1;
        result.updated += 1;
        if (finalisedStatus) result.finalised += 1;
        if (cancelledStatus) result.cancelled += 1;
      }
    } catch (error) {
      result.errors.push(`${file.name}: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    }
  }

  result.newRecords = 0;
  return result;
}
