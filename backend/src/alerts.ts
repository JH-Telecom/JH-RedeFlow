import type { IntegrationEvent } from './integration-health.js';
import type { Call } from './types.js';

// Lote A: aviso de coleta do OFS parada (15) e escalonamento automatico de chamados (3).

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

// ---------- (3) Escalonamento ----------
export type EscalationRule = 'sem-tecnico' | 'sem-observacao';
export const ESCALATION_LABEL: Record<EscalationRule, string> = { 'sem-tecnico': 'sem técnico há mais de 5h', 'sem-observacao': 'sem observação há mais de 2h' };
export type Escalation = { callId: string; orderNumber: string; rule: EscalationRule; technicianId?: string; technicianName?: string; region: string; minutes: number };

const NO_TECH_MINUTES = 5 * 60;
const NO_NOTE_MINUTES = 2 * 60;
const WORKING = new Set(['Atribuido', 'Atrelado', 'Deslocamento', 'Em campo']);

// Ativo sem tecnico ha mais de 5h desde a abertura; ou com tecnico e sem observacao ha mais de 2h
// (contando da ultima observacao, ou da atribuicao, ou da abertura).
export function escalations(calls: Call[], now = Date.now()): Escalation[] {
  const result: Escalation[] = [];
  for (const call of calls) {
    const opened = Date.parse(call.openedAt);
    if (!Number.isFinite(opened)) continue;
    if (call.status === 'Aberto' && !call.technicianId) {
      const minutes = Math.round((now - opened) / 60_000);
      if (minutes > NO_TECH_MINUTES) result.push({ callId: call.id, orderNumber: call.orderNumber, rule: 'sem-tecnico', region: call.region, minutes });
      continue;
    }
    if (call.technicianId && WORKING.has(call.status)) {
      const last = Math.max(...[call.lastObservationAt, call.assignedAt, call.openedAt].map((iso) => (iso ? Date.parse(iso) : NaN)).filter(Number.isFinite));
      const minutes = Math.round((now - last) / 60_000);
      if (minutes > NO_NOTE_MINUTES) result.push({ callId: call.id, orderNumber: call.orderNumber, rule: 'sem-observacao', technicianId: call.technicianId, technicianName: call.technicianName, region: call.region, minutes });
    }
  }
  return result.sort((a, b) => b.minutes - a.minutes);
}

export function escalationText(items: Escalation[], appUrl?: string) {
  const lines = items.slice(0, 15).map((item) => `• ${item.orderNumber} — ${ESCALATION_LABEL[item.rule]} (${hm(item.minutes)})${item.region ? ` · ${item.region}` : ''}${item.technicianName ? ` · ${item.technicianName}` : ''}`);
  return `🔺 *JH RedeFlow — chamados escalados*\n${lines.join('\n')}${items.length > 15 ? `\n…e mais ${items.length - 15}.` : ''}${appUrl ? `\n\n${appUrl.replace(/\/+$/, '')}/chamados/atendimento` : ''}`;
}
