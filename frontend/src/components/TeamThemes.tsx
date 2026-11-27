import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Download, Plus, Trash2, Users } from "lucide-react";
import { api, type ProfilePreferences, type TeamTheme } from "../api";
import { customPreview, HEX, type CustomThemeSpec } from "../lib/custom-theme";
import { applyPalette, isPaletteId, type Theme } from "../theme";

// Temas da equipe (27/11/2026): criar um tema ja deixa ele disponivel para todo mundo (sem publicar). Enquanto cria,
// o sistema inteiro mostra o tema (previa ao vivo); cancelar volta ao tema de antes. Usar = copia para o seu perfil.

const ACCENTS = ["#1264e8", "#0f9d8a", "#1f9d55", "#e07b12", "#d63a3a", "#c2187a", "#7c3aed", "#5b6577"];
const SIDES = ["#0f2b52", "#123d36", "#1d3a1f", "#4a2a0c", "#4a1212", "#4a1036", "#2a1a52", "#22272e"];
const NEW_SPEC: CustomThemeSpec = { name: "", accent: "#0f9d8a", side: "#123d36", background: "colorido" };
const sameSpec = (a?: CustomThemeSpec | null, b?: CustomThemeSpec | null) => Boolean(a && b && a.accent === b.accent && a.side === b.side && a.background === b.background && a.name === b.name);

export function ThemePreview({ spec, theme }: { spec: CustomThemeSpec; theme: Theme }) {
  const preview = customPreview(spec)[theme];
  return (
    <span className={`pf-theme-preview is-${theme}`} style={{ background: preview.page }} aria-hidden="true">
      <span className="pf-theme-side" style={{ background: preview.side }}><i /><i /><i /></span>
      <span className="pf-theme-body"><b style={{ background: preview.accent }} /><span className="pf-theme-card" /><span className="pf-theme-card" /></span>
    </span>
  );
}

function ColorField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <fieldset className="tt-color">
      <legend>{label}</legend>
      <div className="tt-swatches">
        {options.map((color) => <button key={color} type="button" className={color === value ? "is-selected" : ""} style={{ background: color }} aria-label={`${label}: ${color}`} aria-pressed={color === value} onClick={() => onChange(color)} />)}
        <label className="tt-picker" title="Escolher outra cor"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label}: outra cor`} /></label>
        <input className="tt-hex" value={text} maxLength={7} aria-label={`${label} em código (#rrggbb)`} onChange={(event) => { const next = event.target.value.trim(); setText(next); if (HEX.test(next)) onChange(next.toLowerCase()); }} />
      </div>
    </fieldset>
  );
}

