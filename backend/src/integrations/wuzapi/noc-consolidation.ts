import type { ActivationAnalysis, NocAddressRecord } from '../../types.js';

const defaultOltRegionMap: Record<string, string> = Object.freeze({
  'VIP-CT1-SPO-OHW-01': 'CIDADE TIRADENTES 1',
  'VIP-IGU-SPO-OHW-02': 'IGUATEMI',
  'VIP-ITA-SPO-OHW-04': 'ITAIM PAULISTA',
  'VIP-IGU-SPO-OHW-01': 'IGUATEMI',
  'VIP-ITA-SPO-OHW-01': 'ITAIM PAULISTA',
  'VIP-CQT-SPO-OHW-01': 'CONQUISTA',
  'VIP-ITA-SPO-OHW-03': 'ITAIM PAULISTA',
  'VIP-ITA-SPO-OHW-02': 'ITAIM PAULISTA',
  'VIP-GZ1-SPO-OHW-02': 'GUAIANASES 1',
  'VIP-SRF-SPO-OHW-01': 'SÃO RAFAEL',
  'VIP-PN1-SPO-ONK-01': 'PENHA',
  'VIP-GZ1-SPO-OHW-01': 'GUAIANASES 1',
  'VIP-GRU-3-SPO-ONK-03': 'GUARULHOS 3',
  'VIP-GZ1-SPO-OHW-03': 'GUAIANASES 1',
  'VIP-CT3-SPO-OHW-01': 'CIDADE TIRADENTES 3',
  'VIP-SMT-SPO-OHW-01': 'SÃO MATEUS',
  'VIP-GRU-1-SPO-ONK-02': 'GUARULHOS 1',
  'VIP-GRU-1-SPO-ONK-03': 'GUARULHOS 1',
  'VIP-SMT-SPO-OHW-02': 'SÃO MATEUS',
  'VIP-PRP-SBC-OZT-01': 'DIADEMA',
  'VIP-CT1-SPO-OHW-03': 'CIDADE TIRADENTES 1',
  'VIP-ARI-SPO-ONK-01': 'ARICANDUVA',
  'VIP-PN1-SPO-ONK-02': 'PENHA',
  'VIP-GRU-5-SPO-ONK-02': 'GUARULHOS 5',
  'VIP-SMP-SPO-ONK-02': 'SÃO MIGUEL PAULISTA',
  'VIP-DDA-CAE-OHW-01': 'DIADEMA',
  'VIP-SMP-SPO-ONK-01': 'SÃO MIGUEL PAULISTA',
  'VIP-GRU-2-SPO-ONK-01': 'GUARULHOS 2',
  'VIP-CT2-SPO-OHW-01': 'CIDADE TIRADENTES 2',
  'VIP-GRU-5-SPO-ONK-01': 'GUARULHOS 5',
  'VIP-GRU-3-SPO-ONK-04': 'GUARULHOS 3',
  'VIP-GZ2-SPO-OHW-03': 'GUAIANASES 2',
  'VIP-ARI-SPO-ONK-02': 'ARICANDUVA',
  'VIP-SRF-SPO-OHW-02': 'SÃO RAFAEL',
  'VIP-DDA-SER-OHW-02': 'DIADEMA',
  'VIP-GRU-3-SPO-ONK-01': 'GUARULHOS 3',
  'VIP-GRU-4-SPO-ONK-01': 'GUARULHOS 4',
  'VIP-CT2-SPO-OHW-02': 'CIDADE TIRADENTES 2',
  'VIP-GRU-4-SPO-ONK-02': 'GUARULHOS 4',
  'VIP-DDA-VTO-OHW-03': 'DIADEMA',
  'VIP-SZN-SPO-OHW-01': 'SUZANO',
  'VIP-TUR-MAU-OHW-01': 'MAUÁ',
  'VIP-PAL-SPO-OHW-01': 'PALMEIRAS',
  'VIP-SZN-SPO-OHW-02': 'SUZANO',
  'VIP-FZ2-SPO-OHW-01': 'FERRAZ DE VASCONCELOS 2',
  'VIP-PAL-SPO-OHW-02': 'PALMEIRAS',
  'VIP-MG2-ALT-ONK-01': 'MOGI DAS CRUZES',
  'VIP-CCL-RBP-OHW-01': 'RIBEIRÃO PIRES',
  'VIP-FZ1-SPO-OHW-01': 'FERRAZ DE VASCONCELOS 1',
  'VIP-BSK-MDC-OHW-01': 'MOGI DAS CRUZES',
  'VIP-RGS-GSP-OZT-01': 'RIO GRANDE DA SERRA',
  'VIP-STZ-MAU-OHW-01': 'SÃO BERNARDO DOS CAMPOS',
  'VIP-GIU-MAU-OHW-01': 'SÃO RAFAEL',
  'VIP-FZ2-SPO-OHW-02': 'FERRAZ DE VASCONCELOS 2',
  'VIP-MG2-ALT-ONK-02': 'MOGI 2',
  'VIP-PN1-SPO-ONK-03': 'PENHA',
  'OLT-NK-IGGR-01': 'MOGI 1',
});

const manualOltRegionMap = new Map<string, string>();

function normalizeText(value: string | null | undefined) {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').replace(/\s*[,;/]\s*/g, ', ').trim();
}

function normalizeOltCode(value: string | null | undefined) {
  if (!value) return null;
  return value.trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
}

export function setManualOltRegion(olt: string | null | undefined, region: string) {
  const normalizedOlt = normalizeOltCode(olt);
  if (!normalizedOlt || !region.trim()) return;
  manualOltRegionMap.set(normalizedOlt, region.trim());
}

