import { slaLimits } from './sla.js';
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
  /** Ordens NOC TX do mes: nao entram no IGP (pedido de 12/11/2026). */
  nocTxOrders: number;
};

export type IgpArea = 'ALL' | 'SP' | 'GRU' | 'ALTO_TIETE' | 'ABC';
// Regra operacional: ate 6h = PRAZO; acima de 6h ate 9h = FORA DO PRAZO; acima de 9h = OUTLIER.
export const SLA_ON_TIME_MAX_HOURS = 6;
export const SLA_OUTLIER_AFTER_HOURS = 9;
export type SlaState = 'onTime' | 'late' | 'outlier';
// Com o tipo, usa o prazo dele (Links/NOC TX: 15 dias). Sem tipo, a regra 6h/9h.
export function classifySlaHours(hours: number, type?: string): SlaState {
  const limits = slaLimits(type);
  return hours > limits.outlierHours ? 'outlier' : hours > limits.onTimeHours ? 'late' : 'onTime';
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
  // Planilha da Giga (12/11/2026): Ferraz de Vasconcelos 2 e Alto Tiete (C.11).
  'FERRAZ DE VASCONCELOS 2',
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

// Cluster C.9 | ABC: usado so quando o chamado ainda nao tem cluster do OFS.
const abcRegions = new Set([
  'ABC',
  'DIADEMA',
  'SANTO ANDRE',
  'SAO BERNARDO',
  'SAO BERNARDO DO CAMPO',
  'SAO CAETANO',
  'SAO CAETANO DO SUL',
  'MAUA',
  'RIBEIRAO PIRES',
  'RIO GRANDE DA SERRA',
  // Planilha da Giga (12/11/2026): "Maua/Conquista" e ABC (C.9).
  'CONQUISTA',
]);

// Balde do OFS -> area. C.8 Sao Paulo, C.9 ABC, C.11 Alto Tiete, C.12 Guarulhos.
export const CLUSTER_AREAS: Record<string, Exclude<IgpArea, 'ALL'>> = { C08: 'SP', C09: 'ABC', C11: 'ALTO_TIETE', C12: 'GRU' };

// "CLUSTER_C08 (21)", "C.8", "c8" -> "C08". Sem cluster reconhecivel -> undefined.
export function normalizeCluster(value: unknown): string | undefined {
  const match = String(value ?? '').toUpperCase().match(/C\.?\s*0?(\d{1,2})\b/);
  return match ? `C${match[1].padStart(2, '0')}` : undefined;
}

export function igpAreaClusters(area: Exclude<IgpArea, 'ALL'>): string[] {
  return Object.entries(CLUSTER_AREAS).filter(([, value]) => value === area).map(([cluster]) => cluster);
}

// Area do chamado (12/11/2026): 1) cluster da planilha da Giga, quando a ordem ja esta nela (e o oficial);
// 2) regiao (listas acima: bateu com a Giga em ~92% das ordens); 3) cluster do balde do OFS, so quando a regiao nao
// diz nada (ele divergiu da Giga: Guarulhos em C08, Sao Rafael em C11...).
export function classifyCallArea(call: { cluster?: string; gigaCluster?: string; region: string }): Exclude<IgpArea, 'ALL'> | 'OUTRAS' {
  const giga = normalizeCluster(call.gigaCluster);
  if (giga) return CLUSTER_AREAS[giga] ?? 'OUTRAS';
  const byRegion = classifyIgpArea(call.region);
  if (byRegion !== 'OUTRAS') return byRegion;
  const cluster = normalizeCluster(call.cluster);
  return cluster && CLUSTER_AREAS[cluster] ? CLUSTER_AREAS[cluster] : 'OUTRAS';
}

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

// NOC TX nao entra no IGP (12/11/2026): fica fora do calculo e e contado a parte (nocTxOrders).
export const isNocTx = (type: string) => /NOC\s*TX/.test(type.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase());
function classifyIgpGroup(type: string): IgpGroupKey | undefined {
  const normalized = type.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (normalized.includes('BACKBONE')) return 'backbone';
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
  if (abcRegions.has(normalized)) return 'ABC';
  return 'OUTRAS';
}

// Regioes (ja normalizadas: maiusculas, sem acento) de cada area do IGP. Usado no filtro "Area" das filas.
export function igpAreaRegionKeys(area: Exclude<IgpArea, 'ALL'>): string[] {
  if (area === 'GRU') return ['GUARULHOS', 'GUARULHOS 1', 'GUARULHOS 2', 'GUARULHOS 3', 'GUARULHOS 4', 'GUARULHOS 5'];
  return [...(area === 'ALTO_TIETE' ? altoTieteRegions : area === 'ABC' ? abcRegions : saoPauloRegions)];
}

export function calculateIgpMetrics(calls: Call[], month: string, area: IgpArea = 'ALL'): IgpMetrics {
  const groups = { access: createGroup(), backbone: createGroup() };
  const total = createGroup();
  let excludedOrders = 0;
  let nocTxOrders = 0;

  for (const call of calls) {
    // Abertura e fechamento da Giga quando a ordem ja esta na planilha dela (o fechamento de BDESK e o do ticket, ~20 min
    // antes do fim da atividade no OFS); senao, os do sistema.
    const closedAt = call.gigaClosedAt || call.executedAt;
    if (call.status !== 'Finalizado' || !closedAt || toOperationalDate(closedAt).slice(0, 7) !== month) continue;
    if (area !== 'ALL' && classifyCallArea(call) !== area) continue;
    if (isNocTx(call.type)) { nocTxOrders += 1; continue; }
    const groupKey = classifyIgpGroup(call.type);
    const openedAt = Date.parse(call.gigaOpenedAt || call.openedAt);
    const executedAt = Date.parse(closedAt);
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
    nocTxOrders,
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

// ---- IGP com a planilha da Giga (12/11/2026) ----
// No periodo que a planilha cobre (ate closedUntil), as ordens e marcacoes sao as da propria Giga (cluster, prazo,
// outlier e TME), entao o numero bate com o dela. Depois do corte, completa com as finalizadas do sistema que a Giga
// ainda nao listou. Backbone/NOC TX fica fora (conta em nocTxOrders).
export type GigaIgpOrder = { origin: string; cluster: string; closedAt: string | null; tmeHours: number | null; onTime: boolean | null; outlier: boolean | null; month: string | null; callId: string | null };
export type IgpSource = { gigaOrders: number; systemOrders: number; closedUntil: string | null; fileName: string | null };
export function calculateIgpWithGiga(calls: Call[], month: string, area: IgpArea, giga: { orders: GigaIgpOrder[]; closedUntil: string | null; fileName: string | null } | null): IgpMetrics & { source: IgpSource } {
  if (!giga || !giga.orders.length || !giga.closedUntil) {
    const metrics = calculateIgpMetrics(calls, month, area);
    return { ...metrics, source: { gigaOrders: 0, systemOrders: metrics.total.orders, closedUntil: null, fileName: null } };
  }
  const until = Date.parse(giga.closedUntil);
  const inArea = (cluster: string) => { const mapped = CLUSTER_AREAS[normalizeCluster(cluster) ?? '']; return area === 'ALL' ? Boolean(mapped) : mapped === area; };
  const access = createGroup();
  let nocTx = 0;
  for (const order of giga.orders) {
    if (order.month !== month || !order.closedAt || Date.parse(order.closedAt) > until || !inArea(order.cluster)) continue;
    if (order.origin === 'BACKBONE') { nocTx += 1; continue; }
    access.orders += 1;
    access.totalRepairHours += order.tmeHours ?? 0;
    if (order.outlier) access.outliers += 1;
    if (order.onTime) access.onTime += 1;
  }
  const gigaOrders = access.orders;
  const linked = new Set(giga.orders.map((order) => order.callId).filter(Boolean) as string[]);
  const after = calls.filter((call) => !linked.has(call.id) && call.executedAt && Date.parse(call.executedAt) > until);
  const rest = calculateIgpMetrics(after, month, area);
  for (const key of ['orders', 'outliers', 'onTime', 'totalRepairHours'] as const) access[key] += rest.access[key];
  const backbone = rest.backbone;
  const total = createGroup();
  for (const group of [access, backbone]) for (const key of ['orders', 'outliers', 'onTime', 'totalRepairHours'] as const) total[key] += group[key];
  return {
    month, area, access: finalizeGroup(access), backbone: finalizeGroup(backbone), total: finalizeGroup(total),
    excludedOrders: rest.excludedOrders, nocTxOrders: rest.nocTxOrders + nocTx,
    source: { gigaOrders, systemOrders: rest.total.orders, closedUntil: giga.closedUntil, fileName: giga.fileName },
  };
}
