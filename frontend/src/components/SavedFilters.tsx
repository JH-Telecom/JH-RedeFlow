import { useState } from "react";
import { Bookmark, X } from "lucide-react";

// Filtros salvos da fila (18/11/2026): a combinacao atual de filtros ganha um nome e vira um botao. Guardado neste
// navegador, por tela (abertos, em atendimento...).
export type SavedFilter<T> = { name: string; value: T };

function read<T>(key: string): SavedFilter<T>[] {
  try { const saved = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(saved) ? saved : []; } catch { return []; }
}

export function SavedFilters<T>({ storageKey, current, canSave, onApply }: { storageKey: string; current: T; canSave: boolean; onApply: (value: T) => void }) {
  const key = `jh-filtros-salvos:${storageKey}`;
  const [items, setItems] = useState<SavedFilter<T>[]>(() => read<T>(key));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const save = (next: SavedFilter<T>[]) => { setItems(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* sem armazenamento */ } };
  function add() {
    const label = name.trim().slice(0, 40);
    if (!label) return;
    save([...items.filter((item) => item.name.toLowerCase() !== label.toLowerCase()), { name: label, value: current }]);
    setNaming(false);
    setName("");
  }
  if (!items.length && !canSave) return null;
  return (
    <div className="saved-filters" role="group" aria-label="Filtros salvos">
      {items.map((item) => (
        <span key={item.name} className="quick-note">
          <button type="button" onClick={() => onApply(item.value)} title="Aplicar este filtro"><Bookmark size={11} aria-hidden="true" /> {item.name}</button>
          <button type="button" className="quick-note-remove" onClick={() => save(items.filter((other) => other.name !== item.name))} aria-label={`Apagar o filtro salvo ${item.name}`}><X size={11} /></button>
        </span>
      ))}
      {canSave && !naming && <button type="button" className="quick-note-add" onClick={() => setNaming(true)}>Salvar estes filtros</button>}
      {naming && (
        <form className="saved-filters-form" onSubmit={(event) => { event.preventDefault(); add(); }}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome, ex.: Itaim atrasados" maxLength={40} autoFocus aria-label="Nome do filtro" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setNaming(false); } }} />
          <button type="submit" className="secondary-button compact" disabled={!name.trim()}>Salvar</button>
          <button type="button" className="secondary-button compact" onClick={() => setNaming(false)}>Cancelar</button>
        </form>
      )}
    </div>
  );
}
