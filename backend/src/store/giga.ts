import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, invalidateCallsSnapshot, isSupabaseConfigured } from '../integrations/supabase/client.js';
import { parseGigaWorkbook, type GigaOrder, type IgpIndicatorsRaw } from '../giga-workbook.js';
import { classifyCallArea, normalizeCluster, CLUSTER_AREAS } from '../igp.js';
import { DEFAULT_IGP_RULES, type IgpRules } from '../igp-score.js';
import { toOperationalDate } from '../timezone.js';
import type { Call } from '../types.js';
import { listCalls } from './calls.js';
import { calls as demoCalls } from './demo-data.js';

// Planilha da Giga no sistema (12/11/2026): importacao, ordens oficiais, conciliacao e regras do IGP ACESSO.
export type GigaImport = { id: string; fileName: string; month: string; mainCluster: string | null; closedUntil: string | null; ordersCount: number; matchedCount: number; indicators: Record<string, IgpIndicatorsRaw>; importedBy: string | null; importedAt: string };
export type StoredGigaOrder = GigaOrder & { callId: string | null };
const missing = (message: string) => (/giga_|igp_rules/.test(message) ? 'As tabelas da planilha da Giga ainda nao existem no banco (falta a migracao giga_igp).' : message);

const memory = { imports: [] as GigaImport[], orders: new Map<string, StoredGigaOrder>(), rules: null as IgpRules | null };

// Mesma regra das conciliacoes: BDESK (OS curta) ou ordem do OFS (OS_OFS / numero FIELD).
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
export function matchGigaOrders(orders: GigaOrder[], calls: Call[]) {
  const byKey = new Map<string, Call[]>();
  const add = (key: string, call: Call) => { if (key.length >= 6) byKey.set(key, [...(byKey.get(key) || []), call]); };
  for (const call of calls) {
    if (call.status === 'Cancelado') continue;
    add(digits(call.bdesk), call); add(digits(call.orderNumber), call); add(digits(call.officeTrack), call);
  }
  const pick = (candidates: Call[]) => [...new Set(candidates)].sort((left, right) => Date.parse(right.openedAt) - Date.parse(left.openedAt))[0];
  return orders.map((order) => {
    const candidates = [...(byKey.get(order.os) || []), ...(order.osOfs && order.osOfs !== order.os ? byKey.get(order.osOfs) || [] : [])];
    return { order, call: candidates.length ? pick(candidates) : undefined };
  });
}

const clusterCode = (giga: string) => normalizeCluster(giga) ?? null; // "C.8" -> "C08"

