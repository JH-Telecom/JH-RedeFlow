import { useEffect, useState } from "react";
import { Building2, ChevronRight, Search, SlidersHorizontal, Trash2, Users } from "lucide-react";
import { api, type Role, type Technician, type User } from "../api";
import { AdminModal } from "../components/ui";

export function SupervisorsPage({ user }: { user: User & { role: Role } }) {
  const [data, setData] = useState<{
    supervisors: {
      id: string;
      userId?: string;
      name: string;
      region: string;
      active: boolean;
      technicianCount: number;
    }[];
    technicians: Technician[];
  }>({ supervisors: [], technicians: [] });
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", region: "", userId: "", active: true });
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("Todas");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSupervisor, setSelectedSupervisor] = useState<typeof data.supervisors[number] | null>(null);
  const [assigning, setAssigning] = useState(false);
  async function load() {
    try {
      const supervisorData = await api.supervisors();
      setData(supervisorData);
      if (user.role.permissions.includes("users.view")) setUsers((await api.users()).users);
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel carregar supervisores."); }
  }
  useEffect(() => {
    load();
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try { await api.createSupervisor({ ...form, userId: form.userId || undefined }); setShowForm(false); setForm({ name: "", region: "", userId: "", active: true }); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel criar supervisor."); }
  }
  function openTeam(supervisor: typeof data.supervisors[number]) { setSelectedSupervisor(supervisor); }
  async function removeSupervisor(supervisor: typeof data.supervisors[number]) {
    if (supervisor.technicianCount > 0) {
      setError("Desvincule os tecnicos antes de excluir o supervisor.");
      return;
    }
    if (!window.confirm(`Excluir o supervisor ${supervisor.name}? O cadastro será removido da lista, mas o usuário vinculado não será apagado.`)) return;
    try {
      const result = await api.deleteSupervisor(supervisor.id);
      if (result.deleted) {
        setError("");
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel excluir o supervisor.");
    }
  }
  async function assignTechnician(event: React.ChangeEvent<HTMLSelectElement>) {
    const technicianId = event.target.value;
    if (!technicianId || !selectedSupervisor) return;
    setAssigning(true);
    try {
      await api.updateTechnician(technicianId, { supervisorId: selectedSupervisor.id });
      await load();
      setSelectedSupervisor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel adicionar tecnico.");
    } finally {
      setAssigning(false);
    }
  }
  async function linkUser(userId: string) {
    if (!selectedSupervisor) return;
    try {
      const result = await api.updateSupervisor(selectedSupervisor.id, { userId: userId || null });
      setSelectedSupervisor(result.supervisor);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel vincular o login."); }
  }
  const regions = [...new Set(data.supervisors.map((supervisor) => supervisor.region))];
  const visibleSupervisors = data.supervisors.filter((supervisor) => `${supervisor.name} ${supervisor.region}`.toLowerCase().includes(query.toLowerCase()) && (regionFilter === "Todas" || supervisor.region === regionFilter));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">EQUIPES</span>
          <h1>Supervisores</h1>
          <p>
            Visualize a estrutura das equipes e o tecnico sob cada supervisao.
          </p>
        </div>
        <button className="primary-button compact" onClick={() => setShowForm(true)}>
          <Building2 size={16} /> Novo supervisor
        </button>
      </div>
      <div className="team-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar supervisor ou regiao" /></div><button className="secondary-button compact" onClick={() => setShowFilters((current) => !current)}><SlidersHorizontal size={15} /> Filtros</button>{showFilters && <select className="toolbar-select" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option>Todas</option>{regions.map((region) => <option key={region}>{region}</option>)}</select>}</div>
      <div className="supervisor-grid">
        {error && <div className="form-error">{error}</div>}
        {visibleSupervisors.map((supervisor) => (
          <section className="panel supervisor-card" key={supervisor.id}>
            <div className="supervisor-heading">
              <div className="supervisor-avatar">
                <Building2 size={17} />
              </div>
              <div>
                <h2>{supervisor.name}</h2>
                <div className="supervisor-meta"><span>{supervisor.region}</span><strong>{supervisor.technicianCount} tecnicos</strong></div>
              </div>
              <button className="icon-button" type="button" onClick={() => void removeSupervisor(supervisor)} disabled={supervisor.technicianCount > 0} title={supervisor.technicianCount > 0 ? "Desvincule os tecnicos antes de excluir" : "Excluir supervisor"} aria-label={`Excluir supervisor ${supervisor.name}`}>
                <Trash2 size={16} />
              </button>
              <button className="icon-button" type="button" onClick={() => openTeam(supervisor)} title="Abrir equipe">
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="team-list">
              {data.technicians
                .filter(
                  (technician) => technician.supervisorId === supervisor.id,
                )
                .map((technician) => (
                  <div className="team-member" key={technician.id}>
                    <div className="avatar">
                      {technician.name
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div>
                      <strong>{technician.name}</strong>
                      <span>
                        {technician.registration} · {technician.shift}
                      </span>
                    </div>
                    <i
                      className={`member-dot ${technician.currentStatus === "Em campo" ? "field" : technician.active ? "ready" : "off"}`}
                    />
                  </div>
                ))}
              {!data.technicians.some((technician) => technician.supervisorId === supervisor.id) && <div className="team-empty"><Users size={18} /><span>Nenhum tecnico vinculado</span><small>Abra a equipe para adicionar profissionais.</small></div>}
            </div>
            <button className="link-button team-link" type="button" onClick={() => openTeam(supervisor)}>
              Ver chamados da equipe <ChevronRight size={14} />
            </button>
          </section>
        ))}
      </div>
      {showForm && <AdminModal title="Novo supervisor" onClose={() => setShowForm(false)}><form className="admin-form" onSubmit={save}>
        <label>Nome<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label>Regiao<input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} required /></label>
        {user.role.permissions.includes("users.view") && <label>Login do supervisor<select value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })}><option value="">Selecionar depois</option>{users.filter((account) => account.role?.name === "Supervisor" || account.roleId === "role-supervisor").map((account) => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>)}</select></label>}
        <button className="primary-button" type="submit">Cadastrar supervisor <ChevronRight size={16} /></button>
      </form></AdminModal>}
      {selectedSupervisor && <AdminModal title={`Equipe de ${selectedSupervisor.name}`} onClose={() => setSelectedSupervisor(null)}>
        {user.role.permissions.includes("users.view") && <label className="detail-label">Login vinculado<select value={selectedSupervisor.userId || ""} onChange={(event) => void linkUser(event.target.value)}><option value="">Sem login vinculado</option>{users.filter((account) => account.role?.name === "Supervisor" || account.roleId === "role-supervisor").map((account) => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>)}</select></label>}
        <div className="team-detail-list">
          <div className="panel-heading"><div><span className="section-kicker">EQUIPE ATUAL</span><h2>{data.technicians.filter((technician) => technician.supervisorId === selectedSupervisor.id).length} tecnicos</h2></div></div>
          {data.technicians.filter((technician) => technician.supervisorId === selectedSupervisor.id).map((technician) => <div className="team-member" key={technician.id}><div className="avatar">{technician.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div><strong>{technician.name}</strong><span>{technician.registration} · {technician.shift}</span></div><i className={`member-dot ${technician.currentStatus === "Em campo" ? "field" : technician.active ? "ready" : "off"}`} /></div>)}
          {!data.technicians.some((technician) => technician.supervisorId === selectedSupervisor.id) && <div className="empty-state">Nenhum tecnico nesta equipe.</div>}
        </div>
        <label className="detail-label">Adicionar tecnico<select defaultValue="" disabled={assigning} onChange={assignTechnician}><option value="">Selecione um tecnico</option>{data.technicians.filter((technician) => technician.supervisorId !== selectedSupervisor.id).map((technician) => <option key={technician.id} value={technician.id}>{technician.name} · {technician.registration}</option>)}</select></label>
      </AdminModal>}
    </>
  );
}
