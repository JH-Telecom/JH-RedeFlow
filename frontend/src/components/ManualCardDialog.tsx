import { useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardPaste } from "lucide-react";
import { api } from "../api";
import { AdminModal } from "./ui";

// "Colar card" (22/11/2026): quando o WhatsApp do WuzAPI cai, cards do grupo nao chegam. O mesario cola o texto do
// card aqui; o sistema le igual ao que chega pelo grupo (mesmas regras de OS repetida, relatorio de encerramento etc.)
// e o acionamento entra na lista de pendentes para aceitar normalmente.
export function ManualCardDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // Card que ja estava no sistema: mostra o que existe (com link para o chamado), em vez de "lançado".
  const [existing, setExisting] = useState<{ text: string; callId?: string | null } | null>(null);

  async function submit() {
    if (text.trim().length < 20) { setError("Cole o texto completo do card."); return; }
    setSending(true);
    setError("");
    setExisting(null);
    try {
      const result = await api.manualActivation(text);
      const os = result.orderNumber ? ` (OS ${result.orderNumber})` : "";
      if (result.status === "duplicate") { setExisting({ text: result.activationStatus === "Pendente" ? `Esse card já está na lista de pendentes${os}. Não foi lançado de novo.` : `Esse card já foi ${(result.activationStatus || "").toLowerCase()}${os}. Não foi lançado de novo.`, callId: result.callId }); return; }
      if (result.status === "ignored" && result.callId) { setExisting({ text: `Já existe um chamado com essa OS${os}${result.callStatus ? `, em ${result.callStatus}` : ""}. Não foi lançado de novo.`, callId: result.callId }); return; }
      if (result.status === "ignored") { setError(`O card não foi lançado: ${result.reason || "não parece um acionamento."}`); return; }
      onDone("Card lançado: o acionamento está na lista de pendentes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível lançar o card.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminModal title="Colar card" onClose={onClose}>
      <div className="manual-card admin-form">
        <p className="manual-card-hint">Use quando um card do grupo não chegou no sistema (por exemplo, com o WhatsApp do WuzAPI desconectado). Cole o texto inteiro, do jeito que está no WhatsApp.</p>
        <label className="manual-card-label" htmlFor="manual-card-text">Texto do card</label>
        <textarea id="manual-card-text" className="manual-card-text" value={text} onChange={(event) => setText(event.target.value)} placeholder={"⚠️ACIONAMENTO FIELD⚠️\n\nINFO CASA CLIENTE\n- TÉCNICO: ...\n- O.S. CASA CLIENTE: ...\n..."} rows={14} autoFocus spellCheck={false} />
        {error && <div className="form-error" role="alert">{error}</div>}
        {existing && <div className="manual-card-existing" role="status"><span>{existing.text}</span>{existing.callId && <Link to={`/chamados/${existing.callId}`} onClick={onClose}>Abrir chamado</Link>}</div>}
        <div className="manual-card-actions">
          <button type="button" className="secondary-button compact" onClick={onClose} disabled={sending}>Cancelar</button>
          <button type="button" className="primary-button compact" onClick={() => void submit()} disabled={sending || !text.trim()}><ClipboardPaste size={15} /> {sending ? "Lançando..." : "Lançar acionamento"}</button>
        </div>
      </div>
    </AdminModal>
  );
}
