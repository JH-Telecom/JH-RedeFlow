import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '../integrations/supabase/client.js';
import type { IntegrationEvent, IntegrationEventKind } from '../integration-health.js';

// Registro do que a coleta do OFS (e os avisos de prazo) fez: tabela integration_events, 14 dias.
// Falha ao gravar nunca derruba a coleta (so loga).
const RETENTION_DAYS = 14;
const memory: IntegrationEvent[] = [];
let lastPrune = 0;

export async function recordIntegrationEvent(kind: IntegrationEventKind, ok: boolean, summary: string, details: Record<string, unknown> = {}): Promise<void> {
  const event: IntegrationEvent = { id: randomUUID(), kind, ok, summary: summary.slice(0, 500), details, createdAt: new Date().toISOString() };
  try {
    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin();
      const { error } = await admin.from('integration_events').insert({ id: event.id, kind, ok, summary: event.summary, details, created_at: event.createdAt });
      if (error) throw new Error(error.message);
      if (Date.now() - lastPrune > 3_600_000) {
        lastPrune = Date.now();
        await admin.from('integration_events').delete().lt('created_at', new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString());
      }
      return;
    }
    memory.unshift(event);
    memory.splice(2000);
  } catch (error) {
    console.warn(`[Integracao] nao foi possivel registrar o evento ${kind}: ${error instanceof Error ? error.message : error}`);
  }
}

export async function listIntegrationEvents(sinceHours = 72, kinds?: IntegrationEventKind[]): Promise<IntegrationEvent[]> {
  const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
  if (isSupabaseConfigured()) {
    let query = getSupabaseAdmin().from('integration_events').select('id, kind, ok, summary, details, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(500);
    if (kinds?.length) query = query.in('kind', kinds);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map((row) => ({ id: row.id, kind: row.kind, ok: row.ok, summary: row.summary, details: (row.details || {}) as Record<string, unknown>, createdAt: row.created_at }));
  }
  return memory.filter((event) => event.createdAt >= since && (!kinds?.length || kinds.includes(event.kind)));
}

// So para os testes.
export function resetIntegrationEventsForTests() { memory.length = 0; }
