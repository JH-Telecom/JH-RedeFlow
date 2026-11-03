import { getSupabaseAdmin, isSupabaseConfigured } from "../integrations/supabase/client.js";
import { getDefaultOltRegionMap, getManualOltRegionMap, normalizeOltCode, replaceManualOltRegionMap, resolveOltRegion } from "../integrations/wuzapi/noc-consolidation.js";
import type { SystemSettings } from "../types.js";
import { listCalls } from "./calls.js";
import { customOperationalRegions, ensureDemoData, now, oltRegionRequests, settings } from "./demo-data.js";

export function getSettings(): SystemSettings { return { ...settings }; }

export function updateSettings(input: Partial<SystemSettings>): SystemSettings { Object.assign(settings, input); return getSettings(); }

export type OltRegionMapping = { olt: string; region: string; defaultRegion?: string };

export type OltRegionRequest = { id: string; olt: string; source: string; status: 'Pendente' | 'Adicionada' | 'Ignorada'; occurrences: number; firstSeenAt: string; lastSeenAt: string; region?: string };

export async function listCustomOperationalRegions(): Promise<string[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('operational_regions').select('region').order('region', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((row) => row.region);
  }
  return [...customOperationalRegions.values()].sort((left, right) => left.localeCompare(right));
}

export async function addCustomOperationalRegion(value: string): Promise<string> {
  const region = value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
  if (!region || region.length > 160) throw new Error('Informe uma regiao com ate 160 caracteres.');
  const existing = await listCustomOperationalRegions();
  if (existing.some((item) => item.localeCompare(region, 'pt-BR', { sensitivity: 'accent' }) === 0)) {
    throw new Error('Esta regiao ja esta cadastrada.');
  }

  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin().from('operational_regions').insert({ region });
    if (error) throw new Error(error.message);
  } else {
    customOperationalRegions.set(region, region);
  }
  return region;
}

export async function readManualOltRegionMap(): Promise<Record<string, string>> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('olt_region_overrides').select('olt, region').order('olt', { ascending: true });
    if (error) throw new Error(error.message);
    return Object.fromEntries((data || []).map((row) => [row.olt, row.region]));
  }
  return getManualOltRegionMap();
}

export async function listOltRegionMappings(): Promise<OltRegionMapping[]> {
  const defaults = getDefaultOltRegionMap();
  const overrides = await readManualOltRegionMap();
  replaceManualOltRegionMap(overrides);
  const merged = { ...defaults, ...overrides };
  return Object.entries(merged).map(([olt, region]) => ({ olt, region, defaultRegion: defaults[olt] })).sort((left, right) => left.olt.localeCompare(right.olt));
}

export function mapOltRegionRequest(row: { id: string; olt: string; source: string; status: string; occurrences: number; first_seen_at: string; last_seen_at: string; region?: string | null }): OltRegionRequest {
  return { id: row.id, olt: row.olt, source: row.source, status: row.status as OltRegionRequest['status'], occurrences: row.occurrences, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, region: row.region || undefined };
}

export async function recordUnknownOltRequests(olts: Array<string | null | undefined>, source: string) {
  const unknown = [...new Set(olts.map((value) => normalizeOltCode(value)).filter((olt): olt is string => Boolean(olt) && !resolveOltRegion(olt).region))];
  if (!unknown.length) return 0;
  const now = new Date().toISOString();
  let recorded = 0;

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    for (const olt of unknown) {
      const { data: existing, error: readError } = await admin.from('olt_region_requests').select('id, status, occurrences').eq('olt', olt).maybeSingle();
      if (readError) throw new Error(readError.message);
      if (existing?.status === 'Pendente') {
        const { error } = await admin.from('olt_region_requests').update({ occurrences: Number(existing.occurrences || 1) + 1, last_seen_at: now, source }).eq('id', existing.id);
        if (error) throw new Error(error.message);
        recorded += 1;
      } else if (!existing) {
        const { error } = await admin.from('olt_region_requests').insert({ olt, source, status: 'Pendente', occurrences: 1, first_seen_at: now, last_seen_at: now });
        if (error && error.code !== '23505') throw new Error(error.message);
        if (!error) recorded += 1;
      }
    }
    return recorded;
  }


  ensureDemoData();
  for (const olt of unknown) {
    const existing = oltRegionRequests.get(olt);
    if (existing?.status === 'Ignorada' || existing?.status === 'Adicionada') continue;
    if (existing) {
      oltRegionRequests.set(olt, { ...existing, source, occurrences: existing.occurrences + 1, lastSeenAt: now });
    } else {
      oltRegionRequests.set(olt, { id: `olt-request-${crypto.randomUUID()}`, olt, source, status: 'Pendente', occurrences: 1, firstSeenAt: now, lastSeenAt: now });
    }
    recorded += 1;
  }
  return recorded;
}

