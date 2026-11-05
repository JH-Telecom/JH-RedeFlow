import { toOperationalDate } from './timezone.js';
import type { Call } from './types.js';

export type IgpGroup = {
  orders: number;
  outliers: number;
  onTime: number;
  totalRepairHours: number;
  outlierPercent: number | null;
  onTimePercent: number | null;
  mttrHours: number | null;
};

export type IgpMetrics = {
  month: string;
  area: IgpArea;
  access: IgpGroup;
  backbone: IgpGroup;
  total: IgpGroup;
  excludedOrders: number;
};

export type IgpArea = 'ALL' | 'SP' | 'GRU' | 'ALTO_TIETE';
// Regra operacional: ate 6h = PRAZO; acima de 6h ate 9h = FORA DO PRAZO; acima de 9h = OUTLIER.
export const SLA_ON_TIME_MAX_HOURS = 6;
export const SLA_OUTLIER_AFTER_HOURS = 9;
export type SlaState = 'onTime' | 'late' | 'outlier';
export function classifySlaHours(hours: number): SlaState {
  return hours > SLA_OUTLIER_AFTER_HOURS ? 'outlier' : hours > SLA_ON_TIME_MAX_HOURS ? 'late' : 'onTime';
}
type IgpGroupKey = 'access' | 'backbone';
const altoTieteRegions = new Set([
  'FERRAZ DE VASCONCELOS 2',
  'MOGI DAS CRUZES',
  'MOGI 1',
  'MOGI 2',
  'PALMEIRAS',
  'SUZANO',
  'FERRAZ DE VASCONCELOS',
  'FERRAZ DE VASCONCELOS 1',
  // Cluster C.11 no relatorio da operadora.
  'COTIA',
]);

// Cluster C.8 | Sao Paulo: so os distritos da capital atendidos. ABC e regioes desconhecidas nao entram em SP.
const saoPauloRegions = new Set([
  'SAO PAULO',
  'CIDADE TIRADENTES',
  'CIDADE TIRADENTES 1',
  'CIDADE TIRADENTES 2',
  'CIDADE TIRADENTES 3',
  'GUAIANASES',
  'GUAIANASES 1',
  'GUAIANASES 2',
  'ITAIM PAULISTA',
  'IGUATEMI',
  'SAO MATEUS',
  'SAO MIGUEL PAULISTA',
  'SAO RAFAEL',
  'ARICANDUVA',
  'PENHA',
]);

function createGroup(): IgpGroup {
  return { orders: 0, outliers: 0, onTime: 0, totalRepairHours: 0, outlierPercent: null, onTimePercent: null, mttrHours: null };
}

function finalizeGroup(group: IgpGroup): IgpGroup {
  return {
    ...group,
    outlierPercent: group.orders ? group.outliers / group.orders * 100 : null,
    onTimePercent: group.orders ? group.onTime / group.orders * 100 : null,
    mttrHours: group.orders ? group.totalRepairHours / group.orders : null,
  };
}

function classifyIgpGroup(type: string): IgpGroupKey | undefined {
  const normalized = type.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (normalized.includes('BACKBONE') || normalized.includes('NOC TX')) return 'backbone';
  if (normalized.includes('NOC ACESSO') || normalized.includes('FIELD')) return 'access';
  return undefined;
}

// Areas do IGP pelos clusters da operadora: C.8 Sao Paulo, C.12 Guarulhos, C.11 Alto Tiete. O resto (ABC, sem regiao)
// fica em OUTRAS: conta so em "Todas".
export function classifyIgpArea(region: string): Exclude<IgpArea, 'ALL'> | 'OUTRAS' {
  const normalized = region.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (/^GUARULHOS( [1-5])?$/.test(normalized)) return 'GRU';
  if (altoTieteRegions.has(normalized)) return 'ALTO_TIETE';
  if (saoPauloRegions.has(normalized)) return 'SP';
  return 'OUTRAS';
}

// Regioes (ja normalizadas: maiusculas, sem acento) de cada area do IGP. Usado no filtro "Area" das filas.
export function igpAreaRegionKeys(area: Exclude<IgpArea, 'ALL'>): string[] {
  if (area === 'GRU') return ['GUARULHOS', 'GUARULHOS 1', 'GUARULHOS 2', 'GUARULHOS 3', 'GUARULHOS 4', 'GUARULHOS 5'];
  return [...(area === 'ALTO_TIETE' ? altoTieteRegions : saoPauloRegions)];
}

export function calculateIgpMetrics(calls: Call[], month: string, area: IgpArea = 'ALL'): IgpMetrics {
  const groups = { access: createGroup(), backbone: createGroup() };
  const total = createGroup();
  let excludedOrders = 0;

  for (const call of calls) {
    if (call.status !== 'Finalizado' || !call.executedAt || toOperationalDate(call.executedAt).slice(0, 7) !== month) continue;
    if (area !== 'ALL' && classifyIgpArea(call.region) !== area) continue;
    const groupKey = classifyIgpGroup(call.type);
    const openedAt = Date.parse(call.openedAt);
    const executedAt = Date.parse(call.executedAt);
    if (!groupKey || !Number.isFinite(openedAt) || !Number.isFinite(executedAt) || executedAt < openedAt) {
      excludedOrders += 1;
      continue;
    }

    const repairHours = (executedAt - openedAt) / 3_600_000;
    const isOutlier = repairHours > SLA_OUTLIER_AFTER_HOURS;
    const isOnTime = repairHours <= SLA_ON_TIME_MAX_HOURS;
    for (const group of [groups[groupKey], total]) {
      group.orders += 1;
      group.totalRepairHours += repairHours;
      if (isOutlier) group.outliers += 1;
      if (isOnTime) group.onTime += 1;
    }
  }

  return {
    month,
    area,
    access: finalizeGroup(groups.access),
    backbone: finalizeGroup(groups.backbone),
    total: finalizeGroup(total),
    excludedOrders,
  };
}
// ---- "Para bater a meta": quanto falta para cada meta do IGP ----
export const IGP_GOALS = {
  onTime: { target: 89, minimum: 85 }, // % no prazo (maior e melhor)
  outlier: { target: 4.9, minimum: 5.2 }, // % outlier (menor e melhor)
  mttr: { target: 5, minimum: 6 }, // horas (menor e melhor)
} as const;

