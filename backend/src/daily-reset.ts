import { addDays, operationalDayStartIso, toOperationalDate } from './timezone.js';
import type { Call, CallStatus } from './types.js';

// Limpeza diaria da fila (06:00 de Sao Paulo): de manha a equipe redistribui as ordens, entao as ordens em
// andamento com o tecnico de ontem voltam para Chamados abertos, sem tecnico. Ficam com o tecnico as ordens
// alocadas a partir das 19h do dia anterior (tecnico da noite segue no dia seguinte). Atrelado nao entra:
// a ordem esta ligada a outra.
export const DAILY_RESET_HOUR = 6;
// Ultima hora em que a limpeza ainda pode rodar (servidor parado as 06:00 roda ao acordar). Depois das 10:59 fica
// para o dia seguinte, para nao tirar tecnico de ordem em andamento no meio do dia (ex.: logo apos um deploy).
export const DAILY_RESET_LAST_HOUR = 10;
export const NIGHT_SHIFT_FROM_HOUR = 19;
export const DAILY_RESET_STATUSES: CallStatus[] = ['Atribuido', 'Deslocamento', 'Em campo'];

// Instante (ISO) a partir do qual a alocacao conta como "da noite": 19h do dia anterior ao da limpeza.
export function nightShiftCutoffIso(resetDate: string) {
  return new Date(Date.parse(operationalDayStartIso(addDays(resetDate, -1))) + NIGHT_SHIFT_FROM_HOUR * 3_600_000).toISOString();
}

export type DailyResetPlan = { resetDate: string; cutoffIso: string; reset: Call[]; kept: Call[] };

// lastAssignedAt: horario da ultima troca de tecnico de cada chamado (historico). Sem registro, usa a primeira
// atribuicao (assignedAt) e, por ultimo, a abertura.
export function planDailyReset(calls: Call[], lastAssignedAt: Map<string, string>, now = new Date()): DailyResetPlan {
  const resetDate = toOperationalDate(now);
  const cutoffIso = nightShiftCutoffIso(resetDate);
  const cutoff = Date.parse(cutoffIso);
  const reset: Call[] = [];
  const kept: Call[] = [];
  for (const call of calls) {
    if (!call.technicianId || !DAILY_RESET_STATUSES.includes(call.status)) continue;
    const assignedAt = Date.parse(lastAssignedAt.get(call.id) ?? call.assignedAt ?? call.openedAt);
    if (Number.isFinite(assignedAt) && assignedAt >= cutoff) kept.push(call);
    else reset.push(call);
  }
  return { resetDate, cutoffIso, reset, kept };
}