export async function importGigaWorkbook(buffer: Buffer, fileName: string, actorName: string) {
  const workbook = parseGigaWorkbook(buffer);
  const calls = await listCalls();
  const matches = matchGigaOrders(workbook.orders, calls);
  const importId = randomUUID();
  const importedAt = new Date().toISOString();
  const record: GigaImport = { id: importId, fileName, month: workbook.month, mainCluster: workbook.mainCluster, closedUntil: workbook.closedUntil, ordersCount: workbook.orders.length, matchedCount: matches.filter((item) => item.call).length, indicators: workbook.indicators, importedBy: actorName, importedAt };
  // Chamados que mudam: cluster/abertura/fechamento da Giga diferentes do que ja esta gravado.
  const callUpdates = matches.filter((item): item is { order: GigaOrder; call: Call } => Boolean(item.call)).map(({ order, call }) => ({ call, cluster: clusterCode(order.cluster), openedAt: order.openedAt, closedAt: order.closedAt }))
    .filter(({ call, cluster, openedAt, closedAt }) => call.gigaCluster !== (cluster ?? undefined) || Date.parse(call.gigaOpenedAt || '') !== Date.parse(openedAt || '') || Date.parse(call.gigaClosedAt || '') !== Date.parse(closedAt || ''));

  if (!isSupabaseConfigured()) {
    memory.imports.unshift(record);
    for (const { order, call } of matches) memory.orders.set(order.os, { ...order, callId: call?.id ?? null });
    for (const update of callUpdates) { const stored = demoCalls.get(update.call.id); if (stored) demoCalls.set(update.call.id, { ...stored, gigaCluster: update.cluster ?? undefined, gigaOpenedAt: update.openedAt ?? undefined, gigaClosedAt: update.closedAt ?? undefined }); }
    return { import: record, updatedCalls: callUpdates.length };
  }
  const admin = getSupabaseAdmin();
  const { error: importError } = await admin.from('giga_imports').insert({ id: importId, file_name: fileName, month: record.month, main_cluster: record.mainCluster, closed_until: record.closedUntil, orders_count: record.ordersCount, matched_count: record.matchedCount, indicators: record.indicators, imported_by: actorName, imported_at: importedAt });
  if (importError) throw new Error(missing(importError.message));
  const rows = matches.map(({ order, call }) => ({ os: order.os, os_ofs: order.osOfs || null, origin: order.origin, cluster: order.cluster, regional: order.regional, city: order.city, element: order.element, resource: order.resource, opened_at: order.openedAt, closed_at: order.closedAt, tme_hours: order.tmeHours, on_time: order.onTime, outlier: order.outlier, month: order.month, call_id: call?.id ?? null, import_id: importId, updated_at: importedAt }));
  for (let offset = 0; offset < rows.length; offset += 500) {
    const { error } = await admin.from('giga_orders').upsert(rows.slice(offset, offset + 500), { onConflict: 'os' });
    if (error) throw new Error(missing(error.message));
  }
  for (let offset = 0; offset < callUpdates.length; offset += 10) {
    await Promise.all(callUpdates.slice(offset, offset + 10).map(async (update) => {
      const { error } = await admin.from('calls').update({ giga_cluster: update.cluster, giga_opened_at: update.openedAt, giga_closed_at: update.closedAt }).eq('id', update.call.id);
      if (error) throw new Error(missing(error.message));
    }));
  }
  if (callUpdates.length) invalidateCallsSnapshot(true);
  return { import: record, updatedCalls: callUpdates.length };
}

type ImportRow = { id: string; file_name: string; month: string; main_cluster: string | null; closed_until: string | null; orders_count: number; matched_count: number; indicators: Record<string, IgpIndicatorsRaw>; imported_by: string | null; imported_at: string };
const mapImport = (row: ImportRow): GigaImport => ({ id: row.id, fileName: row.file_name, month: row.month, mainCluster: row.main_cluster, closedUntil: row.closed_until, ordersCount: row.orders_count, matchedCount: row.matched_count, indicators: row.indicators || {}, importedBy: row.imported_by, importedAt: row.imported_at });

// Importacoes do mes, da mais nova para a mais antiga (a primeira e a que vale).
export async function listGigaImports(month?: string, limit = 40): Promise<GigaImport[]> {
  if (!isSupabaseConfigured()) return memory.imports.filter((item) => !month || item.month === month).slice(0, limit);
  let query = getSupabaseAdmin().from('giga_imports').select('id, file_name, month, main_cluster, closed_until, orders_count, matched_count, indicators, imported_by, imported_at').order('imported_at', { ascending: false }).limit(limit);
  if (month) query = query.eq('month', month);
  const { data, error } = await query;
  if (error) throw new Error(missing(error.message));
  return (data || []).map((row) => mapImport(row as ImportRow));
}

