import { calculateIgpMetrics, classifyCallArea, classifySlaHours } from './igp.js';
import type { SlaArea } from './sla-analysis.js';
import { addDays, toOperationalDate } from './timezone.js';
import type { Call } from './types.js';

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
  const groups = new Map<string, { detail?: string; hours: number[] }>();
  for (const { call, hours } of items) {
    const key = keyOf(call);
    const group = groups.get(key) || { detail: detailOf?.(call), hours: [] };
    group.hours.push(hours);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([name, group]) => {
    const states = group.hours.map(classifySlaHours);
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
  const states = items.map(({ hours }) => classifySlaHours(hours));
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
