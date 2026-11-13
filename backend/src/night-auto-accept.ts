import type { Activation, Call, User } from './types.js';
import { isNightWindow, nightStartIso, type NightRouterSettings } from './night-router.js';
import { decideActivation, listActivations } from './store/activations.js';
import { updateCall } from './store/calls.js';
import { recordIntegrationEvent } from './store/integration-events.js';
import { bumpDataVersion } from './read-cache.js';

// Aceite automatico da madrugada (13/11/2026). Das 22:00 as 06:00, com o roteirizador ligado e FORA do modo teste, o
// sistema aceita sozinho os acionamentos Pendentes que chegaram nesta madrugada (desde as 22:00). Os que chegaram antes
// das 22:00 continuam esperando o aceite manual dos mesarios. No modo teste nada e aceito: so conta quantos seriam.
// Roda quando a extensao pergunta o que mover (/roteirizador/pendentes, antes de escolher as ordens, para o chamado
// recem-criado ja ser roteado no mesmo ciclo) e logo depois que um card chega pelo webhook.
// O aceite usa o decideActivation normal: aceites em fila e card repetido liga ao chamado que ja existe.
export const MAX_AUTO_ACCEPTS_PER_SWEEP = 20;
export const NIGHT_ROUTER_ACTOR_ID = 'system-night-router';
export const NIGHT_ROUTER_ACTOR_NAME = 'Roteirizador da madrugada';

// roleId 'system': o historico do chamado grava sem usuario (como o Coletor OFS) e o aceite fica sem decision_by no banco.
export function nightRouterActor(label = ''): User {
  return { id: NIGHT_ROUTER_ACTOR_ID, name: `${NIGHT_ROUTER_ACTOR_NAME}${label ? ` – ${label}` : ''}`, email: 'system-night-router@jhtelecom.com', roleId: 'system', active: true, createdAt: new Date().toISOString() };
}

// Pendentes recebidos nesta madrugada (desde as 22:00 e ate agora), do mais antigo para o mais novo. Fora da janela: nenhum.
export function activationsToAutoAccept(activations: Activation[], now: number | Date = Date.now()): Activation[] {
  if (!isNightWindow(now)) return [];
  const since = Date.parse(nightStartIso(now));
  const until = new Date(now).getTime();
  return activations
    .filter((activation) => activation.status === 'Pendente')
    .filter((activation) => { const at = Date.parse(activation.receivedAt); return at >= since && at <= until; })
    .sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt));
}

export type NightSweepResult = { aceitos: number; aceitariamos: number; erros: number; restantes: number; ordens: string[] };
type SweepDeps = {
  list: () => Promise<Activation[]>;
  decide: (id: string, actor: User) => Promise<{ activation?: Activation; call?: Call }>;
  record: (ok: boolean, summary: string, details: Record<string, unknown>) => Promise<void>;
};

const defaultDeps: SweepDeps = {
  list: () => listActivations('Pendente'),
  decide: async (id, actor) => {
    const result = await decideActivation(id, 'Aceito', actor);
    // Chamado criado agora (nao o de um card repetido): deixa escrito quem aceitou (vai para o historico do chamado).
    const { activation, call } = result;
    if (activation && call && Date.parse(call.openedAt) === Date.parse(activation.receivedAt) && !call.notes.includes(NIGHT_ROUTER_ACTOR_NAME)) {
      await updateCall(call.id, { notes: `${call.notes}\nAceito automaticamente pelo ${NIGHT_ROUTER_ACTOR_NAME} (22h às 06h).` }, actor)
        .catch((error) => console.warn(`[Roteirizador] nao consegui anotar o aceite automatico no chamado ${call.orderNumber}: ${error instanceof Error ? error.message : error}`));
    }
    return result;
  },
  record: (ok, summary, details) => recordIntegrationEvent('night_router', ok, summary, details),
};

let running: Promise<NightSweepResult> | undefined;

// Uma varredura por vez (a extensao e o webhook podem chamar juntos); quem chega no meio espera a que esta rodando.
export function sweepNightActivations(settings: NightRouterSettings, now: number | Date = Date.now(), deps: Partial<SweepDeps> = {}, label = ''): Promise<NightSweepResult> {
  if (running) return running;
  running = sweep(settings, now, { ...defaultDeps, ...deps }, label).finally(() => { running = undefined; });
  return running;
}

async function sweep(settings: NightRouterSettings, now: number | Date, deps: SweepDeps, label: string): Promise<NightSweepResult> {
  const empty: NightSweepResult = { aceitos: 0, aceitariamos: 0, erros: 0, restantes: 0, ordens: [] };
  if (!settings.enabled || !isNightWindow(now)) return empty;
  const candidates = activationsToAutoAccept(await deps.list(), now);
  if (!candidates.length) return empty;
  if (settings.testMode) return { ...empty, aceitariamos: candidates.length };
  const actor = nightRouterActor(label);
  const batch = candidates.slice(0, MAX_AUTO_ACCEPTS_PER_SWEEP);
  const ordens: string[] = [];
  const falhas: Array<{ id: string; erro: string }> = [];
  let aceitos = 0;
  for (const activation of batch) {
    try {
      const result = await deps.decide(activation.id, actor);
      // Sem activation: outro aceite (manual ou outra varredura) chegou antes. Nao e erro.
      if (result.activation) { aceitos += 1; if (result.call) ordens.push(result.call.orderNumber); }
    } catch (error) {
      falhas.push({ id: activation.id, erro: error instanceof Error ? error.message : String(error) });
    }
  }
  const restantes = candidates.length - batch.length;
  if (aceitos) bumpDataVersion();
  if (aceitos || falhas.length) {
    const summary = `Roteirizador: ${aceitos} aceito(s) automaticamente${falhas.length ? `, ${falhas.length} erro(s)` : ''}${restantes ? `, ${restantes} para o proximo ciclo` : ''}`;
    console.log(`[Roteirizador] ${actor.name}: ${summary}${ordens.length ? ` (${ordens.join(', ')})` : ''}`);
    await deps.record(!falhas.length, summary, { stage: 'auto_accept', by: label, ordens, falhas: falhas.slice(0, 20) }).catch(() => undefined);
  }
  return { aceitos, aceitariamos: 0, erros: falhas.length, restantes, ordens };
}
