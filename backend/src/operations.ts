import { slaLimits } from './sla.js';
import { classifySlaHours } from './igp.js';
import { toOperationalDate } from './timezone.js';
import type { Call, Technician } from './types.js';

// Lote 3: mapa da fila (por regiao e bairro), reincidencia e carga dos tecnicos.

const ACTIVE = new Set(['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo']);
const isActive = (call: Call) => ACTIVE.has(call.status);
const elapsedMinutes = (call: Call, now: number) => (now - Date.parse(call.openedAt)) / 60_000;

// Situacao do prazo de um chamado ativo: no prazo, vencendo (menos de 2h), fora (6h-9h), outlier (>9h).
export type QueueState = 'ok' | 'soon' | 'late' | 'outlier';
// Links (NOC TX): prazo de 15 dias e "vencendo" no ultimo dia (sla.ts).
export function queueState(call: Call, now = Date.now()): QueueState {
  const minutes = elapsedMinutes(call, now);
  const limits = slaLimits(call.type);
  if (minutes > limits.outlierHours * 60) return 'outlier';
  if (minutes > limits.onTimeHours * 60) return 'late';
  if (limits.onTimeHours * 60 - minutes <= limits.soonMinutes) return 'soon';
  return 'ok';
}
const STATE_RANK: Record<QueueState, number> = { ok: 0, soon: 1, late: 2, outlier: 3 };

// ---------- (3) Reincidencia ----------
// Mesma regra da aba Repetidos: mesmo endereco + OLT + slot/PON, aberto ate 30 dias depois do anterior.
const NO_ADDRESS = new Set(['', 'S/N', 'SEM NÚMERO', 'SEM NUMERO', '-', 'SN']);
const REPEAT_WINDOW_MS = 30 * 86_400_000;
export function repeatKey(call: Pick<Call, 'address' | 'olt' | 'slotPon'>) {
  const address = (call.address || '').trim().toLocaleUpperCase('pt-BR');
  const olt = (call.olt || '').trim().toLocaleUpperCase('pt-BR');
  const slotPon = (call.slotPon || '').trim().toLocaleUpperCase('pt-BR');
  return NO_ADDRESS.has(address) || !olt || !slotPon ? null : `${address}||${olt}||${slotPon}`;
}

export type RepeatHistoryItem = Pick<Call, 'id' | 'orderNumber' | 'status' | 'openedAt' | 'executedAt' | 'technicianName' | 'result' | 'closingReason' | 'closingSubreason' | 'type'>;
// Historico do mesmo ponto (endereco + OLT + slot/PON), do mais recente para o mais antigo, e se este chamado e
// reincidente (houve outro no mesmo ponto ate 30 dias antes dele).
export function repeatHistory(call: Call, calls: Call[]) {
  const key = repeatKey(call);
  if (!key) return { eligible: false, isRepeat: false, previousWithin30Days: 0, history: [] as RepeatHistoryItem[] };
  const opened = Date.parse(call.openedAt);
  const same = calls.filter((item) => item.id !== call.id && item.status !== 'Cancelado' && repeatKey(item) === key);
  const previousWithin30Days = same.filter((item) => { const diff = opened - Date.parse(item.openedAt); return diff > 0 && diff <= REPEAT_WINDOW_MS; }).length;
  const history = same
    .sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt))
    .slice(0, 20)
    .map(({ id, orderNumber, status, openedAt, executedAt, technicianName, result, closingReason, closingSubreason, type }) => ({ id, orderNumber, status, openedAt, executedAt, technicianName, result, closingReason, closingSubreason, type }));
  return { eligible: true, isRepeat: previousWithin30Days > 0, previousWithin30Days, history };
}

// Para a fila: quais destes chamados sao reincidentes (e quantos anteriores em 30 dias).
export function repeatFlags(ids: string[], calls: Call[]): Record<string, number> {
  const byKey = new Map<string, number[]>();
  for (const call of calls) {
    if (call.status === 'Cancelado') continue;
    const key = repeatKey(call);
    if (!key) continue;
    const list = byKey.get(key) || [];
    list.push(Date.parse(call.openedAt));
    byKey.set(key, list);
  }
  const wanted = new Set(ids);
  const flags: Record<string, number> = {};
  for (const call of calls) {
    if (!wanted.has(call.id)) continue;
    const key = repeatKey(call);
    if (!key) continue;
    const opened = Date.parse(call.openedAt);
    const previous = (byKey.get(key) || []).filter((time) => opened - time > 0 && opened - time <= REPEAT_WINDOW_MS).length;
    if (previous) flags[call.id] = previous;
  }
  return flags;
}

// ---------- (2) Mapa da fila ----------
export type MapCall = Pick<Call, 'id' | 'orderNumber' | 'type' | 'technicianName' | 'status' | 'openedAt' | 'olt'> & { state: QueueState; minutes: number };
export type MapArea = { name: string; total: number; states: Record<QueueState, number>; worst: QueueState; noTechnician: number; calls: MapCall[] };
export type MapRegion = MapArea & { bairros: MapArea[] };