export function TeamThemes({ theme, preferences, onSavePreferences, feedback }: { theme: Theme; preferences: ProfilePreferences; onSavePreferences: (next: ProfilePreferences) => Promise<void>; feedback: (text: string, failed?: boolean) => void }) {
  const [themes, setThemes] = useState<TeamTheme[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<CustomThemeSpec | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const before = useRef<ProfilePreferences | null>(null);
  const current = preferences.palette === "custom" ? preferences.customTheme ?? null : null;

  useEffect(() => { api.teamThemes().then((data) => setThemes(data.themes)).catch((err) => setLoadError(err instanceof Error ? err.message : "Não foi possível carregar os temas da equipe.")); }, []);
  // Previa ao vivo: o sistema inteiro mostra o rascunho enquanto o editor esta aberto.
  useEffect(() => { if (draft) applyPalette("custom", draft); }, [draft]);
  const restore = () => { const previous = before.current ?? preferences; applyPalette(isPaletteId(previous.palette) ? previous.palette : "padrao", previous.customTheme); };
  // Saiu da tela com o editor aberto: volta ao tema salvo.
  const draftOpen = useRef(false);
  draftOpen.current = Boolean(draft);
  useEffect(() => () => { if (draftOpen.current) restore(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startDraft() { before.current = preferences; setDraft({ ...NEW_SPEC }); }
  function cancelDraft() { setDraft(null); restore(); }
  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!draft || draft.name.trim().length < 2) return;
    setBusy("novo");
    try {
      const result = await api.createTeamTheme({ ...draft, name: draft.name.trim() });
      setThemes((list) => [result.theme, ...(list ?? [])]);
      setDraft(null);
      await onSavePreferences(result.preferences);
      feedback(`Tema "${result.theme.name}" criado e aplicado. Ele já aparece para toda a equipe em Temas da equipe.`);
    } catch (err) { feedback(err instanceof Error ? err.message : "Não foi possível criar o tema.", true); }
    finally { setBusy(null); }
  }
  async function useTheme(item: TeamTheme) {
    setBusy(item.id);
    try {
      const result = await api.useTeamTheme(item.id);
      await onSavePreferences(result.preferences);
      if (!item.mine) setThemes((list) => list?.map((entry) => (entry.id === item.id ? { ...entry, uses: entry.uses + 1 } : entry)) ?? list);
      feedback(`Tema "${item.name}" aplicado.`);
    } catch (err) { feedback(err instanceof Error ? err.message : "Não foi possível usar o tema.", true); }
    finally { setBusy(null); }
  }
  async function removeTheme(item: TeamTheme) {
    if (!window.confirm(`Apagar o tema "${item.name}" da galeria? Quem já está usando continua com ele.`)) return;
    setBusy(item.id);
    try { await api.deleteTeamTheme(item.id); setThemes((list) => list?.filter((entry) => entry.id !== item.id) ?? list); feedback(`Tema "${item.name}" apagado da galeria.`); }
    catch (err) { feedback(err instanceof Error ? err.message : "Não foi possível apagar o tema.", true); }
    finally { setBusy(null); }
  }

  return (
    <div className="tt">
      <div className="tt-head">
        <h3><Users size={15} aria-hidden="true" /> Temas da equipe</h3>
        <p>Crie o seu com as cores que quiser. Ele já fica disponível para todos aqui, sem precisar publicar.</p>
        {!draft && <button type="button" className="secondary-button compact" onClick={startDraft}><Plus size={14} aria-hidden="true" /> Criar tema</button>}
      </div>

      {draft && (
        <form className="tt-editor" onSubmit={(event) => void saveDraft(event)} aria-label="Criar tema">
          <div className="tt-editor-fields">
            <label className="tt-name">Nome do tema<input value={draft.name} maxLength={40} placeholder="Ex.: Verde Campo" onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus /></label>
            <ColorField label="Cor de destaque (botões e links)" value={draft.accent} options={ACCENTS} onChange={(accent) => setDraft({ ...draft, accent })} />
            <ColorField label="Cor da lateral" value={draft.side} options={SIDES} onChange={(side) => setDraft({ ...draft, side })} />
            <fieldset className="tt-color"><legend>Fundo da página</legend>
              <div className="pf-mode" role="group" aria-label="Fundo da página">
                {(["colorido", "neutro"] as const).map((value) => <button key={value} type="button" className={draft.background === value ? "is-active" : ""} aria-pressed={draft.background === value} onClick={() => setDraft({ ...draft, background: value })}>{value === "colorido" ? "Colorido" : "Neutro"}</button>)}
              </div>
            </fieldset>
          </div>
          <div className="tt-editor-side">
            <ThemePreview spec={draft} theme={theme} />
            <p className="tt-note">O sistema todo já está mostrando o tema. Os textos ficam com o mesmo contraste do Padrão e a lateral escurece o que for preciso para ler. Use o Claro/Escuro acima para ver os dois.</p>
            <div className="tt-actions">
              <button type="button" className="secondary-button compact" onClick={cancelDraft} disabled={busy === "novo"}>Cancelar</button>
              <button type="submit" className="primary-button compact" disabled={busy === "novo" || draft.name.trim().length < 2}>{busy === "novo" ? "Salvando..." : "Salvar e usar"}</button>
            </div>
          </div>
        </form>
      )}

      {loadError ? <p className="form-error">{loadError}</p> : !themes ? <p className="tt-note">Carregando os temas da equipe...</p> : !themes.length ? <p className="tt-note">Ninguém criou um tema ainda. Seja o primeiro!</p> : (
        <div className="pf-themes" aria-label="Temas da equipe">
          {themes.map((item) => {
            const selected = sameSpec(current, item);
            return (
              <div key={item.id} className={`pf-theme tt-card${selected ? " is-selected" : ""}`}>
                <ThemePreview spec={item} theme={theme} />
                <span className="pf-theme-label"><span className="pf-theme-dot" style={{ background: customPreview(item).swatch }} />{item.name}{selected && <Check size={14} aria-label="em uso" />}</span>
                <small className="tt-meta">{item.mine ? "criado por você" : `por ${item.authorName || "—"}`} · {item.uses} {item.uses === 1 ? "usa" : "usam"}</small>
                <div className="tt-card-actions">
                  <button type="button" className="secondary-button compact" onClick={() => void useTheme(item)} disabled={selected || busy !== null || Boolean(draft)}><Download size={13} aria-hidden="true" /> {selected ? "Em uso" : "Usar"}</button>
                  {item.canDelete && <button type="button" className="secondary-button compact tt-delete" onClick={() => void removeTheme(item)} disabled={busy !== null} aria-label={`Apagar o tema ${item.name}`} title="Apagar da galeria"><Trash2 size={13} aria-hidden="true" /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
