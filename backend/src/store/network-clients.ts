import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '../integrations/supabase/client.js';
import { RECENT_READING_MINUTES, markImprecise, nearestCto, normalizeOlt, normalizePonlink, situationOf, type Situation } from '../network.js';
import { listCtosInBox } from './network.js';

// Clientes lidos nas OLTs (so contrato, serial, int6, OLT, ponlink, sinal, status, ultimo contato, lat/lng; nunca nome/endereco/documento)
// e fila de leitura de PON. Sem Supabase fica em memoria; com Supabase, em network_clients e network_pon_requests.
export type NetClient = { contract: string; serial: string | null; int6: string | null; olt: string; ponlink: string; signalRx: number | null; onuStatus: string | null; lastInform: string | null; lat: number | null; lng: number | null; readAt: string };
export type PonRequestInfo = { requestedAt: string; doneAt: string | null; error: string | null; found: number | null; read: number | null };
export type PonClientView = NetClient & { situation: Situation; precise: boolean; nearestCto: { code: string | null; meters: number } | null };
export type PonViewResult = { clients: PonClientView[]; request: PonRequestInfo | null; summary: { total: number; problema: number; atencao: number; ok: number; sem: number } };
export type PonReadingInput = { requestId?: string; olt: string; ponlink: string; clients: NetClient[]; found: number; error?: string | null };

type MemoryRequest = { id: string; olt: string; ponlink: string; callId: string | null; requestedBy: string; requestedAt: string; doneAt: string | null; found: number | null; read: number | null; error: string | null };

const MAX_CLIENTS = 1000; // uma PON tem no maximo ~128 clientes
const CTO_BOX_PAD = 0.01; // graus em volta dos clientes para procurar CTO
const CTO_BOX_MAX = 0.1; // caixa maior que isso (clientes espalhados demais) fica sem CTO mais proxima
const MISSING = 'As tabelas do mapa ainda nao existem no banco (falta a migracao network_map).';

const memoryClients = new Map<string, NetClient>();
const memoryRequests = new Map<string, MemoryRequest>();

// So para os testes: limpa o estado em memoria.
export function resetNetworkClientsMemory() {
  memoryClients.clear();
  memoryRequests.clear();
}

function fail(error: { message: string }): never {
  throw new Error(/network_(clients|pon_requests)/.test(error.message) ? MISSING : error.message);
}

function key(olt: string, ponlink: string) {
  const normalizedOlt = normalizeOlt(olt);
  const normalizedPon = normalizePonlink(ponlink);
  if (!normalizedOlt || !normalizedPon) throw new Error('OLT ou PON invalida.');
  return { olt: normalizedOlt, ponlink: normalizedPon };
}

type ClientDbRow = { contract: string; serial: string | null; int6: string | null; olt: string; ponlink: string; signal_rx: number | null; onu_status: string | null; last_inform: string | null; lat: number | null; lng: number | null; read_at: string };
const CLIENT_COLUMNS = 'contract, serial, int6, olt, ponlink, signal_rx, onu_status, last_inform, lat, lng, read_at';
const mapClient = (row: ClientDbRow): NetClient => ({ contract: row.contract, serial: row.serial, int6: row.int6, olt: row.olt, ponlink: row.ponlink, signalRx: row.signal_rx, onuStatus: row.onu_status, lastInform: row.last_inform, lat: row.lat, lng: row.lng, readAt: row.read_at });
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// Monta o cliente campo a campo: nada alem dos campos do tipo vai para o banco.
function cleanClient(input: NetClient, olt: string, ponlink: string, fallbackReadAt: string): NetClient {
  const contract = String(input.contract ?? '').trim();
  if (!contract) throw new Error('Cliente sem contrato.');
  // readAt vem do relogio do Chrome: data no futuro vira "agora" (nao pode parecer leitura recente para sempre).
  const parsed = typeof input.readAt === 'string' ? Date.parse(input.readAt) : NaN;
  const readAt = Number.isNaN(parsed) || parsed > Date.parse(fallbackReadAt) ? fallbackReadAt : input.readAt;
  return { contract, serial: text(input.serial), int6: text(input.int6), olt, ponlink, signalRx: num(input.signalRx), onuStatus: text(input.onuStatus), lastInform: text(input.lastInform), lat: num(input.lat), lng: num(input.lng), readAt };
}

