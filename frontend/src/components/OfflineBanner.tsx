import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { flushPendingNotes, PENDING_CHANGED, readPendingNotes } from "../lib/offline-notes";

// Aviso de sem conexao e das observacoes guardadas para enviar (18/11/2026).
export function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [pending, setPending] = useState(() => readPendingNotes().length);
  const [sentNow, setSentNow] = useState(0);
  useEffect(() => {
    const refresh = () => setPending(readPendingNotes().length);
    const flush = () => { void flushPendingNotes().then((count) => { refresh(); if (count) { setSentNow(count); window.setTimeout(() => setSentNow(0), 5000); } }); };
    const goOnline = () => { setOnline(true); flush(); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener(PENDING_CHANGED, refresh);
    // Ao abrir e a cada 1 min (com rede): manda o que ficou guardado.
    if (navigator.onLine) flush();
    const timer = window.setInterval(() => { if (navigator.onLine && readPendingNotes().length) flush(); }, 60_000);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); window.removeEventListener(PENDING_CHANGED, refresh); window.clearInterval(timer); };
  }, []);
  if (online && !pending && !sentNow) return null;
  return (
    <div className={`offline-banner${online ? " is-online" : ""}`} role="status" aria-live="polite">
      {!online ? <><CloudOff size={16} aria-hidden="true" /><span><strong>Sem conexão.</strong> As observações que você salvar ficam guardadas e vão sozinhas quando a conexão voltar.{pending ? ` ${pending} aguardando.` : ""}</span></>
        : pending ? <><RefreshCw size={16} aria-hidden="true" /><span>Enviando {pending} observação(ões) guardada(s)...</span></>
        : <><RefreshCw size={16} aria-hidden="true" /><span>{sentNow} observação(ões) guardada(s) enviada(s).</span></>}
    </div>
  );
}
