import type { ActivationAnalysis, NocAddressRecord } from '../../types.js';

function normalizeText(value: string | null | undefined) {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').replace(/\s*[,;/]\s*/g, ', ').trim();
}

function valueBetween(text: string, start: RegExp, end: RegExp) {
  const match = text.match(new RegExp(`${start.source}([\\s\\S]*?)(?=${end.source}|$)`, 'i'));
  return match?.[1]?.trim() || null;
}

function normalizeCep(value: string | null) {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : value?.trim() || null;
}

function normalizeAddressBase(value: string | null) {
  if (!value) return null;
  let normalized = normalizeText(value).replace(/^RUA\s+RUA\b/, 'RUA');
  const unitMarker = normalized.search(/\b(APARTAMENTO|APTO|APT|BLOCO|BL\.?\b|FTTA|COND(?:OMINIO)?\b|CASA\b|COMPLEMENTO|REFERENCIA|REF\.?\b)/i);
  if (unitMarker > 0) normalized = normalized.slice(0, unitMarker).trim();
  const numberedStreet = normalized.match(/^(.*?\b\d+[A-Z]?)(?:\s|,|$)/i);
  return (numberedStreet?.[1] || normalized).replace(/\s*,\s*$/, '').trim();
}

function inferNeighborhood(address: string | null) {
  if (!address) return null;
  const normalized = normalizeText(address);
  const cityMatch = normalized.match(/,\s*[^,]+\s*-\s*[A-Z]{2}\s*$/);
  const beforeCity = cityMatch ? normalized.slice(0, cityMatch.index) : normalized;
  const base = normalizeAddressBase(address);
  let remainder = base ? beforeCity.slice(base.length) : beforeCity;
  remainder = remainder.replace(/\b(APARTAMENTO|APTO|APT)\s*[:#]?\s*[A-Z0-9-]+/g, '').replace(/(?:\bBLOCO|\bBL\.?)\s*[:#]?\s*[A-Z0-9_-]+(?:\s+[A-Z0-9])?/g, '').replace(/\bFTTA\s*-?\s*[A-Z0-9-]*/g, '').replace(/\bCOND(?:OMINIO)?\.?\s*[^,]*/g, '');
  const parts = remainder.split(',').map((part) => part.replace(/^\s*[0-9]+\s*/, '').trim()).filter(Boolean);
  return parts.pop() || null;
}

export function parseNocAddress(raw: string): NocAddressRecord {
  const header = raw.match(/(?:^|\n)\s*NOME\s*:\s*(.*?)\s*\|\s*CONTRATO\s*:\s*([^\n|]+)/i);
  const nome = header?.[1]?.trim() || valueBetween(raw, /(?:^|\n)\s*NOME\s*:\s*/i, /\n\s*CONTRATO\s*:/i);
  const contrato = header?.[2]?.trim() || valueBetween(raw, /(?:^|\n)\s*CONTRATO\s*:\s*/i, /\n\s*CEP\s*:/i);
  const cep = raw.match(/\bCEP\s*:\s*([0-9]{5}[-.]?[0-9]{3})/i)?.[1] || null;
  const endereco = valueBetween(raw, /(?:^|\n)\s*ENDERE[CÇ]O\s*:\s*/i, /\n\s*(?:COMP\.?\s*\/\s*REF|COMPLEMENTO|REFER[EÊ]NCIA)\s*:/i) || raw.replace(/^.*?\bCEP\s*:\s*[0-9]{5}[-.]?[0-9]{3}\s*/is, '').trim() || null;
  const complemento = valueBetween(raw, /(?:^|\n)\s*(?:COMP\.?\s*\/\s*REF|COMPLEMENTO|REFER[EÊ]NCIA)\s*:\s*/i, /\n\s*[-=]{3,}|$/i);
  const enderecoBase = normalizeAddressBase(endereco);
  const bairro = inferNeighborhood(endereco);
  return { raw, nome, contrato, cep, endereco, complemento, bairro, endereco_base: enderecoBase, endereco_normalizado: normalizeText(endereco), bairro_normalizado: normalizeText(bairro), cep_normalizado: normalizeCep(cep) };
}

function mostFrequent<T>(items: Array<{ value: T | null; index: number }>, preferred?: Set<T>) {
  const counts = new Map<T, { count: number; first: number }>();
  for (const item of items) if (item.value) { const current = counts.get(item.value); counts.set(item.value, { count: (current?.count || 0) + 1, first: current?.first ?? item.index }); }
  return [...counts.entries()].sort((left, right) => right[1].count - left[1].count || Number(Boolean(preferred?.has(right[0]))) - Number(Boolean(preferred?.has(left[0]))) || left[1].first - right[1].first)[0]?.[0] || null;
}

export function consolidateNocAddresses(rawAddresses: string[] | null | undefined) {
  const clientes = (rawAddresses || []).map(parseNocAddress);
  const baseCounts = new Map<string, number>();
  for (const client of clientes) if (client.endereco_base) baseCounts.set(client.endereco_base, (baseCounts.get(client.endereco_base) || 0) + 1);
  const mainBase = mostFrequent(clientes.map((client, index) => ({ value: client.endereco_base, index })));
  const preferredNeighborhoods = new Set(clientes.filter((client) => client.endereco_base === mainBase && client.bairro_normalizado).map((client) => client.bairro_normalizado as string));
  const bairroPrincipal = mostFrequent(clientes.map((client, index) => ({ value: client.bairro_normalizado, index })), preferredNeighborhoods);
  const cepPrincipal = mostFrequent(clientes.map((client, index) => ({ value: client.cep_normalizado, index })));
  return { clientes, enderecoPrincipal: clientes.find((client) => client.endereco_base === mainBase)?.endereco_base || mainBase, bairroPrincipal, cepPrincipal, enderecoBaseCounts: Object.fromEntries(baseCounts) };
}

function compact(value: string | null | undefined) { return normalizeText(value).replace(/[^A-Z0-9]/g, ''); }

export function identifyAtreladas(current: Pick<ActivationAnalysis, 'olt' | 'placa_pon' | 'slot_pon' | 'bdesk' | 'office_track' | 'contrato' | 'endereco_principal' | 'bairro_principal'>, existing: Array<{ id: string; analysis?: ActivationAnalysis }>) {
  const currentKeys = [current.olt, current.placa_pon, ...(current.slot_pon || []), current.bdesk, current.office_track, current.contrato].map(compact).filter(Boolean);
  return existing.filter((item) => {
    const other = item.analysis;
    if (!other) return false;
    const otherKeys = [other.olt, other.placa_pon, ...(other.slot_pon || []), other.bdesk, other.office_track, other.contrato].map(compact).filter(Boolean);
    const technicalMatch = currentKeys.some((key) => otherKeys.includes(key));
    const addressMatch = compact(current.endereco_principal) && compact(current.endereco_principal) === compact(other.endereco_principal) && compact(current.bairro_principal) === compact(other.bairro_principal);
    return Boolean(technicalMatch || addressMatch);
  }).map((item) => item.id);
}