const recentCutoff = () => new Date(Date.now() - RECENT_READING_MINUTES * 60_000).toISOString();

// PON com leitura recente conta em skippedRecent; PON ja aberta na fila nao conta em nenhum dos dois.
export async function enqueuePons(items: Array<{ olt: string; ponlink: string }>, by: string, callId?: string): Promise<{ queued: number; skippedRecent: number }> {
  const unique = new Map<string, { olt: string; ponlink: string }>();
  for (const item of items) {
    const normalizedPon = normalizePonlink(item.ponlink);
    const normalizedOlt = normalizeOlt(item.olt);
    if (normalizedOlt && normalizedPon) unique.set(`${normalizedOlt}|${normalizedPon}`, { olt: normalizedOlt, ponlink: normalizedPon });
  }
  let queued = 0;
  let skippedRecent = 0;
  const cutoff = recentCutoff();
  for (const item of unique.values()) {
    if (!isSupabaseConfigured()) {
      const recent = [...memoryClients.values()].some((row) => row.olt === item.olt && row.ponlink === item.ponlink && row.readAt >= cutoff);
      if (recent) { skippedRecent += 1; continue; }
      if ([...memoryRequests.values()].some((row) => row.olt === item.olt && row.ponlink === item.ponlink && !row.doneAt)) continue;
      const id = randomUUID();
      memoryRequests.set(id, { id, ...item, callId: callId || null, requestedBy: by, requestedAt: new Date().toISOString(), doneAt: null, found: null, read: null, error: null });
      queued += 1;
      continue;
    }
    const admin = getSupabaseAdmin();
    const recent = await admin.from('network_clients').select('contract', { count: 'exact', head: true }).eq('olt', item.olt).eq('ponlink', item.ponlink).gte('read_at', cutoff);
    if (recent.error) fail(recent.error);
    if ((recent.count ?? 0) > 0) { skippedRecent += 1; continue; }
    const open = await admin.from('network_pon_requests').select('id').eq('olt', item.olt).eq('ponlink', item.ponlink).is('done_at', null).limit(1);
    if (open.error) fail(open.error);
    if ((open.data || []).length) continue;
    const { error } = await admin.from('network_pon_requests').insert({ olt: item.olt, ponlink: item.ponlink, call_id: callId || null, requested_by: by });
    if (error) {
      if ((error as { code?: string }).code === '23505') continue; // outro pedido aberto criado ao mesmo tempo
      fail(error);
    }
    queued += 1;
  }
  return { queued, skippedRecent };
}

export async function pendingPons(): Promise<Array<{ id: string; olt: string; ponlink: string }>> {
  if (!isSupabaseConfigured()) {
    return [...memoryRequests.values()].filter((row) => !row.doneAt).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)).map((row) => ({ id: row.id, olt: row.olt, ponlink: row.ponlink }));
  }
  const { data, error } = await getSupabaseAdmin().from('network_pon_requests').select('id, olt, ponlink').is('done_at', null).order('requested_at').limit(200);
  if (error) fail(error);
  return (data || []).map((row) => ({ id: row.id as string, olt: row.olt as string, ponlink: row.ponlink as string }));
}

