import { google } from 'googleapis';
import { listCalls, updateCall } from '../store.js';
import type { Call, User } from '../types.js';
import { parseImport } from '../imports/parser.js';

const defaultFolderId = '1m9m2atkUrxwb2v9xzTLgqebOQ4GQJue-';
const validActivityTypes = new Set(['manutencao corretiva de rede', 'manutencao de rede field', 'reparo corretivo']);
const systemActor: User = { id: 'system-google-drive', name: 'Google Drive - Base D-1', email: 'system@jhtelecom.com', roleId: 'system', active: true, createdAt: new Date(0).toISOString() };

type DriveRow = Record<string, string>;

function normalize(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function normalizeOrder(value: unknown) {
  return normalize(value).replace(/^bdesk[-\s]*/, '').replace(/[^a-z0-9]/g, '');
}

function value(row: DriveRow, header: string) {
  return row[header] ?? '';
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

function matchesCall(call: Call, order: string) {
  const key = normalizeOrder(order);
  return Boolean(key) && [call.orderNumber, call.bdesk, call.officeTrack].some((candidate) => normalizeOrder(candidate) === key);
}

export type DriveSyncResult = { files: number; rows: number; updated: number; skipped: number; errors: string[] };

export async function syncCallsFromDrive(): Promise<DriveSyncResult> {
  const drive = getDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || defaultFolderId;
  const response = await drive.files.list({ q: `'${folderId}' in parents and trashed = false and mimeType = 'text/csv'`, fields: 'files(id,name,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: 1000 });
  const files = response.data.files || [];
  const calls = await listCalls();
  const result: DriveSyncResult = { files: files.length, rows: 0, updated: 0, skipped: 0, errors: [] };

  for (const file of files) {
    if (!file.id || !file.name) continue;
    try {
      const media = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
      const base64 = Buffer.from(media.data as ArrayBuffer).toString('base64');
      const parsed = parseImport(file.name, base64);
      for (const row of parsed.rows as DriveRow[]) {
        result.rows += 1;
        const status = normalize(value(row, 'Status da Atividade'));
        const activityType = normalize(value(row, 'Tipo de Atividade'));
        const reason = normalize(value(row, 'Motivo de Encerramento das atividades'));
        if (!validActivityTypes.has(activityType) || status === 'pendente' || reason.includes('nao cumprimento')) { result.skipped += 1; continue; }
        const order = value(row, 'Ordem de Serviço');
        const call = calls.find((candidate) => matchesCall(candidate, order));
        if (!call) { result.skipped += 1; continue; }
        const executedAt = parseFinishedAt(value(row, 'Data'), value(row, 'Fim'));
        if (!executedAt) { result.skipped += 1; continue; }
        const resultValue = value(row, 'Motivo de Encerramento das atividades');
        const orderUpdate = /^bdesk[-\s]/i.test(order) ? { bdesk: order } : { orderNumber: order };
        const updated = await updateCall(call.id, { ...orderUpdate, executedAt, result: resultValue || undefined, status: 'Finalizado', notes: reason ? `${call.notes}\nMotivo de encerramento: ${resultValue}`.trim() : call.notes }, systemActor);
        if (updated) result.updated += 1;
      }
    } catch (error) {
      result.errors.push(`${file.name}: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    }
  }
  return result;
}
