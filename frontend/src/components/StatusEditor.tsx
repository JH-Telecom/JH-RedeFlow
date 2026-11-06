import { useEffect, useState } from "react";
import { Smile } from "lucide-react";
import type { UserStatus } from "../api";

// Status personalizado (Meu perfil): emoji + texto, com atalhos e "limpar depois de". Aparece na aba Pessoas.
const PRESETS: { emoji: string; text: string }[] = [
  { emoji: "🚗", text: "Em campo" },
  { emoji: "📅", text: "Em reunião" },
  { emoji: "🍽️", text: "Almoço" },
  { emoji: "🎧", text: "Focado, falo depois" },
  { emoji: "🏠", text: "Home office" },
  { emoji: "🌙", text: "Ausente" },
];
const EMOJIS = ["🚗", "🛠️", "📅", "🍽️", "☕", "🎧", "🏠", "🌙", "🤒", "✈️", "🔥", "✅"];
type ClearAfter = "never" | "1h" | "4h" | "today";
const CLEAR_OPTIONS: { value: ClearAfter; label: string }[] = [
  { value: "1h", label: "1 hora" },
  { value: "4h", label: "4 horas" },
  { value: "today", label: "Fim do dia" },
  { value: "never", label: "Não limpar" },
];

function untilFor(value: ClearAfter): string | null {
  const now = new Date();
  if (value === "1h") return new Date(now.getTime() + 3_600_000).toISOString();
  if (value === "4h") return new Date(now.getTime() + 4 * 3_600_000).toISOString();
  if (value === "today") { const end = new Date(now); end.setHours(23, 59, 0, 0); return end.toISOString(); }
  return null;
}

export function StatusEditor({ status, onSave }: { status: UserStatus | null; onSave: (next: UserStatus | null) => Promise<void> }) {
  const [emoji, setEmoji] = useState(status?.emoji ?? "");
  const [text, setText] = useState(status?.text ?? "");
  const [clearAfter, setClearAfter] = useState<ClearAfter>("today");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setEmoji(status?.emoji ?? ""); setText(status?.text ?? ""); }, [status?.emoji, status?.text]);

  async function save(next: UserStatus | null, done: string) {
    setSaving(true); setError(""); setMessage("");
    try { await onSave(next); setMessage(done); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar o status."); }
    finally { setSaving(false); }
  }
  const untilText = status?.until ? new Date(status.until).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <section className="panel pf-card" aria-labelledby="pf-status-title">
      <div className="pf-card-heading">
        <span className="pf-card-icon"><Smile size={18} /></span>
        <div>
          <h2 id="pf-status-title">Status</h2>
          <p>Aparece no seu cartão na aba Pessoas, para a equipe saber se você está em campo, em reunião ou ausente.{status ? <> Agora: <strong>{status.emoji} {status.text}</strong>{untilText ? ` (até ${untilText})` : ""}.</> : null}</p>
        </div>
      </div>
      <div className="st-presets" role="group" aria-label="Atalhos de status">
        {PRESETS.map((preset) => <button key={preset.text} type="button" className={emoji === preset.emoji && text === preset.text ? "is-active" : ""} onClick={() => { setEmoji(preset.emoji); setText(preset.text); }}>{preset.emoji} {preset.text}</button>)}
      </div>
      <div className="st-row">
        <div className="st-emoji">
          <button type="button" className="secondary-button compact" onClick={() => setPickerOpen(!pickerOpen)} aria-expanded={pickerOpen} aria-label="Escolher emoji">{emoji || "🙂"}</button>
          {pickerOpen && <div className="st-emoji-grid" role="listbox" aria-label="Emojis">{EMOJIS.map((item) => <button key={item} type="button" role="option" aria-selected={emoji === item} onClick={() => { setEmoji(item); setPickerOpen(false); }}>{item}</button>)}<button type="button" className="st-emoji-none" onClick={() => { setEmoji(""); setPickerOpen(false); }}>Sem emoji</button></div>}
        </div>
        <label className="st-text">O que você está fazendo<input value={text} onChange={(event) => setText(event.target.value)} maxLength={60} placeholder="Ex.: Em campo na região Leste" /></label>
        <label className="st-clear">Limpar depois de<select value={clearAfter} onChange={(event) => setClearAfter(event.target.value as ClearAfter)}>{CLEAR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      <div className="st-actions">
        <button className="primary-button compact" type="button" disabled={saving || (!text.trim() && !emoji)} onClick={() => void save({ emoji, text: text.trim(), until: untilFor(clearAfter) }, "Status salvo.")}>{saving ? "Salvando..." : "Salvar status"}</button>
        {status && <button className="secondary-button compact" type="button" disabled={saving} onClick={() => void save(null, "Status limpo.")}>Limpar status</button>}
      </div>
      {error ? <div className="form-error" role="alert">{error}</div> : message && <div className="save-message" role="status">{message}</div>}
    </section>
  );
}
