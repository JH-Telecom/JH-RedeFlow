import type { Call } from './types.js';
import { slaLimits } from './sla.js';

// Aviso antes de estourar o prazo de 6h. No sino: chamados ativos com menos de 2h restantes. No WhatsApp (se
// configurado): um aviso por chamado quando falta 1h, numa mensagem so com todos os que entraram nessa janela.

const ACTIVE = new Set(['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo']);
export const BELL_WINDOW_MINUTES = 120;
export const WHATSAPP_WINDOW_MINUTES = 60;

export type NearDeadlineCall = Pick<Call, 'id' | 'orderNumber' | 'type' | 'region' | 'technicianName' | 'status'> & { minutesLeft: number };

export function nearDeadlineCalls(calls: Call[], windowMinutes: number, now = Date.now()): NearDeadlineCall[] {
  return calls
    .filter((call) => ACTIVE.has(call.status))
    .map((call) => ({ call, left: slaLimits(call.type).onTimeHours * 60 - (now - Date.parse(call.openedAt)) / 60_000 }))
    .filter(({ left }) => Number.isFinite(left) && left > 0 && left <= windowMinutes)
    .sort((a, b) => a.left - b.left)
    .map(({ call, left }) => ({ id: call.id, orderNumber: call.orderNumber, type: call.type, region: call.region, technicianName: call.technicianName, status: call.status, minutesLeft: Math.max(1, Math.floor(left)) }));
}

const fmtLeft = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`);

// Texto do WhatsApp (sem dados de cliente: ordem, tipo, regiao, tecnico e quanto falta).
export function whatsappAlertText(calls: NearDeadlineCall[], appUrl?: string) {
  const lines = calls.slice(0, 15).map((call) => `• ${call.orderNumber} — ${call.type || 'Chamado'}${call.region ? ` · ${call.region}` : ''} · ${call.technicianName || 'sem técnico'} · faltam ${fmtLeft(call.minutesLeft)}`);
  const extra = calls.length > 15 ? `\n…e mais ${calls.length - 15}.` : '';
  return `⏰ *JH RedeFlow — prazo de 6h*\n${calls.length} chamado(s) vencem em até 1h:\n${lines.join('\n')}${extra}${appUrl ? `\n\n${appUrl.replace(/\/+$/, '')}/chamados/atendimento` : ''}`;
}
