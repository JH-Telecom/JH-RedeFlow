import type { ActivationAnalysis } from './types.js';

// Analise de endereco por IA (18/11/2026). Muitos cards vem sem OLT cadastrada (sem regiao), mas com os enderecos dos
// clientes. A IA (Gemini, a mesma chave do resto do sistema) le os enderecos, devolve o bairro e a cidade principais,
// um endereco limpo e escolhe a regiao (POP) numa lista fechada, com base nos exemplos de bairro -> regiao dos chamados
// que ja tem regiao. Sem chave (GEMINI_API_KEY) ou com erro, nao faz nada.

export type AddressAiInput = {
  addresses: string[];
  bairro?: string | null;
  city?: string | null;
  regions: string[];
  examples: Array<{ bairro: string; city: string; region: string; count: number }>;
};
export type AddressAiResult = { bairro: string | null; cidade: string | null; endereco: string | null; regiao: string | null; confianca: number; motivo: string };
type Fetcher = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;

const keyOf = (value: string | null | undefined) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

// Bairro que a leitura por regras deixou ruim: vazio, so numero/sigla ou pedaco de rotulo do card.
export function badNeighborhood(value: string | null | undefined) {
  const text = keyOf(value);
  return !text || !/[A-Z]{3}/.test(text) || /^(SLOT|PON|SERIAL|CONTRATO|CEP|S N)\b/.test(text);
}
export function badAddress(value: string | null | undefined) {
  const text = keyOf(value);
  return !text || /\b(SLOT|PON|SERIAL|CONTRATO)\b/.test(text) || !/[A-Z]{3}/.test(text);
}

// Exemplos para a IA: pares bairro/cidade -> regiao mais comuns dos chamados com regiao (no maximo `limit`).
export function regionExamples(calls: Array<{ bairro?: string; city?: string; region?: string }>, isMissing: (region: string | undefined) => boolean, limit = 250) {
  const counts = new Map<string, { bairro: string; city: string; region: string; count: number }>();
  for (const call of calls) {
    if (!call.bairro || isMissing(call.region) || badNeighborhood(call.bairro)) continue;
    const id = `${keyOf(call.bairro)}|${keyOf(call.city)}|${keyOf(call.region)}`;
    const item = counts.get(id) ?? { bairro: keyOf(call.bairro), city: keyOf(call.city), region: call.region!, count: 0 };
    item.count += 1;
    counts.set(id, item);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function buildAddressPrompt(input: AddressAiInput) {
  const addresses = [...new Set(input.addresses.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 25);
  return [
    'Você analisa endereços de clientes afetados por uma falha de rede de fibra (Grande São Paulo e região).',
    'Responda SOMENTE um JSON: {"bairro": string|null, "cidade": string|null, "endereco": string|null, "regiao": string|null, "confianca": número de 0 a 1, "motivo": string curto}.',
    '- bairro: o bairro onde está a maioria dos endereços, em MAIÚSCULAS, sem rua, número, CEP, cidade ou complemento.',
    '- cidade: a cidade da maioria, em MAIÚSCULAS.',
    '- endereco: um endereço representativo no formato "RUA X, 123, BAIRRO, CIDADE - UF, CEP" (sem complemento, sem "RUA RUA").',
    '- regiao: escolha EXATAMENTE um nome da lista de regiões abaixo, a que atende esse bairro. Use os exemplos. Se não tiver segurança, use null.',
    '- confianca: 0.9 ou mais só quando o bairro aparece nos exemplos com essa região ou é claramente vizinho de bairros dela.',
    'Não invente: se os endereços não trouxerem bairro, devolva null.',
    '',
    `Regiões possíveis: ${input.regions.join(' | ')}`,
    '',
    'Exemplos (bairro | cidade -> região, quantidade de chamados):',
    ...input.examples.map((item) => `${item.bairro} | ${item.city || '-'} -> ${item.region} (${item.count})`),
    '',
    `Bairro lido pelas regras: ${input.bairro || '(nenhum)'} · Cidade: ${input.city || '(nenhuma)'}`,
    'Endereços:',
    ...addresses.map((item) => `- ${item}`),
  ].join('\n');
}

export function parseAddressAiResponse(text: string, regions: string[]): AddressAiResult | null {
  const json = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text;
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(json) as Record<string, unknown>; } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const str = (value: unknown) => (typeof value === 'string' && value.trim() && !/^null$/i.test(value.trim()) ? value.trim() : null);
  // A regiao so vale se for uma da lista (a IA nao cria regiao nova).
  const wanted = keyOf(str(parsed.regiao));
  const regiao = wanted ? regions.find((region) => keyOf(region) === wanted) ?? null : null;
  const confianca = Math.max(0, Math.min(1, Number(parsed.confianca) || 0));
  const bairro = str(parsed.bairro);
  return { bairro: bairro && !badNeighborhood(bairro) ? keyOf(bairro) : null, cidade: str(parsed.cidade) ? keyOf(str(parsed.cidade)) : null, endereco: str(parsed.endereco), regiao, confianca: regiao ? confianca : 0, motivo: str(parsed.motivo) || '' };
}

export async function analyzeAddressesWithAi(input: AddressAiInput, fetcher: Fetcher = fetch as Fetcher, env: NodeJS.ProcessEnv = process.env): Promise<AddressAiResult | null> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey || (!input.addresses.length && !input.bairro)) return null;
  const model = env.GEMINI_ADDRESS_MODEL || env.GEMINI_MODEL || 'gemini-2.5-flash';
  try {
    const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: buildAddressPrompt(input) }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? parseAddressAiResponse(text, input.regions) : null;
  } catch {
    return null;
  }
}

// Confianca minima para a IA colocar a regiao sozinha no chamado; abaixo disso fica so como sugestao (fila Sem regiao).
export const AI_REGION_MIN_CONFIDENCE = 0.85;

// Aplica o resultado da IA na analise do card: bairro e endereco so quando os das regras estao ruins; a regiao vai em
// regiao_ia (quem cria o chamado decide usar, se a OLT nao tem regiao).
export function applyAddressAi(analysis: ActivationAnalysis, result: AddressAiResult | null): ActivationAnalysis {
  if (!result) return analysis;
  return {
    ...analysis,
    bairro_principal: badNeighborhood(analysis.bairro_principal) && result.bairro ? result.bairro : analysis.bairro_principal,
    endereco_principal: badAddress(analysis.endereco_principal) && result.endereco ? result.endereco : analysis.endereco_principal,
    regiao_ia: result.regiao ? { regiao: result.regiao, confianca: result.confianca, motivo: result.motivo } : analysis.regiao_ia ?? null,
  };
}

// Regiao que a IA pode colocar sozinha no chamado (so com confianca alta). Senao, null: o chamado vai para Sem regiao.
export function confidentAiRegion(analysis: Partial<ActivationAnalysis> | null | undefined) {
  const ai = analysis?.regiao_ia;
  return ai && ai.regiao && ai.confianca >= AI_REGION_MIN_CONFIDENCE ? ai.regiao : null;
}
export function aiRegionNote(analysis: Partial<ActivationAnalysis> | null | undefined, usedRegion: string) {
  const ai = analysis?.regiao_ia;
  return ai && ai.regiao === usedRegion ? `\nRegião ${usedRegion} definida pela IA a partir dos endereços (${Math.round(ai.confianca * 100)}% de confiança${ai.motivo ? `: ${ai.motivo}` : ''}).` : '';
}
