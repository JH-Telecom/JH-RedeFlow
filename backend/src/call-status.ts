import type { CallStatus } from './types.js';

// Encerrados de verdade. GIGA+ (chamado do outro escritorio) NAO e encerrado so por ter o status: continua aberto
// (aceita observacoes para os gestores e edicao) ate o OFS mostrar a atividade concluida. Nunca vira "Finalizado"
// sozinho e fica fora dos indicadores da Rede SP de qualquer jeito.
export const CLOSED_CALL_STATUSES: CallStatus[] = ['Finalizado', 'Cancelado', 'Baixar'];
export const ofsConcluded = (ofsStatus?: string | null) => /^(conclu|finaliz|encerrad|executad)/.test(String(ofsStatus || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase());

export function isCallClosed(call: { status: CallStatus; ofsStatus?: string | null }) {
  if (CLOSED_CALL_STATUSES.includes(call.status)) return true;
  return call.status === 'GIGA+' && ofsConcluded(call.ofsStatus);
}

// Status de quem esta atendendo: voltar o chamado para um deles tira a marca de GIGA+ (passou a ser da Rede SP).
export const ACTIVE_CALL_STATUSES: CallStatus[] = ['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo'];
export function nextGigaPlus(current: { status: CallStatus; gigaPlus?: boolean }, nextStatus: CallStatus): boolean | undefined {
  if (nextStatus === 'GIGA+') return current.gigaPlus ? undefined : true;
  if (ACTIVE_CALL_STATUSES.includes(nextStatus)) return current.gigaPlus || current.status === 'GIGA+' ? false : undefined;
  return current.status === 'GIGA+' && !current.gigaPlus ? true : undefined;
}

// Baixar ou GIGA+ com a atividade concluida no OFS e com tecnico: vira Finalizado sozinho (24/11/2026).
export function shouldAutoFinalize(call: { status: CallStatus; ofsStatus?: string | null; technicianId?: string | null; executedAt?: string | null }) {
  return (call.status === 'Baixar' || call.status === 'GIGA+') && ofsConcluded(call.ofsStatus) && Boolean(call.technicianId) && Boolean(call.executedAt);
}

// Filtro das filas: GIGA+ em aberto (Em atendimento -> GIGA+) ou ja concluido no OFS (Finalizados -> GIGA+).
export function matchesGigaState(call: { status: CallStatus; ofsStatus?: string | null }, gigaClosed?: boolean) {
  return gigaClosed === undefined || call.status !== 'GIGA+' || isCallClosed(call) === gigaClosed;
}
