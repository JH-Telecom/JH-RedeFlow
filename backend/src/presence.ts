// Presenca dos usuarios logados: cada requisicao autenticada do sistema marca o ultimo contato.
// O app aberto consulta notificacoes a cada 15 s (1 min em aba de fundo), entao quem tem o sistema aberto
// e logado aparece online; quem saiu (logout) ou fechou o sistema fica offline depois da janela abaixo.
// Fica em memoria: o Render (1 instancia) reinicia vazio e todos reaparecem no proximo contato.
export const ONLINE_WINDOW_MS = 2 * 60_000;

const lastSeen = new Map<string, number>();

export function touchPresence(userId: string, now = Date.now()) {
  lastSeen.set(userId, now);
}

export function clearPresence(userId: string) {
  lastSeen.delete(userId);
}

export function presenceOf(userId: string, now = Date.now()): { online: boolean; lastSeenAt?: string } {
  const seen = lastSeen.get(userId);
  if (seen === undefined) return { online: false };
  return { online: now - seen <= ONLINE_WINDOW_MS, lastSeenAt: new Date(seen).toISOString() };
}

// Quem esta com cada chamado aberto (18/11/2026): a tela do chamado avisa a cada 15 s; vale por 40 s. Tambem guarda
// quem salvou por ultimo, para avisar quem abriu antes e ainda nao recarregou. Em memoria, como a presenca acima.
export const CALL_VIEW_WINDOW_MS = 40_000;
type Viewer = { name: string; at: number; editing: boolean };
const callViewers = new Map<string, Map<string, Viewer>>();
const callSaves = new Map<string, { userId: string; name: string; at: number }>();

function prune(callId: string, now: number) {
  const viewers = callViewers.get(callId);
  if (!viewers) return;
  for (const [userId, viewer] of viewers) if (now - viewer.at > CALL_VIEW_WINDOW_MS) viewers.delete(userId);
  if (!viewers.size) callViewers.delete(callId);
}

export function touchCallViewer(callId: string, userId: string, name: string, editing: boolean, now = Date.now()) {
  const viewers = callViewers.get(callId) ?? new Map<string, Viewer>();
  viewers.set(userId, { name, at: now, editing });
  callViewers.set(callId, viewers);
  prune(callId, now);
}

export function leaveCall(callId: string, userId: string) {
  callViewers.get(callId)?.delete(userId);
  if (!callViewers.get(callId)?.size) callViewers.delete(callId);
}

export function callViewersOf(callId: string, exceptUserId: string, now = Date.now()) {
  prune(callId, now);
  return [...(callViewers.get(callId)?.entries() ?? [])].filter(([userId]) => userId !== exceptUserId).map(([, viewer]) => ({ name: viewer.name, editing: viewer.editing }));
}

export function markCallSaved(callId: string, userId: string, name: string, now = Date.now()) {
  callSaves.set(callId, { userId, name, at: now });
  if (callSaves.size > 2000) callSaves.delete(callSaves.keys().next().value as string);
}

export function lastCallSave(callId: string) {
  const save = callSaves.get(callId);
  return save ? { userId: save.userId, name: save.name, at: new Date(save.at).toISOString() } : null;
}
