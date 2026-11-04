import { randomUUID } from 'node:crypto';
import XLSX from 'xlsx';
import { extractOperationalData } from '../integrations/wuzapi/client.js';
import { resolveOltRegion } from '../integrations/wuzapi/noc-consolidation.js';
import { analyzeOperationalMessage } from '../integrations/wuzapi/semantic.js';
import type { Call, CallStatus } from '../types.js';

export type CurrentCallsCandidate = { rowNumber: number; identifiers: string[]; call: Call };
export type CurrentCallsParseResult = {
  sheetName: string;
  totalRows: number;
  candidates: CurrentCallsCandidate[];
  invalidRows: number[];
  missingFinishRows: number[];
  ignoredFinishRows: number[];
};

function normalizeHeader(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  const first = Number(match[1]);
  const second = Number(match[2]);
  const yearValue = Number(match[3]);
  const year = yearValue < 100 ? (yearValue >= 70 ? 1900 + yearValue : 2000 + yearValue) : yearValue;
  const month = second;
  const day = first;
  const date = new Date(Date.UTC(year, month - 1, day, Number(match[4] || 0) + 3, Number(match[5] || 0), Number(match[6] || 0)));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date.toISOString();
}

function normalizeIdentifier(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function getCell(row: unknown[], indexes: Map<string, number>, ...aliases: string[]) {
  for (const alias of aliases) {
    const index = indexes.get(normalizeHeader(alias));
    if (index !== undefined) {
      const value = row[index];
      if (value !== undefined && value !== null && String(value).trim()) return value;
    }
  }
  return '';
}

function parseStatus(value: unknown): CallStatus | undefined {
  const status = normalizeHeader(value);
  if (status === 'finalizado') return 'Finalizado';
  if (status === 'pendente' || status === 'aberto') return 'Aberto';
  if (status === 'baixar') return 'Baixar';
  if (status === 'cancelado') return 'Cancelado';
  if (status === 'atribuido') return 'Atribuido';
  if (status === 'deslocamento' || status === 'em deslocamento') return 'Deslocamento';
  if (status === 'em campo' || status === 'em atendimento') return 'Em campo';
  return undefined;
}

export function parseCurrentCallsWorkbook(fileName: string, buffer: Buffer): CurrentCallsParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('A planilha não contém abas para importar.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
  const headerIndex = rows.findIndex((row) => {
    const headers = new Set(row.map(normalizeHeader));
    return headers.has('ordem') && headers.has('tecnico') && headers.has('data evento') && (headers.has('acionamento') || headers.has('card'));
  });
  if (headerIndex < 0) throw new Error('Não encontrei ORDEM, TÉCNICO, DATA EVENTO e ACIONAMENTO (ou CARD).');
  // Sem coluna STATUS (planilha "Em campo"): com tecnico entra Em campo; sem tecnico, Aberto.
  const hasStatusColumn = rows[headerIndex].some((header) => normalizeHeader(header) === 'status');

  const indexes = new Map<string, number>();
  rows[headerIndex].forEach((header, index) => indexes.set(normalizeHeader(header), index));
  const candidates: CurrentCallsCandidate[] = [];
  const invalidRows: number[] = [];
  const missingFinishRows: number[] = [];
  const ignoredFinishRows: number[] = [];

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2;
    if (!row.some((value) => String(value ?? '').trim())) return;
    const rowTechnician = String(getCell(row, indexes, 'TÉCNICO', 'TECNICO')).trim();
    const status = hasStatusColumn ? parseStatus(getCell(row, indexes, 'STATUS')) : rowTechnician ? 'Em campo' : 'Aberto';
    const rawOrder = getCell(row, indexes, 'ORDEM');
    const orderNumber = typeof rawOrder === 'number' && Number.isSafeInteger(rawOrder) ? String(rawOrder) : String(rawOrder ?? '').trim();
    const openedAt = parseWorkbookDate(getCell(row, indexes, 'DATA EVENTO', 'DATA DE ABERTURA'));
    if (!status || !orderNumber || !normalizeIdentifier(orderNumber) || !openedAt) {
      invalidRows.push(rowNumber);
      return;
    }

    const message = String(getCell(row, indexes, 'ACIONAMENTO', 'MENSAGEM DE ACIONAMENTO', 'CARD') ?? '').trim();
    const legacy = message ? extractOperationalData(message) : {};
    const analysis = message ? analyzeOperationalMessage(message) : undefined;
    const teamTechnician = rowTechnician;
    const equipment = String(getCell(row, indexes, 'EQUIPAMENTO', 'OLT')).trim();
    const messageOlt = analysis?.olt || legacy.olt || '';
    const olt = messageOlt || (/^(VIP-|OLT-)/i.test(equipment) ? equipment : '');
    const region = String(getCell(row, indexes, 'AREA', 'REGIÃO', 'REGIAO')).trim() || resolveOltRegion(olt).region || legacy.region || 'Nao informada';
    const rawFinish = getCell(row, indexes, 'DATA FIM', 'DATA DE FIM');
    const parsedFinish = parseWorkbookDate(rawFinish);
    const executedAt = status === 'Finalizado' || status === 'Baixar' ? parsedFinish : undefined;
    if ((status === 'Finalizado' || status === 'Baixar') && !executedAt) missingFinishRows.push(rowNumber);
    if (status === 'Aberto' && parsedFinish) ignoredFinishRows.push(rowNumber);
    const plate = String(getCell(row, indexes, 'PLACA')).trim();
    const pon = String(getCell(row, indexes, 'PON')).trim();
    const slotPon = analysis?.slot_pon?.join(', ') || legacy.slotPon || (plate && pon ? `${plate}/${pon}` : '');
    const assignedAt = parseWorkbookDate(getCell(row, indexes, 'DATA/HORA ACIONAMENTO', 'DATA DE ACIONAMENTO'));
    const eventType = String(getCell(row, indexes, 'TIPO DE EVENTO', 'TIPO')).trim();
    const type = analysis?.tipo_registro || legacy.type || eventType || 'NOC ACESSO';
    const observation = String(getCell(row, indexes, 'OBS', 'OBSERVACAO', 'OBSERVAÇÃO')).trim();
    const officeTrack = analysis?.office_track || analysis?.os_ot || legacy.officeTrack || orderNumber;
    const bdeskCell = getCell(row, indexes, 'BDESK');
    const bdesk = analysis?.bdesk || legacy.bdesk || (typeof bdeskCell === 'number' && Number.isSafeInteger(bdeskCell) ? String(bdeskCell) : String(bdeskCell ?? '').trim());
    const identifiers = [...new Set([orderNumber, officeTrack, bdesk, analysis?.os_casa_cliente, analysis?.contrato].filter((value): value is string => Boolean(value?.trim())).map(normalizeIdentifier))];
    const call: Call = {
      id: randomUUID(),
      orderNumber,
      bdesk,
      officeTrack,
      client: legacy.client || 'Cliente nao identificado',
      type,
      reason: analysis?.motivo || legacy.reason || 'Motivo nao informado',
      region,
      city: legacy.city || '',
      address: analysis?.endereco_principal || '',
      bairro: analysis?.bairro_principal || String(getCell(row, indexes, 'BAIRRO')).trim(),
      olt,
      slotPon,
      status,
      openedAt,
      assignedAt,
      executedAt,
      technicianName: teamTechnician || undefined,
      result: analysis?.tratativa_realizada || undefined,
      notes: `Importado de ${fileName}, linha ${rowNumber}.${observation ? `\nObs. da planilha: ${observation}` : ''}${message ? `\n\n${message}` : ''}`,
      source: 'current-calls-workbook',
      sourceIdentity: `current-calls-workbook:${normalizeIdentifier(orderNumber)}`,
      sourceIdentifiers: identifiers,
      sourceFileName: fileName,
      sourceReferenceDate: (executedAt || openedAt).slice(0, 10),
      sourceProcessedAt: new Date().toISOString(),
    };
    candidates.push({ rowNumber, identifiers, call });
  });

  return { sheetName, totalRows: rows.length - headerIndex - 1, candidates, invalidRows, missingFinishRows, ignoredFinishRows };
}