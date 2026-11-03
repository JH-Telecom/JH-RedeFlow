import { useEffect, useState } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { api, type Role } from "../api";
import { AdminModal } from "../components/ui";

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<
    { code: string; description: string }[]
  >([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState({ name: "", description: "", permissions: [] as string[] });
  const [error, setError] = useState("");
  async function load() {
    try { const data = await api.roles(); setRoles(data.roles); setPermissions(data.permissions); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel carregar cargos."); }
  }
  useEffect(() => {
    load();
  }, []);
  function openForm(role?: Role) { setEditing(role || null); setShowForm(true); setForm({ name: role?.name || "", description: role?.description || "", permissions: role?.permissions || [] }); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editing) await api.updateRole(editing.id, form); else await api.createRole(form);
      setShowForm(false);
      await load();
      window.location.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel salvar cargo."); }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">CONTROLE DE ACESSO</span>
          <h1>Cargos e permissoes</h1>
          <p>Defina os limites de cada funcao dentro da operacao.</p>
        </div>
        <button className="primary-button compact" onClick={() => openForm()}>
          <ShieldCheck size={16} /> Novo cargo
        </button>
      </div>
      <div className="roles-layout">
        <section className="panel roles-list">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">CARGOS</span>
              <h2>Perfis de acesso</h2>
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          {roles.map((role) => (
            <button className="role-row role-row-button" key={role.id} onClick={() => openForm(role)}>
              <div className="role-symbol">
                <ShieldCheck size={17} />
              </div>
              <div>
                <strong>{role.name}</strong>
                <span>{role.description}</span>
              </div>
              <b>{role.permissions.length} permissoes</b>
              <ChevronRight size={16} />
            </button>
          ))}
        </section>
        <section className="panel permissions-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">CATALOGO</span>
              <h2>Permissoes disponiveis</h2>
            </div>
          </div>
          <div className="permissions-catalog">
            {permissions.map((permission) => (
              <div className="permission-row" key={permission.code}>
                <span>{permission.code}</span>
                <small>{permission.description}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
      {showForm && <AdminModal title={editing ? "Editar cargo" : "Novo cargo"} onClose={() => setShowForm(false)}><form className="admin-form" onSubmit={save}>
        <label>Nome<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label>Descricao<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} required /></label>
        <fieldset><legend>Permissoes</legend>{permissions.map((permission) => <label className="checkbox-label" key={permission.code}><input type="checkbox" checked={form.permissions.includes(permission.code)} onChange={(event) => setForm({ ...form, permissions: event.target.checked ? [...form.permissions, permission.code] : form.permissions.filter((code) => code !== permission.code) })} /> <span><b>{permission.code}</b><small>{permission.description}</small></span></label>)}</fieldset>
        <button className="primary-button" type="submit">Salvar cargo <ChevronRight size={16} /></button>
      </form></AdminModal>}
    </>
  );
}
