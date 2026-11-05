// Analise de prazo (regra 6h/9h) dos chamados finalizados: tecnicos e bairros que mais perdem prazo, horario de
// abertura que mais perde, media de entrantes e um estudo do periodo noturno (abertos entre 18h e 06h).
import { classifyCallArea, type IgpArea } from './igp.js';
import { OPERATIONAL_TIME_ZONE, toOperationalDate } from './timezone.js';
import type { Call } from './types.js';

const ON_TIME_MAX_HOURS = 6;
const OUTLIER_AFTER_HOURS = 9;
export const NIGHT_START_HOUR = 18;
export const NIGHT_END_HOUR = 6;

// avgHours = abertura -> fim; avgExecutionHours = acionamento -> fim (so chamados com data de acionamento).
export type SlaCounters = { orders: number; lost: number; outliers: number; lostPercent: number | null; outlierPercent: number | null; avgHours: number | null; avgExecutionHours: number | null; withExecution: number };
export type SlaArea = IgpArea | 'OUTRAS';
export type SlaRankItem = SlaCounters & { name: string; detail?: string };
export type SlaHourItem = SlaCounters & { hour: number };
export type ShiftStudy = SlaCounters & {
  avgWaitHours: number | null; // abertura -> acionamento (quando a planilha/card trouxe a data de acionamento)
  avgExecutionHours: number | null; // acionamento -> fim
  withAssignment: number;
};
export type SlaAnalysis = {
  from: string;
  to: string;
  area: SlaArea;
  total: SlaCounters;
  technicians: SlaRankItem[];
  neighborhoods: SlaRankItem[];
  byOpeningHour: SlaHourItem[];
  /** Perda de prazo por dia da semana (0 = domingo) x faixa de 6h da abertura (0: 00-06, 1: 06-12, 2: 12-18, 3: 18-24). */
  heatmap: (SlaCounters & { weekday: number; band: number })[];
  incoming: { days: number; opened: number; avgPerDay: number | null; byWeekday: { weekday: number; avgPerDay: number | null; opened: number }[]; byHour: { hour: number; avgPerDay: number | null; opened: number }[]; nightShare: number | null };
  night: {
    day: ShiftStudy;
    night: ShiftStudy;
    crossedMorning: number; // noturnos que perderam prazo e so fecharam depois das 06h
    lostClosingHours: { hour: number; count: number }[]; // horario de fechamento dos noturnos que perderam prazo
    byOpeningHour: SlaHourItem[];
    byType: SlaRankItem[];
    technicians: SlaRankItem[];
    reasons: SlaRankItem[];
    byWeekday: (SlaCounters & { weekday: number })[];
    insights: string[];
  };
};

