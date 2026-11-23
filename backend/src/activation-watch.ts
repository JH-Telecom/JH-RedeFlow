import type { IntegrationEvent } from './integration-health.js';

// Vigia dos cards do WhatsApp (23/11/2026).
// 1) Silencio: o numero do WuzAPI desconectou (ou o webhook saiu da configuracao) e ninguem percebeu ate faltar um
//    chamado. Os grupos de acionamento falam o dia todo; das 07h as 22h, 45 min sem nenhuma mensagem e sinal de queda.
// 2) Card que falhou ao gravar (ex.: 19/11, erro no registro): o texto fica guardado no evento e o sistema tenta de
//    novo a cada 5 min (ate 5 vezes em 24 h), em vez de perder o card.

export const SILENT_AFTER_MINUTES = 45;
export const RETRY_MAX_ATTEMPTS = 5;
const spClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

let lastGroupMessageAt = Date.now();
export function noteGroupMessage(at = Date.now()) { lastGroupMessageAt = Math.max(lastGroupMessageAt, at); }
export function lastGroupMessage() { return lastGroupMessageAt; }
export function resetGroupWatchForTests(at = Date.now()) { lastGroupMessageAt = at; }

export function whatsappSilence(now = Date.now(), last = lastGroupMessageAt) {
  const [hour, minute] = spClock.format(now).split(':').map(Number);
  const daytime = hour >= 7 && hour < 22;
  // Conta so a partir das 07h: a madrugada quieta nao vira aviso logo cedo.
  const dayStart = now - ((hour - 7) * 60 + minute) * 60_000;
  const minutes = Math.floor((now - Math.max(last, daytime ? dayStart : last)) / 60_000);
  return { silent: daytime && minutes >= SILENT_AFTER_MINUTES, minutes, lastAt: new Date(last).toISOString() };
}

export const silenceText = (minutes: number, appUrl?: string) => `⚠️ *JH RedeFlow — nenhum card chegando*\nHá ${minutes} min nenhuma mensagem dos grupos de acionamento chega no sistema. Confira se o WhatsApp do WuzAPI está conectado e se o webhook está configurado. Enquanto isso, use "Colar card" em Acionamentos.${appUrl ? `\n${appUrl.replace(/\/+$/, '')}/acionamentos` : ''}`;
export const silenceBackText = () => '✅ *JH RedeFlow — cards chegando de novo*\nAs mensagens dos grupos de acionamento voltaram a chegar.';

// Cards que falharam e ainda nao foram gravados: sem tentativa certa e com menos de RETRY_MAX_ATTEMPTS tentativas.
export function cardsToRetry(events: IntegrationEvent[]) {
  const failed = events.filter((event) => event.kind === 'activation_failed' && typeof event.details?.text === 'string' && event.details.text);
  const retries = events.filter((event) => event.kind === 'activation_retry');
  return failed.filter((event) => {
    const mine = retries.filter((retry) => retry.details?.failedId === event.id);
    return !mine.some((retry) => retry.ok) && mine.length < RETRY_MAX_ATTEMPTS;
  }).map((event) => ({ failedId: event.id, text: String(event.details.text), source: String(event.details.source || ''), attempts: retries.filter((retry) => retry.details?.failedId === event.id).length }));
}