function emptyArea(name: string): MapArea { return { name, total: 0, states: { ok: 0, soon: 0, late: 0, outlier: 0 }, worst: 'ok', noTechnician: 0, calls: [] }; }
function addTo(area: MapArea, call: Call, state: QueueState, minutes: number) {
  area.total += 1;
  area.states[state] += 1;
  if (STATE_RANK[state] > STATE_RANK[area.worst]) area.worst = state;
  if (!call.technicianId) area.noTechnician += 1;
  area.calls.push({ id: call.id, orderNumber: call.orderNumber, type: call.type, technicianName: call.technicianName, status: call.status, openedAt: call.openedAt, olt: call.olt, state, minutes: Math.round(minutes) });
}
const byPressure = (a: MapArea, b: MapArea) => STATE_RANK[b.worst] - STATE_RANK[a.worst] || (b.states.outlier + b.states.late) - (a.states.outlier + a.states.late) || b.total - a.total || a.name.localeCompare(b.name, 'pt-BR');

export function queueMap(calls: Call[], now = Date.now()) {
  const regions = new Map<string, MapRegion>();
  const totals = emptyArea('Total');
  for (const call of calls.filter(isActive)) {
    const minutes = elapsedMinutes(call, now);
    if (!Number.isFinite(minutes)) continue;
    const state = queueState(call, now);
    const regionName = call.region?.trim() || 'Sem região';
    const region = regions.get(regionName) || { ...emptyArea(regionName), bairros: [] };
    addTo(region, call, state, minutes);
    const bairroName = call.bairro?.trim() || 'Sem bairro';
    let bairro = region.bairros.find((item) => item.name === bairroName);
    if (!bairro) { bairro = emptyArea(bairroName); region.bairros.push(bairro); }
    addTo(bairro, call, state, minutes);
    regions.set(regionName, region);
    addTo(totals, call, state, minutes);
  }
  const list = [...regions.values()].map((region) => {
    region.bairros.sort(byPressure);
    for (const bairro of region.bairros) bairro.calls.sort((a, b) => b.minutes - a.minutes);
    region.calls = []; // a lista fica nos bairros
    return region;
  }).sort(byPressure);
  return { total: totals.total, states: totals.states, noTechnician: totals.noTechnician, regions: list };
}

// ---------- (4) Carga dos tecnicos ----------
export type TechnicianLoad = {
  id: string; name: string; supervisorName?: string; region: string; currentStatus: Technician['currentStatus'];
  active: number; oldestMinutes: number | null; worst: QueueState | null; activeCalls: MapCall[];
  finishedToday: number; onTimeToday: number; avgHoursToday: number | null; free: boolean;
};
export function technicianLoad(technicians: Technician[], calls: Call[], now = Date.now()) {
  const today = toOperationalDate(new Date(now));
  const working = technicians.filter((tech) => tech.teamRole === 'Tecnico' && tech.active && tech.employmentStatus !== 'Demitido');
  const rows: TechnicianLoad[] = working.map((tech) => {
    const mine = calls.filter((call) => call.technicianId === tech.id);
    const active = mine.filter(isActive);
    const finished = mine.filter((call) => call.status === 'Finalizado' && call.executedAt && toOperationalDate(call.executedAt) === today);
    const measured = finished.map((call) => ({ type: call.type, value: (Date.parse(call.executedAt!) - Date.parse(call.openedAt)) / 3_600_000 })).filter(({ value }) => Number.isFinite(value) && value >= 0);
    const hours = measured.map(({ value }) => value);
    const activeCalls = active.map((call) => ({ id: call.id, orderNumber: call.orderNumber, type: call.type, technicianName: call.technicianName, status: call.status, openedAt: call.openedAt, olt: call.olt, state: queueState(call, now), minutes: Math.round(elapsedMinutes(call, now)) })).sort((a, b) => b.minutes - a.minutes);
    const worst = activeCalls.reduce<QueueState | null>((acc, call) => (!acc || STATE_RANK[call.state] > STATE_RANK[acc] ? call.state : acc), null);
    return {
      id: tech.id, name: tech.name, supervisorName: tech.supervisorName, region: tech.region, currentStatus: tech.currentStatus,
      active: active.length, oldestMinutes: activeCalls[0]?.minutes ?? null, worst, activeCalls,
      finishedToday: finished.length, onTimeToday: measured.filter(({ type, value }) => classifySlaHours(value, type) === 'onTime').length,
      avgHoursToday: hours.length ? Math.round((hours.reduce((sum, value) => sum + value, 0) / hours.length) * 100) / 100 : null,
      free: active.length === 0,
    };
  });
  // Livres primeiro (para atribuir), depois os com menos carga; entre ocupados, quem tem o chamado mais urgente aparece antes.
  rows.sort((a, b) => Number(b.free) - Number(a.free) || a.active - b.active || (STATE_RANK[b.worst ?? 'ok'] - STATE_RANK[a.worst ?? 'ok']) || a.name.localeCompare(b.name, 'pt-BR'));
  return {
    technicians: rows,
    free: rows.filter((row) => row.free).length,
    busy: rows.filter((row) => !row.free).length,
    unassignedActive: calls.filter((call) => isActive(call) && !call.technicianId).length,
  };
}
