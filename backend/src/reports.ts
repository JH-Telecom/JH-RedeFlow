import { calculateIgpMetrics, classifyCallArea, classifySlaHours } from './igp.js';
import type { SlaArea } from './sla-analysis.js';
import { addDays, toOperationalDate } from './timezone.js';
import type { Call } from './types.js';
import { repeatKey } from './operations.js';

// Relatorios da aba Relatorios (alem de "Finalizados fora do prazo", em sla-analysis.ts).
// Mesma regra de prazo de todo o sistema: ate 6h no prazo, acima de 6h fora, acima de 9h outlier.
// Periodo pela Data Fim (finalizados) ou pela abertura (abertos), no dia operacional de Sao Paulo.

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const percent = (part: number, total: number) => (total ? round((part / total) * 100) : null);
const inRange = (iso: string | null | undefined, from: string, to: string) => { if (!iso) return false; const date = toOperationalDate(iso); return date >= from && date <= to; };
const matchesArea = (call: Call, area: SlaArea) => area === 'ALL' || classifyCallArea(call) === area;

type Finished = { call: Call; hours: number };
function finishedIn(calls: Call[], from: string, to: string, area: SlaArea): Finished[] {
  return calls
    .filter((call) => call.status === 'Finalizado' && inRange(call.executedAt, from, to) && matchesArea(call, area))
    .map((call) => ({ call, hours: (Date.parse(call.executedAt!) - Date.parse(call.openedAt)) / 3_600_000 }))
    .filter(({ hours }) => Number.isFinite(hours) && hours >= 0);
}

export type ProductivityRow = { name: string; detail?: string; finished: number; onTime: number; late: number; outliers: number; onTimePercent: number | null; avgHours: number | null };

function productivityRows(items: Finished[], keyOf: (call: Call) => string, detailOf?: (call: Call) => string | undefined): ProductivityRow[] {
  const groups = new Map<string, { detail?: string; hours: number[]; types: string[] }>();
  for (const { call, hours } of items) {
    const key = keyOf(call);
    const group = groups.get(key) || { detail: detailOf?.(call), hours: [] as number[], types: [] as string[] };
    group.hours.push(hours);
    group.types.push(call.type);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([name, group]) => {
    const states = group.hours.map((value, index) => classifySlaHours(value, group.types[index]));
    const onTime = states.filter((state) => state === 'onTime').length;
    return {
      name, detail: group.detail, finished: group.hours.length, onTime,
      late: states.filter((state) => state === 'late').length, outliers: states.filter((state) => state === 'outlier').length,
      onTimePercent: percent(onTime, group.hours.length), avgHours: round(group.hours.reduce((sum, value) => sum + value, 0) / group.hours.length, 2),
    };
  }).sort((a, b) => b.finished - a.finished || (b.onTimePercent ?? 0) - (a.onTimePercent ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
}

// (5) Produtividade por tecnico e por supervisor no periodo.
export function productivityReport(calls: Call[], from: string, to: string, area: SlaArea = 'ALL') {
  const items = finishedIn(calls, from, to, area);
  return {
    total: items.length,
    technicians: productivityRows(items, (call) => call.technicianName?.trim() || 'Sem técnico', (call) => call.supervisorName || undefined),
    supervisors: productivityRows(items, (call) => call.supervisorName?.trim() || 'Sem supervisor'),
  };
}

// (6) Motivos de fechamento: ranking, submotivos, por area e por mes.
export function closingReasonsReport(calls: Call[], from: string, to: string, area: SlaArea = 'ALL') {
  const items = finishedIn(calls, from, to, area);
  const reasonOf = (call: Call) => call.closingReason?.trim() || '';
  const withReason = items.filter(({ call }) => reasonOf(call));
  const groups = new Map<string, { count: number; hours: number; subreasons: Map<string, number>; byArea: Record<string, number> }>();
  for (const { call, hours } of withReason) {
    const key = reasonOf(call);
    const group = groups.get(key) || { count: 0, hours: 0, subreasons: new Map<string, number>(), byArea: {} as Record<string, number> };
    group.count += 1;
    group.hours += hours;
    const sub = call.closingSubreason?.trim();
    if (sub) group.subreasons.set(sub, (group.subreasons.get(sub) || 0) + 1);
    const callArea = classifyCallArea(call);
    group.byArea[callArea] = (group.byArea[callArea] || 0) + 1;
    groups.set(key, group);
  }
  const reasons = [...groups.entries()].map(([reason, group]) => ({
    reason, count: group.count, percent: percent(group.count, withReason.length), avgHours: round(group.hours / group.count, 2), byArea: group.byArea,
    subreasons: [...group.subreasons.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8),
  })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, 'pt-BR'));
  const months = new Map<string, Map<string, number>>();
  for (const { call } of withReason) {
    const month = toOperationalDate(call.executedAt!).slice(0, 7);
    const counts = months.get(month) || new Map<string, number>();
    counts.set(reasonOf(call), (counts.get(reasonOf(call)) || 0) + 1);
    months.set(month, counts);
  }
  const byMonth = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, counts]) => ({
    month, total: [...counts.values()].reduce((sum, value) => sum + value, 0),
    top: [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 5),
  }));
  return { total: items.length, withReason: withReason.length, withoutReason: items.length - withReason.length, reasons, byMonth };
}

