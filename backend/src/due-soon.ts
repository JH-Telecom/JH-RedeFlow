import type { Call } from './types.js';

// Prazo JH: 6h da abertura. "Vencendo" = chamado ainda aberto que estoura o prazo nos proximos 30 min.
export const DUE_LIMIT_MINUTES = 6 * 60;
export const DUE_SOON_WINDOW_MINUTES = 30;
const ACTIVE = new Set(['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo']);

export type DueSoonCall = Pick<Call, 'id' | 'orderNumber' | 'type' | 'region' | 'technicianName' | 'openedAt' | 'status'> & { minutesLeft: number };

export function dueSoonCalls(calls: Call[], now = Date.now()) {
  const active = calls.filter((call) => ACTIVE.has(call.status));
  const dueSoon: DueSoonCall[] = [];
  let late = 0;
  for (const call of active) {
    const elapsed = (now - Date.parse(call.openedAt)) / 60_000;
    if (!Number.isFinite(elapsed)) continue;
    const minutesLeft = DUE_LIMIT_MINUTES - elapsed;
    if (minutesLeft <= 0) late += 1;
    else if (minutesLeft <= DUE_SOON_WINDOW_MINUTES) {
      dueSoon.push({ id: call.id, orderNumber: call.orderNumber, type: call.type, region: call.region, technicianName: call.technicianName, openedAt: call.openedAt, status: call.status, minutesLeft: Math.max(1, Math.floor(minutesLeft)) });
    }
  }
  dueSoon.sort((left, right) => left.minutesLeft - right.minutesLeft);
  return { dueSoon, late, windowMinutes: DUE_SOON_WINDOW_MINUTES };
}
