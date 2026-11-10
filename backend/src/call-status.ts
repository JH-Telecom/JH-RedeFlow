import type { CallStatus } from './types.js';

// Encerrados de verdade. GIGA+ (chamado do outro escritorio) NAO e encerrado so por ter o status: continua aberto
// (aceita observacoes para os gestores e edicao) ate o OFS mostrar a atividade concluida. Nunca vira "Finalizado"
// sozinho e fica fora dos indicadores da Rede SP de qualquer jeito.
export const CLOSED_CALL_STATUSES: CallStatus[] = ['Finalizado', 'Cancelado', 'Baixar'];
const ofsConcluded = (ofsStatus?: string | null) => /^(conclu|finaliz|encerrad|executad)/.test(String(ofsStatus || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase());

export function isCallClosed(call: { status: CallStatus; ofsStatus?: string | null }) {
  if (CLOSED_CALL_STATUSES.includes(call.status)) return true;
  return call.status === 'GIGA+' && ofsConcluded(call.ofsStatus);
}

// Filtro das filas: GIGA+ em aberto (Em atendimento -> GIGA+) ou ja concluido no OFS (Finalizados -> GIGA+).
export function matchesGigaState(call: { status: CallStatus; ofsStatus?: string | null }, gigaClosed?: boolean) {
  return gigaClosed === undefined || call.status !== 'GIGA+' || isCallClosed(call) === gigaClosed;
}
