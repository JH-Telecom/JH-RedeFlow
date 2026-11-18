import { useEffect, useRef, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { api, type CallPresence as Presence } from "../api";

// Quem mais esta com este chamado aberto (18/11/2026). Avisa o servidor a cada 15 s (so com a aba visivel) e na hora
// em que a pessoa comeca ou para de editar. Se outra pessoa salvou depois que esta tela abriu, pede para recarregar
// antes de salvar, para uma nao gravar por cima da outra.
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");
const clock = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function CallPresence({ callId, editing }: { callId: string; editing: boolean }) {
  const [presence, setPresence] = useState<Presence | null>(null);
  const openedAt = useRef(Date.now());
  const editingRef = useRef(editing);
  editingRef.current = editing;
  useEffect(() => {
    let active = true;
    openedAt.current = Date.now();
    const ping = () => { if (document.visibilityState === "visible") api.callPresence(callId, editingRef.current).then((data) => { if (active) setPresence(data); }).catch(() => undefined); };
    const timer = window.setInterval(ping, 15_000);
    document.addEventListener("visibilitychange", ping);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", ping); void api.leaveCallPresence(callId).catch(() => undefined); };
  }, [callId]);
  // Comecou ou parou de editar: avisa na hora (os outros veem "editando").
  useEffect(() => { api.callPresence(callId, editing).then(setPresence).catch(() => undefined); }, [callId, editing]);
  const viewers = presence?.viewers ?? [];
  const saved = presence?.lastSave && Date.parse(presence.lastSave.at) > openedAt.current ? presence.lastSave : null;
  if (!viewers.length && !saved) return null;
  const editors = viewers.filter((viewer) => viewer.editing);
  const names = (list: typeof viewers) => list.map((viewer) => viewer.name).join(", ").replace(/, ([^,]*)$/, " e $1");
  return (
    <div className={`call-presence${saved ? " is-conflict" : editors.length ? " is-editing" : ""}`} role="status">
      {viewers.length > 0 && <span className="call-presence-avatars" aria-hidden="true">{viewers.slice(0, 4).map((viewer) => <i key={viewer.name} className={viewer.editing ? "is-editing" : ""} title={viewer.name}>{initials(viewer.name)}</i>)}</span>}
      {!viewers.length && <Users size={16} aria-hidden="true" />}
      <span className="call-presence-text">
        {saved
          ? <><strong>{saved.name} salvou mudanças neste chamado às {clock(saved.at)}.</strong> Recarregue para ver antes de salvar, ou as suas mudanças podem gravar por cima.</>
          : editors.length
            ? <><strong>{names(editors)} {editors.length === 1 ? "está editando" : "estão editando"} este chamado agora.</strong>{viewers.length > editors.length ? ` ${names(viewers.filter((viewer) => !viewer.editing))} também ${viewers.length - editors.length === 1 ? "está" : "estão"} com ele aberto.` : ""}</>
            : <><strong>{names(viewers)}</strong> também {viewers.length === 1 ? "está" : "estão"} com este chamado aberto.</>}
      </span>
      {saved && <button type="button" className="secondary-button compact" onClick={() => window.location.reload()}><RefreshCw size={14} aria-hidden="true" /> Recarregar</button>}
    </div>
  );
}
