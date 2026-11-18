import assert from 'node:assert/strict';
import test from 'node:test';
import { askLlmJson, groqModels, llmConfigured } from '../src/llm.js';

type Call = { url: string; body: Record<string, unknown> };
const reply = (status: number, payload: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });

test('Groq first; on quota it tries the next Groq model, then Gemini', async () => {
  const calls: Call[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    if (url.includes('groq')) return reply(429, {});
    return reply(200, { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
  };
  const answer = await askLlmJson('diga json', {}, fetcher, { GROQ_API_KEY: 'g', GEMINI_API_KEY: 'k' } as NodeJS.ProcessEnv);
  assert.equal(answer.provider, 'gemini');
  assert.deepEqual(calls.map((call) => (call.url.includes('groq') ? `groq:${call.body.model}` : 'gemini')), ['groq:llama-3.3-70b-versatile', 'groq:llama-3.1-8b-instant', 'gemini']);
});

test('Groq answer is used as is, with JSON mode and the bearer key', async () => {
  let headers: Record<string, string> = {};
  const fetcher = async (_url: string, init: RequestInit) => { headers = init.headers as Record<string, string>; return reply(200, { choices: [{ message: { content: '{"a":1}' } }] }); };
  const answer = await askLlmJson('json', {}, fetcher, { GROQ_API_KEY: 'chave' } as NodeJS.ProcessEnv);
  assert.deepEqual(answer, { text: '{"a":1}', provider: 'groq', model: 'llama-3.3-70b-versatile' });
  assert.equal(headers.authorization, 'Bearer chave');
});

test('a request error (400) does not try other models; no key throws', async () => {
  let count = 0;
  const fetcher = async () => { count += 1; return reply(400, {}); };
  await assert.rejects(askLlmJson('json', {}, fetcher, { GROQ_API_KEY: 'g' } as NodeJS.ProcessEnv), /HTTP 400/);
  assert.equal(count, 1);
  await assert.rejects(askLlmJson('json', {}, fetcher, {} as NodeJS.ProcessEnv), /Nenhuma IA configurada/);
  assert.equal(llmConfigured({ GROQ_API_KEY: ' ' } as NodeJS.ProcessEnv), false);
  assert.deepEqual(groqModels({ GROQ_MODEL: 'x', GROQ_FALLBACK_MODELS: 'y, x' } as NodeJS.ProcessEnv), ['x', 'y']);
});
