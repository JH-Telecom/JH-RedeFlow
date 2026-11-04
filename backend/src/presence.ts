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
