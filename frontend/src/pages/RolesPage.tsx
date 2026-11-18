import { useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, Lock, Plus, ShieldCheck } from "lucide-react";
import { api, type Role } from "../api";
import { navItems } from "../lib/nav-items";

type Permission = { code: string; description: string };
type Draft = { id?: string; name: string; description: string; permissions: string[]; hiddenTabs: string[] };

// Grupos de permissao pelo prefixo do codigo (calls.*, users.*...), na ordem do menu.
const PERMISSION_GROUPS: { prefix: string; label: string }[] = [
  { prefix: "dashboard", label: "Indicadores" },
  { prefix: "calls", label: "Chamados" },
  { prefix: "activations", label: "Acionamentos" },
  { prefix: "technicians", label: "Técnicos" },
  { prefix: "supervisors", label: "Supervisores" },
  { prefix: "imports", label: "Importações" },
  { prefix: "users", label: "Usuários" },
  { prefix: "roles", label: "Cargos" },
  { prefix: "settings", label: "Configurações" },
];
const EMPTY: Draft = { name: "", description: "", permissions: [], hiddenTabs: [] };
const toDraft = (role: Role): Draft => ({ id: role.id, name: role.name, description: role.description, permissions: [...role.permissions], hiddenTabs: [...(role.hiddenTabs ?? [])] });
const sameList = (left: string[], right: string[]) => left.length === right.length && [...left].sort().join("|") === [...right].sort().join("|");

function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`role-toggle${checked ? " is-on" : ""}`} onClick={() => onChange(!checked)}>
      <i aria-hidden="true" />
    </button>
  );
}