export async function captureUnknownOltRequestsFromCalls() {
  try {
    const currentCalls = await listCalls();
    return await captureUnknownOltRequests(currentCalls.map((call) => call.olt), 'Chamados existentes');
  } catch (error) {
    console.error('[OLT] nao foi possivel procurar OLTs desconhecidas nos chamados:', error);
    return 0;
  }
}

export async function captureUnknownOltRequests(olts: Array<string | null | undefined>, source: string) {
  try {
    return await recordUnknownOltRequests(olts, source);
  } catch (error) {
    console.error(`[OLT] nao foi possivel registrar solicitacoes (${source}):`, error);
    return 0;
  }
}

export async function listOltRegionRequests(): Promise<OltRegionRequest[]> {
  let requests: OltRegionRequest[];
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('olt_region_requests').select('id, olt, source, status, occurrences, first_seen_at, last_seen_at, region').eq('status', 'Pendente').order('last_seen_at', { ascending: false });
    if (error) throw new Error(error.message);
    requests = (data || []).map(mapOltRegionRequest);
  } else {
    ensureDemoData();
    requests = [...oltRegionRequests.values()].filter((request) => request.status === 'Pendente').sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
  }
  return requests.filter((request) => !resolveOltRegion(request.olt).region);
}

export async function acceptOltRegionRequest(id: string, region: string) {
  const pending = (await listOltRegionRequests()).find((request) => request.id === id);
  if (!pending) throw new Error('A solicitação de OLT não está mais pendente.');
  const currentMappings = await listOltRegionMappings();
  const mappings = currentMappings.filter((mapping) => normalizeOltCode(mapping.olt) !== pending.olt);
  await saveOltRegionMappings([...mappings, { olt: pending.olt, region }]);
  const resolvedAt = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin().from('olt_region_requests').update({ status: 'Adicionada', region: region.trim(), resolved_at: resolvedAt }).eq('id', id).eq('status', 'Pendente');
    if (error) throw new Error(error.message);
  } else {
    oltRegionRequests.set(pending.olt, { ...pending, status: 'Adicionada', region: region.trim(), lastSeenAt: resolvedAt });
  }
  return { olt: pending.olt, region: region.trim() };
}

export async function ignoreOltRegionRequest(id: string) {
  const pending = (await listOltRegionRequests()).find((request) => request.id === id);
  if (!pending) throw new Error('A solicitação de OLT não está mais pendente.');
  const ignoredAt = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin().from('olt_region_requests').update({ status: 'Ignorada', resolved_at: ignoredAt }).eq('id', id).eq('status', 'Pendente');
    if (error) throw new Error(error.message);
  } else {
    oltRegionRequests.set(pending.olt, { ...pending, status: 'Ignorada', lastSeenAt: ignoredAt });
  }
  return { ignored: true, olt: pending.olt };
}

export async function saveOltRegionMappings(mappings: Array<{ olt: string; region: string }>): Promise<OltRegionMapping[]> {
  const defaults = getDefaultOltRegionMap();
  const overrides: Record<string, string> = {};
  for (const mapping of mappings) {
    const olt = normalizeOltCode(mapping.olt);
    const region = mapping.region.trim();
    if (!olt || !region) throw new Error('Informe uma OLT e uma regiao para cada mapeamento.');
    if (overrides[olt]) throw new Error(`A OLT ${olt} foi informada mais de uma vez.`);
    if (defaults[olt] !== region) overrides[olt] = region;
  }

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { error: deleteError } = await admin.from('olt_region_overrides').delete().not('olt', 'is', null);
    if (deleteError) throw new Error(deleteError.message);
    const rows = Object.entries(overrides).map(([olt, region]) => ({ olt, region, updated_at: new Date().toISOString() }));
    if (rows.length) {
      const { error } = await admin.from('olt_region_overrides').insert(rows);
      if (error) throw new Error(error.message);
    }
  }

  replaceManualOltRegionMap(overrides);
  const merged = { ...defaults, ...overrides };
  return Object.entries(merged).map(([olt, region]) => ({ olt, region, defaultRegion: defaults[olt] })).sort((left, right) => left.olt.localeCompare(right.olt));
}
