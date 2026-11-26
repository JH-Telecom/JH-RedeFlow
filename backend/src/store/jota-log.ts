import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '../integrations/supabase/client.js';
import { addDays, operationalDayStartIso, toOperationalDate } from '../timezone.js';

// Uso do Jota H: cada pergunta (quem, como terminou, quantas linhas, de onde veio a resposta) e a avaliacao 👍/👎.
// Nunca o resultado.
export type JotaLogStatus = 'ok' | 'vazio' | 'erro' | 'recusada' | 'pergunta';
export type JotaProvider = 'groq' | 'gemini' | 'cache' | 'demo';
export type JotaLog = {
  id: string; userId: string | null; userName: string; question: string; title: string; sql: string; status: JotaLogStatus;
  rowCount: number | null; durationMs: number | null; error: string; feedback: -1 | 1 | null; createdAt: string;
  provider: JotaProvider | null; model: string; cached: boolean; repaired: boolean; aiMs: number | null;
};
export type JotaLogInput = Omit<JotaLog, 'id' | 'createdAt' | 'feedback' | 'provider' | 'model' | 'cached' | 'repaired' | 'aiMs'> & Partial<Pick<JotaLog, 'provider' | 'model' | 'cached' | 'repaired' | 'aiMs'>>;
const memory: JotaLog[] = [];
const missing = (message: string) => (/jota_h_log/.test(message) ? 'A tabela de uso do Jota H ainda nao existe no banco (falta a migracao jota_h).' : message);

export async function addJotaLog(input: JotaLogInput): Promise<string> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const entry = { provider: null, model: '', cached: false, repaired: false, aiMs: null, ...input };
  if (!isSupabaseConfigured()) { memory.unshift({ ...entry, id, createdAt, feedback: null }); memory.splice(2000); return id; }
  const { error } = await getSupabaseAdmin().from('jota_h_log').insert({
    id, user_id: entry.userId, user_name: entry.userName, question: entry.question.slice(0, 500), title: entry.title.slice(0, 160) || null, sql: entry.sql.slice(0, 6000) || null,
    status: entry.status, row_count: entry.rowCount, duration_ms: entry.durationMs, error: entry.error.slice(0, 500) || null, created_at: createdAt,
    provider: entry.provider, model: entry.model || null, cached: entry.cached, repaired: entry.repaired, ai_ms: entry.aiMs,
  });
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

type LogRow = { id: string; user_id: string | null; user_name: string | null; question: string; title: string | null; sql: string | null; status: JotaLogStatus; row_count: number | null; duration_ms: number | null; error: string | null; feedback: -1 | 1 | null; created_at: string; provider: JotaProvider | null; model: string | null; cached: boolean | null; repaired: boolean | null; ai_ms: number | null };
async function logsSince(since: string): Promise<JotaLog[]> {
  if (!isSupabaseConfigured()) return memory.filter((log) => log.createdAt >= since);
  const { data, error } = await getSupabaseAdmin().from('jota_h_log').select('id, user_id, user_name, question, title, sql, status, row_count, duration_ms, error, feedback, created_at, provider, model, cached, repaired, ai_ms').gte('created_at', since).order('created_at', { ascending: false }).limit(5000);
  if (error) throw new Error(missing(error.message));
  return ((data || []) as LogRow[]).map((row) => ({
    id: row.id, userId: row.user_id, userName: row.user_name || '', question: row.question, title: row.title || '', sql: row.sql || '', status: row.status, rowCount: row.row_count,
    durationMs: row.duration_ms, error: row.error || '', feedback: row.feedback, createdAt: row.created_at, provider: row.provider, model: row.model || '', cached: Boolean(row.cached), repaired: Boolean(row.repaired), aiMs: row.ai_ms,
  }));
}

// Mesma pergunta escrita de jeitos parecidos ("Quantos chamados hoje?" / "quantos chamados hoje") conta junto.
export function normalizeJotaQuestion(question: string) {
  return question.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[?!.\s]+$/g, '').replace(/\s+/g, ' ').trim();
}

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

