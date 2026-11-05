import type { Call, EditableCallFields } from '../types.js';
import { inferNeighborhood } from '../integrations/wuzapi/noc-consolidation.js';

export type D0Row = Record<string, string>;
export type D0CallFields = Partial<Pick<EditableCallFields, 'client' | 'address' | 'bairro' | 'city' | 'region' | 'olt' | 'ofsStatus' | 'executedAt'>>;
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

function mapFields(row: D0Row, call: Call): D0CallFields {
  const fields: D0CallFields = {};
  const address = value(row, 'Endereço', 'Endereco', 'Endereço do Cliente', 'Endereco do Cliente', 'Endereço de Instalação', 'Endereco de Instalacao');
  const bairro = value(row, 'Bairro', 'Neighborhood') || (address ? inferNeighborhood(address) || '' : '');
  const city = value(row, 'Cidade', 'Município', 'Municipio', 'City');
  const region = value(row, 'Região', 'Regiao', 'Região Operacional', 'Regiao Operacional');
  const olt = value(row, 'OLT', 'OLT de atendimento');
  const ofsStatus = value(row, 'Status OFS', 'OFS Status', 'Status da Atividade OFS', 'Status da Atividade');
  const isClosed = call.status === 'Finalizado' || call.status === 'Cancelado' || call.status === 'Baixar';
  const clientName = call.type.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('field') ? value(row, 'Nome', 'Nome do Cliente', 'Cliente') : '';
  // OFS ja concluiu a atividade: traz a Data Fim mesmo que o status interno ainda esteja aberto (ex.: Atribuido).
  // Ao finalizar/baixar no sistema, essa data e mantida em vez de usar "agora".
  const ofsConcluded = /^(conclu|finaliz|encerrad|executad)/.test(normalize(ofsStatus));
  const keepsFinish = isClosed || ofsConcluded;
  const executedAt = keepsFinish ? parseD0FinishedAt(value(row, 'Data', 'Data Fim', 'Data de Finalização', 'Data de Finalizacao'), value(row, 'Fim', 'Hora Fim', 'Horário Fim', 'Horario Fim')) : null;
  if (address) fields.address = address;
  if (bairro) fields.bairro = bairro;
  if (city) fields.city = city;
  if (region) fields.region = region;
  if (olt) fields.olt = olt;
  if (ofsStatus) fields.ofsStatus = ofsStatus;
  if (clientName) fields.client = clientName;
  if (keepsFinish && executedAt) fields.executedAt = executedAt;
  else if (!keepsFinish) fields.executedAt = null;
  return fields;
}

// Ordem que bate em mais de um chamado: se so um nao estiver Cancelado (ex.: card mandado duas vezes e a copia
// cancelada), e esse. Senao, nao adivinha.
export function pickSingleCall<T extends { status: Call['status'] }>(candidates: T[]): T | undefined {
  if (candidates.length === 1) return candidates[0];
  const active = candidates.filter((candidate) => candidate.status !== 'Cancelado');
  return active.length === 1 ? active[0] : undefined;
}

export function matchD0Rows(rows: D0Row[], calls: Call[]): D0MatchResult {
  const callKeys = calls.map((call) => ({ call, identifiers: new Set(callIdentifiers(call)) }));
  const updates = new Map<string, D0CallFields>();
  let unmatchedRows = 0;

  for (const row of rows) {
    const identifiers = rowIdentifiers(row);
    const candidates = callKeys.filter(({ identifiers: keys }) => identifiers.some((identifier) => keys.has(identifier)));
    const chosen = pickSingleCall(candidates.map((candidate) => candidate.call));
    if (!chosen) {
      unmatchedRows += 1;
      continue;
    }
    const candidate = { call: chosen };
    const fields = mapFields(row, candidate.call);
    if (Object.keys(fields).length) updates.set(candidate.call.id, { ...updates.get(candidate.call.id), ...fields });
  }

  return { matches: [...updates].map(([callId, fields]) => ({ callId, fields })), unmatchedRows };
}

export function hasD0Identifiers(rows: D0Row[]) {
  return rows.some((row) => rowIdentifiers(row).length > 0);
}
// Linha do export do OFS -> chamado, so quando bate em um unico chamado (mesma regra da D-0).
export function matchRowsToCalls(rows: D0Row[], calls: Call[]): Array<{ row: D0Row; call: Call }> {
  const callKeys = calls.map((call) => ({ call, identifiers: new Set(callIdentifiers(call)) }));
  const matches: Array<{ row: D0Row; call: Call }> = [];
  for (const row of rows) {
    const identifiers = rowIdentifiers(row);
    if (!identifiers.length) continue;
    const candidates = callKeys.filter(({ identifiers: keys }) => identifiers.some((identifier) => keys.has(identifier)));
    const chosen = pickSingleCall(candidates.map((candidate) => candidate.call));
    if (chosen) matches.push({ row, call: chosen });
  }
  return matches;
}

// "SP-000GRS3-WZ001": zona de trabalho do OFS. Cada uma pertence a um cluster.
export function rowWorkzone(row: D0Row) {
  return value(row, 'Chave Workzone', 'Workzone', 'Chave da Workzone').trim().toUpperCase();
}
