import type { IntegrationEvent } from './integration-health.js';
import { toOperationalDate } from './timezone.js';

// Resumo dos cards (23/11/2026): quantos chegaram hoje e o que aconteceu com eles, e a lista dos cards que vieram
// com dado faltando (sem OS, sem OLT) para ajustar a leitura antes de alguem precisar reclamar.

export type CardFacts = { id: string; status: string; receivedAt: string; extracted: Record<string, unknown> };
export type CardProblem = { id: string; receivedAt: string; status: string; type: string; missing: string[]; preview: string };

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function cardMissing(extracted: Record<string, unknown>) {
  const analysis = (extracted._analysis || {}) as Record<string, unknown>;
  const type = text(analysis.tipo_card) || text(extracted.type);
  const missing: string[] = [];
  if (!text(extracted.orderNumber) && !text(extracted.officeTrack) && !text(analysis.office_track) && !text(analysis.os_ot)) missing.push('OS');
  // Backbone (TX) nao tem OLT: vem placa/trecho.
  if (type !== 'TX' && !/NOC TX/i.test(type) && !text(analysis.olt) && !text(extracted.olt)) missing.push('OLT');
  if (!type) missing.push('tipo');
  return { type, missing };
}

export function summarizeCards(cards: CardFacts[], blocked: IntegrationEvent[], now = new Date()) {
  const today = toOperationalDate(now);
  const ofToday = cards.filter((card) => toOperationalDate(card.receivedAt) === today);
  const count = (status: string) => ofToday.filter((card) => card.status === status).length;
  const blockedToday = blocked.filter((event) => toOperationalDate(event.createdAt) === today);
  const aiRegion = ofToday.filter((card) => { const ai = ((card.extracted._analysis || {}) as Record<string, unknown>).regiao_ia as { regiao?: string } | null | undefined; return Boolean(ai?.regiao); }).length;
  const problems: CardProblem[] = cards
    .map((card) => ({ card, ...cardMissing(card.extracted) }))
    .filter((item) => item.missing.length && item.card.status !== 'Recusado')
    .map((item) => ({ id: item.card.id, receivedAt: item.card.receivedAt, status: item.card.status, type: item.type, missing: item.missing, preview: '' }))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return {
    date: today,
    today: {
      received: ofToday.length,
      accepted: count('Aceito'),
      refused: count('Recusado'),
      pending: count('Pendente'),
      blocked: blockedToday.length,
      blockedSameCall: blockedToday.filter((event) => event.details?.reason === 'same_call').length,
      blockedDuplicate: blockedToday.filter((event) => event.details?.reason === 'duplicate').length,
      blockedClosing: blockedToday.filter((event) => event.details?.reason === 'closing_report').length,
      aiRegion,
    },
    problems: problems.slice(0, 100),
    problemCount: problems.length,
  };
}

// Primeira linha util do card (sem o cabecalho de alerta), para reconhecer na lista.
export function cardPreview(message: string) {
  const lines = message.split(/\r?\n/).map((line) => line.replace(/[⚠️*]/g, '').trim()).filter(Boolean);
  return lines.slice(0, 4).join(' · ').slice(0, 160);
}
