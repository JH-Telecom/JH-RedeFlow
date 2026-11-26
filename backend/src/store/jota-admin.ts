import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '../integrations/supabase/client.js';

// Acompanhamento da IA (26/11/2026): regras que a IA aprendeu (entram no prompt do Jota H, valem na proxima pergunta)
// e testes automaticos (pergunta + SQL certo). Sem banco (preview), ficam em memoria.
export type JotaRuleScope = 'todos' | 'lideranca';
export type JotaRule = { id: string; text: string; scope: JotaRuleScope; active: boolean; author: string; origin: string; createdAt: string; updatedAt: string };
export type JotaTestResult = 'ok' | 'diferente' | 'erro';
export type JotaTest = { id: string; question: string; sql: string; author: string; lastResult: JotaTestResult | null; lastDetail: string; lastRunAt: string | null; createdAt: string };

const rulesMemory: JotaRule[] = [];
const testsMemory: JotaTest[] = [];
const missing = (message: string) => (/jota_h_(regras|testes)/.test(message) ? 'Falta a migração do Acompanhamento da IA no banco (jota_h_acompanhamento).' : message);
const db = () => getSupabaseAdmin();

type RuleRow = { id: string; texto: string; escopo: JotaRuleScope; ativo: boolean; autor: string | null; origem: string | null; created_at: string; updated_at: string };
const toRule = (row: RuleRow): JotaRule => ({ id: row.id, text: row.texto, scope: row.escopo, active: row.ativo, author: row.autor || '', origin: row.origem || '', createdAt: row.created_at, updatedAt: row.updated_at });

// Versao das regras: muda a cada alteracao, para o cache de respostas do dia nao usar SQL montado com regra antiga.
let rulesVersion = 0;
export const jotaRulesVersion = () => rulesVersion;

export async function listJotaRules(): Promise<JotaRule[]> {
  if (!isSupabaseConfigured()) return [...rulesMemory];
  const { data, error } = await db().from('jota_h_regras').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(missing(error.message));
  return (data as RuleRow[]).map(toRule);
}

// Regras ligadas que valem para quem pergunta: "todos" sempre; "lideranca" so para quem gerencia o sistema.
export async function activeJotaRuleTexts(isLeader: boolean): Promise<string[]> {
  try {
    return (await listJotaRules()).filter((rule) => rule.active && (rule.scope === 'todos' || isLeader)).reverse().map((rule) => rule.text).slice(0, 40);
  } catch (error) {
    console.warn(`[Jota H] regras nao carregadas: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

export async function addJotaRule(input: { text: string; scope: JotaRuleScope; author: string; origin?: string }): Promise<JotaRule> {
  rulesVersion += 1;
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const rule: JotaRule = { id: randomUUID(), text: input.text, scope: input.scope, active: true, author: input.author, origin: input.origin || '', createdAt: now, updatedAt: now };
    rulesMemory.unshift(rule);
    return rule;
  }
  const { data, error } = await db().from('jota_h_regras').insert({ texto: input.text, escopo: input.scope, autor: input.author, origem: input.origin || null }).select('*').single();
  if (error) throw new Error(missing(error.message));
  return toRule(data as RuleRow);
}

export async function updateJotaRule(id: string, patch: { text?: string; scope?: JotaRuleScope; active?: boolean }): Promise<JotaRule | null> {
  rulesVersion += 1;
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    const rule = rulesMemory.find((item) => item.id === id);
    if (!rule) return null;
    Object.assign(rule, patch.text !== undefined ? { text: patch.text } : {}, patch.scope ? { scope: patch.scope } : {}, patch.active !== undefined ? { active: patch.active } : {}, { updatedAt: now });
    return { ...rule };
  }
  const { data, error } = await db().from('jota_h_regras').update({ ...(patch.text !== undefined ? { texto: patch.text } : {}), ...(patch.scope ? { escopo: patch.scope } : {}), ...(patch.active !== undefined ? { ativo: patch.active } : {}), updated_at: now }).eq('id', id).select('*');
  if (error) throw new Error(missing(error.message));
  return data?.length ? toRule(data[0] as RuleRow) : null;
}

export async function deleteJotaRule(id: string): Promise<boolean> {
  rulesVersion += 1;
  if (!isSupabaseConfigured()) { const index = rulesMemory.findIndex((item) => item.id === id); if (index >= 0) rulesMemory.splice(index, 1); return index >= 0; }
  const { data, error } = await db().from('jota_h_regras').delete().eq('id', id).select('id');
  if (error) throw new Error(missing(error.message));
  return Boolean(data?.length);
}

type TestRow = { id: string; pergunta: string; sql_esperado: string; autor: string | null; ultimo_resultado: JotaTestResult | null; ultimo_detalhe: string | null; ultima_execucao: string | null; created_at: string };
const toTest = (row: TestRow): JotaTest => ({ id: row.id, question: row.pergunta, sql: row.sql_esperado, author: row.autor || '', lastResult: row.ultimo_resultado, lastDetail: row.ultimo_detalhe || '', lastRunAt: row.ultima_execucao, createdAt: row.created_at });

export async function listJotaTests(): Promise<JotaTest[]> {
  if (!isSupabaseConfigured()) return [...testsMemory];
  const { data, error } = await db().from('jota_h_testes').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(missing(error.message));
  return (data as TestRow[]).map(toTest);
}

export async function addJotaTest(input: { question: string; sql: string; author: string }): Promise<JotaTest> {
  if (!isSupabaseConfigured()) {
    const test: JotaTest = { id: randomUUID(), question: input.question, sql: input.sql, author: input.author, lastResult: null, lastDetail: '', lastRunAt: null, createdAt: new Date().toISOString() };
    testsMemory.unshift(test);
    return test;
  }
  const { data, error } = await db().from('jota_h_testes').insert({ pergunta: input.question, sql_esperado: input.sql, autor: input.author }).select('*').single();
  if (error) throw new Error(missing(error.message));
  return toTest(data as TestRow);
}

export async function deleteJotaTest(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) { const index = testsMemory.findIndex((item) => item.id === id); if (index >= 0) testsMemory.splice(index, 1); return index >= 0; }
  const { data, error } = await db().from('jota_h_testes').delete().eq('id', id).select('id');
  if (error) throw new Error(missing(error.message));
  return Boolean(data?.length);
}

export async function saveJotaTestResult(id: string, result: JotaTestResult, detail: string, at = new Date().toISOString()) {
  if (!isSupabaseConfigured()) { const test = testsMemory.find((item) => item.id === id); if (test) Object.assign(test, { lastResult: result, lastDetail: detail, lastRunAt: at }); return; }
  const { error } = await db().from('jota_h_testes').update({ ultimo_resultado: result, ultimo_detalhe: detail.slice(0, 500), ultima_execucao: at }).eq('id', id);
  if (error) throw new Error(missing(error.message));
}
