import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AtSign, Check, Clock, ExternalLink, History } from "lucide-react";
import { api, type Call, type CallObservation } from "../api";
import { AdminModal } from "./ui";
import { MentionTextarea, withMentions } from "./MentionTextarea";
import { isSaveEnter } from "../lib/keyboard";

const MAX_LENGTH = 5000;

function whenLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === today.toDateString() ? `hoje, ${time}` : `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${time}`;
}

// Popup da fila "Em atendimento": mostra a ultima observacao do chamado e registra uma nova, sem abrir o chamado.
// A observacao anterior nao e apagada: continua no historico (mesma regra do detalhe do chamado).
export function ObservationPopup({ call, teamScoped, onClose, onSaved }: { call: Call; teamScoped: boolean; onClose: () => void; onSaved: (observation: CallObservation) => void }) {
  const [latest, setLatest] = useState<CallObservation | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.observations(call.id, { teamScope: teamScoped })
      .then((data) => { if (active) setLatest([...data.observations].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null); })
      .catch(() => { if (active) setLatest(null); });
    return () => { active = false; };
  }, [call.id, teamScoped]);

  // Esc: o AdminModal fecha (com a mesma trava de "salvando" no onClose abaixo).

  async function save() {
    const value = text.trim();
    if (value.length < 2) { setError("Escreva a observação antes de salvar."); return; }
    setSaving(true);
    setError("");
    try {
      const { observation } = await api.addObservation(call.id, value, [], { teamScope: teamScoped });
      onSaved(observation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a observação.");
      setSaving(false);
    }
  }

  const place = [call.type, call.bairro || call.region].filter(Boolean).join(" · ");
  return (
    <AdminModal title={`Observação do chamado ${call.orderNumber}`} onClose={() => { if (!saving) onClose(); }}>
      <div className="obs-popup">
        <p className="obs-popup-meta">{[call.technicianName || "Sem técnico", place].filter(Boolean).join(" · ")}</p>

        <div className="obs-popup-latest" aria-live="polite">
          {latest === undefined ? <span className="obs-popup-muted">Carregando a última observação...</span>
            : latest ? <>
              <div className="obs-popup-latest-head"><span><Clock size={13} aria-hidden="true" /> Última observação</span><strong>{whenLabel(latest.createdAt)} · {latest.userName}</strong></div>
              <p>{withMentions(latest.text)}</p>
            </> : <>
              <div className="obs-popup-latest-head"><span><Clock size={13} aria-hidden="true" /> Sem observação ainda</span></div>
              {call.notes && <p>{call.notes}</p>}
            </>}
        </div>

        <label className="obs-popup-label">Nova observação
          <MentionTextarea value={text} onChange={(value) => { setText(value.slice(0, MAX_LENGTH)); if (error) setError(""); }} rows={4} placeholder="Técnico chegou no local, CTO sem sinal. Aguardando fusão." onKeyDown={(event) => { if (isSaveEnter(event)) { event.preventDefault(); void save(); } }} />
        </label>
        <div className="obs-popup-hints"><span><AtSign size={12} aria-hidden="true" /> para mencionar alguém · Enter salva · Shift+Enter quebra a linha</span><span>{text.length} / {MAX_LENGTH}</span></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="obs-popup-history"><History size={14} aria-hidden="true" /> A observação anterior continua no histórico do chamado.</p>

        <div className="obs-popup-actions">
          <Link to={`/chamados/${call.id}${teamScoped ? "?teamScope=true" : ""}`}>Abrir chamado completo <ExternalLink size={13} aria-hidden="true" /></Link>
          <div>
            <button className="secondary-button compact" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="primary-button compact" type="button" onClick={() => void save()} disabled={saving}><Check size={15} aria-hidden="true" /> {saving ? "Salvando..." : "Salvar observação"}</button>
          </div>
        </div>
      </div>
    </AdminModal>
  );
}
