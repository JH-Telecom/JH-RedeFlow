import { useState } from "react";
import { Plus, X } from "lucide-react";

// Observacoes prontas (18/11/2026): textos que se repetem viram botoes acima do campo. Um clique coloca o texto no
// campo (sem salvar). Cada navegador guarda a sua lista; da para guardar o texto atual e tirar os que nao usa.
const KEY = "jh-observacoes-prontas";
const DEFAULTS = ["No local, batendo rota", "Em deslocamento", "Continuar após o almoço", "Tratar atenuação", "Aguardando fusão", "Cliente ausente", "Normalizado, aguardando validação"];

function read(): string[] {
  try { const saved = JSON.parse(localStorage.getItem(KEY) || "null"); return Array.isArray(saved) ? saved.filter((item) => typeof item === "string") : DEFAULTS; } catch { return DEFAULTS; }
}

export function QuickNotes({ current, onPick }: { current: string; onPick: (text: string) => void }) {
  const [notes, setNotes] = useState<string[]>(read);
  const save = (next: string[]) => { setNotes(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sem armazenamento */ } };
  const typed = current.trim();
  const canAdd = typed.length >= 3 && typed.length <= 120 && !notes.some((note) => note.toLowerCase() === typed.toLowerCase());
  return (
    <div className="quick-notes" role="group" aria-label="Observações prontas">
      {notes.map((note) => (
        <span key={note} className="quick-note">
          <button type="button" onClick={() => onPick(typed ? `${typed} ${note}` : note)} title="Colocar no campo">{note}</button>
          <button type="button" className="quick-note-remove" onClick={() => save(notes.filter((item) => item !== note))} aria-label={`Tirar "${note}" das observações prontas`}><X size={11} /></button>
        </span>
      ))}
      {canAdd && <button type="button" className="quick-note-add" onClick={() => save([...notes, typed])}><Plus size={12} aria-hidden="true" /> Guardar texto como pronto</button>}
    </div>
  );
}
