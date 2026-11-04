import { useEffect, useState } from "react";
import { ChevronRight, Search, SlidersHorizontal, Users } from "lucide-react";
import { api, type Role, type User } from "../api";
import { AdminModal } from "../components/ui";

// "ha 5 min", "ha 2 h", ou a data quando passou de um dia.
function formatLastSeen(iso: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `ha ${minutes} min`;
  if (minutes < 24 * 60) return `ha ${Math.floor(minutes / 60)} h`;
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "online" | "offline" | "inactive">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", roleId: "role-operator", password: "", active: true });
  async function load() {
    try {
      const [userData, roleData] = await Promise.all([api.users(), api.roles()]);
      setUsers(userData.users);
      setRoles(roleData.roles);
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel carregar usuarios."); }
  }
  useEffect(() => {
    load();
    // Presenca muda sozinha: recarrega a lista a cada 30 s.
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  function openForm(user?: User) {
    setEditing(user || null);
    setShowForm(true);
    setForm({ name: user?.name || "", email: user?.email || "", roleId: user?.roleId || roles[0]?.id || "", password: "", active: user?.active ?? true });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editing) await api.updateUser(editing.id, { ...form, password: form.password || undefined });
      else await api.createUser({ name: form.name, email: form.email, roleId: form.roleId, password: form.password });
      setEditing(null); setShowForm(false); setMessage("Usuario salvo com sucesso."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel salvar usuario."); }
  }
  async function handleDelete(user: User) {
    const confirmed = window.confirm(`Deseja apagar o usuario ${user.name}?`);
    if (!confirmed) return;
    try {
      await api.deleteUser(user.id);
      setMessage("Usuario removido com sucesso.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel remover o usuario.");
    }
  }
  const visibleUsers = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()) && (activeFilter === "all" || (activeFilter === "online" ? user.active && user.online : activeFilter === "offline" ? user.active && !user.online : !user.active)));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">ADMINISTRAÇÃO</span>
          <h1>Usuários</h1>
          <p>Controle quem acessa o O&amp;M e o que cada pessoa pode fazer.</p>
        </div>
        <button className="primary-button compact" onClick={() => openForm()}>
          <Users size={16} /> Novo usuário
        </button>
      </div>
      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou e-mail" />
          </div>
          <button className="secondary-button compact" onClick={() => setShowFilters((current) => !current)}>
            <SlidersHorizontal size={15} /> Filtros
          </button>
          {showFilters && <select className="toolbar-select" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as typeof activeFilter)}><option value="all">Todos os status</option><option value="online">Online agora</option><option value="offline">Offline</option><option value="inactive">Contas inativas</option></select>}
        </div>
        {error ? (
          <div className="empty-state">{error}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>E-mail</th>
                <th>Cargo</th>
                <th>Status</th>
                <th>Cadastro</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="user-cell">
                      <div className="avatar">
                        {user.name
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <strong>{user.name}</strong>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <span className="role-pill">
                      {user.role?.name ||
                        (user.roleId === "role-admin"
                          ? "Administrador"
                          : "Operador")}
                    </span>
                  </td>
                  <td>
                    {!user.active ? (
                      <span className="status inactive"><i />Conta inativa</span>
                    ) : user.online ? (
                      <span className="status presence-online" title={user.lastSeenAt ? `Ultima atividade: ${new Date(user.lastSeenAt).toLocaleString("pt-BR")}` : undefined}><i />Online</span>
                    ) : (
                      <span className="status presence-offline" title="Sem o sistema aberto ou deslogado"><i />Offline{user.lastSeenAt && <small>visto {formatLastSeen(user.lastSeenAt)}</small>}</span>
                    )}
                  </td>
                  <td>
                    {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button className="secondary-button compact" type="button" onClick={() => openForm(user)} title="Editar usuario">
                        Editar
                      </button>
                      <button className="secondary-button compact" type="button" onClick={() => handleDelete(user)} title="Apagar usuario" style={{ background: '#e63946', borderColor: '#e63946', color: '#fff' }}>
                        Apagar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {message && <div className="save-message">{message}</div>}
      {showForm ? <AdminModal title={editing ? "Editar usuário" : "Novo usuário"} onClose={() => { setEditing(null); setShowForm(false); }}>
        <form className="admin-form" onSubmit={save} autoComplete="off">
          <label>Nome<input name="new-user-name" autoComplete="off" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>E-mail<input type="email" name="new-user-email" autoComplete="off" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label>Cargo<select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          <label>Senha {editing && <small>(deixe vazio para manter)</small>}<input type="password" name="new-user-password" autoComplete="new-password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!editing} /></label>
          {editing && <label className="checkbox-label"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Usuário ativo</label>}
          <button className="primary-button" type="submit">Salvar usuário <ChevronRight size={16} /></button>
        </form>
      </AdminModal> : null}
    </>
  );
}
