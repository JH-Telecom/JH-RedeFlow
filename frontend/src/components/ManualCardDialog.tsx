import { useState } from "react";
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

  async function submit() {
    if (text.trim().length < 20) { setError("Cole o texto completo do card."); return; }
    setSending(true);
    setError("");
    try {
      const result = await api.manualActivation(text);
      if (result.status === "ignored") { setError(`O card não foi lançado: ${result.reason || "não parece um acionamento."}`); return; }
      onDone(result.status === "Pendente" ? "Card lançado: o acionamento está na lista de pendentes." : `Esse card já estava no sistema (${result.status}).`);
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
        <div className="manual-card-actions">
          <button type="button" className="secondary-button compact" onClick={onClose} disabled={sending}>Cancelar</button>
          <button type="button" className="primary-button compact" onClick={() => void submit()} disabled={sending || !text.trim()}><ClipboardPaste size={15} /> {sending ? "Lançando..." : "Lançar acionamento"}</button>
        </div>
      </div>
    </AdminModal>
  );
}