export function clearManualOltRegion(olt: string | null | undefined) {
  const normalizedOlt = normalizeOltCode(olt);
  if (!normalizedOlt) return;
  manualOltRegionMap.delete(normalizedOlt);
}

export function resolveOltRegion(olt: string | null | undefined) {
  const normalizedOlt = normalizeOltCode(olt);
  if (!normalizedOlt) return { region: null, source: 'none' as const, olt: null };
  const manualRegion = manualOltRegionMap.get(normalizedOlt);
  if (manualRegion) return { region: manualRegion, source: 'manual' as const, olt: normalizedOlt };
  const defaultRegion = defaultOltRegionMap[normalizedOlt];
  if (defaultRegion) return { region: defaultRegion, source: 'default' as const, olt: normalizedOlt };
  return { region: null, source: 'none' as const, olt: normalizedOlt };
}

function valueBetween(text: string, start: RegExp, end: RegExp) {
  const match = text.match(new RegExp(`${start.source}([\\s\\S]*?)(?=${end.source}|$)`, 'i'));
  return match?.[1]?.trim() || null;
}

function cleanAddressText(value: string | null) {
  if (!value) return null;
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cityLineIndex = lines.findIndex((line) => /,\s*[^,]+?\s*-\s*[A-Z]{2}\s*$/i.test(line));
  if (cityLineIndex >= 0) return lines.slice(0, cityLineIndex + 1).join(' ').trim();
  while (lines.length && /^(?:N\s*\/\s*A|NA|NÃO INFORMADA|NAO INFORMADA|NÃO INFORMADO|NAO INFORMADO)$/i.test(lines[lines.length - 1])) lines.pop();
  return lines.join(' ').trim() || null;
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

function cleanNeighborhoodCandidate(value: string | null) {
  if (!value) return null;
  let candidate = normalizeText(value)
    .replace(/\b(?:NAO|NÃO)\s+INFORMADO\b/g, ' ')
    .replace(/\b(?:NAO|NÃO)\b/g, ' ')
    .replace(/\b(?:REGIAO|REGIÃO)\b/g, ' ')
    .replace(/\b(?:RUA|AVENIDA|AV|ALAMEDA|TRAVESSA|ESTRADA|RODOVIA|VIA)\b/g, ' ')
    .replace(/^\d+\s*/g, '')
    .replace(/\s*[-:;,.]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  candidate = candidate.replace(/^(?:N\/A|NA|SEM|NENHUM|NENHUMA)\s*/i, '').trim();
  if (!candidate || /^(?:SAO PAULO|SP|SÃO PAULO|CIDADE|ESTADO|UF|MUNICIPIO)$/i.test(candidate)) return null;
  return candidate || null;
}

function inferNeighborhood(address: string | null) {
  if (!address) return null;
  const normalized = normalizeText(address);
  const cityMatch = normalized.match(/,\s*[^,]+\s*-\s*[A-Z]{2}\s*$/);
  const beforeCity = cityMatch ? normalized.slice(0, cityMatch.index) : normalized;
  const base = normalizeAddressBase(address);
  let remainder = base ? beforeCity.slice(base.length) : beforeCity;
  remainder = remainder.replace(/\b(APARTAMENTO|APTO|APT)\s*[:#]?\s*[A-Z0-9-]+/g, '').replace(/(?:\bBLOCO|\bBL\.?)\s*[:#]?\s*(?:BL\s*)?[A-Z0-9_-]+/g, '').replace(/\bFTTA\s*-?\s*[A-Z0-9-]*/g, '').replace(/\bCOND(?:OMINIO)?\.?\s*[^,]*?(?=\bAP\b|,|$)/g, '').replace(/\bAP(?=\s+[A-Z])/g, '');
  const parts = remainder.split(/[,-]/).map((part) => cleanNeighborhoodCandidate(part)).filter((part): part is string => Boolean(part));
  if (parts.length) return parts[parts.length - 1] || null;
  const fallback = normalized.split(/[,-]/).map((part) => cleanNeighborhoodCandidate(part)).filter((part): part is string => Boolean(part));
  return fallback[fallback.length - 1] || null;
}

export function parseNocAddress(raw: string): NocAddressRecord {
  const header = raw.match(/(?:^|\n)\s*NOME\s*:\s*(.*?)\s*\|\s*CONTRATO\s*:\s*([^\n|]+)/i);
  const nome = header?.[1]?.trim() || valueBetween(raw, /(?:^|\n)\s*NOME\s*:\s*/i, /\n\s*CONTRATO\s*:/i);
  const contrato = header?.[2]?.trim() || valueBetween(raw, /(?:^|\n)\s*CONTRATO\s*:\s*/i, /\n\s*CEP\s*:/i);
  const cep = raw.match(/\bCEP\s*:\s*([0-9]{5}[-.]?[0-9]{3})/i)?.[1] || null;
  const labeledAddress = valueBetween(raw, /(?:^|\n)\s*ENDERE[CÇ]O\s*:\s*/i, /\n\s*(?:COMP\.?\s*\/\s*REF|COMPLEMENTO|REFER[EÊ]NCIA)\s*:/i);
  const fallbackAddress = raw.replace(/^.*?\bCEP\s*:\s*[0-9]{5}[-.]?[0-9]{3}\s*/is, '').trim();
  const endereco = cleanAddressText(labeledAddress || fallbackAddress);
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
  if (!clientes.length) {
    return { clientes: [], enderecoPrincipal: null, bairroPrincipal: null, cepPrincipal: null, enderecoBaseCounts: {} };
  }
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