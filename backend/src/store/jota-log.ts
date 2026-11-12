import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '../integrations/supabase/client.js';
import { addDays, operationalDayStartIso, toOperationalDate } from '../timezone.js';

// Uso do Jota H: cada pergunta (quem, como terminou, quantas linhas) e a avaliacao 👍/👎. Nunca o resultado.
export type JotaLogStatus = 'ok' | 'vazio' | 'erro' | 'recusada' | 'pergunta';
export type JotaLog = { id: string; userId: string | null; userName: string; question: string; title: string; sql: string; status: JotaLogStatus; rowCount: number | null; durationMs: number | null; error: string; feedback: -1 | 1 | null; createdAt: string };
const memory: JotaLog[] = [];
const missing = (message: string) => (/jota_h_log/.test(message) ? 'A tabela de uso do Jota H ainda nao existe no banco (falta a migracao jota_h).' : message);

export async function addJotaLog(entry: Omit<JotaLog, 'id' | 'createdAt' | 'feedback'>): Promise<string> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  if (!isSupabaseConfigured()) { memory.unshift({ ...entry, id, createdAt, feedback: null }); memory.splice(2000); return id; }
  const { error } = await getSupabaseAdmin().from('jota_h_log').insert({ id, user_id: entry.userId, user_name: entry.userName, question: entry.question.slice(0, 500), title: entry.title.slice(0, 160) || null, sql: entry.sql.slice(0, 6000) || null, status: entry.status, row_count: entry.rowCount, duration_ms: entry.durationMs, error: entry.error.slice(0, 500) || null, created_at: createdAt });
  if (error) throw new Error(missing(error.message));
  return id;
}

// So quem perguntou avalia a propria resposta.
export async function setJotaFeedback(id: string, userId: string, feedback: -1 | 1): Promise<boolean> {
  if (!isSupabaseConfigured()) { const item = memory.find((log) => log.id === id && log.userId === userId); if (item) item.feedback = feedback; return Boolean(item); }
  const { data, error } = await getSupabaseAdmin().from('jota_h_log').update({ feedback }).eq('id', id).eq('user_id', userId).select('id');
  if (error) throw new Error(missing(error.message));
  return Boolean(data?.length);
}

async function logsSince(since: string): Promise<JotaLog[]> {
  if (!isSupabaseConfigured()) return memory.filter((log) => log.createdAt >= since);
  const { data, error } = await getSupabaseAdmin().from('jota_h_log').select('id, user_id, user_name, question, title, sql, status, row_count, duration_ms, error, feedback, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(5000);
  if (error) throw new Error(missing(error.message));
  return (data || []).map((row) => ({ id: row.id, userId: row.user_id, userName: row.user_name || '', question: row.question, title: row.title || '', sql: row.sql || '', status: row.status, rowCount: row.row_count, durationMs: row.duration_ms, error: row.error || '', feedback: row.feedback, createdAt: row.created_at }));
}

export type JotaUsage = {
  today: number; week: number; errors: number; errorRate: number; people: number; thumbsUp: number; thumbsDown: number;
  byDay: { day: string; total: number; errors: number }[];
  byPerson: { name: string; today: number; week: number; errors: number }[];
  recentErrors: { at: string; name: string; question: string; error: string }[];
  empty: { at: string; name: string; question: string }[];
};

export function summarizeJotaUsage(logs: JotaLog[], today = toOperationalDate()): JotaUsage {
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const dayOf = (log: JotaLog) => toOperationalDate(log.createdAt);
  const week = logs.filter((log) => dayOf(log) >= days[0]);
  const isError = (log: JotaLog) => log.status === 'erro';
  const people = new Map<string, { name: string; today: number; week: number; errors: number }>();
  for (const log of week) {
    const key = log.userId || log.userName;
    const item = people.get(key) ?? { name: log.userName || 'Sem nome', today: 0, week: 0, errors: 0 };
    item.week += 1;
    if (dayOf(log) === today) item.today += 1;
    if (isError(log)) item.errors += 1;
    people.set(key, item);
  }
  const errors = week.filter(isError).length;
  return {
    today: week.filter((log) => dayOf(log) === today).length,
    week: week.length,
    errors,
    errorRate: week.length ? Math.round((errors / week.length) * 100) : 0,
    people: people.size,
    thumbsUp: week.filter((log) => log.feedback === 1).length,
    thumbsDown: week.filter((log) => log.feedback === -1).length,
    byDay: days.map((day) => ({ day, total: week.filter((log) => dayOf(log) === day).length, errors: week.filter((log) => dayOf(log) === day && isError(log)).length })),
    byPerson: [...people.values()].sort((left, right) => right.today - left.today || right.week - left.week || left.name.localeCompare(right.name, 'pt-BR')).slice(0, 100),
    recentErrors: week.filter(isError).slice(0, 20).map((log) => ({ at: log.createdAt, name: log.userName, question: log.question, error: log.error })),
    empty: week.filter((log) => log.status === 'vazio' || log.status === 'recusada').slice(0, 20).map((log) => ({ at: log.createdAt, name: log.userName, question: log.question })),
  };
}

export async function jotaUsage(): Promise<JotaUsage> {
  const today = toOperationalDate();
  return summarizeJotaUsage(await logsSince(operationalDayStartIso(addDays(today, -6))), today);
}
