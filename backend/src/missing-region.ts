import type { Call } from './types.js';
import { normalizeOltCode } from './integrations/wuzapi/noc-consolidation.js';

// Fila "Sem regiao" (12/11/2026): chamados cuja regiao ficou vazia ou "Nao informada" (OLT sem mapeamento, card sem
// regiao). Ficam numa fila propria para alguem colocar a regiao certa; sem isso eles somem dos filtros e indicadores
// por regiao.
const MISSING = new Set(['', 'NAO INFORMADA', 'NAO INFORMADO', 'SEM REGIAO', 'SEM REGIÃO', '-', 'N/A']);
const key = (value: string | undefined) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
export const isMissingRegion = (region: string | undefined) => MISSING.has(key(region));

export type MissingRegionCall = Pick<Call, 'id' | 'orderNumber' | 'status' | 'type' | 'client' | 'olt' | 'slotPon' | 'city' | 'bairro' | 'address' | 'openedAt' | 'technicianName'>;
export function missingRegionCalls(calls: Call[]): MissingRegionCall[] {
  return calls
    .filter((call) => isMissingRegion(call.region))
    .sort((left, right) => Date.parse(right.openedAt) - Date.parse(left.openedAt))
    .map(({ id, orderNumber, status, type, client, olt, slotPon, city, bairro, address, openedAt, technicianName }) => ({ id, orderNumber, status, type, client, olt, slotPon, city, bairro, address, openedAt, technicianName }));
}

// Outros chamados sem regiao da mesma OLT (para "aplicar a todos desta OLT").
export function sameOltMissing(calls: Call[], olt: string | undefined, exceptId: string) {
  const target = normalizeOltCode(olt || '');
  if (!target) return [];
  return calls.filter((call) => call.id !== exceptId && isMissingRegion(call.region) && normalizeOltCode(call.olt || '') === target);
}

// Regioes conhecidas para escolher (as dos chamados, tecnicos e as cadastradas), sem as "nao informadas".
export function knownRegions(...lists: Array<Array<string | undefined>>) {
  const regions = new Map<string, string>();
  for (const list of lists) for (const region of list) { const value = String(region ?? '').trim(); if (value && !isMissingRegion(value) && !regions.has(key(value))) regions.set(key(value), value); }
  return [...regions.values()].sort((left, right) => left.localeCompare(right, 'pt-BR'));
}