export async function listGigaOrders(month: string): Promise<StoredGigaOrder[]> {
  if (!isSupabaseConfigured()) return [...memory.orders.values()].filter((order) => order.month === month);
  const out: StoredGigaOrder[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabaseAdmin().from('giga_orders').select('os, os_ofs, origin, cluster, regional, city, element, resource, opened_at, closed_at, tme_hours, on_time, outlier, month, call_id').eq('month', month).order('os').range(from, from + 999);
    if (error) throw new Error(missing(error.message));
    out.push(...(data || []).map((row) => ({ os: row.os, osOfs: row.os_ofs || '', origin: row.origin || '', cluster: row.cluster || '', regional: row.regional || '', city: row.city || '', element: row.element || '', resource: row.resource || '', openedAt: row.opened_at, closedAt: row.closed_at, tmeHours: row.tme_hours === null ? null : Number(row.tme_hours), onTime: row.on_time, outlier: row.outlier, month: row.month, callId: row.call_id })));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Conciliacao do mes (e cluster): ordens nas duas bases, so na Giga e so no sistema (finalizadas no mes, na mesma area).
export type Reconciliation = {
  both: number; onlyGiga: StoredGigaOrder[]; onlySystem: Array<Pick<Call, 'id' | 'orderNumber' | 'bdesk' | 'type' | 'region' | 'executedAt' | 'openedAt'>>;
  timeDiffs: Array<{ os: string; callId: string; orderNumber: string; origin: string; gigaClosedAt: string | null; systemClosedAt: string | null; minutes: number }>;
  closedUntil: string | null;
};
export function reconcile(orders: StoredGigaOrder[], calls: Call[], cluster: string, closedUntil: string | null): Reconciliation {
  const area = CLUSTER_AREAS[normalizeCluster(cluster) ?? ''];
  const mine = orders.filter((order) => order.cluster === cluster && order.origin !== 'BACKBONE');
  const linked = new Set(mine.map((order) => order.callId).filter(Boolean) as string[]);
  const allLinked = new Set(orders.map((order) => order.callId).filter(Boolean) as string[]);
  const month = mine[0]?.month || orders[0]?.month || '';
  const until = closedUntil ? Date.parse(closedUntil) : Infinity;
  const onlySystem = calls.filter((call) => call.status === 'Finalizado' && call.executedAt && !/NOC\s*TX/i.test(call.type) && toOperationalDate(call.executedAt).slice(0, 7) === month && Date.parse(call.executedAt) <= until && !allLinked.has(call.id) && area && classifyCallArea(call) === area)
    .sort((left, right) => Date.parse(right.executedAt!) - Date.parse(left.executedAt!))
    .map(({ id, orderNumber, bdesk, type, region, executedAt, openedAt }) => ({ id, orderNumber, bdesk, type, region, executedAt, openedAt }));
  const byId = new Map(calls.map((call) => [call.id, call]));
  const timeDiffs = mine.filter((order) => order.callId && order.closedAt).map((order) => {
    const call = byId.get(order.callId!);
    const minutes = call?.executedAt ? Math.round((Date.parse(call.executedAt) - Date.parse(order.closedAt!)) / 60_000) : NaN;
    return { os: order.os, callId: order.callId!, orderNumber: call?.orderNumber || '', origin: order.origin, gigaClosedAt: order.closedAt, systemClosedAt: call?.executedAt ?? null, minutes };
  }).filter((item) => Number.isFinite(item.minutes) && Math.abs(item.minutes) > 5).sort((left, right) => Math.abs(right.minutes) - Math.abs(left.minutes));
  return { both: linked.size, onlyGiga: mine.filter((order) => !order.callId), onlySystem, timeDiffs, closedUntil };
}

export async function getIgpRules(): Promise<{ rules: IgpRules; updatedAt: string | null; updatedBy: string | null }> {
  if (!isSupabaseConfigured()) return { rules: memory.rules ?? DEFAULT_IGP_RULES, updatedAt: null, updatedBy: null };
  const { data, error } = await getSupabaseAdmin().from('igp_rules').select('rules, updated_at, updated_by').eq('id', 1).maybeSingle();
  if (error) throw new Error(missing(error.message));
  return { rules: (data?.rules as IgpRules | undefined) ?? DEFAULT_IGP_RULES, updatedAt: data?.updated_at ?? null, updatedBy: data?.updated_by ?? null };
}

export async function saveIgpRules(rules: IgpRules, actorName: string) {
  if (!isSupabaseConfigured()) { memory.rules = rules; return getIgpRules(); }
  const { error } = await getSupabaseAdmin().from('igp_rules').upsert({ id: 1, rules, updated_at: new Date().toISOString(), updated_by: actorName });
  if (error) throw new Error(missing(error.message));
  return getIgpRules();
}