export function RolesPage({ currentRoleId }: { currentRoleId?: string }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load(selectId?: string) {
    try {
      const data = await api.roles();
      setRoles(data.roles);
      setPermissions(data.permissions);
      const target = data.roles.find((role) => role.id === (selectId ?? selectedId)) ?? data.roles[0];
      if (target && selectedId !== "new") { setSelectedId(target.id); setDraft(toDraft(target)); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar cargos.");
    }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const original = selectedId === "new" ? EMPTY : roles.find((role) => role.id === selectedId);
  const dirty = Boolean(original) && (draft.name !== original!.name || draft.description !== original!.description || !sameList(draft.permissions, original!.permissions) || !sameList(draft.hiddenTabs, (original as Role).hiddenTabs ?? []));
  const isOwnRole = draft.id !== undefined && draft.id === currentRoleId;

  // Abas que fazem sentido para o cargo: as de cargo especifico (ex.: Supervisor) so aparecem para ele.
  const tabs = useMemo(() => navItems.filter((item) => !item.roles || item.roles.includes(draft.name)), [draft.name]);
  const sections = [...new Set(tabs.map((item) => item.section))];
  const allowedTabs = tabs.filter((item) => !item.permission || draft.permissions.includes(item.permission));
  const visibleCount = allowedTabs.filter((item) => !draft.hiddenTabs.includes(item.to)).length;

  function select(role: Role | "new") {
    if (dirty && !window.confirm("Descartar as alterações deste cargo?")) return;
    setError("");
    setSaved(false);
    if (role === "new") { setSelectedId("new"); setDraft(EMPTY); return; }
    setSelectedId(role.id);
    setDraft(toDraft(role));
  }

  function setTab(path: string, visible: boolean) {
    setDraft((current) => ({ ...current, hiddenTabs: visible ? current.hiddenTabs.filter((item) => item !== path) : [...new Set([...current.hiddenTabs, path])] }));
  }
  function setPermission(code: string, on: boolean) {
    setDraft((current) => ({ ...current, permissions: on ? [...new Set([...current.permissions, code])] : current.permissions.filter((item) => item !== code) }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload = { name: draft.name.trim(), description: draft.description.trim(), permissions: draft.permissions, hiddenTabs: draft.hiddenTabs };
      const result = draft.id ? await api.updateRole(draft.id, payload) : await api.createRole(payload);
      setSelectedId(result.role.id);
      await load(result.role.id);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
      // O menu do proprio usuario muda na hora se ele editou o proprio cargo.
      if (draft.id && draft.id === currentRoleId) window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar o cargo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">CONTROLE DE ACESSO</span>
          <h1>Cargos e permissões</h1>
          <p>Escolha, para cada cargo, o que ele pode fazer e quais abas aparecem no menu.</p>
        </div>
        <button className="primary-button compact" type="button" onClick={() => select("new")}><Plus size={16} /> Novo cargo</button>
      </div>

      <div className="roles-v2">
        <section className="panel roles-v2-list" aria-label="Cargos">
          {roles.map((role) => {
            const roleTabs = navItems.filter((item) => (!item.roles || item.roles.includes(role.name)) && (!item.permission || role.permissions.includes(item.permission)));
            const shown = roleTabs.filter((item) => !(role.hiddenTabs ?? []).includes(item.to)).length;
            return (
              <button key={role.id} type="button" className={`roles-v2-item${selectedId === role.id ? " is-selected" : ""}`} onClick={() => select(role)}>
                <span className="roles-v2-icon"><ShieldCheck size={16} /></span>
                <span className="roles-v2-text">
                  <strong>{role.name}{role.id === currentRoleId && <em>seu cargo</em>}</strong>
                  <small>{shown} de {roleTabs.length} abas · {role.permissions.length} permissões</small>
                </span>
              </button>
            );
          })}
          {selectedId === "new" && <div className="roles-v2-item is-selected"><span className="roles-v2-icon"><Plus size={16} /></span><span className="roles-v2-text"><strong>Novo cargo</strong><small>preencha ao lado</small></span></div>}
        </section>

        <section className="panel roles-v2-editor" aria-label="Editar cargo">
          {!original ? <div className="empty-state">Selecione um cargo.</div> : <>
            <div className="roles-v2-fields">
              <label>Nome<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Operador" /></label>
              <label>Descrição<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="O que este cargo faz" /></label>
            </div>

            <div className="roles-v2-block">
              <div className="roles-v2-block-head">
                <div><h2>Abas do menu</h2><p>{visibleCount} de {allowedTabs.length} abas visíveis. Aba oculta some do menu e da busca, e não abre pelo link.</p></div>
                <div className="roles-v2-quick">
                  <button type="button" className="secondary-button compact" onClick={() => setDraft({ ...draft, hiddenTabs: [] })}><Eye size={14} /> Mostrar todas</button>
                  <button type="button" className="secondary-button compact" onClick={() => setDraft({ ...draft, hiddenTabs: allowedTabs.map((item) => item.to).filter((path) => !(isOwnRole && path === "/cargos")) })}><EyeOff size={14} /> Ocultar todas</button>
                </div>
              </div>
              <div className="roles-v2-tabs">
                {sections.map((section) => (
                  <div className="roles-v2-tab-group" key={section}>
                    <span className="roles-v2-group-title">{section}</span>
                    {tabs.filter((item) => item.section === section).map((item) => {
                      const allowed = !item.permission || draft.permissions.includes(item.permission);
                      const locked = isOwnRole && item.to === "/cargos";
                      const visible = allowed && !draft.hiddenTabs.includes(item.to);
                      const Icon = item.icon;
                      return (
                        <div key={item.to} className={`roles-v2-tab${visible ? "" : " is-hidden"}${allowed ? "" : " is-blocked"}`}>
                          <Icon size={16} aria-hidden="true" />
                          <span><strong>{item.label}</strong>{!allowed ? <small><Lock size={11} /> sem a permissão {item.permission}</small> : locked ? <small><Lock size={11} /> não dá para ocultar do seu próprio cargo</small> : <small>{visible ? "Visível" : "Oculta"}</small>}</span>
                          <Toggle checked={visible} disabled={!allowed || locked} onChange={(next) => setTab(item.to, next)} label={`${item.label}: ${visible ? "visível" : "oculta"}`} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="roles-v2-block">
              <div className="roles-v2-block-head"><div><h2>Permissões</h2><p>{draft.permissions.length} de {permissions.length} permissões. Sem a permissão da tela, a aba não aparece mesmo marcada como visível.</p></div></div>
              <div className="roles-v2-perms">
                {PERMISSION_GROUPS.map((group) => {
                  const items = permissions.filter((permission) => permission.code.split(".")[0] === group.prefix);
                  if (!items.length) return null;
                  return (
                    <div className="roles-v2-perm-group" key={group.prefix}>
                      <span className="roles-v2-group-title">{group.label}</span>
                      {items.map((permission) => {
                        const on = draft.permissions.includes(permission.code);
                        return (
                          <label key={permission.code} className={`roles-v2-perm${on ? " is-on" : ""}`}>
                            <input type="checkbox" checked={on} onChange={(event) => setPermission(permission.code, event.target.checked)} />
                            <span><strong>{permission.description}</strong><small>{permission.code}</small></span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="roles-v2-savebar">
              {error && <span className="roles-v2-error" role="alert">{error}</span>}
              {saved && !dirty && <span className="roles-v2-saved"><Check size={14} /> Salvo</span>}
              {dirty && <span className="roles-v2-dirty">Alterações não salvas</span>}
              <button type="button" className="secondary-button compact" disabled={!dirty || saving} onClick={() => original && setDraft(selectedId === "new" ? EMPTY : toDraft(original as Role))}>Descartar</button>
              <button type="button" className="primary-button compact" disabled={!dirty || saving || draft.name.trim().length < 2 || draft.description.trim().length < 2} onClick={() => void save()}>{saving ? "Salvando..." : draft.id ? "Salvar alterações" : "Criar cargo"}</button>
            </div>
          </>}
        </section>
      </div>
    </>
  );
}
