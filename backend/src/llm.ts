// IA do sistema (18/11/2026): Groq primeiro (GROQ_API_KEY, rapido e com menos erro de cota), Gemini como reserva
// (GEMINI_API_KEY). Usado na leitura dos cards do WhatsApp, na analise de endereco e no Jota H. Sempre pede JSON.
//   GROQ_MODEL              modelo principal do Groq (padrao llama-3.3-70b-versatile)
//   GROQ_FALLBACK_MODELS    reservas do Groq, separados por virgula (padrao llama-3.1-8b-instant)
//   GEMINI_MODEL            modelo do Gemini (padrao gemini-2.5-flash)
type Fetcher = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;
export type LlmOptions = { temperature?: number; timeoutMs?: number; geminiModels?: string[]; label?: string };
export type LlmAnswer = { text: string; provider: 'groq' | 'gemini'; model: string };

export class LlmError extends Error {
  constructor(message: string, readonly status: number, readonly provider: string) { super(message); }
}

export function llmConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.GROQ_API_KEY?.trim() || env.GEMINI_API_KEY?.trim());
}

const unique = (items: string[]) => [...new Set(items.map((item) => item.trim()).filter(Boolean))];
export function groqModels(env: NodeJS.ProcessEnv = process.env) {
  return unique([env.GROQ_MODEL || 'llama-3.3-70b-versatile', ...(env.GROQ_FALLBACK_MODELS ?? 'llama-3.1-8b-instant').split(',')]);
}

// Erro que outro modelo pode resolver: cota (429), modelo fora/inexistente (404, 5xx) ou rede.
const retryable = (status: number) => status === 0 || status === 429 || status === 404 || status === 413 || status >= 500;

export async function askLlmJson(prompt: string, options: LlmOptions = {}, fetcher: Fetcher = fetch as Fetcher, env: NodeJS.ProcessEnv = process.env): Promise<LlmAnswer> {
  const timeout = options.timeoutMs ?? 15_000;
  const temperature = options.temperature ?? 0;
  const tag = options.label ? `[IA ${options.label}]` : '[IA]';
  let last: LlmError | null = null;

  const groqKey = env.GROQ_API_KEY?.trim();
  if (groqKey) {
    for (const model of groqModels(env)) {
      let status = 0;
      try {
        const response = await fetcher('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${groqKey}` },
          body: JSON.stringify({ model, temperature, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Responda somente com um objeto JSON válido.' }, { role: 'user', content: prompt }] }),
          signal: AbortSignal.timeout(timeout),
        });
        status = response.status;
        if (response.ok) {
          const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
          const text = payload.choices?.[0]?.message?.content;
          if (text) return { text, provider: 'groq', model };
          status = 502;
        }
      } catch { status = 0; }
      last = new LlmError(`Groq (${model}) respondeu HTTP ${status || 'sem resposta'}`, status, 'groq');
      console.warn(`${tag} ${last.message}`);
      if (!retryable(status)) break;
    }
  }

  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    for (const model of unique(options.geminiModels?.length ? options.geminiModels : [env.GEMINI_MODEL || 'gemini-2.5-flash'])) {
      let status = 0;
      try {
        const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature, responseMimeType: 'application/json' } }),
          signal: AbortSignal.timeout(timeout),
        });
        status = response.status;
        if (response.ok) {
          const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
          const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return { text, provider: 'gemini', model };
          status = 502;
        }
      } catch { status = 0; }
      last = new LlmError(`Gemini (${model}) respondeu HTTP ${status || 'sem resposta'}`, status, 'gemini');
      console.warn(`${tag} ${last.message}`);
      if (!retryable(status)) break;
    }
  }

  throw last ?? new LlmError('Nenhuma IA configurada no servidor (GROQ_API_KEY ou GEMINI_API_KEY).', 0, 'none');
}
