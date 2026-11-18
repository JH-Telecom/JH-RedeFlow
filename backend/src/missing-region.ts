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
// OLT de verdade tem o formato de hostname (ex.: VIP-ITA-SPO-OHW-01); textos como "ATIVACAO" (lixo do card) nao contam.
export function isRealOlt(olt: string | undefined | null) {
  return /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(normalizeOltCode(olt || '') || '');
}

export function sameOltMissing(calls: Call[], olt: string | undefined, exceptId: string) {
  const target = normalizeOltCode(olt || '');
  if (!target || !isRealOlt(olt)) return [];
  return calls.filter((call) => call.id !== exceptId && isMissingRegion(call.region) && normalizeOltCode(call.olt || '') === target);
}

// Regioes conhecidas para escolher (as dos chamados, tecnicos e as cadastradas), sem as "nao informadas".
export function knownRegions(...lists: Array<Array<string | undefined>>) {
  const regions = new Map<string, string>();
  for (const list of lists) for (const region of list) { const value = String(region ?? '').trim(); if (value && !isMissingRegion(value) && !regions.has(key(value))) regions.set(key(value), value); }
  return [...regions.values()].sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

// Sugestao de regiao (18/11/2026), na ordem: a regiao cadastrada para a OLT; a mais comum entre os chamados com
// regiao do mesmo bairro (e cidade); a mais comum da mesma cidade, se for clara (pelo menos 70% e 3 chamados).
export type RegionSuggestion = { region: string; reason: 'olt' | 'bairro' | 'cidade'; detail: string } | null;
const mostCommon = (regions: string[]) => {
  const counts = new Map<string, { region: string; count: number }>();
  for (const region of regions) { const item = counts.get(key(region)) ?? { region, count: 0 }; item.count += 1; counts.set(key(region), item); }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0];
};
// Cidade do chamado: o campo cidade (sem "Nao informada" e sem o "/Itaim" do OFS) ou a do endereco ("..., GUARULHOS - SP").
export function cityOf(call: Pick<Call, 'city'> & { address?: string }) {
  const field = key(call.city).split('/')[0].trim();
  if (field && !MISSING.has(field) && field !== 'NAO INFORMADA') return field;
  const fromAddress = String(call.address ?? '').match(/,?\s*([^,]+?)\s+-\s+[A-Z]{2}(?:\s*,|\s*$)/i)?.[1];
  return fromAddress ? key(fromAddress) : '';
}

export function suggestRegion(call: Pick<Call, 'olt' | 'bairro' | 'city'> & { address?: string }, calls: Call[], oltRegion: (olt: string) => string | null): RegionSuggestion {
  const byOlt = call.olt && isRealOlt(call.olt) ? oltRegion(call.olt) : null;
  if (byOlt && !isMissingRegion(byOlt)) return { region: byOlt, reason: 'olt', detail: `OLT ${call.olt}` };
  const withRegion = calls.filter((item) => !isMissingRegion(item.region));
  const city = cityOf(call);
  if (call.bairro && key(call.bairro)) {
    // Mesmo bairro e mesma cidade (existe Jardim Bela Vista em Guarulhos e em Ferraz). Sem cidade conhecida, so quando
    // todos os chamados desse bairro concordam na regiao.
    const sameBairro = withRegion.filter((item) => key(item.bairro) === key(call.bairro));
    const same = city ? sameBairro.filter((item) => cityOf(item) === city) : sameBairro;
    const top = same.length ? mostCommon(same.map((item) => item.region)) : undefined;
    if (top && (city || top.count === same.length)) return { region: top.region, reason: 'bairro', detail: `${top.count} chamado(s) do bairro ${call.bairro}${city ? ` em ${city}` : ''}` };
  }
  if (city) {
    const same = withRegion.filter((item) => cityOf(item) === city);
    const top = same.length >= 3 ? mostCommon(same.map((item) => item.region)) : undefined;
    if (top && top.count / same.length >= 0.7) return { region: top.region, reason: 'cidade', detail: `${top.count} de ${same.length} chamado(s) de ${city}` };
  }
  return null;
}
