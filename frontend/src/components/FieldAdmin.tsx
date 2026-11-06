import { useEffect, useState } from "react";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { api, type ChecklistTemplate, type User } from "../api";

// Lote E (administracao): vinculo tecnico <-> usuario (detalhe do tecnico) e modelos de checklist (Configuracoes).

// Usuario do sistema ligado ao tecnico: ele ve e atualiza os proprios chamados em "Meus chamados".
// Sem permissao para ver usuarios ou editar tecnicos, nao aparece.
export function TechnicianUserLink({ technicianId }: { technicianId: string }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([api.users(), api.technicianLinks()]).then(([userData, linkData]) => { if (!active) return; setUsers(userData.users.filter((user) => user.active)); setLinks(linkData.links); }).catch(() => { if (active) setUsers(null); });
    return () => { active = false; };
  }, [technicianId]);
  if (!users) return null;
  const current = links[technicianId] || "";
  const usedBy = (userId: string) => Object.entries(links).find(([tech, user]) => user === userId && tech !== technicianId)?.[0];
  async function change(userId: string) {
    setSaving(true); setMessage(""); setError("");
    try {
      await api.setTechnicianUser(technicianId, userId || null);
      setLinks((previous) => { const next = Object.fromEntries(Object.entries(previous).filter(([tech, user]) => tech !== technicianId && user !== userId)); if (userId) next[technicianId] = userId; return next; });
      setMessage(userId ? "Usuário ligado. Ele verá os chamados deste técnico em Meus chamados." : "Vínculo removido.");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar o vínculo."); }
    finally { setSaving(false); }
  }
  return (
    <div className="fa-link">
      <label className="detail-label">Usuário do sistema (Meus chamados)<select value={current} disabled={saving} onChange={(event) => void change(event.target.value)}>
        <option value="">Sem usuário</option>
        {users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}{usedBy(user.id) ? " (ligado a outro técnico)" : ""}</option>)}
      </select></label>
      <small>Crie o usuário em Usuários (sugestão: um cargo "Técnico" sem outras permissões) e escolha aqui. Ele passa a ver só os próprios chamados, no celular.</small>
      {error ? <div className="form-error" role="alert">{error}</div> : message && <div className="save-message" role="status">{message}</div>}
    </div>
  );
}

type Draft = { id?: string; name: string; callTypes: string; items: string; active: boolean };
const toDraft = (template: ChecklistTemplate): Draft => ({ id: template.id, name: template.name, callTypes: template.callTypes.join(", "), items: template.items.join("\n"), active: template.active });

// Modelos de checklist por tipo de chamado. Na hora de finalizar (no escritorio ou no celular), todos os itens
// precisam ser marcados; o que foi conferido vai para a observacao final.
export function ChecklistSettings() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api.checklists().then((data) => setDrafts(data.templates.map(toDraft))).catch((err) => setError(err instanceof Error ? err.message : "Não foi possível carregar.")); }, []);
  const update = (index: number, patch: Partial<Draft>) => setDrafts((current) => current?.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)) ?? null);
  async function save() {
    if (!drafts) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const templates = drafts.map((draft) => ({ id: draft.id, name: draft.name.trim(), callTypes: draft.callTypes.split(",").map((item) => item.trim()).filter(Boolean), items: draft.items.split("\n").map((item) => item.trim()).filter(Boolean), active: draft.active }));
      const result = await api.saveChecklists(templates);
      setDrafts(result.templates.map(toDraft));
      setMessage("Checklists salvos.");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }
  return (
    <section className="panel fx-panel" aria-labelledby="cl-title">
      <div><span className="section-kicker"><ListChecks size={13} aria-hidden="true" /> FINALIZAÇÃO</span><h2 id="cl-title">Checklists por tipo de chamado</h2><p className="rp-note">Ao finalizar um chamado do tipo indicado, todos os itens precisam ser marcados (no escritório ou no celular do técnico). Sem tipos, vale para todos. Os tipos de hoje: NOC ACESSO, ACIONAMENTO FIELD, NOC TX.</p></div>
      {!drafts ? (!error && <div className="dv-empty">Carregando...</div>) : <>
        {drafts.map((draft, index) => (
          <div key={draft.id ?? `new-${index}`} className="cl-item">
            <div className="cl-row">
              <label>Nome<input value={draft.name} onChange={(event) => update(index, { name: event.target.value })} placeholder="Ex.: Rompimento de cabo" maxLength={80} /></label>
              <label>Tipos de chamado (separados por vírgula)<input value={draft.callTypes} onChange={(event) => update(index, { callTypes: event.target.value })} placeholder="Ex.: ACIONAMENTO FIELD" /></label>
              <label className="checkbox-label"><input type="checkbox" checked={draft.active} onChange={(event) => update(index, { active: event.target.checked })} /> Ativo</label>
              <button type="button" className="icon-button" aria-label={`Remover ${draft.name || "checklist"}`} title="Remover" onClick={() => setDrafts((current) => current?.filter((_, i) => i !== index) ?? null)}><Trash2 size={16} /></button>
            </div>
            <label>Itens (um por linha)<textarea rows={3} value={draft.items} onChange={(event) => update(index, { items: event.target.value })} placeholder={"Emenda testada\nSinal conferido na OLT"} /></label>
          </div>
        ))}
        <div className="cl-actions">
          <button type="button" className="secondary-button compact" onClick={() => setDrafts((current) => [...(current ?? []), { name: "", callTypes: "", items: "", active: true }])}><Plus size={15} /> Novo checklist</button>
          <button type="button" className="primary-button compact" disabled={saving || drafts.some((draft) => draft.name.trim().length < 2 || !draft.items.trim())} onClick={() => void save()}>{saving ? "Salvando..." : "Salvar checklists"}</button>
        </div>
      </>}
      {error ? <div className="form-error" role="alert">{error}</div> : message && <div className="save-message" role="status">{message}</div>}
    </section>
  );
}

// Lista de itens para marcar ao finalizar (formulario do escritorio e do celular).
export function ChecklistBox({ template, checked, onChange }: { template: ChecklistTemplate; checked: string[]; onChange: (next: string[]) => void }) {
  return (
    <fieldset className="cl-box">
      <legend>Checklist: {template.name}</legend>
      {template.items.map((item) => (
        <label key={item} className="checkbox-label"><input type="checkbox" checked={checked.includes(item)} onChange={(event) => onChange(event.target.checked ? [...checked, item] : checked.filter((value) => value !== item))} /> {item}</label>
      ))}
    </fieldset>
  );
}
