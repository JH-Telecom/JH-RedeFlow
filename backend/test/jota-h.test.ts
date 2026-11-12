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

test('usage summary counts today, the week, errors, people, thumbs and empty answers', async () => {
  const { summarizeJotaUsage } = await import('../src/store/jota-log.js');
  const log = (id: string, userId: string, userName: string, createdAt: string, status: 'ok' | 'vazio' | 'erro' | 'recusada' | 'pergunta', feedback: -1 | 1 | null = null) => ({ id, userId, userName, question: `pergunta ${id}`, title: '', sql: '', status, rowCount: 0, durationMs: 0, error: status === 'erro' ? 'falhou' : '', feedback, createdAt });
  const usage = summarizeJotaUsage([
    log('1', 'u1', 'Wallaf Lucas', '2026-11-12T13:00:00Z', 'ok', 1),
    log('2', 'u1', 'Wallaf Lucas', '2026-11-12T12:00:00Z', 'erro'),
    log('3', 'u2', 'Daniela Soares', '2026-11-10T15:00:00Z', 'vazio', -1),
    log('4', 'u2', 'Daniela Soares', '2026-11-12T02:30:00Z', 'ok'),
    log('5', 'u3', 'Antiga', '2026-11-01T15:00:00Z', 'ok'),
  ], '2026-11-12');
  assert.equal(usage.today, 2);
  assert.equal(usage.week, 4);
  assert.equal(usage.errors, 1);
  assert.equal(usage.errorRate, 25);
  assert.equal(usage.people, 2);
  assert.deepEqual([usage.thumbsUp, usage.thumbsDown], [1, 1]);
  assert.deepEqual(usage.byDay.map((day) => day.total), [0, 0, 0, 0, 1, 1, 2]);
  assert.deepEqual(usage.byPerson.map((person) => [person.name, person.today, person.week, person.errors]), [['Wallaf Lucas', 2, 2, 1], ['Daniela Soares', 0, 2, 0]]);
  assert.deepEqual(usage.empty.map((item) => item.question), ['pergunta 3']);
  assert.equal(usage.recentErrors[0].question, 'pergunta 2');
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
    assert.equal(answer.kind, 'query');
    assert.deepEqual(called, ['principal', 'reserva']);
    globalThis.fetch = (async () => new Response('{}', { status: 429 })) as typeof fetch;
    await assert.rejects(() => askJotaGemini('quantos chamados hoje?'), /cota de uso do Gemini acabou/);
  } finally {
    globalThis.fetch = original.fetch;
    for (const [name, value] of [['GEMINI_API_KEY', original.key], ['JOTA_H_MODEL', original.model], ['JOTA_H_FALLBACK_MODELS', original.fallbacks]] as const) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
