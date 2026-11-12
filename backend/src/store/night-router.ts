import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '../integrations/supabase/client.js';
import type { NightRun, NightRunResult, NightRouterSettings, NightShift } from '../night-router.js';

// Roteirizador da madrugada: liga/desliga + modo teste, escala de plantao (regiao x dia da semana -> tecnico) e o
// historico do que o robo fez. So o backend (service_role) le e grava.
const missing = (message: string) => /night_router/.test(message) ? 'As tabelas do roteirizador ainda nao existem no banco (falta a migracao night_router).' : message;

const memory = { settings: { enabled: false, testMode: true, updatedAt: null, updatedBy: null } as NightRouterSettings, shifts: [] as NightShift[], runs: [] as NightRun[] };

export async function getNightRouterSettings(): Promise<NightRouterSettings> {
  if (!isSupabaseConfigured()) return { ...memory.settings };
  const { data, error } = await getSupabaseAdmin().from('night_router_settings').select('enabled, test_mode, updated_at, updated_by').eq('id', 1).maybeSingle();
  if (error) throw new Error(missing(error.message));
  return { enabled: Boolean(data?.enabled), testMode: data ? Boolean(data.test_mode) : true, updatedAt: data?.updated_at ?? null, updatedBy: data?.updated_by ?? null };
}

export async function saveNightRouterSettings(input: { enabled: boolean; testMode: boolean }, actorName: string): Promise<NightRouterSettings> {
  const updatedAt = new Date().toISOString();
  if (!isSupabaseConfigured()) { memory.settings = { ...input, updatedAt, updatedBy: actorName }; return { ...memory.settings }; }
  const { error } = await getSupabaseAdmin().from('night_router_settings').upsert({ id: 1, enabled: input.enabled, test_mode: input.testMode, updated_at: updatedAt, updated_by: actorName });
  if (error) throw new Error(missing(error.message));
  return getNightRouterSettings();
}

export async function listNightShifts(): Promise<NightShift[]> {
  if (!isSupabaseConfigured()) return memory.shifts.map((shift) => ({ ...shift }));
  const { data, error } = await getSupabaseAdmin().from('night_router_shifts').select('region, weekday, technician_id').order('region').order('weekday');
  if (error) throw new Error(missing(error.message));
  return (data || []).map((row) => ({ region: row.region, weekday: row.weekday, technicianId: row.technician_id }));
}

// Troca a escala inteira pela enviada (a tela manda a grade completa).
export async function replaceNightShifts(shifts: NightShift[]): Promise<NightShift[]> {
  const unique = new Map(shifts.map((shift) => [`${shift.region}|${shift.weekday}`, shift]));
  const next = [...unique.values()];
  if (!isSupabaseConfigured()) { memory.shifts = next.map((shift) => ({ ...shift })); return listNightShifts(); }
  const admin = getSupabaseAdmin();
  const { error: deleteError } = await admin.from('night_router_shifts').delete().gte('weekday', 0);
  if (deleteError) throw new Error(missing(deleteError.message));
  if (next.length) {
    const { error } = await admin.from('night_router_shifts').insert(next.map((shift) => ({ region: shift.region, weekday: shift.weekday, technician_id: shift.technicianId })));
    if (error) throw new Error(missing(error.message));
  }
  return listNightShifts();
}

type RunRow = { id: string; call_id: string | null; order_number: string; region: string | null; technician_id: string | null; technician_name: string | null; result: string; message: string | null; test_mode: boolean; created_at: string };
const mapRun = (row: RunRow): NightRun => ({ id: row.id, callId: row.call_id, orderNumber: row.order_number, region: row.region || '', technicianId: row.technician_id, technicianName: row.technician_name || '', result: row.result as NightRunResult, message: row.message || '', testMode: Boolean(row.test_mode), createdAt: row.created_at });

export async function listNightRuns(options: { since?: string; limit?: number } = {}): Promise<NightRun[]> {
  const limit = Math.min(options.limit ?? 100, 500);
  if (!isSupabaseConfigured()) return memory.runs.filter((run) => !options.since || run.createdAt >= options.since).slice(0, limit).map((run) => ({ ...run }));
  let query = getSupabaseAdmin().from('night_router_runs').select('id, call_id, order_number, region, technician_id, technician_name, result, message, test_mode, created_at').order('created_at', { ascending: false }).limit(limit);
  if (options.since) query = query.gte('created_at', options.since);
  const { data, error } = await query;
  if (error) throw new Error(missing(error.message));
  return (data || []).map((row) => mapRun(row as RunRow));
}

export async function addNightRuns(runs: Array<Omit<NightRun, 'id' | 'createdAt'>>, machine: string | null) {
  if (!runs.length) return;
  const createdAt = new Date().toISOString();
  if (!isSupabaseConfigured()) { memory.runs.unshift(...runs.map((run) => ({ ...run, id: randomUUID(), createdAt }))); memory.runs.splice(1000); return; }
  const { error } = await getSupabaseAdmin().from('night_router_runs').insert(runs.map((run) => ({ call_id: run.callId, order_number: run.orderNumber, region: run.region, technician_id: run.technicianId, technician_name: run.technicianName, result: run.result, message: run.message.slice(0, 500), test_mode: run.testMode, machine, created_at: createdAt })));
  if (error) throw new Error(missing(error.message));
}
