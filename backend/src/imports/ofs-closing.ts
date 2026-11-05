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

// Valor gravado como chave da lista do OFS (ex.: Submotivo "13", Motivo "CTO_SEM_SINAL_EVENTO_PRODUTIVO") em vez do
// texto: a extensao v1.2.0 lia a chave. Esses chamados voltam para a fila e sao relidos ja com o texto.
export function looksLikeOfsCode(value?: string) {
  const text = value?.trim() || '';
  return /^\d+$/.test(text) || /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(text);
}

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
    .filter((call) => CLOSED.has(call.status) || (call.status !== 'Cancelado' && isOfsConcluded(call.ofsStatus)))
    .filter((call) => (!call.closingSubreason?.trim() && !call.closingReason?.trim()) || looksLikeOfsCode(call.closingSubreason) || looksLikeOfsCode(call.closingReason))
    .filter((call) => Date.parse(call.executedAt || call.openedAt) >= since)
    .sort((left, right) => Date.parse(right.executedAt || right.openedAt) - Date.parse(left.executedAt || left.openedAt))
    .map((call) => orderDigits(call.orderNumber) || orderDigits(call.officeTrack))
    .filter((order) => order.length >= 8 && !seen.has(order) && Boolean(seen.add(order)))
    .slice(0, limit);
}

const ACTIVE = new Set(['Aberto', 'Atribuido', 'Deslocamento', 'Em campo']);
export type OfsAutoFinish = { callId: string; orderNumber: string; fields: Pick<EditableCallFields, 'status' | 'executedAt' | 'result'> };

// Finaliza sozinho o chamado que ja tem tudo do OFS: ainda ativo aqui, OFS "concluido", Data Fim do OFS, tecnico
// e o fechamento lido (Motivo/Submotivo em texto, nao codigo). Resultado = o que ja havia (se for texto) ou
// "Motivo — Submotivo" do fechamento. Sem tecnico nao finaliza (o encerramento manual tambem exige).
export function callsReadyToFinish(calls: Call[]): OfsAutoFinish[] {
  return calls
    .filter((call) => ACTIVE.has(call.status) && isOfsConcluded(call.ofsStatus) && Boolean(call.executedAt) && Boolean(call.technicianId))
    .filter((call) => Boolean(call.closingReason?.trim() || call.closingSubreason?.trim()) && !looksLikeOfsCode(call.closingReason) && !looksLikeOfsCode(call.closingSubreason))
    .map((call) => {
      const currentResult = call.result?.trim();
      const result = currentResult && !looksLikeOfsCode(currentResult) ? currentResult : [call.closingReason, call.closingSubreason].map((part) => part?.trim()).filter(Boolean).join(' — ');
      return { callId: call.id, orderNumber: call.orderNumber, fields: { status: 'Finalizado' as const, executedAt: call.executedAt!, result: result.slice(0, 255) } };
    });
}

const clean = (value: unknown) => {
  // Tira virgula/ponto e virgula soltos nas pontas (ex.: Tipo do Cabo ",12" digitado no OFS).
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().replace(/^[,;]+\s*|\s*[,;]+$/g, '');
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
