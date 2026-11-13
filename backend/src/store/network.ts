import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '../integrations/supabase/client.js';

// Mapa da rede (13/11/2026): elementos (POP, CTO, CEO), cabos, arquivos importados e POP -> OLT.
// Sem Supabase (modo demonstracao/testes) tudo fica em memoria; com Supabase, nas tabelas network_*.
export type NetElement = { kind: 'pop' | 'cto' | 'ceo' | 'outro'; code: string | null; name: string; projectCode: string | null; pop: string | null; fh: string | null; lat: number; lng: number };
export type NetCable = { name: string; color: string | null; points: [number, number][] }; // pontos [lng, lat]
export type NetElementRow = NetElement & { id: string; sourceFile: string };
export type NetCableRow = NetCable & { id: string; sourceFile: string };
export type NetworkBox = { minLat: number; minLng: number; maxLat: number; maxLng: number };
export type NetworkSource = { fileName: string; elements: number; cables: number; importedBy: string; importedAt: string };
export type PopOlt = { pop: string; olt: string; active: boolean; note: string | null; confirmedBy: string | null; updatedAt: string };
export type NetworkBatch = { fileName: string; sha256: string; first: boolean; elements: NetElement[]; cables: NetCable[] };

const CLUSTER_ZOOM = 15; // abaixo disso CTOs/CEOs viram clusters
const CLUSTER_GRID = 0.005; // graus
const MAX_ELEMENTS = 5000;
const MAX_CABLES = 3000;
const MAX_CLUSTER_SOURCE = 100_000; // linhas lidas so com lat/lng para agrupar
const CHUNK = 500;
const PAGE = 1000; // limite do Supabase por requisicao
const MISSING = 'As tabelas do mapa ainda nao existem no banco (falta a migracao network_map).';

const memoryElements = new Map<string, NetElementRow>();
const memoryCables = new Map<string, NetCableRow>();
const memorySources = new Map<string, NetworkSource & { sha256: string }>();
const memoryPopOlts = new Map<string, PopOlt>();

// So para os testes: limpa o estado em memoria.
export function resetNetworkMemory() {
  memoryElements.clear();
  memoryCables.clear();
  memorySources.clear();
  memoryPopOlts.clear();
}

function fail(error: { message: string }): never {
  throw new Error(/network_(elements|cables|sources|pop_olts)/.test(error.message) ? MISSING : error.message);
}
function chunks<T>(items: T[], size = CHUNK) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
function cableBox(points: [number, number][]): NetworkBox {
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const [lng, lat] of points) { minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat); minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng); }
  return { minLat, minLng, maxLat, maxLng };
}
function dedupeByCode(elements: NetElement[]) {
  const withCode = new Map<string, NetElement>();
  const without: NetElement[] = [];
  for (const element of elements) {
    if (element.code) withCode.set(element.code, element); // o ultimo do lote vale
    else without.push(element);
  }
  return [...withCode.values(), ...without];
}

type ElementDbRow = { id: string; kind: string; code: string | null; name: string | null; project_code: string | null; pop: string | null; fh: string | null; lat: number; lng: number; source_file: string };
const ELEMENT_COLUMNS = 'id, kind, code, name, project_code, pop, fh, lat, lng, source_file';
const mapElement = (row: ElementDbRow): NetElementRow => ({ id: row.id, kind: row.kind as NetElement['kind'], code: row.code, name: row.name || '', projectCode: row.project_code, pop: row.pop, fh: row.fh, lat: row.lat, lng: row.lng, sourceFile: row.source_file });
type CableDbRow = { id: string; name: string | null; color: string | null; points: [number, number][]; source_file: string };
const mapCable = (row: CableDbRow): NetCableRow => ({ id: row.id, name: row.name || '', color: row.color, points: row.points, sourceFile: row.source_file });

