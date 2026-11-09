import { TechnicianUserLink } from "../components/FieldAdmin";
import { useEffect, useState } from "react";
import { ChevronRight, Pencil, Search, SlidersHorizontal, Users } from "lucide-react";
import { api, type Technician, type Supervisor } from "../api";
import { useFitToViewport } from "../hooks/useFitToViewport";
import { AdminModal, DetailItem, Metric } from "../components/ui";
import { Pager, usePaged } from "../components/Pager";

export function TechniciansPage() {
  // Lista longa rola dentro do cartao (cabecalho fixo); lista curta continua compacta.
  const tableRef = useFitToViewport<HTMLElement>("max");
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [employmentFilter, setEmploymentFilter] = useState<Technician["employmentStatus"] | "Todos">("Trabalhando");
  const [regionFilter, setRegionFilter] = useState("Todas");
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [form, setForm] = useState({ name: "", registration: "", supervisorId: "", teamRole: "Tecnico" as Technician["teamRole"], leadTechnicianId: "", region: "", shift: "", currentStatus: "Disponivel" as Technician["currentStatus"], active: true, employmentStatus: "Trabalhando" as Technician["employmentStatus"] });
  async function load() {
    try {
      const [technicianData, supervisorData] = await Promise.all([api.technicians(), api.supervisors()]);
      setTechnicians(technicianData.technicians); setSupervisors(supervisorData.supervisors);
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel carregar tecnicos."); }
  }
  useEffect(() => {
    load();
    const interval = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(interval);
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try { await api.createTechnician({ ...form, supervisorId: form.supervisorId || undefined, leadTechnicianId: form.teamRole === "Auxiliar" ? form.leadTechnicianId || undefined : undefined }); setShowForm(false); setForm({ name: "", registration: "", supervisorId: "", teamRole: "Tecnico", leadTechnicianId: "", region: "", shift: "", currentStatus: "Disponivel", active: true, employmentStatus: "Trabalhando" }); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel criar tecnico."); }
  }
  function editTechnician(technician: Technician) {
    setError("");
    setForm({ name: technician.name, registration: technician.registration, supervisorId: technician.supervisorId || "", teamRole: technician.teamRole, leadTechnicianId: technician.leadTechnicianId || "", region: technician.region, shift: technician.shift, currentStatus: technician.currentStatus, active: technician.active, employmentStatus: technician.employmentStatus || "Trabalhando" });
    setSelectedTechnician(null);
    setEditingTechnician(technician);
  }
  async function saveTechnicianEdits(event: React.FormEvent) {
    event.preventDefault();
    if (!editingTechnician) return;
    try {
      const result = await api.updateTechnician(editingTechnician.id, {
        ...(form.name !== editingTechnician.name ? { name: form.name } : {}),
        ...(form.registration !== editingTechnician.registration ? { registration: form.registration } : {}),
        ...(form.region !== editingTechnician.region ? { region: form.region } : {}),
        ...(form.shift !== editingTechnician.shift ? { shift: form.shift } : {}),
        ...(form.supervisorId !== (editingTechnician.supervisorId || "") ? { supervisorId: form.supervisorId } : {}),
        ...(form.teamRole !== editingTechnician.teamRole ? { teamRole: form.teamRole } : {}),
        ...(form.leadTechnicianId !== (editingTechnician.leadTechnicianId || "") || (form.teamRole !== editingTechnician.teamRole && form.teamRole === "Tecnico") ? { leadTechnicianId: form.teamRole === "Auxiliar" ? form.leadTechnicianId || null : null } : {}),
        ...(form.currentStatus !== editingTechnician.currentStatus ? { currentStatus: form.currentStatus } : {}),
        ...(form.active !== editingTechnician.active ? { active: form.active } : {}),
        ...(form.employmentStatus !== editingTechnician.employmentStatus ? { employmentStatus: form.employmentStatus } : {}),
      });
      setTechnicians((items) => items.map((item) => item.id === result.technician.id ? result.technician : item));
      setEditingTechnician(null);
      setSelectedTechnician(result.technician);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar os dados do tecnico.");
    }
  }
  const regions = [...new Set(technicians.map((technician) => technician.region))];
  const visibleTechnicians = technicians.filter((technician) => `${technician.name} ${technician.registration} ${technician.region}`.toLowerCase().includes(query.toLowerCase()) && (employmentFilter === "Todos" || (technician.employmentStatus || "Trabalhando") === employmentFilter) && (statusFilter === "Todos" || technician.currentStatus === statusFilter) && (regionFilter === "Todas" || technician.region === regionFilter));
  const pagedTechnicians = usePaged(visibleTechnicians, visibleTechnicians.length);
  async function changeStatus(technician: Technician, currentStatus: Technician["currentStatus"]) {
    try { const result = await api.updateTechnician(technician.id, { currentStatus }); setTechnicians((items) => items.map((item) => item.id === result.technician.id ? { ...item, ...result.technician } : item)); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel atualizar status."); }
  }
  async function changeActive(technician: Technician, active: boolean) {
    try { const result = await api.updateTechnician(technician.id, { active }); setTechnicians((items) => items.map((item) => item.id === result.technician.id ? { ...item, ...result.technician } : item)); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel atualizar a ativacao."); }
  }
  async function changeEmploymentStatus(technician: Technician, employmentStatus: Technician["employmentStatus"]) {
    try { const result = await api.updateTechnician(technician.id, { employmentStatus }); setTechnicians((items) => items.map((item) => item.id === result.technician.id ? { ...item, ...result.technician } : item)); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel atualizar o vinculo."); }
  }
  async function assignAssistant(technician: Technician, leadTechnicianId: string) {
    try { const result = await api.updateTechnician(technician.id, { leadTechnicianId: leadTechnicianId || null }); setTechnicians((items) => items.map((item) => item.id === result.technician.id ? { ...item, ...result.technician } : item)); setSelectedTechnician(result.technician); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel vincular o auxiliar."); }
  }
  async function removeTechnician(technician: Technician) {
    if (!window.confirm(`Deseja excluir ${technician.name}? O técnico ficará inativo e seus chamados históricos serão preservados.`)) return;
    try { await api.deleteTechnician(technician.id); setSelectedTechnician(null); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel excluir o tecnico."); }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">EQUIPES</span>
          <h1>Tecnicos</h1>
          <p>Consulte disponibilidade, escala e supervisor de cada tecnico.</p>
        </div>
        <button className="primary-button compact" onClick={() => setShowForm(true)}>
          <Users size={16} /> Novo tecnico
        </button>
      </div>
      <div className="metric-grid team-metrics">
        <Metric
          label="Trabalhando"
          value={String(
            technicians.filter((technician) => technician.employmentStatus !== "Demitido").length,
          )}
          note="Vínculo empregatício"
          positive
        />
        <Metric
          label="Em campo"
          value={String(
            technicians.filter(
              (technician) => technician.employmentStatus !== "Demitido" && technician.currentStatus === "Em campo",
            ).length,
          )}
          note="Atendimento em curso"
        />
        <Metric
          label="Disponiveis"
          value={String(
            technicians.filter(
              (technician) => technician.employmentStatus !== "Demitido" && technician.currentStatus === "Disponivel",
            ).length,
          )}
          note="Prontos para atribuicao"
          positive
        />
        <Metric
          label="Regioes"
          value={String(
            new Set(technicians.map((technician) => technician.region)).size,
          )}
          note="Areas cobertas"
        />
      </div>
      <section className="panel table-panel fit-table-panel" ref={tableRef}>
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou matricula" />
          </div>
          <button className="secondary-button compact" onClick={() => setShowFilters((current) => !current)}>
            <SlidersHorizontal size={15} /> Filtros
          </button>
          {showFilters && <><select className="toolbar-select" aria-label="Filtrar por vínculo" value={employmentFilter} onChange={(event) => setEmploymentFilter(event.target.value as Technician["employmentStatus"] | "Todos")}><option value="Trabalhando">Trabalhando</option><option value="Demitido">Demitido</option><option value="Todos">Todos os vínculos</option></select><select className="toolbar-select" aria-label="Filtrar por situação operacional" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todos</option><option>Disponivel</option><option>Em campo</option><option>Indisponivel</option></select><select className="toolbar-select" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option>Todas</option>{regions.map((region) => <option key={region}>{region}</option>)}</select></>}
        </div>
        {error ? (
          <div className="empty-state">{error}</div>
        ) : (
          <div className="fit-scroll">
          <table>
            <thead>
              <tr>
                <th>Tecnico</th>
                <th>Tipo</th>
                <th>Matricula</th>
                <th>Supervisor</th>
                <th>Regiao</th>
                <th>Turno</th>
                <th>Situacao</th>
                <th>Status</th>
                <th>Vinculo</th>
              </tr>
            </thead>
            <tbody>
              {pagedTechnicians.pageItems.map((technician) => (
                <tr key={technician.id} onClick={() => setSelectedTechnician(technician)}>
                  <td>
                    <div className="user-cell">
                      <div className="avatar">
                        {technician.name
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <strong>{technician.name}</strong>
                    </div>
                  </td>
                  <td><span className="role-pill">{technician.teamRole}</span></td>
                  <td>{technician.registration}</td>
                  <td>{technician.supervisorName || "Sem supervisor"}</td>
                  <td>{technician.region}</td>
                  <td>{technician.shift}</td>
                  <td>
                    <select className="status-select" value={technician.currentStatus} onClick={(event) => event.stopPropagation()} onChange={(event) => changeStatus(technician, event.target.value as Technician["currentStatus"])} aria-label={`Status de ${technician.name}`}>
                      <option>Disponivel</option><option>Em campo</option><option>Indisponivel</option>
                    </select>
                  </td>
                  <td>
                    <select className="status-select" value={technician.active ? "true" : "false"} onClick={(event) => event.stopPropagation()} onChange={(event) => void changeActive(technician, event.target.value === "true")} aria-label={`Ativacao de ${technician.name}`}>
                      <option value="true">Ativo</option>
                      <option value="false">Inativo</option>
                    </select>
                  </td>
                  <td>
                    <select className="status-select" value={technician.employmentStatus || "Trabalhando"} onClick={(event) => event.stopPropagation()} onChange={(event) => void changeEmploymentStatus(technician, event.target.value as Technician["employmentStatus"])} aria-label={`Vinculo de ${technician.name}`}>
                      <option value="Trabalhando">Trabalhando</option>
                      <option value="Demitido">Demitido</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table><Pager {...pagedTechnicians} noun={["técnico", "técnicos"]} />
          </div>
        )}
      </section>
      {showForm && <AdminModal title="Novo tecnico" onClose={() => setShowForm(false)}><form className="admin-form" onSubmit={save}>
        <label>Nome<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label>Matricula<input value={form.registration} onChange={(event) => setForm({ ...form, registration: event.target.value })} required /></label>
        <label>Tipo<select value={form.teamRole} onChange={(event) => setForm({ ...form, teamRole: event.target.value as Technician["teamRole"], leadTechnicianId: "" })}><option value="Tecnico">Técnico</option><option value="Auxiliar">Auxiliar</option></select></label>
        {form.teamRole === "Auxiliar" && <label>Técnico responsável<select value={form.leadTechnicianId} onChange={(event) => setForm({ ...form, leadTechnicianId: event.target.value })} required><option value="">Selecione o técnico</option>{technicians.filter((technician) => technician.teamRole === "Tecnico").map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>}
        <label>Supervisor<select value={form.supervisorId} onChange={(event) => setForm({ ...form, supervisorId: event.target.value })}><option value="">Sem supervisor</option>{supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}</select></label>
        <label>Regiao<input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} /></label>
        <label>Turno<input value={form.shift} onChange={(event) => setForm({ ...form, shift: event.target.value })} placeholder="07:00 - 16:00" required /></label>
        <label>Status<select value={form.currentStatus} onChange={(event) => setForm({ ...form, currentStatus: event.target.value as Technician["currentStatus"] })}><option>Disponivel</option><option>Em campo</option><option>Indisponivel</option></select></label>
        <label>Vínculo<select value={form.employmentStatus} onChange={(event) => setForm({ ...form, employmentStatus: event.target.value as Technician["employmentStatus"] })}><option value="Trabalhando">Trabalhando</option><option value="Demitido">Demitido</option></select></label>
        <button className="primary-button" type="submit">Cadastrar tecnico <ChevronRight size={16} /></button>
      </form></AdminModal>}
      {selectedTechnician && <AdminModal title={selectedTechnician.name} onClose={() => setSelectedTechnician(null)}>
        <div className="detail-grid">
          <DetailItem label="Tipo" value={selectedTechnician.teamRole} /><DetailItem label="Matrícula" value={selectedTechnician.registration} /><DetailItem label="Região" value={selectedTechnician.region} /><DetailItem label="Turno" value={selectedTechnician.shift} /><DetailItem label="Supervisor" value={selectedTechnician.supervisorName || "Sem supervisor"} /><DetailItem label="Situação operacional" value={selectedTechnician.currentStatus} /><DetailItem label="Vínculo" value={selectedTechnician.employmentStatus || "Trabalhando"} />
        </div>
        <button className="secondary-button compact" type="button" onClick={() => editTechnician(selectedTechnician)}><Pencil size={15}/> Editar cadastro</button>
        {selectedTechnician.teamRole === "Tecnico" && <TechnicianUserLink technicianId={selectedTechnician.id} />}
        {selectedTechnician.teamRole === "Tecnico" ? <div className="team-member-list"><strong>Auxiliares vinculados</strong>{technicians.filter((technician) => technician.leadTechnicianId === selectedTechnician.id).map((assistant) => <span key={assistant.id}>{assistant.name} · {assistant.registration}</span>)}{!technicians.some((technician) => technician.leadTechnicianId === selectedTechnician.id) && <small>Nenhum auxiliar vinculado.</small>}</div> : <label className="detail-label">Técnico responsável<select value={selectedTechnician.leadTechnicianId || ""} onChange={(event) => void assignAssistant(selectedTechnician, event.target.value)}><option value="">Sem vínculo</option>{technicians.filter((technician) => technician.teamRole === "Tecnico" && technician.id !== selectedTechnician.id).map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>}
        <button className="delete-button" type="button" onClick={() => void removeTechnician(selectedTechnician)}>Excluir técnico</button>
      </AdminModal>}
      {editingTechnician && <AdminModal title={`Editar ${editingTechnician.teamRole === "Auxiliar" ? "auxiliar" : "técnico"}`} onClose={() => { setEditingTechnician(null); setForm({ name: "", registration: "", supervisorId: "", teamRole: "Tecnico", leadTechnicianId: "", region: "", shift: "", currentStatus: "Disponivel", active: true, employmentStatus: "Trabalhando" }); setError(""); }}><form className="admin-form" onSubmit={saveTechnicianEdits}>
        <label>Nome<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength={2} maxLength={160} required /></label>
        <label>Matrícula<input value={form.registration} onChange={(event) => setForm({ ...form, registration: event.target.value })} minLength={2} maxLength={80} required /></label>
        <label>Tipo<select value={form.teamRole} onChange={(event) => setForm({ ...form, teamRole: event.target.value as Technician["teamRole"], leadTechnicianId: "" })}><option value="Tecnico">Técnico</option><option value="Auxiliar">Auxiliar</option></select></label>
        {form.teamRole === "Auxiliar" && <label>Técnico responsável<select value={form.leadTechnicianId} onChange={(event) => setForm({ ...form, leadTechnicianId: event.target.value })}><option value="">Sem vínculo</option>{technicians.filter((technician) => technician.teamRole === "Tecnico" && technician.id !== editingTechnician.id).map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>}
        <label>Supervisor<select value={form.supervisorId} onChange={(event) => setForm({ ...form, supervisorId: event.target.value })}><option value="">Sem supervisor</option>{supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}</select></label>
        <label>Região<input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} maxLength={100} /></label>
        <label>Turno<input value={form.shift} onChange={(event) => setForm({ ...form, shift: event.target.value })} minLength={2} maxLength={80} required /></label>
        <label>Status<select value={form.currentStatus} onChange={(event) => setForm({ ...form, currentStatus: event.target.value as Technician["currentStatus"] })}><option>Disponivel</option><option>Em campo</option><option>Indisponivel</option></select></label>
        <label>Vínculo<select value={form.employmentStatus} onChange={(event) => setForm({ ...form, employmentStatus: event.target.value as Technician["employmentStatus"] })}><option value="Trabalhando">Trabalhando</option><option value="Demitido">Demitido</option></select></label>
        <label>Status do cadastro<select value={form.active ? "true" : "false"} onChange={(event) => setForm({ ...form, active: event.target.value === "true" })}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" type="submit">Salvar alterações <ChevronRight size={16} /></button>
      </form></AdminModal>}
    </>
  );
}