export type PeriodMetrics = { from: string; to: string; opened: number; finished: number; onTime: number; late: number; outliers: number; onTimePercent: number | null; outlierPercent: number | null; avgHours: number | null; cancelled: number };

function periodMetrics(calls: Call[], from: string, to: string, area: SlaArea): PeriodMetrics {
  const scoped = calls.filter((call) => matchesArea(call, area));
  const items = finishedIn(scoped, from, to, 'ALL');
  const states = items.map(({ call, hours }) => classifySlaHours(hours, call.type));
  const onTime = states.filter((state) => state === 'onTime').length;
  const outliers = states.filter((state) => state === 'outlier').length;
  return {
    from, to,
    opened: scoped.filter((call) => call.status !== 'Cancelado' && inRange(call.openedAt, from, to)).length,
    finished: items.length, onTime, late: states.filter((state) => state === 'late').length, outliers,
    onTimePercent: percent(onTime, items.length), outlierPercent: percent(outliers, items.length),
    avgHours: items.length ? round(items.reduce((sum, item) => sum + item.hours, 0) / items.length, 2) : null,
    cancelled: scoped.filter((call) => call.status === 'Cancelado' && inRange(call.openedAt, from, to)).length,
  };
}

// (8) Comparar o periodo com o anterior de mesmo tamanho (que termina na vespera do inicio).
export function comparePeriods(calls: Call[], from: string, to: string, area: SlaArea = 'ALL') {
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(days - 1));
  return { days, current: periodMetrics(calls, from, to, area), previous: periodMetrics(calls, previousFrom, previousTo, area) };
}

// (7) Resumo de um dia (o agendado manda o de ontem as 7h): abertos, finalizados, prazo, ativos e o IGP do mes ate ali.
export function dailySummary(calls: Call[], date: string, now = Date.now()) {
  const day = periodMetrics(calls, date, date, 'ALL');
  const active = calls.filter((call) => ['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo'].includes(call.status));
  const activeLate = active.filter((call) => (now - Date.parse(call.openedAt)) / 3_600_000 > 6).length;
  const productivity = productivityReport(calls, date, date).technicians.filter((row) => row.name !== 'Sem técnico').slice(0, 3);
  const reasons = closingReasonsReport(calls, date, date).reasons.slice(0, 3).map((item) => ({ reason: item.reason, count: item.count }));
  const igp = calculateIgpMetrics(calls, date.slice(0, 7)).total;
  return { date, ...day, activeNow: active.length, activeLate, topTechnicians: productivity, topReasons: reasons, igp: { month: date.slice(0, 7), orders: igp.orders, onTimePercent: igp.onTimePercent, outlierPercent: igp.outlierPercent } };
}

const pct = (value: number | null) => (value === null ? '–' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const hrs = (value: number | null) => (value === null ? '–' : `${Math.floor(value)}h${String(Math.round((value % 1) * 60)).padStart(2, '0')}`);
const brDate = (iso: string) => iso.split('-').reverse().join('/');

// Texto do resumo para WhatsApp (sem dados de cliente).
export function dailySummaryText(summary: ReturnType<typeof dailySummary>) {
  const lines = [
    `📊 *JH RedeFlow — resumo de ${brDate(summary.date)}*`,
    `Abertos: ${summary.opened} · Finalizados: ${summary.finished}${summary.cancelled ? ` · Cancelados: ${summary.cancelled}` : ''}`,
    `No prazo (até 6h): ${summary.onTime} (${pct(summary.onTimePercent)}) · Fora: ${summary.late} · Outliers (>9h): ${summary.outliers}`,
    `Tempo médio: ${hrs(summary.avgHours)}`,
    `Agora: ${summary.activeNow} ativo(s), ${summary.activeLate} já fora do prazo`,
    `IGP do mês até aqui: ${pct(summary.igp.onTimePercent)} no prazo · ${pct(summary.igp.outlierPercent)} outliers (${summary.igp.orders} ordens)`,
  ];
  if (summary.topTechnicians.length) lines.push(`Mais finalizados: ${summary.topTechnicians.map((row) => `${row.name} (${row.finished})`).join(', ')}`);
  if (summary.topReasons.length) lines.push(`Motivos: ${summary.topReasons.map((item) => `${item.reason} (${item.count})`).join(', ')}`);
  return lines.join('\n');
}

// ---------- Lote C: gargalos (6) e mapa de calor por horario (7) ----------
const median = (values: number[]) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const p90 = (values: number[]) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]; };
export type StageStats = { name: string; calls: number; waitMedian: number | null; waitP90: number | null; execMedian: number | null; execP90: number | null; waitShare: number | null; late: number; lateByWait: number };