export type IgpGoalPlan = {
  goal: number;
  met: boolean;
  /** Ordens seguidas no prazo / sem outlier que faltam (0 se ja bateu). MTTR nao tem (depende do tempo de cada ordem). */
  streak: number | null;
  /** Ritmo do mes (so no mes corrente): o que as ordens que ainda devem fechar precisam entregar. */
  projected: null | {
    remainingOrders: number;
    // Prazo: quantas das restantes precisam ficar no prazo; Outlier: quantos outliers ainda cabem; MTTR: media maxima em horas.
    required: number;
    requiredPercent: number | null;
    possible: boolean;
    // Folga quando ja bateu: Prazo = quantas podem passar de 6h; Outlier = quantos outliers ainda cabem.
    slack: number | null;
  };
};
export type IgpPlan = {
  month: string;
  currentMonth: boolean;
  elapsedDays: number;
  daysInMonth: number;
  orders: number;
  onTime: { target: IgpGoalPlan; minimum: IgpGoalPlan };
  outlier: { target: IgpGoalPlan; minimum: IgpGoalPlan };
  mttr: { target: IgpGoalPlan; minimum: IgpGoalPlan };
};

function onTimePlan(group: IgpGroup, goal: number, remaining: number | null): IgpGoalPlan {
  const p = goal / 100;
  const { orders: n, onTime: a } = group;
  const met = n > 0 && a / n >= p;
  // (a + k) / (n + k) >= p  ->  k >= (p n - a) / (1 - p)
  const streak = met ? 0 : Math.max(0, Math.ceil((p * n - a) / (1 - p) - 1e-9));
  if (remaining === null) return { goal, met, streak, projected: null };
  const total = n + remaining;
  const needed = Math.max(0, Math.ceil(p * total - a - 1e-9));
  return { goal, met, streak, projected: { remainingOrders: remaining, required: needed, requiredPercent: remaining ? (needed / remaining) * 100 : null, possible: needed <= remaining, slack: needed <= remaining ? remaining - needed : null } };
}

function outlierPlan(group: IgpGroup, goal: number, remaining: number | null): IgpGoalPlan {
  const q = goal / 100;
  const { orders: n, outliers: o } = group;
  const met = n === 0 || o / n <= q;
  // o / (n + k) <= q  ->  k >= o / q - n
  const streak = met ? 0 : Math.max(0, Math.ceil(o / q - n - 1e-9));
  if (remaining === null) return { goal, met, streak, projected: null };
  const allowed = Math.floor(q * (n + remaining) - o + 1e-9);
  return { goal, met, streak, projected: { remainingOrders: remaining, required: Math.max(0, allowed), requiredPercent: remaining ? (Math.max(0, allowed) / remaining) * 100 : null, possible: allowed >= 0, slack: allowed >= 0 ? allowed : null } };
}

function mttrPlan(group: IgpGroup, goal: number, remaining: number | null): IgpGoalPlan {
  const { orders: n, totalRepairHours: hours } = group;
  const met = n === 0 || hours / n <= goal;
  if (remaining === null || remaining === 0) return { goal, met, streak: null, projected: remaining === 0 ? { remainingOrders: 0, required: 0, requiredPercent: null, possible: met, slack: null } : null };
  // (H + r x) / (n + r) <= T  ->  x <= (T (n + r) - H) / r
  const maxAverage = (goal * (n + remaining) - hours) / remaining;
  return { goal, met, streak: null, projected: { remainingOrders: remaining, required: Math.round(maxAverage * 10) / 10, requiredPercent: null, possible: maxAverage > 0, slack: null } };
}

// Ritmo do mes: ordens finalizadas por dia ate hoje x dias que faltam (so no mes corrente).
export function calculateIgpPlan(group: IgpGroup, month: string, today = toOperationalDate()): IgpPlan {
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const currentMonth = today.slice(0, 7) === month;
  const elapsedDays = currentMonth ? Number(today.slice(8, 10)) : month < today.slice(0, 7) ? daysInMonth : 0;
  const remaining = currentMonth ? Math.round((group.orders / Math.max(1, elapsedDays)) * (daysInMonth - elapsedDays)) : null;
  return {
    month,
    currentMonth,
    elapsedDays,
    daysInMonth,
    orders: group.orders,
    onTime: { target: onTimePlan(group, IGP_GOALS.onTime.target, remaining), minimum: onTimePlan(group, IGP_GOALS.onTime.minimum, remaining) },
    outlier: { target: outlierPlan(group, IGP_GOALS.outlier.target, remaining), minimum: outlierPlan(group, IGP_GOALS.outlier.minimum, remaining) },
    mttr: { target: mttrPlan(group, IGP_GOALS.mttr.target, remaining), minimum: mttrPlan(group, IGP_GOALS.mttr.minimum, remaining) },
  };
}
