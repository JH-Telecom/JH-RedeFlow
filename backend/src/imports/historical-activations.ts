import { createHash } from 'node:crypto';
import XLSX from 'xlsx';
import type { Call } from '../types.js';
import { extractOperationalData } from '../integrations/wuzapi/client.js';
import { analyzeOperationalMessage } from '../integrations/wuzapi/semantic.js';
import { resolveOltRegion } from '../integrations/wuzapi/noc-consolidation.js';

export type HistoricalActivationCandidate = {
  rowNumber: number;
  identifiers: string[];
  fingerprint: string;
  call: Call;
};

export type HistoricalActivationConflict = {
  orderNumber: string;
  rows: { rowNumber: number; openedAt: string; assignedAt?: string; executedAt: string }[];
};

export type HistoricalActivationPreview = {
  sheetName: string;
  totalRows: number;
  candidates: HistoricalActivationCandidate[];
  duplicatesWithinFile: number;
  conflictingOrders: number;
  conflicts: HistoricalActivationConflict[];
  missingOpeningDate: number;
  missingFinishedDate: number;
  missingOrder: number;
  missingReason: number;
  missingOlt: number;
  missingTechnician: number;
  byType: Record<string, number>;
};

function normalizeHeader(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeHistoricalIdentifier(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseWorkbookDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return undefined;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H + 3, parsed.M, parsed.S)).toISOString();
  }
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const text = value.trim();
  const localDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (localDate) {
    const first = Number(localDate[1]);
    const second = Number(localDate[2]);
    const yearValue = Number(localDate[3]);
    const year = yearValue < 100 ? (yearValue >= 70 ? 1900 + yearValue : 2000 + yearValue) : yearValue;
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    return new Date(Date.UTC(year, month - 1, day, Number(localDate[4] || 0) + 3, Number(localDate[5] || 0), Number(localDate[6] || 0))).toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function stableCallId(identity: string) {
  const hash = createHash('sha256').update(`legacy-activation:${identity}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fingerprint(values: unknown[]) {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

export function parseHistoricalActivationWorkbook(fileName: string, buffer: Buffer): HistoricalActivationPreview {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('A planilha não contém abas para importar.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return headers.includes('data abertura') && headers.includes('data fim') && headers.includes('acionamento');
  });
  if (headerIndex < 0) throw new Error('Não encontrei as colunas Data Abertura, Data-Fim e Acionamento.');

  const headers = rows[headerIndex].map(normalizeHeader);
  const column = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const technicianColumn = column('tecnico', 'técnico');
  const openingColumn = column('data abertura');
  const activationColumn = column('data acionamento');
  const finishedColumn = column('data fim');
  const messageColumn = column('acionamento');
  const totalRows = rows.slice(headerIndex + 1).filter((row) => String(row[messageColumn] ?? '').trim()).length;
  const groups = new Map<string, HistoricalActivationCandidate[]>();
  const missing = { missingOpeningDate: 0, missingFinishedDate: 0, missingOrder: 0, missingReason: 0, missingOlt: 0, missingTechnician: 0 };
  const byType: Record<string, number> = {};

  rows.slice(headerIndex + 1).forEach((row, index) => {
    const message = String(row[messageColumn] ?? '').trim();
    if (!message) return;
    const openedAt = parseWorkbookDate(row[openingColumn]);
    const executedAt = parseWorkbookDate(row[finishedColumn]);
    if (!openedAt) missing.missingOpeningDate += 1;
    if (!executedAt) missing.missingFinishedDate += 1;

    const legacy = extractOperationalData(message);
    const analysis = analyzeOperationalMessage(message);
    const orderLabelPattern = /^[\t ]*[-*]?[\t ]*(?:O\.?S\.?[\t ]*OT|OFFICE[\t ]*TRACK|OFFICETRACK)[\t ]*[:=-][\t ]*(.*?)[\t ]*$/i;
    const orderLabel = message.split(/\r?\n/).find((line) => orderLabelPattern.test(line));
    const explicitOrder = orderLabel?.match(orderLabelPattern)?.[1]?.trim() || '';
    const orderNumber = orderLabel ? explicitOrder : analysis.os_ot || analysis.office_track || legacy.orderNumber || legacy.officeTrack;
    if (!orderNumber) missing.missingOrder += 1;
    if (!analysis.motivo && !legacy.reason) missing.missingReason += 1;
    if (!analysis.olt && !legacy.olt) missing.missingOlt += 1;
    if (!analysis.tecnico_rede && !analysis.tecnico && !legacy.technician && technicianColumn < 0) missing.missingTechnician += 1;

    const type = analysis.tipo_registro || legacy.type || 'NOC ACESSO';
    byType[type] = (byType[type] || 0) + 1;
    if (!openedAt || !executedAt || !orderNumber) return;

    const orderKey = normalizeHistoricalIdentifier(orderNumber);
    if (!orderKey) { missing.missingOrder += 1; return; }
    const identifiers = [...new Set([analysis.os_ot, analysis.office_track, analysis.os_casa_cliente, analysis.bdesk, analysis.ticket, analysis.contrato, orderNumber]
      .filter((item): item is string => Boolean(item?.trim())))];
    const olt = analysis.olt || legacy.olt || '';
    const identity = `legacy-activation:${orderKey}`;
    const rowNumber = headerIndex + index + 2;
    const rowFingerprint = fingerprint([message.replace(/\s+/g, ' ').trim(), openedAt, executedAt]);
    const call: Call = {
      id: stableCallId(identity),
      orderNumber,
      bdesk: analysis.bdesk || legacy.bdesk || '',
      officeTrack: analysis.office_track || legacy.officeTrack || '',
      client: legacy.client || 'Cliente nao identificado',
      type,
      reason: analysis.motivo || legacy.reason || 'Motivo nao informado',
      region: resolveOltRegion(olt).region || legacy.region || 'Nao informada',
      city: legacy.city || '',
      address: analysis.endereco_principal || '',
      bairro: analysis.bairro_principal || '',
      olt,
      slotPon: analysis.slot_pon?.join(', ') || legacy.slotPon || '',
      status: 'Finalizado',
      openedAt,
      assignedAt: parseWorkbookDate(activationColumn >= 0 ? row[activationColumn] : undefined),
      executedAt,
      result: analysis.tratativa_realizada || undefined,
      notes: `Importado do histórico ${fileName}, linha ${rowNumber}.`,
      source: 'legacy-activation',
      sourceIdentity: identity,
      sourceIdentifiers: identifiers.map(normalizeHistoricalIdentifier),
      sourceFileName: fileName,
      sourceReferenceDate: executedAt.slice(0, 10),
      sourceFingerprint: rowFingerprint,
      sourceProcessedAt: new Date().toISOString(),
    };
    const candidate = { rowNumber, identifiers, fingerprint: rowFingerprint, call };
    const group = groups.get(orderKey) || [];
    group.push(candidate);
    groups.set(orderKey, group);
  });

  const candidates: HistoricalActivationCandidate[] = [];
  let duplicatesWithinFile = 0;
  let conflictingOrders = 0;
  const conflicts: HistoricalActivationConflict[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { candidates.push(group[0]); continue; }
    if (group.every((candidate) => candidate.fingerprint === group[0].fingerprint)) {
      candidates.push(group[0]);
      duplicatesWithinFile += group.length - 1;
    } else {
      conflictingOrders += group.length;
      conflicts.push({ orderNumber: group[0].call.orderNumber, rows: group.map(({ rowNumber, call }) => ({ rowNumber, openedAt: call.openedAt, assignedAt: call.assignedAt, executedAt: call.executedAt || '' })) });
    }
  }

  return { sheetName, totalRows, candidates, duplicatesWithinFile, conflictingOrders, conflicts, ...missing, byType };
}