export type JotaLogItem = { id: string; at: string; name: string; question: string; title: string; sql: string; error: string; status: JotaLogStatus };
export type JotaPanel = {
  days: number; total: number; today: number; people: number; errors: number; okRate: number;
  medianMs: number | null; cached: number; cacheRate: number; byProvider: Record<JotaProvider, number>; repaired: number; thumbsUp: number; thumbsDown: number;
  byDay: { day: string; total: number; errors: number }[];
  byPerson: { name: string; today: number; total: number; errors: number }[];
  errorList: JotaLogItem[]; top: { question: string; count: number; lastAt: string }[]; disliked: JotaLogItem[]; empty: JotaLogItem[]; liked: JotaLogItem[];
};

// Painel do Acompanhamento da IA: ultimos N dias (7 ou 30) ate hoje (dia de Sao Paulo).
export function summarizeJotaPanel(logs: JotaLog[], days = 7, today = toOperationalDate()): JotaPanel {
  const dayList = Array.from({ length: days }, (_, index) => addDays(today, index - days + 1));
  const dayOf = (log: JotaLog) => toOperationalDate(log.createdAt);
  const period = logs.filter((log) => dayOf(log) >= dayList[0] && dayOf(log) <= today).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const isError = (log: JotaLog) => log.status === 'erro';
  const item = (log: JotaLog): JotaLogItem => ({ id: log.id, at: log.createdAt, name: log.userName || 'Sem nome', question: log.question, title: log.title, sql: log.sql, error: log.error, status: log.status });
  const people = new Map<string, { name: string; today: number; total: number; errors: number }>();
  const questions = new Map<string, { question: string; count: number; lastAt: string }>();
  const byProvider: Record<JotaProvider, number> = { groq: 0, gemini: 0, cache: 0, demo: 0 };
  for (const log of period) {
    const key = log.userId || log.userName;
    const person = people.get(key) ?? { name: log.userName || 'Sem nome', today: 0, total: 0, errors: 0 };
    person.total += 1;
    if (dayOf(log) === today) person.today += 1;
    if (isError(log)) person.errors += 1;
    people.set(key, person);
    const normalized = normalizeJotaQuestion(log.question);
    const entry = questions.get(normalized) ?? { question: log.question, count: 0, lastAt: log.createdAt };
    entry.count += 1;
    questions.set(normalized, entry);
    if (log.provider) byProvider[log.provider] += 1;
  }
  const errors = period.filter(isError).length;
  const cached = period.filter((log) => log.cached).length;
  return {
    days,
    total: period.length,
    today: period.filter((log) => dayOf(log) === today).length,
    people: people.size,
    errors,
    okRate: period.length ? Math.round(((period.length - errors) / period.length) * 100) : 100,
    medianMs: median(period.filter((log) => !log.cached && log.aiMs !== null && (log.status === 'ok' || log.status === 'vazio')).map((log) => (log.aiMs ?? 0) + (log.durationMs ?? 0))),
    cached,
    cacheRate: period.length ? Math.round((cached / period.length) * 100) : 0,
    byProvider,
    repaired: period.filter((log) => log.repaired).length,
    thumbsUp: period.filter((log) => log.feedback === 1).length,
    thumbsDown: period.filter((log) => log.feedback === -1).length,
    byDay: dayList.map((day) => ({ day, total: period.filter((log) => dayOf(log) === day).length, errors: period.filter((log) => dayOf(log) === day && isError(log)).length })),
    byPerson: [...people.values()].sort((left, right) => right.total - left.total || right.today - left.today || left.name.localeCompare(right.name, 'pt-BR')).slice(0, 100),
    errorList: period.filter(isError).slice(0, 100).map(item),
    top: [...questions.values()].sort((left, right) => right.count - left.count || right.lastAt.localeCompare(left.lastAt)).slice(0, 100),
    disliked: period.filter((log) => log.feedback === -1).slice(0, 100).map(item),
    empty: period.filter((log) => log.status === 'vazio' || log.status === 'recusada').slice(0, 100).map(item),
    liked: period.filter((log) => log.feedback === 1 && log.sql).slice(0, 100).map(item),
  };
}

export async function jotaPanel(days = 7): Promise<JotaPanel> {
  const today = toOperationalDate();
  return summarizeJotaPanel(await logsSince(operationalDayStartIso(addDays(today, -(days - 1)))), days, today);
}
