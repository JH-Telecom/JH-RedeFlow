import { classifyCallArea } from './igp.js';
import { OPERATIONAL_TIME_ZONE, addDays, toOperationalDate } from './timezone.js';
import type { Call } from './types.js';

// Visao dos supervisores (11/11/2026): entrantes (chamados que chegaram) por area, por dia e por horario, media por
// dia, TME e os totais do mes e da semana. Entrante = chamado aberto no periodo (pela abertura), sem Cancelado e
// sem GIGA+ (atendido pelo outro escritorio, fora dos indicadores). TME = da abertura ate a Data Fim, nos
// finalizados do periodo (pela Data Fim), igual a Analise de prazo.
export const OVERVIEW_AREAS = ['SP', 'GRU', 'ALTO_TIETE', 'ABC', 'OUTRAS'] as const;
export type OverviewArea = typeof OVERVIEW_AREAS[number];
export type OverviewFilters = { from: string; to: string; area?: OverviewArea; type?: string };

const hourOf = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: OPERATIONAL_TIME_ZONE, hour: '2-digit', hour12: false }).format(new Date(iso))) % 24;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
// Segunda-feira da semana de uma data AAAA-MM-DD.
export function weekStart(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(day, -((weekday + 6) % 7));
}

const isEntrante = (call: Call) => call.status !== 'Cancelado' && call.status !== 'GIGA+';
const hoursOpen = (call: Call) => (Date.parse(String(call.executedAt)) - Date.parse(call.openedAt)) / 3_600_000;

type Bucket = { entrantes: number; finalizados: number; tmeHours: number | null };
function summarize(entrantes: Call[], finished: Call[]): Bucket {
  const hours = finished.map(hoursOpen).filter((value) => Number.isFinite(value) && value >= 0);
  return { entrantes: entrantes.length, finalizados: finished.length, tmeHours: hours.length ? hours.reduce((sum, value) => sum + value, 0) / hours.length : null };
}

export function supervisorOverview(calls: Call[], filters: OverviewFilters, now = new Date()) {
  const today = toOperationalDate(now);
  const matches = (call: Call) => (!filters.area || classifyCallArea(call) === filters.area) && (!filters.type || call.type === filters.type);
  const pool = calls.filter((call) => isEntrante(call) && matches(call));
  const openedOn = (call: Call) => toOperationalDate(call.openedAt);
  const inRange = (day: string, from: string, to: string) => day >= from && day <= to;
  const openedIn = (from: string, to: string) => pool.filter((call) => inRange(openedOn(call), from, to));
  const finishedIn = (from: string, to: string) => pool.filter((call) => call.status === 'Finalizado' && call.executedAt && inRange(toOperationalDate(call.executedAt), from, to));

  // Mes e semana atuais (ate hoje), com a media por dia corrido.
  const monthFrom = `${today.slice(0, 7)}-01`;
  const weekFrom = weekStart(today);
  const month = openedIn(monthFrom, today).length;
  const week = openedIn(weekFrom, today).length;

  // Periodo dos filtros.
  const lastDay = filters.to > today ? today : filters.to;
  const periodDays = Math.max(1, daysBetween(filters.from, lastDay));
  const entrantes = openedIn(filters.from, filters.to);
  const finished = finishedIn(filters.from, filters.to);
  const total = summarize(entrantes, finished);

  const byArea = OVERVIEW_AREAS.map((area) => ({ area, ...summarize(entrantes.filter((call) => classifyCallArea(call) === area), finished.filter((call) => classifyCallArea(call) === area)) }))
    .filter((row) => row.entrantes || row.finalizados || row.area !== 'OUTRAS');
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, entrantes: 0 }));
  for (const call of entrantes) byHour[hourOf(call.openedAt)].entrantes += 1;
  const byDay: Array<{ day: string; entrantes: number; finalizados: number }> = [];
  for (let day = filters.from; day <= lastDay && byDay.length < 93; day = addDays(day, 1)) byDay.push({ day, entrantes: 0, finalizados: 0 });
  const dayIndex = new Map(byDay.map((item, index) => [item.day, index]));
  for (const call of entrantes) { const index = dayIndex.get(openedOn(call)); if (index !== undefined) byDay[index].entrantes += 1; }
  for (const call of finished) { const index = dayIndex.get(toOperationalDate(call.executedAt!)); if (index !== undefined) byDay[index].finalizados += 1; }
  const types = [...new Set(calls.filter(isEntrante).map((call) => call.type).filter(Boolean))].sort((left, right) => left.localeCompare(right));

  return {
    filters: { ...filters, today },
    month: { from: monthFrom, entrantes: month, perDay: month / daysBetween(monthFrom, today) },
    week: { from: weekFrom, entrantes: week, perDay: week / daysBetween(weekFrom, today) },
    period: { days: periodDays, perDay: total.entrantes / periodDays, ...total },
    byArea,
    byHour,
    byDay,
    types,
  };
}
