import type { Activation, Call, User } from './types.js';
import { decideActivation, listActivations } from './store/activations.js';
import { updateCall } from './store/calls.js';
import { recordIntegrationEvent } from './store/integration-events.js';
import { bumpDataVersion } from './read-cache.js';
import { resolveOltRegion } from './integrations/wuzapi/noc-consolidation.js';

// Aceite automatico de dia (26/11/2026). 15% dos cards (137 de 903 em 30 dias) esperavam mais de 1h para alguem
// aceitar, e o prazo de 6h ja conta desde o card. Agora o card COMPLETO que ficou 15 min pendente e aceito sozinho:
// tem a ordem, tem OLT com regiao conhecida e nao e repetido. Card faltando algo continua esperando o mesario.
// Usa o decideActivation normal (atrelada vira Atrelado, card repetido liga ao chamado que ja existe).
export const DAY_AUTO_ACCEPT_MINUTES = 15;
export const MAX_DAY_ACCEPTS_PER_SWEEP = 20;
export const DAY_ACCEPT_ACTOR_NAME = 'Aceite automático (15 min)';

export function dayAcceptActor(): User {
  return { id: 'system-day-accept', name: DAY_ACCEPT_ACTOR_NAME, email: 'system-day-accept@jhtelecom.com', roleId: 'system', active: true, createdAt: new Date().toISOString() };
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

// O que falta para o card ser aceito sozinho (vazio = completo).
export function missingForAutoAccept(activation: Pick<Activation, 'extractedData' | 'analysis' | 'duplicate'>): string[] {
  const missing: string[] = [];
  if (!text(activation.extractedData?.orderNumber)) missing.push('ordem');
  const olt = text(activation.analysis?.olt) || text(activation.extractedData?.olt);
  if (!olt || !resolveOltRegion(olt).region) missing.push('OLT com região');
  if (activation.duplicate) missing.push('card repetido');
  return missing;
}

// Pendentes completos esperando ha 15 min ou mais, do mais antigo para o mais novo.
export function activationsToDayAccept(activations: Activation[], now: number | Date = Date.now()): Activation[] {
  const limit = new Date(now).getTime() - DAY_AUTO_ACCEPT_MINUTES * 60_000;
  return activations
    .filter((activation) => activation.status === 'Pendente' && Date.parse(activation.receivedAt) <= limit)
    .filter((activation) => !missingForAutoAccept(activation).length)
    .sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt));
}

type Deps = {
  list: () => Promise<Activation[]>;
  decide: (id: string, actor: User) => Promise<{ activation?: Activation; call?: Call }>;
  record: (ok: boolean, summary: string, details: Record<string, unknown>) => Promise<void>;
};
const defaultDeps: Deps = {
  list: () => listActivations('Pendente'),
  decide: async (id, actor) => {
    const result = await decideActivation(id, 'Aceito', actor);
    const { activation, call } = result;
    if (activation && call && Date.parse(call.openedAt) === Date.parse(activation.receivedAt) && !call.notes.includes(DAY_ACCEPT_ACTOR_NAME)) {
      await updateCall(call.id, { notes: `${call.notes}\n${DAY_ACCEPT_ACTOR_NAME}: card completo pendente há mais de ${DAY_AUTO_ACCEPT_MINUTES} min.` }, actor).catch(() => undefined);
    }
    return result;
  },
  record: (ok, summary, details) => recordIntegrationEvent('day_accept', ok, summary, details),
};

let running: Promise<{ aceitos: number; erros: number }> | undefined;
export function sweepDayActivations(now: number | Date = Date.now(), deps: Partial<Deps> = {}) {
  if (running) return running;
  running = sweep(now, { ...defaultDeps, ...deps }).finally(() => { running = undefined; });
  return running;
}

async function sweep(now: number | Date, deps: Deps) {
  const batch = activationsToDayAccept(await deps.list(), now).slice(0, MAX_DAY_ACCEPTS_PER_SWEEP);
  if (!batch.length) return { aceitos: 0, erros: 0 };
  const actor = dayAcceptActor();
  const ordens: string[] = [];
  const falhas: Array<{ id: string; erro: string }> = [];
  for (const activation of batch) {
    try {
      const result = await deps.decide(activation.id, actor);
      if (result.activation && result.call) ordens.push(result.call.orderNumber);
    } catch (error) {
      falhas.push({ id: activation.id, erro: error instanceof Error ? error.message : String(error) });
    }
  }
  if (ordens.length) bumpDataVersion();
  const summary = `${DAY_ACCEPT_ACTOR_NAME}: ${ordens.length} card(s) aceito(s)${falhas.length ? `, ${falhas.length} erro(s)` : ''}`;
  console.log(`[Aceite automatico] ${summary}${ordens.length ? ` (${ordens.join(', ')})` : ''}`);
  await deps.record(!falhas.length, summary, { stage: 'day_auto_accept', ordens, falhas: falhas.slice(0, 20) }).catch(() => undefined);
  return { aceitos: ordens.length, erros: falhas.length };
}
