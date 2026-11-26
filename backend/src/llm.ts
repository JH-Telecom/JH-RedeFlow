// IA do sistema (18/11/2026): Groq primeiro (GROQ_API_KEY, rapido e com menos erro de cota), Gemini como reserva
// (GEMINI_API_KEY). Usado na leitura dos cards do WhatsApp, na analise de endereco e no Jota H. Sempre pede JSON.
//   GROQ_MODEL              modelo principal do Groq (padrao llama-3.3-70b-versatile)
//   GROQ_FALLBACK_MODELS    reservas do Groq, separados por virgula (padrao llama-3.1-8b-instant)
//   GEMINI_MODEL            modelo do Gemini (padrao gemini-2.5-flash)
type Fetcher = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'> & { headers?: Pick<Headers, 'get'> }>;
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

// Modelos que a conta do Groq tem (GET /models), para quando os configurados nao existem mais (HTTP 404): os nomes do
// Groq mudam com o tempo. Guardado por 6 h. Prefere os modelos de texto grandes; ignora audio, guarda e embeddings.
const PREFERRED = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'moonshotai/kimi-k2-instruct', 'qwen/qwen3-32b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
let groqCatalog: { models: string[]; at: number } | null = null;
export function pickGroqModels(available: string[]) {
  const chat = available.filter((id) => !/whisper|tts|guard|embed|playai|distil|orpheus|compound|allam|prompt/i.test(id));
  const preferred = PREFERRED.filter((id) => chat.includes(id));
  return unique([...preferred, ...chat]).slice(0, 3);
}
async function groqAvailableModels(key: string, fetcher: Fetcher): Promise<string[]> {
  if (groqCatalog && Date.now() - groqCatalog.at < 6 * 3_600_000) return groqCatalog.models;
  try {
    const response = await fetcher('https://api.groq.com/openai/v1/models', { method: 'GET', headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const payload = await response.json() as { data?: { id?: string; active?: boolean }[] };
    const models = pickGroqModels((payload.data || []).filter((item) => item.id && item.active !== false).map((item) => item.id!));
    groqCatalog = { models, at: Date.now() };
    if (models.length) console.log(`[IA] modelos do Groq disponiveis: ${models.join(', ')}`);
    return models;
  } catch { return []; }
}
// Modelos que deram 404 neste servidor: nao tenta de novo a cada pedido (antes, toda chamada perdia 2 tentativas).
const deadGroqModels = new Set<string>();
export function resetGroqCatalog() { groqCatalog = null; deadGroqModels.clear(); }
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Erro que outro modelo pode resolver: cota (429), modelo fora/inexistente (404, 5xx) ou rede.
const retryable = (status: number) => status === 0 || status === 429 || status === 404 || status === 413 || status >= 500;

// Verificacao do Acompanhamento da IA (botao "Verificar agora"): uma pergunta minima para cada IA configurada, com o
// tempo de resposta e o modelo que respondeu. So roda quando alguem clica (nao gasta cota sozinho).
export type LlmCheck = { provider: 'groq' | 'gemini'; role: 'principal' | 'reserva'; configured: boolean; ok: boolean; ms: number | null; model: string; error: string };
export async function checkLlmProviders(geminiModels: string[], env: NodeJS.ProcessEnv = process.env, fetcher: Fetcher = fetch as Fetcher): Promise<LlmCheck[]> {
  const hasGroq = Boolean(env.GROQ_API_KEY?.trim());
  const hasGemini = Boolean(env.GEMINI_API_KEY?.trim());
  const one = async (provider: 'groq' | 'gemini', configured: boolean, role: LlmCheck['role']): Promise<LlmCheck> => {
    const model = provider === 'groq' ? groqModels(env)[0] : geminiModels[0] || env.GEMINI_MODEL || 'gemini-2.5-flash';
    if (!configured) return { provider, role, configured, ok: false, ms: null, model, error: 'Sem chave no servidor.' };
    const started = Date.now();
    try {
      const only = provider === 'groq' ? { ...env, GEMINI_API_KEY: '' } : { ...env, GROQ_API_KEY: '' };
      const answer = await askLlmJson('Responda exatamente {"ok":true}', { timeoutMs: 12_000, label: 'verificação', geminiModels }, fetcher, only);
      return { provider, role, configured, ok: true, ms: Date.now() - started, model: answer.model, error: '' };
    } catch (error) {
      return { provider, role, configured, ok: false, ms: Date.now() - started, model, error: error instanceof LlmError && error.status ? `HTTP ${error.status}` : 'Sem resposta.' };
    }
  };
  return Promise.all([one('groq', hasGroq, 'principal'), one('gemini', hasGemini, hasGroq ? 'reserva' : 'principal')]);
}

export async function askLlmJson(prompt: string, options: LlmOptions = {}, fetcher: Fetcher = fetch as Fetcher, env: NodeJS.ProcessEnv = process.env): Promise<LlmAnswer> {
  const timeout = options.timeoutMs ?? 15_000;
  const temperature = options.temperature ?? 0;
  const tag = options.label ? `[IA ${options.label}]` : '[IA]';
  let last: LlmError | null = null;

  const groqKey = env.GROQ_API_KEY?.trim();
  if (groqKey) {
    // Configurados primeiro; os que deram 404 (nome que nao existe mais) dao lugar aos que a conta tem hoje.
    const tried = new Set<string>(deadGroqModels);
    let queue = unique([...groqModels(env), ...(groqCatalog?.models ?? [])]).filter((model) => !deadGroqModels.has(model));
    let discovered = false;
    if (!queue.length) { queue = await groqAvailableModels(groqKey, fetcher); discovered = true; }
    let waited = false;
    for (let index = 0; index < queue.length; index += 1) {
      const model = queue[index];
      if (tried.has(model)) continue;
      tried.add(model);
      let status = 0;
      try {
        const response = await fetcher('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${groqKey}` },
          body: JSON.stringify({ model, temperature, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Responda somente com um objeto JSON válido.' }, { role: 'user', content: prompt }] }),
          signal: AbortSignal.timeout(timeout),
        });
        status = response.status;
        // Limite por minuto (429): espera o que o Groq pedir (ate 6 s) e tenta o mesmo modelo de novo, uma vez por pedido.
        if (status === 429 && !waited) {
          waited = true;
          const after = Number(response.headers?.get('retry-after')) || 2;
          await sleep(Math.min(6, Math.max(1, after)) * 1000);
          tried.delete(model);
          index -= 1;
          console.warn(`${tag} Groq (${model}) no limite por minuto; tentando de novo em ${Math.min(6, Math.max(1, after))} s`);
          continue;
        }
        if (response.ok) {
          const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
          const text = payload.choices?.[0]?.message?.content;
          if (text) return { text, provider: 'groq', model };
          status = 502;
        }
      } catch { status = 0; }
      last = new LlmError(`Groq (${model}) respondeu HTTP ${status || 'sem resposta'}`, status, 'groq');
      console.warn(`${tag} ${last.message}`);
      if (status === 404) deadGroqModels.add(model);
      if (!retryable(status)) break;
      if (status === 404 && !discovered && index === queue.length - 1) {
        discovered = true;
        queue = [...queue, ...(await groqAvailableModels(groqKey, fetcher)).filter((item) => !tried.has(item))];
      }
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
