import { DAILY_RESET_HOUR, DAILY_RESET_LAST_HOUR, DAILY_RESET_STATUSES, planDailyReset, type DailyResetPlan } from './daily-reset.js';
import { bumpDataVersion } from './read-cache.js';
import { listCalls, updateCall } from './store.js';
import { listIntegrationEvents, recordIntegrationEvent } from './store/integration-events.js';
import { lastTechnicianAssignmentTimes } from './store/observations.js';
import { toOperationalDate } from './timezone.js';
import type { User } from './types.js';

const spHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' });
let running = false;

// Limpeza diaria da fila as 06:00 (Sao Paulo), uma vez por dia (registro em integration_events, kind daily_reset).
// Ordens Atribuido/Deslocamento/Em campo com tecnico alocado antes das 19h de ontem voltam para Aberto, sem tecnico.
// Se o servidor estava parado as 06:00, roda na primeira verificacao ate as 10:59; depois disso fica para o dia
// seguinte. A regra das 19h de ontem continua protegendo quem foi alocado hoje. Cada ordem fica no historico como alterada pelo sistema ("Limpeza diaria").
export async function runDailyReset(now = new Date()): Promise<DailyResetPlan | null> {
  const hour = Number(spHour.format(now));
  if (running || hour < DAILY_RESET_HOUR || hour > DAILY_RESET_LAST_HOUR) return null;
  running = true;
  try {
    const resetDate = toOperationalDate(now);
    const done = (await listIntegrationEvents(36, ['daily_reset'])).some((event) => event.ok && event.details.date === resetDate);
    if (done) return null;
    const active = await listCalls(DAILY_RESET_STATUSES);
    const plan = planDailyReset(active, await lastTechnicianAssignmentTimes(active.map((call) => call.id)), now);
    const actor: User = { id: 'system-daily-reset', name: 'Limpeza diaria', email: 'system-daily-reset@jhtelecom.com', roleId: 'system', active: true, createdAt: now.toISOString() };
    const failed: string[] = [];
    for (const call of plan.reset) {
      try { await updateCall(call.id, { technicianId: null, status: 'Aberto' }, actor); }
      catch (error) { failed.push(`${call.orderNumber}: ${error instanceof Error ? error.message : error}`); }
    }
    if (plan.reset.length) bumpDataVersion();
    await recordIntegrationEvent('daily_reset', failed.length === 0, `Limpeza diária: ${plan.reset.length - failed.length} ordem(ns) voltaram para Chamados abertos, ${plan.kept.length} do turno da noite mantida(s)${failed.length ? `, ${failed.length} com erro` : ''}`, { date: resetDate, cutoff: plan.cutoffIso, reset: plan.reset.map((call) => call.orderNumber), kept: plan.kept.map((call) => call.orderNumber), failed });
    console.log(`[Limpeza diaria] ${resetDate}: ${plan.reset.length} ordem(ns) devolvidas, ${plan.kept.length} mantidas (noite).`);
    return plan;
  } catch (error) {
    console.warn(`[Limpeza diaria] erro: ${error instanceof Error ? error.message : error}`);
    return null;
  } finally {
    running = false;
  }
}
