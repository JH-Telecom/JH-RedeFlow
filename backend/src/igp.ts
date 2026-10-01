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

export function classifyIgpArea(region: string): Exclude<IgpArea, 'ALL'> {
  const normalized = region.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (/^GUARULHOS [1-5]$/.test(normalized)) return 'GRU';
  if (altoTieteRegions.has(normalized)) return 'ALTO_TIETE';
  return 'SP';
}

export function calculateIgpMetrics(calls: Call[], month: string, area: IgpArea = 'ALL'): IgpMetrics {
  const groups = { access: createGroup(), backbone: createGroup() };
  const total = createGroup();
  let excludedOrders = 0;

  for (const call of calls) {
    if (call.status !== 'Finalizado' || !call.executedAt || call.executedAt.slice(0, 7) !== month) continue;
    if (area !== 'ALL' && classifyIgpArea(call.region) !== area) continue;
    const groupKey = classifyIgpGroup(call.type);
    const openedAt = Date.parse(call.openedAt);
    const executedAt = Date.parse(call.executedAt);
    if (!groupKey || !Number.isFinite(openedAt) || !Number.isFinite(executedAt) || executedAt < openedAt) {
      excludedOrders += 1;
      continue;
    }

    const repairHours = (executedAt - openedAt) / 3_600_000;
    const isOutlier = repairHours > 10;
    const isOnTime = repairHours <= 8;
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