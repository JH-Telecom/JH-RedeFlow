import { calculateIgpMetrics, calculateIgpMetricsWhere, calculateIgpPlan, IGP_GOALS, type IgpArea, type IgpGroup } from './igp.js';
import { addDays, toOperationalDate } from './timezone.js';
import type { Call } from './types.js';

// Resumo semanal do IGP (18/11/2026): toda segunda, a semana anterior (segunda a domingo) no WhatsApp, com as mesmas
// regras do IGP do mes: no prazo (ate 6h), outliers (acima de 9h) e MTTR, por area, e o que falta para a meta do mes.
const AREAS: Array<[Exclude<IgpArea, 'ALL'>, string]> = [['SP', 'SP'], ['GRU', 'GRU'], ['ALTO_TIETE', 'Alto Tietê'], ['ABC', 'ABC']];
const pct = (value: number | null) => (value === null ? '–' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const hrs = (value: number | null) => (value === null ? '–' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`);
const brDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

// Semana anterior a data (segunda a domingo).
export function previousWeek(today: string) {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const thisMonday = addDays(today, -((weekday + 6) % 7));
  return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
}

const line = (name: string, group: IgpGroup) => `${name}: ${group.orders} ordens · ${pct(group.onTimePercent)} no prazo · ${pct(group.outlierPercent)} outlier · MTTR ${hrs(group.mttrHours)}`;

export function weeklyIgpText(calls: Call[], today = toOperationalDate()) {
  const { from, to } = previousWeek(today);
  const inWeek = (date: string) => date >= from && date <= to;
  const total = calculateIgpMetricsWhere(calls, `${from}..${to}`, 'ALL', inWeek).total;
  const month = today.slice(0, 7);
  const monthTotal = calculateIgpMetrics(calls, month).total;
  const plan = calculateIgpPlan(monthTotal, month, today);
  const lines = [
    `📈 *IGP da semana ${brDate(from)} a ${brDate(to)}*`,
    line('Total', total),
    ...AREAS.map(([area, name]) => calculateIgpMetricsWhere(calls, '', area, inWeek).total).map((group, index) => (group.orders ? line(AREAS[index][1], group) : null)).filter((item): item is string => Boolean(item)),
    '',
    `*Mês até aqui* (${monthTotal.orders} ordens): ${pct(monthTotal.onTimePercent)} no prazo (meta ${IGP_GOALS.onTime.target}%) · ${pct(monthTotal.outlierPercent)} outlier (meta ${IGP_GOALS.outlier.target}%) · MTTR ${hrs(monthTotal.mttrHours)} (meta ${IGP_GOALS.mttr.target}h)`,
  ];
  const onTime = plan.onTime.target.projected;
  if (onTime && !plan.onTime.target.met && onTime.remainingOrders > 0) lines.push(onTime.possible ? `Para a meta de prazo: ${onTime.required} das ~${onTime.remainingOrders} ordens que faltam no mês precisam fechar em até 6h.` : 'Meta de prazo do mês não dá mais para alcançar; foco no mínimo de 85%.');
  else if (plan.onTime.target.met) lines.push('Meta de prazo do mês batida até agora.');
  return { text: lines.join('\n'), from, to };
}