export async function saveNetworkBatch(input: NetworkBatch, by: string): Promise<{ elements: number; cables: number }> {
  const elements = dedupeByCode(input.elements);
  const cables = input.cables.filter((item) => item.points.length > 0);
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    if (input.first) {
      for (const [id, row] of memoryElements) if (row.sourceFile === input.fileName) memoryElements.delete(id);
      for (const [id, row] of memoryCables) if (row.sourceFile === input.fileName) memoryCables.delete(id);
    }
    for (const element of elements) {
      const existing = element.code ? [...memoryElements.values()].find((row) => row.code === element.code) : undefined;
      const id = existing?.id || randomUUID();
      memoryElements.set(id, { ...element, id, sourceFile: input.fileName }); // o arquivo mais recente passa a ser o dono
    }
    for (const item of cables) { const id = randomUUID(); memoryCables.set(id, { ...item, id, sourceFile: input.fileName }); }
    const owned = (rows: Iterable<{ sourceFile: string }>) => [...rows].filter((row) => row.sourceFile === input.fileName).length;
    memorySources.set(input.fileName, { fileName: input.fileName, sha256: input.sha256, elements: owned(memoryElements.values()), cables: owned(memoryCables.values()), importedBy: by, importedAt: now });
    return { elements: elements.length, cables: cables.length };
  }
  const admin = getSupabaseAdmin();
  if (input.first) {
    const deletedElements = await admin.from('network_elements').delete().eq('source_file', input.fileName);
    if (deletedElements.error) fail(deletedElements.error);
    const deletedCables = await admin.from('network_cables').delete().eq('source_file', input.fileName);
    if (deletedCables.error) fail(deletedCables.error);
  }
  // O indice unico de code e parcial (where code is not null), que o upsert do PostgREST nao infere:
  // apaga os codigos que ja existem (venham de onde vierem) e insere de novo com este arquivo como dono.
  const codes = elements.map((element) => element.code).filter(Boolean) as string[];
  for (const part of chunks(codes)) {
    const { error } = await admin.from('network_elements').delete().in('code', part);
    if (error) fail(error);
  }
  for (const part of chunks(elements)) {
    const { error } = await admin.from('network_elements').insert(part.map((element) => ({ kind: element.kind, code: element.code, name: element.name, project_code: element.projectCode, pop: element.pop, fh: element.fh, lat: element.lat, lng: element.lng, source_file: input.fileName, imported_at: now })));
    if (error) fail(error);
  }
  for (const part of chunks(cables)) {
    const { error } = await admin.from('network_cables').insert(part.map((item) => {
      const box = cableBox(item.points);
      return { name: item.name, color: item.color, points: item.points, min_lat: box.minLat, min_lng: box.minLng, max_lat: box.maxLat, max_lng: box.maxLng, source_file: input.fileName };
    }));
    if (error) fail(error);
  }
  const countElements = await admin.from('network_elements').select('id', { count: 'exact', head: true }).eq('source_file', input.fileName);
  if (countElements.error) fail(countElements.error);
  const countCables = await admin.from('network_cables').select('id', { count: 'exact', head: true }).eq('source_file', input.fileName);
  if (countCables.error) fail(countCables.error);
  const { error } = await admin.from('network_sources').upsert({ file_name: input.fileName, sha256: input.sha256, elements: countElements.count ?? 0, cables: countCables.count ?? 0, imported_by: by, imported_at: now }, { onConflict: 'file_name' });
  if (error) fail(error);
  return { elements: elements.length, cables: cables.length };
}

export async function listNetworkSources(): Promise<NetworkSource[]> {
  if (!isSupabaseConfigured()) return [...memorySources.values()].map(({ sha256: _sha, ...source }) => ({ ...source })).sort((a, b) => a.fileName.localeCompare(b.fileName, 'pt-BR'));
  const { data, error } = await getSupabaseAdmin().from('network_sources').select('file_name, elements, cables, imported_by, imported_at').order('file_name');
  if (error) fail(error);
  return (data || []).map((row) => ({ fileName: row.file_name, elements: row.elements ?? 0, cables: row.cables ?? 0, importedBy: row.imported_by || '', importedAt: row.imported_at }));
}

const inBox = (lat: number, lng: number, box: NetworkBox) => lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;

function clusterize(points: Array<{ lat: number; lng: number }>) {
  const cells = new Map<string, { latSum: number; lngSum: number; count: number }>();
  for (const point of points) {
    const key = `${Math.floor(point.lat / CLUSTER_GRID)}:${Math.floor(point.lng / CLUSTER_GRID)}`;
    const cell = cells.get(key) || { latSum: 0, lngSum: 0, count: 0 };
    cell.latSum += point.lat; cell.lngSum += point.lng; cell.count += 1;
    cells.set(key, cell);
  }
  return [...cells.values()].map((cell) => ({ lat: cell.latSum / cell.count, lng: cell.lngSum / cell.count, count: cell.count }));
}

// Le paginas de ate 1000 linhas (limite do Supabase) ate `limit` linhas ou ate a ultima pagina.
async function paged<T>(limit: number, build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  while (rows.length < limit) {
    const to = Math.min(rows.length + PAGE, limit) - 1;
    const { data, error } = await build(rows.length, to);
    if (error) fail(error);
    const got = data || [];
    rows.push(...got);
    if (got.length < to - (rows.length - got.length) + 1) break;
  }
  return rows;
}

