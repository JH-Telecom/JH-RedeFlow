import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJotaRequest, parseJotaAnswer, validateJotaSql } from '../src/jota-h.js';

test('only plain SELECT/WITH over the jota views passes', () => {
  assert.deepEqual(validateJotaSql('SELECT tecnico AS "Técnico", count(*) FROM chamados GROUP BY 1;'), { ok: true, sql: 'SELECT tecnico AS "Técnico", count(*) FROM chamados GROUP BY 1' });
  assert.equal(validateJotaSql("with x as (select * from chamados where cluster = 'C08') select count(*) from x").ok, true);
  assert.equal(validateJotaSql("SELECT * FROM chamados WHERE motivo ILIKE '%delete%' AND status = 'Aberto'").ok, true);
  assert.equal(validateJotaSql('SELECT 1 AS "Set de dados"').ok, true);
  for (const bad of [
    'DELETE FROM chamados',
    'SELECT 1; DROP TABLE calls',
    'SELECT * FROM public.calls',
    'SELECT * FROM chamados -- comentario',
    'SELECT pg_sleep(10)',
    'SELECT * INTO copia FROM chamados',
    "SELECT set_config('role', 'postgres', true)",
    'WITH x AS (DELETE FROM chamados RETURNING *) SELECT * FROM x',
    '',
  ]) assert.equal(validateJotaSql(bad).ok, false, bad);
});

test('reads the three kinds of answer from the model', () => {
  const query = parseJotaAnswer('```json\n{"titulo":"Entrantes de hoje","sql":"SELECT count(*) FROM chamados","explicacao":"Conta por abertura.","sugestoes":["a","b","c","d"]}\n```');
  assert.equal(query?.kind, 'query');
  assert.equal(query?.kind === 'query' && query.sugestoes.length, 3);
  const ask = parseJotaAnswer('{"titulo":"","sql":"","pergunta_ia":{"texto":"Qual período?","opcoes":["Hoje","Ontem"]}}');
  assert.deepEqual(ask, { kind: 'question', texto: 'Qual período?', opcoes: ['Hoje', 'Ontem'] });
  assert.equal(parseJotaAnswer('{"titulo":"Não consigo responder","sql":"","explicacao":"fora do assunto"}')?.kind, 'refused');
  assert.equal(parseJotaAnswer('nada'), null);
});

test('prompt carries dates and previous questions but no data', () => {
  const text = buildJotaRequest('e ontem?', [{ pergunta: 'quantos entraram hoje', sql: 'SELECT count(*) FROM chamados' }], '2026-11-12');
  assert.match(text, /Hoje e 2026-11-12/);
  assert.match(text, /"Ontem" = 2026-11-11/);
  assert.match(text, /Pergunta anterior 1: quantos entraram hoje\nSQL dela: SELECT count\(\*\) FROM chamados/);
  assert.match(text, /Pergunta: e ontem\?$/);
});

test('Acompanhamento da IA: period totals, providers, cache, median time, top questions and lists', async () => {
  const { summarizeJotaPanel, normalizeJotaQuestion } = await import('../src/store/jota-log.js');
  type Status = 'ok' | 'vazio' | 'erro' | 'recusada' | 'pergunta';
  const log = (id: string, userId: string, userName: string, createdAt: string, status: Status, extra: Record<string, unknown> = {}) => ({ id, userId, userName, question: `pergunta ${id}`, title: '', sql: 'SELECT 1', status, rowCount: 0, durationMs: 100, error: status === 'erro' ? 'falhou' : '', feedback: null as -1 | 1 | null, createdAt, provider: 'groq' as const, model: 'm', cached: false, repaired: false, aiMs: 1000, ...extra });
  const panel = summarizeJotaPanel([
    log('1', 'u1', 'Wallaf Lucas', '2026-11-12T13:00:00Z', 'ok', { feedback: 1, question: 'Quantos chamados hoje?' }),
    log('2', 'u1', 'Wallaf Lucas', '2026-11-12T12:00:00Z', 'erro', { provider: 'gemini' }),
    log('3', 'u2', 'Daniela Soares', '2026-11-10T15:00:00Z', 'vazio', { feedback: -1, aiMs: 3000 }),
    log('4', 'u2', 'Daniela Soares', '2026-11-12T02:30:00Z', 'ok', { cached: true, provider: 'cache', aiMs: 0, question: 'quantos chamados hoje' }),
    log('5', 'u3', 'Antiga', '2026-11-01T15:00:00Z', 'ok'),
  ], 7, '2026-11-12');
  assert.equal(panel.today, 2);
  assert.equal(panel.total, 4);
  assert.equal(panel.errors, 1);
  assert.equal(panel.okRate, 75);
  assert.equal(panel.people, 2);
  assert.deepEqual([panel.thumbsUp, panel.thumbsDown], [1, 1]);
  assert.deepEqual([panel.cached, panel.cacheRate], [1, 25]);
  assert.deepEqual(panel.byProvider, { groq: 2, gemini: 1, cache: 1, demo: 0 });
  assert.equal(panel.medianMs, 2100);
  assert.deepEqual(panel.byDay.map((day) => day.total), [0, 0, 0, 0, 1, 1, 2]);
  assert.deepEqual(panel.byPerson.map((person) => [person.name, person.today, person.total, person.errors]), [['Wallaf Lucas', 2, 2, 1], ['Daniela Soares', 0, 2, 0]]);
  assert.deepEqual(panel.top[0], { question: 'Quantos chamados hoje?', count: 2, lastAt: '2026-11-12T13:00:00Z' });
  assert.deepEqual(panel.empty.map((item) => item.question), ['pergunta 3']);
  assert.deepEqual(panel.disliked.map((item) => item.id), ['3']);
  assert.deepEqual(panel.liked.map((item) => item.id), ['1']);
  assert.equal(panel.errorList[0].question, 'pergunta 2');
  assert.equal(summarizeJotaPanel([], 30, '2026-11-12').byDay.length, 30);
  assert.equal(normalizeJotaQuestion('  Técnicos   em CAMPO?? '), 'tecnicos em campo');
});

