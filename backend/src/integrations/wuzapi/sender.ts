// Envio de texto pelo WuzAPI (a mesma conta que hoje so recebe os acionamentos). Fica DESLIGADO ate as tres
// variaveis estarem no ambiente do Render:
//   WUZAPI_API_URL       endereco do WuzAPI (ex.: https://wuzapi.exemplo.com)
//   WUZAPI_USER_TOKEN    token do usuario WuzAPI (header "Token")
//   WUZAPI_ALERT_CHAT    para onde mandar: ID do grupo (…@g.us) ou numero com DDI (5511…)
// Rota usada: POST {WUZAPI_API_URL}/chat/send/text  { Phone, Body }.

export type WhatsAppConfig = { url: string; token: string; chat: string };

export function whatsappConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig | null {
  const url = env.WUZAPI_API_URL?.trim();
  const token = env.WUZAPI_USER_TOKEN?.trim();
  const chat = env.WUZAPI_ALERT_CHAT?.trim();
  return url && token && chat ? { url: url.replace(/\/+$/, ''), token, chat } : null;
}

export async function sendWhatsAppText(config: WhatsAppConfig, body: string): Promise<void> {
  const response = await fetch(`${config.url}/chat/send/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Token: config.token },
    body: JSON.stringify({ Phone: config.chat, Body: body }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`WuzAPI respondeu ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`);
}
