import { isCallClosed } from '../call-status.js';
import type { Call, EditableCallFields } from '../types.js';
import { inferNeighborhood } from '../integrations/wuzapi/noc-consolidation.js';

export type D0Row = Record<string, string>;
export type D0CallFields = Partial<Pick<EditableCallFields, 'client' | 'address' | 'bairro' | 'city' | 'region' | 'olt' | 'ofsStatus' | 'executedAt' | 'technicianId' | 'status'>>;
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

// O OFS manda a data da ATIVIDADE e a hora de fim separadas. Fim depois da meia-noite vinha com a data do dia anterior
// (aberto 05/11 21:10, fim "05/11 00:05" em vez de 06/11 00:05) e o chamado saia do IGP como "fim antes da abertura".
// Se o fim ficar antes da abertura por menos de 24h, e o dia seguinte (12/11/2026).
export function finishAfterOpening(executedAt: string, openedAt: string | undefined) {
  const finish = Date.parse(executedAt);
  const opened = Date.parse(String(openedAt ?? ''));
  if (!Number.isFinite(finish) || !Number.isFinite(opened) || finish >= opened || opened - finish >= 86_400_000) return executedAt;
  const next = new Date(finish + 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 19);
  return `${next}-03:00`;
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
  // GIGA+ conta como aberto ate o OFS concluir: recebe a Data Fim do OFS so quando concluir (isCallClosed).
  const isClosed = isCallClosed(call);
  const clientName = call.type.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('field') ? value(row, 'Nome', 'Nome do Cliente', 'Cliente') : '';
  // OFS ja concluiu a atividade: traz a Data Fim mesmo que o status interno ainda esteja aberto (ex.: Atribuido).
  // Ao finalizar/baixar no sistema, essa data e mantida em vez de usar "agora".
  const ofsConcluded = /^(conclu|finaliz|encerrad|executad)/.test(normalize(ofsStatus));
  const keepsFinish = isClosed || ofsConcluded;
  const parsedFinish = keepsFinish ? parseD0FinishedAt(value(row, 'Data', 'Data Fim', 'Data de Finalização', 'Data de Finalizacao'), value(row, 'Fim', 'Hora Fim', 'Horário Fim', 'Horario Fim')) : null;
  const executedAt = parsedFinish ? finishAfterOpening(parsedFinish, call.openedAt) : parsedFinish;
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
  const byCall = new Map<string, { call: Call; rows: D0Row[] }>();
  let unmatchedRows = 0;

  for (const row of rows) {
    const identifiers = rowIdentifiers(row);
    const candidates = callKeys.filter(({ identifiers: keys }) => identifiers.some((identifier) => keys.has(identifier)));
    const chosen = pickSingleCall(candidates.map((candidate) => candidate.call));
    if (!chosen) {
      unmatchedRows += 1;
      continue;
    }
    const entry = byCall.get(chosen.id) ?? { call: chosen, rows: [] };
    entry.rows.push(row);
    byCall.set(chosen.id, entry);
  }

  // Mesma ordem em mais de uma linha (ex.: uma atividade pendente com um tecnico e outra iniciada com outro): antes
  // valia a ULTIMA linha do arquivo, que muda de um export para outro, e o Status OFS/tecnico ficavam indo e voltando
  // (caso 611129380560102, 11/11/2026). Agora a linha mais avancada (compareRows) e aplicada por ultimo e prevalece;
  // as outras so completam o que ela nao traz.
  const updates = new Map<string, D0CallFields>();
  for (const { call, rows: callRows } of byCall.values()) {
    const fields = [...callRows].sort(compareRows).reduce<D0CallFields>((merged, row) => ({ ...merged, ...mapFields(row, call) }), {});
    if (Object.keys(fields).length) updates.set(call.id, fields);
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

// "Recurso" do OFS = tecnico que esta com a atividade. Baldes ("CLUSTER_C08", "BKI_...") nao sao pessoas.
// So devolve quando o nome bate (sem acento/caixa) com UM tecnico ativo e trabalhando.
type TechnicianLike = { id: string; name: string; active: boolean; teamRole: string; employmentStatus?: string };
const personKey = (value: string) => normalize(value).replace(/\s+/g, ' ');
export function matchOfsTechnician<T extends TechnicianLike>(recurso: string, technicians: T[]): T | undefined {
  const key = personKey(recurso);
  if (!key || /^(cluster|bki)_|_/.test(key) || !/\s/.test(key)) return undefined;
  const working = technicians.filter((technician) => technician.teamRole === 'Tecnico' && technician.active && technician.employmentStatus !== 'Demitido');
  const exact = working.filter((technician) => personKey(technician.name) === key);
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  // Nome mais curto num dos lados: OFS "Paulo Herculano Firmo" x cadastro "Paulo Herculano". Vale quando o primeiro
  // nome e igual e todas as palavras do nome menor (pelo menos 2, sem "da/de/dos") estao no maior, e so UM tecnico bate.
  const ofsWords = nameWords(key);
  const partial = working.filter((technician) => sameShortName(ofsWords, nameWords(personKey(technician.name))));
  return partial.length === 1 ? partial[0] : undefined;
}
const CONNECTORS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
const nameWords = (key: string) => key.split(' ').filter((word) => word && !CONNECTORS.has(word));
function sameShortName(left: string[], right: string[]) {
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length < 2 || shorter[0] !== longer[0]) return false;
  return shorter.every((word) => longer.includes(word));
}

// Prioridade da linha quando a mesma ordem aparece mais de uma vez no export: concluida > em andamento (iniciado,
// em rota, em deslocamento, em execucao) > pendente/outros > suspensa/cancelada/nao concluida. Empate: a atividade
// mais nova (maior "ID da Atividade"). Ordem crescente: a ultima e a que vale.
export const rowWeight = (row: D0Row) => {
  const status = normalize(value(row, 'Status da Atividade', 'Status OFS'));
  if (/^(conclu|finaliz|encerrad|executad)/.test(status)) return 4;
  if (/^(iniciad|em rota|em desloc|em execu|em andamento|em atendimento|a caminho)/.test(status)) return 3;
  if (/^(suspens|cancel|nao concl)/.test(status)) return 1;
  return 2;
};
const activityId = (row: D0Row) => Number(String(value(row, 'ID da Atividade', 'ID Atividade', 'Atividade')).replace(/\D/g, '')) || 0;
export const compareRows = (left: D0Row, right: D0Row) => rowWeight(left) - rowWeight(right) || activityId(left) - activityId(right);

// Linha do OFS com Recurso conhecido -> tecnico do OFS no chamado. "Aberto" vira "Atribuido".
// Desde 11/11/2026 o OFS prevalece: se o chamado ja tem OUTRO tecnico, troca pelo do OFS (pedido do usuario).
// So troca quando o Recurso bate com UM tecnico trabalhando (balde CLUSTER_/BKI_ ou nome desconhecido nao mexe).
export function technicianAssignmentsFromRows<T extends TechnicianLike>(rows: D0Row[], calls: Call[], technicians: T[]) {
  const best = new Map<string, { row: D0Row; call: Call }>();
  for (const pair of matchRowsToCalls(rows, calls)) {
    const previous = best.get(pair.call.id);
    if (!previous || compareRows(pair.row, previous.row) >= 0) best.set(pair.call.id, pair);
  }
  const assignments: Array<{ callId: string; technicianId: string; status?: 'Atribuido'; supportTechnicianId?: null }> = [];
  for (const { row, call } of best.values()) {
    if (['Cancelado', 'Finalizado', 'Baixar'].includes(call.status)) continue;
    const technician = matchOfsTechnician(value(row, 'Recurso', 'Técnico', 'Tecnico'), technicians);
    if (technician && technician.id !== call.technicianId) assignments.push({ callId: call.id, technicianId: technician.id, ...(call.status === 'Aberto' ? { status: 'Atribuido' as const } : {}), ...(call.supportTechnicianId === technician.id ? { supportTechnicianId: null } : {}) });
  }
  return assignments;
}