const hourFormat = new Intl.DateTimeFormat('en-GB', { timeZone: OPERATIONAL_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' });
const weekdayFormat = new Intl.DateTimeFormat('en-US', { timeZone: OPERATIONAL_TIME_ZONE, weekday: 'short' });
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const localHour = (iso: string) => Number(hourFormat.format(new Date(iso)));
const localWeekday = (iso: string) => WEEKDAYS.indexOf(weekdayFormat.format(new Date(iso)));
export const isNightHour = (hour: number) => hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;

type Accumulator = { orders: number; lost: number; outliers: number; hours: number; executionHours: number; withExecution: number };
const emptyAccumulator = (): Accumulator => ({ orders: 0, lost: 0, outliers: 0, hours: 0, executionHours: 0, withExecution: 0 });

// Horas de execucao (acionamento -> fim), quando a data de acionamento existe e e coerente.
function executionHours(call: Call) {
  const assigned = call.assignedAt ? Date.parse(call.assignedAt) : NaN;
  const executed = call.executedAt ? Date.parse(call.executedAt) : NaN;
  // Acionamento igual a abertura (planilhas antigas repetem a data) nao e informacao: exige ao menos 1 minuto depois.
  if (!Number.isFinite(assigned) || !Number.isFinite(executed) || assigned - Date.parse(call.openedAt) < 60_000 || executed < assigned) return null;
  return (executed - assigned) / 3_600_000;
}
const ratio = (part: number, total: number) => (total ? (part / total) * 100 : null);

function add(accumulator: Accumulator, hours: number, call?: Call) {
  accumulator.orders += 1;
  accumulator.hours += hours;
  const execution = call ? executionHours(call) : null;
  if (execution !== null) {
    accumulator.executionHours += execution;
    accumulator.withExecution += 1;
  }
  if (hours > ON_TIME_MAX_HOURS) accumulator.lost += 1;
  if (hours > OUTLIER_AFTER_HOURS) accumulator.outliers += 1;
}

function counters(accumulator: Accumulator): SlaCounters {
  return {
    orders: accumulator.orders,
    lost: accumulator.lost,
    outliers: accumulator.outliers,
    lostPercent: ratio(accumulator.lost, accumulator.orders),
    outlierPercent: ratio(accumulator.outliers, accumulator.orders),
    avgHours: accumulator.orders ? accumulator.hours / accumulator.orders : null,
    avgExecutionHours: accumulator.withExecution ? accumulator.executionHours / accumulator.withExecution : null,
    withExecution: accumulator.withExecution,
  };
}

function ranking(groups: Map<string, Accumulator & { detail?: string }>) {
  return [...groups.entries()]
    .map(([name, accumulator]) => ({ name, detail: accumulator.detail, ...counters(accumulator) }))
    .sort((left, right) => right.lost - left.lost || (right.lostPercent ?? 0) - (left.lostPercent ?? 0) || right.orders - left.orders);
}

function bump(groups: Map<string, Accumulator & { detail?: string }>, key: string, hours: number, call: Call, detail?: string) {
  const accumulator = groups.get(key) || { ...emptyAccumulator(), detail };
  add(accumulator, hours, call);
  groups.set(key, accumulator);
}

function shiftStudy(items: { call: Call; hours: number }[]): ShiftStudy {
  const accumulator = emptyAccumulator();
  let wait = 0;
  let execution = 0;
  let withAssignment = 0;
  for (const { call, hours } of items) {
    add(accumulator, hours, call);
    const assigned = call.assignedAt ? Date.parse(call.assignedAt) : NaN;
    const opened = Date.parse(call.openedAt);
    const executed = Date.parse(call.executedAt!);
    if (Number.isFinite(assigned) && assigned - opened >= 60_000 && assigned <= executed) {
      withAssignment += 1;
      wait += (assigned - opened) / 3_600_000;
      execution += (executed - assigned) / 3_600_000;
    }
  }
  return { ...counters(accumulator), withAssignment, avgWaitHours: withAssignment ? wait / withAssignment : null, avgExecutionHours: withAssignment ? execution / withAssignment : null };
}

const typeLabel = (type: string) => {
  const normalized = type.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (normalized.includes('BACKBONE') || normalized.includes('NOC TX')) return 'Backbone (NOC TX)';
  if (normalized.includes('FIELD')) return 'Field';
  if (normalized.includes('NOC ACESSO')) return 'Acesso (NOC)';
  return type || 'Outros';
};

const pct = (value: number | null) => (value === null ? '–' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const hrs = (value: number | null) => (value === null ? '–' : `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`);

function nightInsights(day: ShiftStudy, night: ShiftStudy, crossedMorning: number, lostClosingHours: { hour: number; count: number }[], byOpeningHour: SlaHourItem[], technicians: SlaRankItem[], reasons: SlaRankItem[], byType: SlaRankItem[]) {
  const insights: string[] = [];
  if (!night.orders) return ['Nenhum chamado aberto entre 18h e 06h no período.'];
  if (night.lostPercent !== null && day.lostPercent !== null) {
    const gap = night.lostPercent - day.lostPercent;
    insights.push(gap > 0
      ? `À noite ${pct(night.lostPercent)} dos chamados perdem prazo, contra ${pct(day.lostPercent)} durante o dia (${gap.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pontos a mais).`
      : `À noite ${pct(night.lostPercent)} dos chamados perdem prazo, igual ou abaixo do dia (${pct(day.lostPercent)}).`);
  }
  if (night.lost && crossedMorning) {
    const morning = lostClosingHours.filter((item) => item.hour >= 6 && item.hour < 10).reduce((sum, item) => sum + item.count, 0);
    insights.push(`${crossedMorning} de ${night.lost} chamados noturnos que perderam prazo só fecharam depois das 06h${morning ? `, ${morning} deles entre 06h e 10h` : ''}: o atendimento fica para a equipe da manhã.`);
  }
  if (night.avgWaitHours !== null && day.avgWaitHours !== null && night.withAssignment >= 3) {
    insights.push(`Tempo até o acionamento: ${hrs(night.avgWaitHours)} à noite contra ${hrs(day.avgWaitHours)} de dia. Execução depois de acionado: ${hrs(night.avgExecutionHours)} à noite contra ${hrs(day.avgExecutionHours)} de dia.`);
    if (night.avgWaitHours > (night.avgExecutionHours ?? 0)) insights.push('À noite o chamado espera mais para ser acionado do que leva para ser executado: o gargalo é o acionamento, não o reparo.');
  }
  const worstHour = byOpeningHour.filter((item) => item.orders >= 2).sort((left, right) => (right.lostPercent ?? 0) - (left.lostPercent ?? 0))[0];
  if (worstHour?.lostPercent) insights.push(`Pior horário de abertura à noite: ${String(worstHour.hour).padStart(2, '0')}h, com ${pct(worstHour.lostPercent)} de perda (${worstHour.lost} de ${worstHour.orders}).`);
  const worstType = byType.filter((item) => item.orders >= 2)[0];
  if (worstType?.lost) insights.push(`Tipo que mais perde à noite: ${worstType.name}, ${worstType.lost} de ${worstType.orders} (${pct(worstType.lostPercent)}).`);
  if (technicians[0]?.lost) insights.push(`Técnico com mais perdas à noite: ${technicians[0].name} (${technicians[0].lost} de ${technicians[0].orders}).`);
  if (reasons[0]?.lost && reasons[0].name !== 'Motivo nao informado') insights.push(`Motivo mais comum nas perdas noturnas: ${reasons[0].name} (${reasons[0].lost}).`);
  return insights;
}

export function calculateSlaAnalysis(calls: Call[], from: string, to: string, area: SlaArea = 'ALL', today = toOperationalDate()): SlaAnalysis {
  // Mesmos clusters do IGP: C.8 Sao Paulo, C.12 Guarulhos, C.11 Alto Tiete; OUTRAS = ABC e sem cluster.
  const inArea = (call: Call) => area === 'ALL' || classifyCallArea(call) === area;
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    const date = toOperationalDate(iso);
    return date >= from && date <= to;
  };

  // Finalizados no periodo (pela Data Fim), com abertura e fim validos
  const finished = calls
    .filter((call) => call.status === 'Finalizado' && inRange(call.executedAt) && inArea(call))
    .map((call) => ({ call, hours: (Date.parse(call.executedAt!) - Date.parse(call.openedAt)) / 3_600_000 }))
    .filter(({ hours }) => Number.isFinite(hours) && hours >= 0);

  const total = emptyAccumulator();
  const technicians = new Map<string, Accumulator & { detail?: string }>();
  const neighborhoods = new Map<string, Accumulator & { detail?: string }>();
  const hours = Array.from({ length: 24 }, emptyAccumulator);
  const heat = Array.from({ length: 28 }, emptyAccumulator);
  for (const { call, hours: repair } of finished) {
    add(heat[localWeekday(call.openedAt) * 4 + Math.floor(localHour(call.openedAt) / 6)], repair, call);
    add(total, repair, call);
    bump(technicians, call.technicianName || 'Sem técnico', repair, call, call.supervisorName);
    const place = call.bairro?.trim() || call.region || 'Não informado';
    bump(neighborhoods, place, repair, call, call.bairro?.trim() ? call.region : undefined);
    add(hours[localHour(call.openedAt)], repair, call);
  }

  // Entrantes: chamados abertos no periodo (qualquer status), por dia, dia da semana e hora
  const lastDay = to < today ? to : today;
  const dayCount = Math.max(1, Math.round((Date.parse(`${lastDay}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1);
  const opened = calls.filter((call) => inRange(call.openedAt) && toOperationalDate(call.openedAt) <= lastDay && inArea(call));
  const weekdayDays = Array.from({ length: 7 }, () => 0);
  for (let index = 0; index < dayCount; index += 1) weekdayDays[new Date(Date.parse(`${from}T12:00:00Z`) + index * 86_400_000).getUTCDay()] += 1;
  const openedByWeekday = Array.from({ length: 7 }, () => 0);
  const openedByHour = Array.from({ length: 24 }, () => 0);
  for (const call of opened) {
    openedByWeekday[localWeekday(call.openedAt)] += 1;
    openedByHour[localHour(call.openedAt)] += 1;
  }

  // Estudo noturno: aberto entre 18h e 06h
  const nightItems = finished.filter(({ call }) => isNightHour(localHour(call.openedAt)));
  const dayItems = finished.filter(({ call }) => !isNightHour(localHour(call.openedAt)));
  const nightLost = nightItems.filter(({ hours: repair }) => repair > ON_TIME_MAX_HOURS);
  const closing = Array.from({ length: 24 }, () => 0);
  let crossedMorning = 0;
  for (const { call } of nightLost) {
    const closeHour = localHour(call.executedAt!);
    closing[closeHour] += 1;
    if (closeHour >= NIGHT_END_HOUR && closeHour < NIGHT_START_HOUR) crossedMorning += 1;
  }
  const nightTypes = new Map<string, Accumulator & { detail?: string }>();
  const nightTechnicians = new Map<string, Accumulator & { detail?: string }>();
  const nightReasons = new Map<string, Accumulator & { detail?: string }>();
  const nightWeekdays = Array.from({ length: 7 }, emptyAccumulator);
  for (const { call, hours: repair } of nightItems) {
    bump(nightTypes, typeLabel(call.type), repair, call);
    bump(nightTechnicians, call.technicianName || 'Sem técnico', repair, call);
    bump(nightReasons, call.reason || 'Motivo nao informado', repair, call);
    add(nightWeekdays[localWeekday(call.openedAt)], repair, call);
  }
  const nightHourOrder = [...Array.from({ length: 24 - NIGHT_START_HOUR }, (_, index) => NIGHT_START_HOUR + index), ...Array.from({ length: NIGHT_END_HOUR }, (_, index) => index)];
  const nightByHour = nightHourOrder.map((hour) => ({ hour, ...counters(hours[hour]) }));
  const day = shiftStudy(dayItems);
  const night = shiftStudy(nightItems);
  const nightTechniciansRank = ranking(nightTechnicians);
  const nightReasonsRank = ranking(nightReasons).filter((item) => item.lost > 0);
  const nightTypesRank = ranking(nightTypes);
  const lostClosingHours = closing.map((count, hour) => ({ hour, count }));

  return {
    from,
    to,
    area,
    total: counters(total),
    technicians: ranking(technicians),
    neighborhoods: ranking(neighborhoods),
    byOpeningHour: hours.map((accumulator, hour) => ({ hour, ...counters(accumulator) })),
    heatmap: heat.map((accumulator, index) => ({ weekday: Math.floor(index / 4), band: index % 4, ...counters(accumulator) })),
    incoming: {
      days: dayCount,
      opened: opened.length,
      avgPerDay: opened.length / dayCount,
      byWeekday: openedByWeekday.map((count, weekday) => ({ weekday, opened: count, avgPerDay: weekdayDays[weekday] ? count / weekdayDays[weekday] : null })),
      byHour: openedByHour.map((count, hour) => ({ hour, opened: count, avgPerDay: count / dayCount })),
      nightShare: ratio(openedByHour.filter((_, hour) => isNightHour(hour)).reduce((sum, count) => sum + count, 0), opened.length),
    },
    night: {
      day,
      night,
      crossedMorning,
      lostClosingHours,
      byOpeningHour: nightByHour,
      byType: nightTypesRank,
      technicians: nightTechniciansRank,
      reasons: nightReasonsRank,
      byWeekday: nightWeekdays.map((accumulator, weekday) => ({ weekday, ...counters(accumulator) })),
      insights: nightInsights(day, night, crossedMorning, lostClosingHours, nightByHour, nightTechniciansRank, nightReasonsRank, nightTypesRank),
    },
  };
}
