import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { api, type PersonCard } from "../api";

// Caixa de observacao com mencoes: ao digitar "@" aparece a lista de pessoas; escolher insere "@Nome Completo ".
// Quem for mencionado recebe um aviso no sino (o servidor reconhece o nome completo).

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
let peopleCache: Promise<PersonCard[]> | null = null;
const loadPeople = () => (peopleCache ??= api.people().then((data) => data.people).catch(() => { peopleCache = null; return []; }));

export function MentionTextarea({ value, onChange, onKeyDown, placeholder, rows = 3 }: { value: string; onChange: (value: string) => void; onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void; placeholder?: string; rows?: number }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [people, setPeople] = useState<PersonCard[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => { if (query !== null && !people.length) void loadPeople().then(setPeople); }, [query, people.length]);

  function updateQuery(text: string, caret: number) {
    const match = text.slice(0, caret).match(/(?:^|\s)@([\p{L}\p{N} ]{0,30})$/u);
    setQuery(match ? match[1] : null);
    setActive(0);
  }
  const options = query === null ? [] : people.filter((person) => fold(person.name).includes(fold(query.trim()))).slice(0, 6);

  function pick(person: PersonCard) {
    const element = ref.current;
    if (!element || query === null) return;
    const caret = element.selectionStart ?? value.length;
    const start = caret - query.length - 1;
    const next = `${value.slice(0, start)}@${person.name} ${value.slice(caret)}`;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => { const position = start + person.name.length + 2; element.focus(); element.setSelectionRange(position, position); });
  }

  return (
    <div className="mention-box">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={options.length > 0}
        onChange={(event) => { onChange(event.target.value); updateQuery(event.target.value, event.target.selectionStart ?? event.target.value.length); }}
        onBlur={() => window.setTimeout(() => setQuery(null), 150)}
        onKeyDown={(event) => {
          if (options.length) {
            if (event.key === "ArrowDown") { event.preventDefault(); setActive((active + 1) % options.length); return; }
            if (event.key === "ArrowUp") { event.preventDefault(); setActive((active - 1 + options.length) % options.length); return; }
            if ((event.key === "Enter" && !event.ctrlKey && !event.metaKey) || event.key === "Tab") { event.preventDefault(); pick(options[active]); return; }
            if (event.key === "Escape") { event.preventDefault(); setQuery(null); return; }
          }
          onKeyDown?.(event);
        }}
      />
      {options.length > 0 && (
        <ul className="mention-list" role="listbox" aria-label="Mencionar pessoa">
          {options.map((person, index) => (
            <li key={person.id} role="option" aria-selected={index === active}>
              <button type="button" className={index === active ? "is-active" : ""} onMouseDown={(event) => { event.preventDefault(); pick(person); }}>
                <strong>{person.name}</strong><small>{person.roleName}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Texto da observacao com as mencoes (@Nome Sobrenome) destacadas.
export function withMentions(text: string): ReactNode {
  const parts = text.split(/(@[\p{Lu}][\p{L}]+(?: (?:d[aeo]s? )?[\p{Lu}][\p{L}]+)*)/u);
  return parts.map((part, index) => (index % 2 ? <b key={index} className="mention">{part}</b> : part));
}