test('learned rules go into the prompt; results compare by values only', async () => {
  const { buildJotaRequest, sameJotaResult } = await import('../src/jota-h.js');
  const text = buildJotaRequest('quantos hoje?', [], '2026-11-26', ['Baixar conta como finalizado']);
  assert.match(text, /Regras aprendidas[^\n]*\n- Baixar conta como finalizado/);
  assert.doesNotMatch(buildJotaRequest('quantos hoje?', [], '2026-11-26'), /Regras aprendidas/);
  assert.match(text, /NUNCA use UNION/);
  assert.equal(sameJotaResult([{ a: 'X', b: 2 }, { a: 'Y', b: '1.004' }], [{ 'Região': 'Y', Total: 1 }, { 'Região': 'X', Total: '2' }]), true);
  assert.equal(sameJotaResult([{ a: 'X', b: 2 }], [{ a: 'X', b: 3 }]), false);
  assert.equal(sameJotaResult([{ a: 1 }], [{ a: 1 }, { a: 1 }]), false);
});

test('falls back to the next Gemini model on 429 and explains when all are out of quota', async () => {
  const { askJotaGemini, jotaModels } = await import('../src/jota-h.js');
  assert.deepEqual(jotaModels({ JOTA_H_MODEL: 'a', JOTA_H_FALLBACK_MODELS: 'b, a ,c' }), ['a', 'b', 'c']);
  const original = { fetch: globalThis.fetch, key: process.env.GEMINI_API_KEY, model: process.env.JOTA_H_MODEL, fallbacks: process.env.JOTA_H_FALLBACK_MODELS };
  process.env.GEMINI_API_KEY = 'test-key'; process.env.JOTA_H_MODEL = 'principal'; process.env.JOTA_H_FALLBACK_MODELS = 'reserva';
  const called: string[] = [];
  const ok = JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"titulo":"T","sql":"SELECT 1","explicacao":"e","sugestoes":[]}' }] } }] });
  try {
    globalThis.fetch = (async (url: string) => { const model = String(url).match(/models\/([^:]+):/)![1]; called.push(model); return model === 'principal' ? new Response('{}', { status: 429 }) : new Response(ok, { status: 200 }); }) as typeof fetch;
    const answer = await askJotaGemini('quantos chamados hoje?');
    assert.equal(answer.answer.kind, 'query');
    assert.deepEqual([answer.provider, answer.model], ['gemini', 'reserva']);
    assert.deepEqual(called, ['principal', 'reserva']);
    globalThis.fetch = (async () => new Response('{}', { status: 429 })) as typeof fetch;
    await assert.rejects(() => askJotaGemini('quantos chamados hoje?'), /cota de uso da IA acabou/);
  } finally {
    globalThis.fetch = original.fetch;
    for (const [name, value] of [['GEMINI_API_KEY', original.key], ['JOTA_H_MODEL', original.model], ['JOTA_H_FALLBACK_MODELS', original.fallbacks]] as const) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
