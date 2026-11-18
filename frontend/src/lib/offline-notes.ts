import { api } from "../api";

// Observacoes sem conexao (18/11/2026): em campo o sinal cai. Se nao der para enviar por falta de rede, o texto fica
// guardado neste navegador e vai sozinho quando a conexao voltar (components/OfflineBanner.tsx). Anexos nao entram
// na fila: so o texto.
const KEY = "jh-observacoes-pendentes";
export type PendingNote = { id: string; callId: string; text: string; teamScope: boolean; at: string };
export const PENDING_CHANGED = "jh-redeflow:pending-notes";

export function readPendingNotes(): PendingNote[] {
  try { const saved = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(saved) ? saved : []; } catch { return []; }
}
function writePending(list: PendingNote[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event(PENDING_CHANGED));
}

// Falha de rede (fetch nao chegou ao servidor), nao erro de validacao do servidor.
export function isNetworkError(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return error instanceof TypeError && !("status" in (error as object));
}

export function queueNote(callId: string, text: string, teamScope = false) {
  writePending([...readPendingNotes(), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, callId, text, teamScope, at: new Date().toISOString() }]);
}

let flushing: Promise<number> | null = null;
// Envia as guardadas, uma por vez, na ordem. Para na primeira falha de rede (tenta de novo depois).
export function flushPendingNotes(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (const note of readPendingNotes()) {
      try {
        await api.addObservation(note.callId, note.text, [], { teamScope: note.teamScope });
      } catch (error) {
        if (isNetworkError(error)) break;
        // Recusada pelo servidor (ex.: chamado apagado): tira da fila para nao travar as outras.
      }
      writePending(readPendingNotes().filter((item) => item.id !== note.id));
      sent += 1;
    }
    if (sent) window.dispatchEvent(new Event("jh-redeflow:calls-changed"));
    return sent;
  })().finally(() => { flushing = null; });
  return flushing;
}