export async function savePonReading(input: PonReadingInput, by: string): Promise<{ saved: number }> {
  const { olt, ponlink } = key(input.olt, input.ponlink);
  const now = new Date().toISOString();
  const byContract = new Map<string, NetClient>();
  for (const item of input.clients || []) {
    const cleaned = cleanClient(item, olt, ponlink, now);
    byContract.set(cleaned.contract, cleaned);
  }
  const rows = [...byContract.values()];
  const found = Number.isFinite(input.found) ? Math.max(0, Math.trunc(input.found)) : rows.length;
  const error = input.error?.trim() || null;
  if (!isSupabaseConfigured()) {
    for (const row of rows) memoryClients.set(row.contract, row);
    const open = [...memoryRequests.values()].find((request) => !request.doneAt && (input.requestId ? request.id === input.requestId : request.olt === olt && request.ponlink === ponlink));
    if (open) Object.assign(open, { doneAt: now, found, read: rows.length, error });
    return { saved: rows.length };
  }
  const admin = getSupabaseAdmin();
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500).map((row) => ({ contract: row.contract, serial: row.serial, int6: row.int6, olt: row.olt, ponlink: row.ponlink, signal_rx: row.signalRx, onu_status: row.onuStatus, last_inform: row.lastInform, lat: row.lat, lng: row.lng, read_at: row.readAt, read_by: by }));
    const { error: upsertError } = await admin.from('network_clients').upsert(part, { onConflict: 'contract' });
    if (upsertError) fail(upsertError);
  }
  const base = admin.from('network_pon_requests').update({ done_at: now, found, read: rows.length, error }).is('done_at', null);
  const closed = await (input.requestId ? base.eq('id', input.requestId) : base.eq('olt', olt).eq('ponlink', ponlink));
  if (closed.error) fail(closed.error);
  return { saved: rows.length };
}

async function loadClients(olt: string, ponlink: string): Promise<NetClient[]> {
  if (!isSupabaseConfigured()) return [...memoryClients.values()].filter((row) => row.olt === olt && row.ponlink === ponlink).sort((a, b) => a.contract.localeCompare(b.contract)).slice(0, MAX_CLIENTS);
  const { data, error } = await getSupabaseAdmin().from('network_clients').select(CLIENT_COLUMNS).eq('olt', olt).eq('ponlink', ponlink).order('contract').limit(MAX_CLIENTS);
  if (error) fail(error);
  return (data || []).map((row) => mapClient(row as ClientDbRow));
}

async function latestRequest(olt: string, ponlink: string): Promise<PonRequestInfo | null> {
  if (!isSupabaseConfigured()) {
    const latest = [...memoryRequests.values()].filter((row) => row.olt === olt && row.ponlink === ponlink).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
    return latest ? { requestedAt: latest.requestedAt, doneAt: latest.doneAt, error: latest.error, found: latest.found, read: latest.read } : null;
  }
  const { data, error } = await getSupabaseAdmin().from('network_pon_requests').select('requested_at, done_at, error, found, read').eq('olt', olt).eq('ponlink', ponlink).order('requested_at', { ascending: false }).limit(1);
  if (error) fail(error);
  const row = (data || [])[0];
  return row ? { requestedAt: row.requested_at as string, doneAt: (row.done_at as string | null) ?? null, error: (row.error as string | null) ?? null, found: (row.found as number | null) ?? null, read: (row.read as number | null) ?? null } : null;
}

export async function ponView(oltInput: string, ponlinkInput: string): Promise<PonViewResult> {
  const { olt, ponlink } = key(oltInput, ponlinkInput);
  const [clients, request] = await Promise.all([loadClients(olt, ponlink), latestRequest(olt, ponlink)]);
  const marked = markImprecise(clients);
  const precisePoints = marked.filter((item) => item.precise).map((item) => ({ lat: item.lat as number, lng: item.lng as number }));
  let ctos: Array<{ code: string | null; lat: number; lng: number }> = [];
  if (precisePoints.length) {
    const lats = precisePoints.map((p) => p.lat);
    const lngs = precisePoints.map((p) => p.lng);
    const box = { minLat: Math.min(...lats) - CTO_BOX_PAD, maxLat: Math.max(...lats) + CTO_BOX_PAD, minLng: Math.min(...lngs) - CTO_BOX_PAD, maxLng: Math.max(...lngs) + CTO_BOX_PAD };
    if (box.maxLat - box.minLat <= CTO_BOX_MAX && box.maxLng - box.minLng <= CTO_BOX_MAX) ctos = await listCtosInBox(box);
  }
  const summary = { total: marked.length, problema: 0, atencao: 0, ok: 0, sem: 0 };
  const view = marked.map((item): PonClientView => {
    const situation = situationOf(item.onuStatus);
    summary[situation] += 1;
    return { ...item, situation, nearestCto: item.precise ? nearestCto({ lat: item.lat as number, lng: item.lng as number }, ctos) : null };
  });
  return { clients: view, request, summary };
}
