import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { api, type MassIncident, type Technician } from "../api";

// Possiveis incidentes em massa (3+ chamados ativos na mesma OLT abertos com ate 3h entre um e outro), com acoes
// em lote: o mesmo tecnico, a mesma observacao, ou finalizar todos. Cada acao usa a permissao de sempre.

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const nowLocal = () => { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); };

export function IncidentsPanel({ refreshKey }: { refreshKey: number }) {
  const [incidents, setIncidents] = useState<MassIncident[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const load = useCallback(() => { api.massIncidents().then((data) => setIncidents(data.incidents)).catch(() => setIncidents([])); }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { api.technicians().then((data) => setTechnicians(data.technicians.filter((tech) => tech.teamRole === "Tecnico" && tech.active && tech.employmentStatus !== "Demitido"))).catch(() => undefined); }, []);
  if (!incidents.length) return null;
  return (
    <section className="in-list" aria-label="Possíveis incidentes em massa">
      {incidents.map((incident) => <IncidentCard key={incident.key} incident={incident} technicians={technicians} onDone={load} />)}
    </section>
  );
}

function IncidentCard({ incident, technicians, onDone }: { incident: MassIncident; technicians: Technician[]; onDone: () => void }) {
  const [mode, setMode] = useState<"" | "assign" | "observe" | "finish">("");
  const [technicianId, setTechnicianId] = useState("");
  const [text, setText] = useState("");
  const [executedAt, setExecutedAt] = useState(nowLocal());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const ids = incident.calls.map((call) => call.id);

  async function run() {
    if (mode === "finish" && !confirming) { setConfirming(true); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api.incidentAction({ callIds: ids, action: mode as "assign" | "observe" | "finish", technicianId: technicianId || undefined, text: text.trim() || undefined, executedAt: mode === "finish" ? executedAt : undefined });
      const failed = result.results.filter((item) => !item.ok);
      setMessage(`${result.ok} de ${ids.length} chamado(s) atualizados.${failed.length ? ` Não foram: ${failed.map((item) => `${incident.calls.find((call) => call.id === item.callId)?.orderNumber || item.callId} (${item.message})`).join("; ")}` : ""}`);
      setMode(""); setText(""); setConfirming(false);
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível aplicar a ação."); }
    finally { setBusy(false); }
  }

  return (
    <article className="panel in-card">
      <header>
        <span className="in-icon" aria-hidden="true"><Zap size={16} /></span>
        <div>
          <strong>Possível incidente em massa: OLT {incident.olt}</strong>
          <small>{incident.calls.length} chamados ativos · {incident.region || "sem região"} · abertos de {when(incident.firstAt)} a {when(incident.lastAt)}{incident.slotPons.length ? ` · slot/PON ${incident.slotPons.join(", ")}` : ""}</small>
        </div>
      </header>
      <div className="in-orders">{incident.calls.map((call) => <Link key={call.id} to={`/chamados/${call.id}`} className="in-order" title={`${call.status}${call.technicianName ? ` · ${call.technicianName}` : " · sem técnico"}`}>{call.orderNumber}</Link>)}</div>
      <div className="in-actions" role="group" aria-label="Ação em todos">
        <button type="button" className={`secondary-button compact${mode === "assign" ? " is-active" : ""}`} onClick={() => { setMode(mode === "assign" ? "" : "assign"); setConfirming(false); }}>Atribuir todos</button>
        <button type="button" className={`secondary-button compact${mode === "observe" ? " is-active" : ""}`} onClick={() => { setMode(mode === "observe" ? "" : "observe"); setConfirming(false); }}>Observação em todos</button>
        <button type="button" className={`secondary-button compact${mode === "finish" ? " is-active" : ""}`} onClick={() => { setMode(mode === "finish" ? "" : "finish"); setConfirming(false); }}>Finalizar todos</button>
      </div>
      {mode && (
        <div className="in-form">
          {mode === "assign" && <label>Técnico para os {ids.length} chamados<select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}><option value="">Escolha</option>{technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</select></label>}
          {mode === "finish" && <label>Data e hora de execução<input type="datetime-local" value={executedAt} onChange={(event) => setExecutedAt(event.target.value)} /></label>}
          {mode !== "assign" && <label>{mode === "finish" ? "Resultado e observação (a 1ª linha vira o Resultado)" : "Observação"}<textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder={mode === "finish" ? "Ex.: Rompimento na OLT reparado\nFibra emendada no poste 12" : "Ex.: Rompimento confirmado, equipe a caminho"} /></label>}
          <button className="primary-button compact" type="button" disabled={busy || (mode === "assign" ? !technicianId : !text.trim())} onClick={() => void run()}>
            {busy ? "Aplicando..." : mode === "finish" ? (confirming ? `Confirmar: finalizar ${ids.length} chamados` : `Finalizar ${ids.length} chamados`) : mode === "assign" ? `Atribuir ${ids.length} chamados` : `Adicionar em ${ids.length} chamados`}
          </button>
        </div>
      )}
      {error ? <div className="form-error" role="alert">{error}</div> : message && <div className="save-message" role="status">{message}</div>}
    </article>
  );
}