function stageStats(name: string, items: { wait: number; exec: number; total: number }[]): StageStats {
  const waits = items.map((item) => item.wait);
  const execs = items.map((item) => item.exec);
  const totalWait = waits.reduce((sum, value) => sum + value, 0);
  const total = items.reduce((sum, item) => sum + item.total, 0);
  const late = items.filter((item) => item.total > 360);
  return {
    name, calls: items.length,
    waitMedian: median(waits), waitP90: p90(waits), execMedian: median(execs), execP90: p90(execs),
    waitShare: total ? round((totalWait / total) * 100) : null,
    late: late.length,
    // Fora do prazo em que mais da metade do tempo foi esperando tecnico.
    lateByWait: late.filter((item) => item.wait > item.total / 2).length,
  };
}

// (6) Onde o tempo se perde: espera por tecnico (abertura -> atribuicao) x atendimento (atribuicao -> Data Fim),
// em minutos (mediana e p90). Geral, por regiao e por tecnico. Ignora chamado com atribuicao fora da janela.
export function bottleneckReport(calls: Call[], from: string, to: string, area: SlaArea = 'ALL') {
  const items = finishedIn(calls, from, to, area)
    .map(({ call }) => ({ call, opened: Date.parse(call.openedAt), assigned: call.assignedAt ? Date.parse(call.assignedAt) : NaN, executed: Date.parse(call.executedAt!) }))
    .filter(({ opened, assigned, executed }) => Number.isFinite(assigned) && assigned >= opened && assigned <= executed)
    .map(({ call, opened, assigned, executed }) => ({ call, wait: (assigned - opened) / 60_000, exec: (executed - assigned) / 60_000, total: (executed - opened) / 60_000 }));
  const groupBy = (keyOf: (call: Call) => string) => {
    const map = new Map<string, typeof items>();
    for (const item of items) { const key = keyOf(item.call) || 'Não informado'; map.set(key, [...(map.get(key) || []), item]); }
    return [...map.entries()].map(([name, list]) => stageStats(name, list)).filter((row) => row.calls >= 3).sort((a, b) => (b.waitMedian ?? 0) - (a.waitMedian ?? 0));
  };
  return {
    total: stageStats('Geral', items),
    byRegion: groupBy((call) => call.region?.trim() || '').slice(0, 20),
    byTechnician: groupBy((call) => call.technicianName?.trim() || '').sort((a, b) => (b.execMedian ?? 0) - (a.execMedian ?? 0)).slice(0, 20),
  };
}

