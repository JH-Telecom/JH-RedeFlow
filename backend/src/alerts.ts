import type { IntegrationEvent } from './integration-health.js';

// Aviso de coleta do OFS parada. O escalonamento automatico (sem tecnico 5h / sem observacao 2h) foi tirado em 24/11/2026.

// ---------- (15) Coleta parada ----------
export const OUTAGE_AFTER_MINUTES = 120;
// Parada = nenhum envio certo de export ou de fechamentos ha mais de 2h. Sem nenhum registro ainda, nao avisa.
export function integrationOutage(events: IntegrationEvent[], now = Date.now()) {
  const ok = events.filter((event) => (event.kind === 'export' || event.kind === 'closing') && event.ok).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (!events.some((event) => event.kind === 'export' || event.kind === 'closing')) return { known: false, down: false, lastOkAt: null as string | null, minutes: null as number | null };
  const lastOkAt = ok[0]?.createdAt ?? null;
  const minutes = lastOkAt ? Math.round((now - Date.parse(lastOkAt)) / 60_000) : null;
  return { known: true, down: minutes === null || minutes > OUTAGE_AFTER_MINUTES, lastOkAt, minutes };
}

const hm = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`);
export function outageText(outage: ReturnType<typeof integrationOutage>, appUrl?: string) {
  const since = outage.minutes === null ? 'sem nenhum envio certo registrado' : `há ${hm(outage.minutes)} sem enviar`;
  return `⚠️ *JH RedeFlow — coleta do OFS parada*\nA extensão está ${since} (export e fechamentos). Confira a aba do OFS fixada, o login no OFS e se o computador da coleta está ligado.${appUrl ? `\n${appUrl.replace(/\/+$/, '')}/integracao-ofs` : ''}`;
}
export const recoveryText = (appUrl?: string) => `✅ *JH RedeFlow — coleta do OFS voltou*\nA extensão voltou a enviar.${appUrl ? `\n${appUrl.replace(/\/+$/, '')}/integracao-ofs` : ''}`;
