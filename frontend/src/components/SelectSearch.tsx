import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

// Pesquisa em todas as listas suspensas (11/11/2026, card "Pesquisa melhorada"): ao abrir qualquer <select> do
// sistema, aparece por cima dele uma lista com campo "Pesquisar". O <select> original continua na tela (mesmo visual)
// e a escolha passa por ele (evento "change" de verdade), entao nenhuma tela precisou mudar.
// Fica de fora: <select multiple>, com size > 1, desativado ou com data-native-select.
type Item = { value: string; label: string; group: string | null; disabled: boolean };
const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function eligible(target: EventTarget | null): HTMLSelectElement | null {
  const select = target instanceof HTMLSelectElement ? target : null;
  if (!select || select.multiple || select.size > 1 || select.disabled || select.hasAttribute("data-native-select")) return null;
  return select;
}
function readItems(select: HTMLSelectElement): Item[] {
  return Array.from(select.options).map((option) => ({ value: option.value, label: option.text.trim() || option.value, group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : null, disabled: option.disabled }));
}
function choose(select: HTMLSelectElement, value: string) {
  if (select.value !== value) {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  select.focus();
}

export function SelectSearchLayer() {
  const [select, setSelect] = useState<HTMLSelectElement | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const current = useRef<HTMLSelectElement | null>(null);
  current.current = select;
  const list = useRef<HTMLUListElement | null>(null);

  function open(target: HTMLSelectElement, initial = "") {
    const all = readItems(target);
    setItems(all);
    setQuery(initial);
    setActive(Math.max(0, all.findIndex((item) => item.value === target.value)));
    setRect(target.getBoundingClientRect());
    setSelect(target);
  }
  const close = (refocus = true) => { if (refocus) select?.focus(); setSelect(null); };

  // Abre ao clicar ou ao usar o teclado num <select> (Enter, Espaco, Alt+seta, F4 ou digitando uma letra).
  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = eligible(event.target);
      if (!target) return;
      event.preventDefault();
      target.focus();
      // Clicar de novo na mesma lista fecha.
      if (current.current === target) { setSelect(null); return; }
      open(target);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = eligible(event.target);
      if (!target || event.ctrlKey || event.metaKey) return;
      const typed = event.key.length === 1 && event.key !== " " && !event.altKey ? event.key : "";
      if (event.key === "Enter" || event.key === " " || event.key === "F4" || (event.altKey && event.key === "ArrowDown") || typed) {
        event.preventDefault();
        open(target, typed);
      }
    };
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => { document.removeEventListener("mousedown", onMouseDown, true); document.removeEventListener("keydown", onKeyDown, true); };
  }, []);

  // Fecha ao clicar fora, rolar a tela (fora da lista) ou mudar o tamanho da janela.
  useEffect(() => {
    if (!select) return;
    // Clique em outra lista: quem abre a nova e o ouvinte de cima (aqui nao fecha, senao a nova fecharia junto).
    const outside = (event: Event) => { if (panel.current && !panel.current.contains(event.target as Node) && !(event.type === "mousedown" && eligible(event.target))) close(false); };
    const onResize = () => close(false);
    document.addEventListener("mousedown", outside, true);
    document.addEventListener("scroll", outside, true);
    window.addEventListener("resize", onResize);
    return () => { document.removeEventListener("mousedown", outside, true); document.removeEventListener("scroll", outside, true); window.removeEventListener("resize", onResize); };
  }, [select]);

  const filtered = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return words.length ? items.filter((item) => { const text = normalize(`${item.label} ${item.group || ""}`); return words.every((word) => text.includes(word)); }) : items;
  }, [items, query]);
  useEffect(() => { if (query) setActive(Math.max(0, filtered.findIndex((item) => !item.disabled))); }, [query, filtered]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, select]);

  if (!select || !rect) return null;
  const move = (step: number) => {
    if (!filtered.length) return;
    let next = active;
    for (let tries = 0; tries < filtered.length; tries += 1) { next = (next + step + filtered.length) % filtered.length; if (!filtered[next].disabled) break; }
    setActive(next);
  };
  const pick = (item: Item | undefined) => { if (!item || item.disabled) return; const target = select; close(false); choose(target, item.value); };

  // Abaixo do <select>; sem espaco embaixo, abre para cima.
  const width = Math.max(rect.width, 240);
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  const below = window.innerHeight - rect.bottom - 12;
  const above = rect.top - 12;
  const openUp = below < 220 && above > below;
  const maxHeight = Math.max(160, Math.min(360, openUp ? above : below));
  const style = { left, width, maxHeight, ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }) };
  let lastGroup: string | null = null;

  return createPortal(
    <div ref={panel} className="ss-panel" style={style} role="dialog" aria-label="Escolher opção">
      <label className="ss-search">
        <Search size={15} aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar"
          aria-label="Pesquisar opção"
          aria-controls="ss-list"
          aria-activedescendant={filtered[active] ? `ss-option-${active}` : undefined}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
            else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
            else if (event.key === "Enter") { event.preventDefault(); pick(filtered[active]); }
            else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
            else if (event.key === "Tab") close();
          }}
        />
      </label>
      <ul ref={list} id="ss-list" className="ss-list" role="listbox">
        {filtered.length === 0 && <li className="ss-empty">Nada encontrado</li>}
        {filtered.map((item, index) => {
          const header = item.group !== lastGroup && item.group ? <li className="ss-group" role="presentation">{item.group}</li> : null;
          lastGroup = item.group;
          return [
            header,
            <li key={`${item.value}-${index}`} id={`ss-option-${index}`} data-index={index} role="option" aria-selected={item.value === select.value} aria-disabled={item.disabled || undefined}
              className={`ss-option${index === active ? " is-active" : ""}${item.value === select.value ? " is-selected" : ""}${item.disabled ? " is-disabled" : ""}`}
              onMouseEnter={() => !item.disabled && setActive(index)} onMouseDown={(event) => { event.preventDefault(); pick(item); }}>
              {item.label}
            </li>,
          ];
        })}
      </ul>
    </div>,
    document.body,
  );
}