export async function listNetworkArea(box: NetworkBox, zoom: number): Promise<{ elements: NetElementRow[]; clusters: Array<{ lat: number; lng: number; count: number }>; cables: NetCableRow[] }> {
  const grouped = zoom < CLUSTER_ZOOM;
  if (!isSupabaseConfigured()) {
    const inside = [...memoryElements.values()].filter((row) => inBox(row.lat, row.lng, box));
    const elements = (grouped ? inside.filter((row) => row.kind === 'pop') : inside).slice(0, MAX_ELEMENTS);
    const clusters = grouped ? clusterize(inside.filter((row) => row.kind !== 'pop')) : [];
    const cables = [...memoryCables.values()].filter((row) => { const b = cableBox(row.points); return b.minLat <= box.maxLat && b.maxLat >= box.minLat && b.minLng <= box.maxLng && b.maxLng >= box.minLng; }).slice(0, MAX_CABLES);
    return { elements, clusters, cables };
  }
  const admin = getSupabaseAdmin();
  const elementRows = await paged<ElementDbRow>(MAX_ELEMENTS, (from, to) => {
    let query = admin.from('network_elements').select(ELEMENT_COLUMNS).gte('lat', box.minLat).lte('lat', box.maxLat).gte('lng', box.minLng).lte('lng', box.maxLng);
    if (grouped) query = query.eq('kind', 'pop');
    return query.order('id').range(from, to);
  });
  let clusters: Array<{ lat: number; lng: number; count: number }> = [];
  if (grouped) {
    const points = await paged<{ lat: number; lng: number }>(MAX_CLUSTER_SOURCE, (from, to) => admin.from('network_elements').select('lat, lng').neq('kind', 'pop').gte('lat', box.minLat).lte('lat', box.maxLat).gte('lng', box.minLng).lte('lng', box.maxLng).order('id').range(from, to));
    clusters = clusterize(points);
  }
  const cableRows = await paged<CableDbRow>(MAX_CABLES, (from, to) => admin.from('network_cables').select('id, name, color, points, source_file').lte('min_lat', box.maxLat).gte('max_lat', box.minLat).lte('min_lng', box.maxLng).gte('max_lng', box.minLng).order('id').range(from, to));
  return { elements: elementRows.map(mapElement), clusters, cables: cableRows.map(mapCable) };
}

type PopOltDbRow = { pop: string; olt: string; active: boolean | null; note: string | null; confirmed_by: string | null; updated_at: string };
const mapPopOlt = (row: PopOltDbRow): PopOlt => ({ pop: row.pop, olt: row.olt, active: row.active !== false, note: row.note, confirmedBy: row.confirmed_by, updatedAt: row.updated_at });
const byPopOlt = (a: PopOlt, b: PopOlt) => a.pop.localeCompare(b.pop, 'pt-BR') || a.olt.localeCompare(b.olt, 'pt-BR');

export async function listPopOlts(): Promise<PopOlt[]> {
  if (!isSupabaseConfigured()) return [...memoryPopOlts.values()].map((row) => ({ ...row })).sort(byPopOlt);
  const { data, error } = await getSupabaseAdmin().from('network_pop_olts').select('pop, olt, active, note, confirmed_by, updated_at').order('pop').order('olt');
  if (error) fail(error);
  return (data || []).map((row) => mapPopOlt(row as PopOltDbRow));
}

export async function savePopOlt(input: { pop: string; olt: string; active: boolean; note?: string | null }, by: string): Promise<PopOlt> {
  const pop = input.pop.trim();
  const olt = input.olt.trim();
  const note = input.note?.trim() || null;
  if (!pop || !olt) throw new Error('Informe o POP e a OLT.');
  if (!input.active && !note) throw new Error('Para desativar, escreva o motivo.');
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const row: PopOlt = { pop, olt, active: input.active, note, confirmedBy: by, updatedAt: now };
    memoryPopOlts.set(`${pop}|${olt}`, row);
    return { ...row };
  }
  const { data, error } = await getSupabaseAdmin().from('network_pop_olts').upsert({ pop, olt, active: input.active, note, confirmed_by: by, updated_at: now }, { onConflict: 'pop,olt' }).select('pop, olt, active, note, confirmed_by, updated_at').single();
  if (error) fail(error);
  return mapPopOlt(data as PopOltDbRow);
}
