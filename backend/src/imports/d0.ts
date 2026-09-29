import type { Call, EditableCallFields } from '../types.js';

export type D0Row = Record<string, string>;
export type D0CallFields = Partial<Pick<EditableCallFields, 'address' | 'bairro' | 'city' | 'region' | 'olt' | 'ofsStatus' | 'executedAt'>>;
export type D0Match = { callId: string; fields: D0CallFields };
export type D0MatchResult = { matches: D0Match[]; unmatchedRows: number };

function normalize(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function normalizeIdentifier(value: unknown) {
  return normalize(value).replace(/^(?:bdesk|bd)[-\s]*/, '').replace(/[^a-z0-9]/g, '');
}

function value(row: D0Row, ...aliases: string[]) {
  const entries = new Map(Object.entries(row).map(([key, entry]) => [normalize(key), String(entry ?? '').trim()]));
  for (const alias of aliases) {
    const found = entries.get(normalize(alias));
    if (found) return found;
  }
  return '';
}

export function parseD0FinishedAt(dateValue: string, timeValue: string) {
  const dateText = dateValue.trim();
  const dateMatch = dateText.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  const isoMatch = dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const timeMatch = timeValue.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if ((!dateMatch && !isoMatch) || !timeMatch) return undefined;

  const day = Number(dateMatch ? dateMatch[1] : isoMatch![3]);
  const month = Number(dateMatch ? dateMatch[2] : isoMatch![2]);
  const rawYear = dateMatch ? dateMatch[3] : isoMatch![1];
  const year = Number(rawYear.length === 2 ? `20${rawYear}` : rawYear);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return undefined;

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}-03:00`;
}

function rowIdentifiers(row: D0Row) {
  return [
    value(row, 'Ordem de Serviço', 'Ordem de Servico', 'Numero da Ordem', 'Número da Ordem', 'Numero OS', 'Número OS', 'OS', 'Ordem'),
    value(row, 'BDESK', 'BDesk'),
    value(row, 'Office Track', 'OfficeTrack', 'OS OT', 'OT'),
    value(row, 'OS Casa Cliente'),
    value(row, 'Contrato', 'Numero do Contrato', 'Número do Contrato'),
  ].map(normalizeIdentifier).filter(Boolean);
}

function callIdentifiers(call: Call) {
  return [call.orderNumber, call.bdesk, call.officeTrack, ...(call.sourceIdentifiers || [])].map(normalizeIdentifier).filter(Boolean);
}

function mapFields(row: D0Row, callStatus: Call['status']): D0CallFields {
  const fields: D0CallFields = {};
  const address = value(row, 'Endereço', 'Endereco', 'Endereço do Cliente', 'Endereco do Cliente', 'Endereço de Instalação', 'Endereco de Instalacao');
  const bairro = value(row, 'Bairro', 'Neighborhood');
  const city = value(row, 'Cidade', 'Município', 'Municipio', 'City');
  const region = value(row, 'Região', 'Regiao', 'Região Operacional', 'Regiao Operacional');
  const olt = value(row, 'OLT', 'OLT de atendimento');
  const ofsStatus = value(row, 'Status OFS', 'OFS Status', 'Status da Atividade OFS', 'Status da Atividade');
  const isClosed = callStatus === 'Finalizado' || callStatus === 'Cancelado';
  const executedAt = isClosed ? parseD0FinishedAt(value(row, 'Data', 'Data Fim', 'Data de Finalização', 'Data de Finalizacao'), value(row, 'Fim', 'Hora Fim', 'Horário Fim', 'Horario Fim')) : null;
  if (address) fields.address = address;
  if (bairro) fields.bairro = bairro;
  if (city) fields.city = city;
  if (region) fields.region = region;
  if (olt) fields.olt = olt;
  if (ofsStatus) fields.ofsStatus = ofsStatus;
  if (isClosed && executedAt) fields.executedAt = executedAt;
  else if (!isClosed) fields.executedAt = null;
  return fields;
}

export function matchD0Rows(rows: D0Row[], calls: Call[]): D0MatchResult {
  const callKeys = calls.map((call) => ({ call, identifiers: new Set(callIdentifiers(call)) }));
  const updates = new Map<string, D0CallFields>();
  let unmatchedRows = 0;

  for (const row of rows) {
    const identifiers = rowIdentifiers(row);
    const candidates = callKeys.filter(({ identifiers: keys }) => identifiers.some((identifier) => keys.has(identifier)));
    if (candidates.length !== 1) {
      unmatchedRows += 1;
      continue;
    }
    const candidate = candidates[0];
    const fields = mapFields(row, candidate.call.status);
    if (Object.keys(fields).length) updates.set(candidate.call.id, { ...updates.get(candidate.call.id), ...fields });
  }

  return { matches: [...updates].map(([callId, fields]) => ({ callId, fields })), unmatchedRows };
}

export function hasD0Identifiers(rows: D0Row[]) {
  return rows.some((row) => rowIdentifiers(row).length > 0);
}