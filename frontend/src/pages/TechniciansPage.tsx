import { TechnicianUserLink } from "../components/FieldAdmin";
import { useEffect, useState } from "react";
import { ChevronRight, Copy, Pencil, Search, SlidersHorizontal, Users } from "lucide-react";
import { shareReportImage, slugFileName, type ReportCell, type ReportColumn, type ReportTone } from "../lib/report-image";
import { api, type Technician, type Supervisor } from "../api";
import { useFitToViewport } from "../hooks/useFitToViewport";
import { AdminModal, DetailItem, Metric } from "../components/ui";
import { Pager, usePaged } from "../components/Pager";
import { DUTY_STATUSES, dutyOf, dutyTone, isWorkingDuty } from "../lib/duty-status";

export function TechniciansPage() {
  // Lista longa rola dentro do cartao (cabecalho fixo); lista curta continua compacta.
  const tableRef = useFitToViewport<HTMLElement>("max");
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [roleFilter, setRoleFilter] = useState<Technician["teamRole"] | "Todos">("Todos");
  const [regionFilter, setRegionFilter] = useState("Todas");
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const emptyForm = { name: "", registration: "", supervisorId: "", teamRole: "Tecnico" as Technician["teamRole"], leadTechnicianId: "", region: "", shift: "", currentStatus: "Disponivel" as Technician["currentStatus"], active: true, employmentStatus: "Trabalhando" as Technician["employmentStatus"], dutyStatus: "", statusNote: "" };
  const [form, setForm] = useState(emptyForm);
  const [notes, setNotes] = useState<Record<string, string>>({});
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
    try { await api.createTechnician({ ...form, supervisorId: form.supervisorId || undefined, leadTechnicianId: form.teamRole === "Auxiliar" ? form.leadTechnicianId || undefined : undefined }); setShowForm(false); setForm(emptyForm); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel criar tecnico."); }
  }
  function editTechnician(technician: Technician) {
    setError("");
    setForm({ name: technician.name, registration: technician.registration, supervisorId: technician.supervisorId || "", teamRole: technician.teamRole, leadTechnicianId: technician.leadTechnicianId || "", region: technician.region, shift: technician.shift, currentStatus: technician.currentStatus, active: technician.active, employmentStatus: technician.employmentStatus || "Trabalhando", dutyStatus: dutyOf(technician), statusNote: technician.statusNote || "" });
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
        ...(form.dutyStatus && form.dutyStatus !== dutyOf(editingTechnician) ? { dutyStatus: form.dutyStatus } : {}),
        ...(form.statusNote.trim() !== (editingTechnician.statusNote || "") ? { statusNote: form.statusNote.trim() || null } : {}),
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
  const visibleTechnicians = technicians.filter((technician) => `${technician.name} ${technician.registration} ${technician.region}`.toLowerCase().includes(query.toLowerCase()) && (roleFilter === "Todos" || technician.teamRole === roleFilter) && (statusFilter === "Todos" || dutyOf(technician) === statusFilter) && (regionFilter === "Todas" || technician.region === regionFilter));
  const pagedTechnicians = usePaged(visibleTechnicians, visibleTechnicians.length);
  const filtersActive = Boolean(query.trim()) || roleFilter !== "Todos" || statusFilter !== "Todos" || regionFilter !== "Todas";
  // Imagem da equipe (para mandar a atualizacao no WhatsApp): todos os da lista com os filtros atuais, ate 100.
  const [copyState, setCopyState] = useState<"idle" | "working" | "copied" | "downloaded" | "error">("idle");
  async function copyTeamImage() {
    setCopyState("working");
    const list = visibleTechnicians.slice(0, 100);
    const helpersOf = (id: string) => technicians.filter((item) => item.teamRole === "Auxiliar" && item.leadTechnicianId === id).map((item) => item.name);
    const columns: ReportColumn[] = [
      { label: "Técnico", width: 330 },
      { label: "Região", width: 170 },
      { label: "Supervisor", width: 180 },
      { label: "Status", width: 150 },
      { label: "Obs", width: 260 },
    ];
    const rows: ReportCell[][] = list.map((technician) => {
      const helpers = technician.teamRole === "Tecnico" ? helpersOf(technician.id) : [];
      const lead = technician.teamRole === "Auxiliar" ? technician.leadTechnicianName : undefined;
      return [
        { text: technician.name, strong: true, sub: helpers.length ? `Auxiliar: ${helpers.join(", ")}` : lead ? `Com ${lead}` : undefined },
        { text: technician.region || "—" },
        { text: technician.supervisorName || "Sem supervisor" },
        { text: dutyOf(technician) || "—", tone: dutyTone(dutyOf(technician)) as ReportTone },
        { text: technician.statusNote || "", tone: "muted" },
      ];
    });
    const filtered = filtersActive;
    const stamp = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());
    const working = list.filter((item) => isWorkingDuty(dutyOf(item))).length;
    const away = list.filter((item) => dutyOf(item) && !isWorkingDuty(dutyOf(item))).length;
    const title = roleFilter === "Auxiliar" ? "Auxiliares" : roleFilter === "Tecnico" ? "Técnicos" : "Técnicos e auxiliares";
    try {
      const copied = await shareReportImage({
        kicker: "JH Telecom · Rede",
        title,
        subtitle: `${working} ativos · ${away} fora${filtered ? " · com os filtros atuais" : ""} · ${stamp}`,
        badge: `${list.length} ${list.length === 1 ? "pessoa" : "pessoas"}`,
        columns,
        rows,
        empty: "Ninguém na lista com os filtros atuais.",
      }, `${slugFileName(title)}-${new Date().toISOString().slice(0, 10)}.png`);
      setCopyState(copied ? "copied" : "downloaded");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 2200);
  }
  // Status do dia (substitui Situacao e Ativo/Inativo): ao trocar, o sistema acerta ativo/inativo sozinho.
  async function changeDuty(technician: Technician, dutyStatus: string) {
    if (!dutyStatus) return;
    try { const result = await api.updateTechnician(technician.id, { dutyStatus }); setTechnicians((items) => items.map((item) => item.id === result.technician.id ? { ...item, ...result.technician } : item)); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel atualizar o status."); }
  }
  async function saveNote(technician: Technician) {
    const draft = notes[technician.id];
    if (draft === undefined) return;
    const next = draft.trim();
    setNotes((current) => { const copy = { ...current }; delete copy[technician.id]; return copy; });
    if (next === (technician.statusNote || "")) return;
    try { const result = await api.updateTechnician(technician.id, { statusNote: next || null }); setTechnicians((items) => items.map((item) => item.id === result.technician.id ? { ...item, ...result.technician } : item)); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel salvar a observacao."); }
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
        <div className="cq-heading-actions">
          <button className="secondary-button compact" type="button" onClick={() => void copyTeamImage()} disabled={copyState === "working"} title="Copia a lista (com os filtros atuais) como imagem, para mandar no WhatsApp">
            <Copy size={15} aria-hidden="true" /> {copyState === "working" ? "Gerando..." : copyState === "copied" ? "Imagem copiada" : copyState === "downloaded" ? "PNG baixado" : copyState === "error" ? "Falha ao gerar" : "Copiar imagem"}
          </button>
          <button className="primary-button compact" onClick={() => setShowForm(true)}>
            <Users size={16} /> Novo tecnico
          </button>
        </div>
      </div>
      {/* Os cards acompanham a busca e os filtros (tipo, situação e região). */}
      <div className="metric-grid team-metrics">
        <Metric
          label="Na equipe"
          value={String(
            visibleTechnicians.filter((technician) => technician.employmentStatus !== "Demitido").length,
          )}
          note={roleFilter === "Tecnico" ? "Técnicos na lista" : roleFilter === "Auxiliar" ? "Auxiliares na lista" : filtersActive ? "Na lista com os filtros" : "Técnicos e auxiliares cadastrados"}
          positive
        />
        <Metric
          label="Ativos"
          value={String(visibleTechnicians.filter((technician) => technician.employmentStatus !== "Demitido" && isWorkingDuty(dutyOf(technician))).length)}
          note="Ativo, vindo na base ou saiu de rota"
          positive
        />
        <Metric
          label="Fora hoje"
          value={String(visibleTechnicians.filter((technician) => technician.employmentStatus !== "Demitido" && dutyOf(technician) && !isWorkingDuty(dutyOf(technician))).length)}
          note="Folga, falta, atestado, férias, frota..."
        />
        <Metric
          label="Regioes"
          value={String(
            new Set(visibleTechnicians.map((technician) => technician.region.trim()).filter(Boolean)).size,
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
          {showFilters && <><select className="toolbar-select" aria-label="Filtrar por tipo" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as Technician["teamRole"] | "Todos")}><option value="Todos">Todos os tipos</option><option value="Tecnico">Técnicos</option><option value="Auxiliar">Auxiliares</option></select><select className="toolbar-select" aria-label="Filtrar por status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="Todos">Todos os status</option>{DUTY_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><select className="toolbar-select" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option>Todas</option>{regions.map((region) => <option key={region}>{region}</option>)}</select></>}
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
                <th>Status</th>
                <th>Obs</th>
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
                    <select className={`status-select duty-select is-${dutyTone(dutyOf(technician))}`} value={dutyOf(technician)} onClick={(event) => event.stopPropagation()} onChange={(event) => void changeDuty(technician, event.target.value)} aria-label={`Status de ${technician.name}`}>
                      {!dutyOf(technician) && <option value="">—</option>}
                      {DUTY_STATUSES.map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </td>
                  <td>
                    <input className="duty-note" value={notes[technician.id] ?? technician.statusNote ?? ""} placeholder="Obs." maxLength={300} onClick={(event) => event.stopPropagation()} onChange={(event) => setNotes((current) => ({ ...current, [technician.id]: event.target.value }))} onBlur={() => void saveNote(technician)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} aria-label={`Observação de ${technician.name}`} title={technician.statusUpdatedAt ? `Atualizado em ${new Date(technician.statusUpdatedAt).toLocaleString("pt-BR")}` : undefined} />
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
        <button className="primary-button" type="submit">Cadastrar tecnico <ChevronRight size={16} /></button>
      </form></AdminModal>}
      {selectedTechnician && <AdminModal title={selectedTechnician.name} onClose={() => setSelectedTechnician(null)}>
        <div className="detail-grid">
          <DetailItem label="Tipo" value={selectedTechnician.teamRole} /><DetailItem label="Matrícula" value={selectedTechnician.registration} /><DetailItem label="Região" value={selectedTechnician.region} /><DetailItem label="Turno" value={selectedTechnician.shift} /><DetailItem label="Supervisor" value={selectedTechnician.supervisorName || "Sem supervisor"} /><DetailItem label="Status" value={dutyOf(selectedTechnician) || "—"} /><DetailItem label="Obs" value={selectedTechnician.statusNote || "—"} />
        </div>
        <button className="secondary-button compact" type="button" onClick={() => editTechnician(selectedTechnician)}><Pencil size={15}/> Editar cadastro</button>
        {selectedTechnician.teamRole === "Tecnico" && <TechnicianUserLink technicianId={selectedTechnician.id} />}
        {selectedTechnician.teamRole === "Tecnico" ? <div className="team-member-list"><strong>Auxiliares vinculados</strong>{technicians.filter((technician) => technician.leadTechnicianId === selectedTechnician.id).map((assistant) => <span key={assistant.id}>{assistant.name} · {assistant.registration}</span>)}{!technicians.some((technician) => technician.leadTechnicianId === selectedTechnician.id) && <small>Nenhum auxiliar vinculado.</small>}</div> : <label className="detail-label">Técnico responsável<select value={selectedTechnician.leadTechnicianId || ""} onChange={(event) => void assignAssistant(selectedTechnician, event.target.value)}><option value="">Sem vínculo</option>{technicians.filter((technician) => technician.teamRole === "Tecnico" && technician.id !== selectedTechnician.id).map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>}
        <button className="delete-button" type="button" onClick={() => void removeTechnician(selectedTechnician)}>Excluir técnico</button>
      </AdminModal>}
      {editingTechnician && <AdminModal title={`Editar ${editingTechnician.teamRole === "Auxiliar" ? "auxiliar" : "técnico"}`} onClose={() => { setEditingTechnician(null); setForm(emptyForm); setError(""); }}><form className="admin-form" onSubmit={saveTechnicianEdits}>
        <label>Nome<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength={2} maxLength={160} required /></label>
        <label>Matrícula<input value={form.registration} onChange={(event) => setForm({ ...form, registration: event.target.value })} minLength={2} maxLength={80} required /></label>
        <label>Tipo<select value={form.teamRole} onChange={(event) => setForm({ ...form, teamRole: event.target.value as Technician["teamRole"], leadTechnicianId: "" })}><option value="Tecnico">Técnico</option><option value="Auxiliar">Auxiliar</option></select></label>
        {form.teamRole === "Auxiliar" && <label>Técnico responsável<select value={form.leadTechnicianId} onChange={(event) => setForm({ ...form, leadTechnicianId: event.target.value })}><option value="">Sem vínculo</option>{technicians.filter((technician) => technician.teamRole === "Tecnico" && technician.id !== editingTechnician.id).map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>}
        <label>Supervisor<select value={form.supervisorId} onChange={(event) => setForm({ ...form, supervisorId: event.target.value })}><option value="">Sem supervisor</option>{supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}</select></label>
        <label>Região<input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} maxLength={100} /></label>
        <label>Turno<input value={form.shift} onChange={(event) => setForm({ ...form, shift: event.target.value })} minLength={2} maxLength={80} required /></label>
        <label>Status<select value={form.dutyStatus} onChange={(event) => setForm({ ...form, dutyStatus: event.target.value })}>{!form.dutyStatus && <option value="">—</option>}{DUTY_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>Obs<input value={form.statusNote} onChange={(event) => setForm({ ...form, statusNote: event.target.value })} maxLength={300} placeholder="Ex.: chega 9h, carro na oficina" /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" type="submit">Salvar alterações <ChevronRight size={16} /></button>
      </form></AdminModal>}
    </>
  );
}
