import type { Call, EditableCallFields } from '../types.js';

// Fechamento do OFS (formulario "Fechamento" da atividade): Motivo de Fechamento, Submotivo e Tipo do Cabo.
// Nao vem no export CSV; o Coletor OFS abre cada atividade concluida e envia esses tres campos.

export type OfsClosingItem = { ordem: string; motivo?: string | null; submotivo?: string | null; tipoCabo?: string | null };
export type OfsClosingFields = Pick<EditableCallFields, 'closingReason' | 'closingSubreason' | 'cableType'>;
export type OfsClosingMatch = { callId: string; orderNumber: string; fields: Partial<OfsClosingFields> };

const CLOSED = new Set(['Finalizado', 'Baixar']);
const MAX_LENGTH = 200;

const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
// "BDESK-610011231680102", "610011231680102" -> "610011231680102"
export const orderDigits = (value: unknown) => String(value ?? '').replace(/^\s*(?:bdesk|bd)[-\s]*/i, '').replace(/\D/g, '');

export function isOfsConcluded(ofsStatus?: string) {
  return /^(conclu|finaliz|encerrad|executad)/.test(normalize(ofsStatus));
}

// Chamados que ja terminaram (fechados aqui ou concluidos no OFS) e ainda nao tem o fechamento do OFS lido.
// Ja lido = tem Motivo ou Submotivo (alguns fechamentos nao tem Submotivo). Mais recentes primeiro;
// so ordens numericas (as "PEND-..." nao existem no OFS).
export function pendingClosingOrders(calls: Call[], options: { now?: number; days?: number; limit?: number } = {}) {
  const now = options.now ?? Date.now();
  const since = now - (options.days ?? 10) * 86_400_000;
  const limit = options.limit ?? 40;
  const seen = new Set<string>();
  return calls
    .filter((call) => (CLOSED.has(call.status) || (call.status !== 'Cancelado' && isOfsConcluded(call.ofsStatus))) && !call.closingSubreason?.trim() && !call.closingReason?.trim())
    .filter((call) => Date.parse(call.executedAt || call.openedAt) >= since)
    .sort((left, right) => Date.parse(right.executedAt || right.openedAt) - Date.parse(left.executedAt || left.openedAt))
    .map((call) => orderDigits(call.orderNumber) || orderDigits(call.officeTrack))
    .filter((order) => order.length >= 8 && !seen.has(order) && Boolean(seen.add(order)))
    .slice(0, limit);
}

const clean = (value: unknown) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, MAX_LENGTH) : undefined;
};

// Cruza pela ordem (ou Office Track) e devolve so os campos que mudaram. Ordem que bate em mais de um chamado e ignorada.
export function matchOfsClosing(items: OfsClosingItem[], calls: Call[]): { matches: OfsClosingMatch[]; unmatched: string[] } {
  const byOrder = new Map<string, Call[]>();
  for (const call of calls) {
    for (const key of new Set([orderDigits(call.orderNumber), orderDigits(call.officeTrack)].filter((value) => value.length >= 8))) {
      byOrder.set(key, [...(byOrder.get(key) || []), call]);
    }
  }
  const matches: OfsClosingMatch[] = [];
  const unmatched: string[] = [];
  for (const item of items) {
    const order = orderDigits(item.ordem);
    const candidates = byOrder.get(order) || [];
    if (candidates.length !== 1) { unmatched.push(order || String(item.ordem)); continue; }
    const call = candidates[0];
    const next: Partial<OfsClosingFields> = { closingReason: clean(item.motivo), closingSubreason: clean(item.submotivo), cableType: clean(item.tipoCabo) };
    const fields = Object.fromEntries(Object.entries(next).filter(([field, value]) => value !== undefined && value !== call[field as keyof OfsClosingFields])) as Partial<OfsClosingFields>;
    if (Object.keys(fields).length) matches.push({ callId: call.id, orderNumber: call.orderNumber, fields });
  }
  return { matches, unmatched };
}
