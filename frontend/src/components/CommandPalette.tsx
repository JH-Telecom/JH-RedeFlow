import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { api, type Call } from "../api";

export type PaletteLink = { label: string; to: string; section: string; icon: ComponentType<{ size?: number }> };
type Result = { key: string; kind: "page" | "call"; title: string; detail: string; to: string; icon?: PaletteLink["icon"] };

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Busca rapida (Ctrl+K): telas do menu e chamados (ordem, BDESK, tecnico, regiao ou OLT).
export function CommandPalette({ links, canSearchCalls, onClose, onNavigate }: { links: PaletteLink[]; canSearchCalls: boolean; onClose: () => void; onNavigate: (to: string) => void }) {
  const [query, setQuery] = useState("");
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const text = query.trim();
    if (!canSearchCalls || text.length < 3) { setCalls([]); setLoading(false); return; }
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api.calls(undefined, { search: text, page: 1, pageSize: 8 })
        .then((result) => { if (active) setCalls(result.calls); })
        .catch(() => { if (active) setCalls([]); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, canSearchCalls]);

  const results = useMemo<Result[]>(() => {
    const text = normalize(query.trim());
    const pages = links
      .filter((link) => !text || normalize(`${link.label} ${link.section}`).includes(text))
      .map((link) => ({ key: `page:${link.to}`, kind: "page" as const, title: link.label, detail: link.section, to: link.to, icon: link.icon }));
    const callResults = calls.map((call) => ({
      key: `call:${call.id}`,
      kind: "call" as const,
      title: call.orderNumber,
      detail: [call.type, call.region, call.technicianName || "sem técnico", call.status].filter(Boolean).join(" · "),
      to: `/chamados/${call.id}`,
    }));
    return [...callResults, ...pages];
  }, [links, calls, query]);

  useEffect(() => { setSelected(0); }, [query, calls.length]);

  function choose(result?: Result) {
    if (!result) return;
    onNavigate(result.to);
    onClose();
  }

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Busca rápida" onMouseDown={(event) => event.stopPropagation()}>
        <label className="palette-search">
          <Search size={17} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={canSearchCalls ? "Buscar tela ou chamado (ordem, BDESK, técnico, OLT)..." : "Buscar tela..."}
            aria-label="Buscar"
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              else if (event.key === "ArrowDown") { event.preventDefault(); setSelected((current) => Math.min(results.length - 1, current + 1)); }
              else if (event.key === "ArrowUp") { event.preventDefault(); setSelected((current) => Math.max(0, current - 1)); }
              else if (event.key === "Enter") { event.preventDefault(); choose(results[selected]); }
            }}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="palette-results" role="listbox">
          {loading && <div className="palette-hint">Buscando chamados...</div>}
          {!loading && canSearchCalls && query.trim().length > 0 && query.trim().length < 3 && <div className="palette-hint">Digite 3 letras ou números para buscar chamados.</div>}
          {results.map((result, index) => {
            const Icon = result.icon;
            return (
              <button
                key={result.key}
                type="button"
                role="option"
                aria-selected={index === selected}
                className={index === selected ? "is-selected" : ""}
                onMouseEnter={() => setSelected(index)}
                onClick={() => choose(result)}
              >
                <span className={`palette-kind is-${result.kind}`}>{Icon ? <Icon size={15} /> : "OS"}</span>
                <span className="palette-text"><strong>{result.title}</strong><small>{result.detail}</small></span>
                {index === selected && <CornerDownLeft size={14} aria-hidden="true" />}
              </button>
            );
          })}
          {!loading && results.length === 0 && <div className="palette-hint">Nada encontrado para “{query}”.</div>}
        </div>
      </div>
    </div>
  );
}