// (7) Mapa de calor: por dia da semana (0 = domingo) x hora de Sao Paulo, media por dia do periodo de:
// chamados que entraram, tecnicos diferentes que finalizaram chamados naquela hora, e % fora do prazo dos que
// abriram naquela hora (finalizados).
const spParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function slotOf(iso: string) {
  const parts = spParts.formatToParts(new Date(iso));
  return { weekday: WEEK.indexOf(parts.find((part) => part.type === 'weekday')!.value), hour: Number(parts.find((part) => part.type === 'hour')!.value) % 24 };
}
export function heatmapReport(calls: Call[], from: string, to: string, area: SlaArea = 'ALL') {
  const weekdayCount = Array(7).fill(0);
  for (let day = from; day <= to; day = addDays(day, 1)) weekdayCount[new Date(`${day}T12:00:00Z`).getUTCDay()] += 1;
  const grid = () => Array.from({ length: 7 }, () => Array(24).fill(0));
  const incoming = grid();
  const techSets = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => new Map<string, Set<string>>()));
  const finishedByOpen = grid();
  const lateByOpen = grid();
  const scoped = calls.filter((call) => matchesArea(call, area));
  for (const call of scoped) {
    if (call.status !== 'Cancelado' && inRange(call.openedAt, from, to)) { const { weekday, hour } = slotOf(call.openedAt); incoming[weekday][hour] += 1; }
    if (call.status === 'Finalizado' && call.executedAt && inRange(call.executedAt, from, to) && call.technicianId) {
      const { weekday, hour } = slotOf(call.executedAt);
      const day = toOperationalDate(call.executedAt);
      const set = techSets[weekday][hour].get(day) || new Set<string>();
      set.add(call.technicianId);
      techSets[weekday][hour].set(day, set);
    }
    if (call.status === 'Finalizado' && call.executedAt && inRange(call.openedAt, from, to)) {
      const { weekday, hour } = slotOf(call.openedAt);
      finishedByOpen[weekday][hour] += 1;
      if ((Date.parse(call.executedAt) - Date.parse(call.openedAt)) / 3_600_000 > 6) lateByOpen[weekday][hour] += 1;
    }
  }
  const perDay = (value: number, weekday: number) => (weekdayCount[weekday] ? round(value / weekdayCount[weekday], 2) : 0);
  const techs = techSets.map((row, weekday) => row.map((days) => perDay([...days.values()].reduce((sum, set) => sum + set.size, 0), weekday)));
  const incomingAvg = incoming.map((row, weekday) => row.map((value) => perDay(value, weekday)));
  return {
    weekdayCount,
    incoming: incomingAvg,
    technicians: techs,
    callsPerTechnician: incomingAvg.map((row, weekday) => row.map((value, hour) => (techs[weekday][hour] ? round(value / techs[weekday][hour], 2) : null))),
    latePercent: lateByOpen.map((row, weekday) => row.map((value, hour) => (finishedByOpen[weekday][hour] >= 3 ? round((value / finishedByOpen[weekday][hour]) * 100) : null))),
    totalIncoming: incoming.flat().reduce((sum, value) => sum + value, 0),
  };
}

// ---------- Lote D: reincidencia por tecnico (12) ----------
// Para cada chamado finalizado no periodo (pela Data Fim), se o mesmo ponto (endereco + OLT + slot/PON) teve
// outro chamado aberto ate 30 dias depois da Data Fim: o reparo "nao segurou". Taxa por tecnico (minimo 5).
export function repeatRanking(calls: Call[], from: string, to: string, area: SlaArea = 'ALL') {
  const opensByKey = new Map<string, { at: number; orderNumber: string; id: string }[]>();
  for (const call of calls) {
    if (call.status === 'Cancelado') continue;
    const key = repeatKey(call);
    if (!key) continue;
    opensByKey.set(key, [...(opensByKey.get(key) || []), { at: Date.parse(call.openedAt), orderNumber: call.orderNumber, id: call.id }]);
  }
  const groups = new Map<string, { finished: number; eligible: number; repeated: { orderNumber: string; id: string; nextOrder: string; nextId: string; days: number }[] }>();
  for (const { call } of finishedIn(calls, from, to, area)) {
    const name = call.technicianName?.trim() || 'Sem técnico';
    const group = groups.get(name) || { finished: 0, eligible: 0, repeated: [] };
    group.finished += 1;
    const key = repeatKey(call);
    if (key) {
      group.eligible += 1;
      const done = Date.parse(call.executedAt!);
      const next = (opensByKey.get(key) || []).filter((item) => item.id !== call.id && item.at > done && item.at - done <= 30 * 86_400_000).sort((a, b) => a.at - b.at)[0];
      if (next) group.repeated.push({ orderNumber: call.orderNumber, id: call.id, nextOrder: next.orderNumber, nextId: next.id, days: round((next.at - done) / 86_400_000, 1) });
    }
    groups.set(name, group);
  }
  const rows = [...groups.entries()].map(([name, group]) => ({ name, finished: group.finished, eligible: group.eligible, repeated: group.repeated.length, percent: group.eligible ? round((group.repeated.length / group.eligible) * 100) : null, items: group.repeated.slice(0, 20) }))
    .sort((a, b) => (b.eligible >= 5 ? 1 : 0) - (a.eligible >= 5 ? 1 : 0) || (b.percent ?? 0) - (a.percent ?? 0) || b.repeated - a.repeated);
  const eligible = rows.reduce((sum, row) => sum + row.eligible, 0);
  const repeated = rows.reduce((sum, row) => sum + row.repeated, 0);
  return { finished: rows.reduce((sum, row) => sum + row.finished, 0), eligible, repeated, percent: eligible ? round((repeated / eligible) * 100) : null, technicians: rows };
}
