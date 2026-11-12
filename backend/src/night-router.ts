import type { Call, Technician } from './types.js';
import { orderDigits } from './imports/ofs-closing.js';
import { OPERATIONAL_TIME_ZONE } from './timezone.js';

// Roteirizador da madrugada (12/11/2026). Das 00:00 as 06:00 (Sao Paulo), quando os mesarios nao estao, a extensao do
// PC da coleta pergunta ao servidor quais ordens mover e move no OFS (mesmo caminho do "Mover" da extensao JH Telecom:
// OS pendente de hoje -> Mover -> tecnico -> "Reordenacao de Prioridade - BackOffice" -> Mover).
// Quais ordens: chamados ativos do RedeFlow SEM tecnico (no OFS ainda estao no balde), OFS pendente.
// Para quem: o tecnico de plantao da regiao do chamado naquela madrugada (escala por regiao e dia da semana).
// A extensao ainda confere no OFS que a ordem esta pendente e num balde (CLUSTER_/BKI_); se estiver com uma pessoa,
// nao mexe.

export const NIGHT_START_HOUR = 0;
export const NIGHT_END_HOUR = 6; // ate 05:59
export const MAX_ORDERS_PER_CYCLE = 10;
export const MAX_ERRORS_PER_NIGHT = 2;

export type NightRouterSettings = { enabled: boolean; testMode: boolean; updatedAt: string | null; updatedBy: string | null };
// weekday: 0 = domingo ... 6 = sabado, o dia em que a madrugada acontece (00h-06h de segunda = 1).
export type NightShift = { region: string; weekday: number; technicianId: string };
export type NightRunResult = 'Movida' | 'Teste' | 'Erro' | 'Pulada';
export type NightRun = { id: string; callId: string | null; orderNumber: string; region: string; technicianId: string | null; technicianName: string; result: NightRunResult; message: string; testMode: boolean; createdAt: string };
export type NightOrder = { callId: string; os: string; regiao: string; tecnico: string; tecnicoId: string };

const hourFormatter = new Intl.DateTimeFormat('en-US', { timeZone: OPERATIONAL_TIME_ZONE, hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function saoPauloClock(now: number | Date = Date.now()) {
  const parts = Object.fromEntries(hourFormatter.formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  return { hour: Number(parts.hour) % 24, weekday: WEEKDAYS[parts.weekday] ?? 0 };
}

export function isNightWindow(now: number | Date = Date.now()) {
  const { hour } = saoPauloClock(now);
  return hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR;
}

const ACTIVE = new Set(['Aberto', 'Atribuido', 'Atrelado']);
export const regionKey = (value: string | undefined) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const isPending = (ofsStatus?: string) => !ofsStatus?.trim() || /^pend/i.test(ofsStatus.normalize('NFD').replace(/[̀-ͯ]/g, '').trim());

// Ordens para mover agora. `runs` = execucoes desta madrugada (para nao repetir a mesma ordem).
// `retestar`: o teste manual ("Rodar agora") mostra de novo as ja testadas; na madrugada, testada uma vez basta.
export function pickNightOrders(calls: Call[], shifts: NightShift[], technicians: Technician[], runs: NightRun[], now: number | Date = Date.now(), retestar = false): NightOrder[] {
  const { weekday } = saoPauloClock(now);
  // Nao usa `active`: ele segue o horario do turno do dia, e de madrugada o plantonista aparece fora do turno.
  const working = new Map(technicians.filter((technician) => technician.employmentStatus !== 'Demitido' && technician.teamRole === 'Tecnico').map((technician) => [technician.id, technician]));
  const onDuty = new Map<string, Technician>();
  for (const shift of shifts) {
    const technician = working.get(shift.technicianId);
    if (shift.weekday === weekday && technician) onDuty.set(regionKey(shift.region), technician);
  }
  if (!onDuty.size) return [];
  const done = new Set(runs.filter((run) => run.result === 'Movida' || run.result === 'Pulada' || (run.result === 'Teste' && !retestar)).map((run) => run.callId));
  const errors = new Map<string, number>();
  runs.filter((run) => run.result === 'Erro' && run.callId).forEach((run) => errors.set(run.callId!, (errors.get(run.callId!) ?? 0) + 1));
  const seen = new Set<string>();
  const orders: NightOrder[] = [];
  for (const call of [...calls].sort((left, right) => Date.parse(left.openedAt) - Date.parse(right.openedAt))) {
    if (!ACTIVE.has(call.status) || call.technicianId || !isPending(call.ofsStatus)) continue;
    if (done.has(call.id) || (errors.get(call.id) ?? 0) >= MAX_ERRORS_PER_NIGHT) continue;
    const technician = onDuty.get(regionKey(call.region));
    const os = orderDigits(call.orderNumber) || orderDigits(call.officeTrack);
    if (!technician || os.length < 8 || seen.has(os)) continue;
    seen.add(os);
    orders.push({ callId: call.id, os, regiao: call.region, tecnico: technician.name, tecnicoId: technician.id });
    if (orders.length >= MAX_ORDERS_PER_CYCLE) break;
  }
  return orders;
}

// Inicio (ISO) da madrugada atual: 00:00 de hoje em Sao Paulo (UTC-3 o ano todo).
export function nightStartIso(now: number | Date = Date.now()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: OPERATIONAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  return new Date(Date.parse(`${date}T03:00:00.000Z`)).toISOString();
}
