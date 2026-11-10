import { useEffect, useState } from "react";
import { Bell, Check, ExternalLink, X } from "lucide-react";
import { api, type Activation } from "../api";

// Aviso de acionamento novo no canto inferior direito, com Aceitar e Recusar ali mesmo (quem tem
// activations.decide). Varios chegando juntos ficam numa fila ("1 de 3"). Nao some sozinho enquanto ha
// acionamento esperando decisao; o X so esconde (o acionamento continua pendente na tela de Acionamentos).
export const ACTIVATIONS_CHANGED = "redeflow:acionamentos";

export function ActivationToast({ queue, canDecide, onClose, onDecided, onOpen }: {
  queue: Activation[];
  canDecide: boolean;
  onClose: () => void;
  onDecided: (id: string) => void;
  onOpen: () => void;
}) {
  const current = queue[0];
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => { setRejecting(false); setReason(""); setFeedback(null); }, [current?.id]);
  if (!current) return null;

  const data = current.extractedData || {};
  const order = data.orderNumber || data.bdesk || "";
  const details = [data.type, data.olt, data.reason].filter(Boolean).join(" · ");

  async function decide(kind: "accept" | "reject") {
    setBusy(true);
    setFeedback(null);
    try {
      if (kind === "accept") await api.acceptActivation(current.id);
      else await api.rejectActivation(current.id, reason.trim());
      setFeedback({ text: kind === "accept" ? "Aceito: o chamado já está na fila." : "Acionamento recusado.", error: false });
      // Mostra a confirmacao por 1,2 s e so depois avisa as outras telas (que tiram o acionamento da fila).
      window.setTimeout(() => { onDecided(current.id); window.dispatchEvent(new Event(ACTIVATIONS_CHANGED)); }, 1200);
    } catch (err) {
      setFeedback({ text: err instanceof Error ? err.message : "Não foi possível concluir.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="act-toast" role="alertdialog" aria-labelledby="act-toast-title" aria-describedby="act-toast-detail">
      <div className="act-toast-head">
        <span className="act-toast-icon"><Bell size={18} aria-hidden="true" /></span>
        <div className="act-toast-text">
          <strong id="act-toast-title">Novo acionamento recebido{queue.length > 1 ? <em> · 1 de {queue.length}</em> : null}</strong>
          <small id="act-toast-detail">{order ? `Ordem ${order}` : "Acionamento"} aguardando análise{details ? ` · ${details}` : ""}</small>
        </div>
        <button className="act-toast-close" type="button" onClick={onClose} aria-label="Fechar aviso"><X size={16} aria-hidden="true" /></button>
      </div>
      {feedback ? (
        <p className={`act-toast-feedback${feedback.error ? " is-error" : ""}`} role="status">{feedback.text}</p>
      ) : rejecting ? (
        <form className="act-toast-reject" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 3) void decide("reject"); }}>
          <label>Motivo da recusa<input autoFocus value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Ex.: já atendido pela outra equipe" /></label>
          <div className="act-toast-actions">
            <button className="secondary-button compact" type="button" onClick={() => setRejecting(false)} disabled={busy}>Voltar</button>
            <button className="act-toast-danger" type="submit" disabled={busy || reason.trim().length < 3}>{busy ? "Recusando..." : "Confirmar recusa"}</button>
          </div>
        </form>
      ) : (
        <div className="act-toast-actions">
          <button className="act-toast-link" type="button" onClick={onOpen}><ExternalLink size={14} aria-hidden="true" />Ver</button>
          {canDecide && <button className="secondary-button compact" type="button" onClick={() => setRejecting(true)} disabled={busy}>Recusar</button>}
          {canDecide && <button className="primary-button compact" type="button" onClick={() => void decide("accept")} disabled={busy}><Check size={15} aria-hidden="true" />{busy ? "Aceitando..." : "Aceitar"}</button>}
        </div>
      )}
    </section>
  );
}
