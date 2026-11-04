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