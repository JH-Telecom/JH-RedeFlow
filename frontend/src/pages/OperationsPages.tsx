import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, RefreshCw, UserCheck, UserX, Users } from "lucide-react";
import { api, type MapArea, type MapCall, type QueueMap, type QueueState, type TechnicianLoad, type TechnicianLoadRow } from "../api";
import { KpiTile, Panel, formatCount } from "../components/charts";
import { IncidentsPanel } from "../components/IncidentsPanel";
import { Pager, usePaged } from "../components/Pager";
import { useCachedData } from "../lib/data-cache";
import { SkeletonRows } from "../components/Skeleton";

// Lote 3: Mapa da fila (por regiao e bairro) e Carga dos tecnicos. Os dois atualizam sozinhos a cada minuto.

export const STATE_LABEL: Record<QueueState, string> = { ok: "No prazo", soon: "Vence em < 2h", late: "Fora do prazo", outlier: "Outlier (> 9h)" };
const STATES: QueueState[] = ["outlier", "late", "soon", "ok"];
const elapsed = (minutes: number) => (minutes < 60 ? `${minutes} min` : minutes < 2880 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` : `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`);
const hoursText = (hours: number | null) => { if (hours === null) return "–"; const minutes = Math.round(hours * 60); return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`; };

// Guardado em memoria: ao voltar para a aba aparece na hora; reconfere a cada 1 min e quando um chamado muda.
function useAutoLoad<T>(key: string, load: () => Promise<T>) {
  const { data, error, loading, reload } = useCachedData<T>(key, load, { refreshMs: 60_000, refreshOnCallsChanged: true });
  return { data: data ?? null, error, loading, reload: () => void reload() };
}

function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return <button className="secondary-button compact" type="button" onClick={onClick} disabled={loading}><RefreshCw size={15} className={loading ? "ih-spin" : ""} /> {loading ? "Atualizando..." : "Atualizar"}</button>;
}

export function StateChip({ state }: { state: QueueState }) {
  return <span className={`op-chip is-${state}`}>{STATE_LABEL[state]}</span>;
}

// Barra empilhada com a divisao por situacao do prazo.
function StateBar({ area }: { area: Pick<MapArea, "states" | "total"> }) {
  if (!area.total) return null;
  return (
    <span className="op-bar" role="img" aria-label={STATES.filter((state) => area.states[state]).map((state) => `${area.states[state]} ${STATE_LABEL[state].toLowerCase()}`).join(", ")}>
      {STATES.map((state) => area.states[state] ? <i key={state} className={`is-${state}`} style={{ flexGrow: area.states[state] }} /> : null)}
    </span>
  );
}

function CallList({ calls }: { calls: MapCall[] }) {
  return (
    <ul className="op-calls">
      {calls.map((call) => (
        <li key={call.id}>
          <Link to={`/chamados/${call.id}`} className="rp-order">{call.orderNumber}</Link>
          <span>{call.type}{call.olt ? ` · ${call.olt}` : ""}</span>
          <span>{call.technicianName || <b className="ih-missing">Sem técnico</b>}</span>
          <span className="op-call-time">{elapsed(call.minutes)}</span>
          <StateChip state={call.state} />
        </li>
      ))}
    </ul>
  );
}

// ---------- Mapa da fila ----------
export function QueueMapPage() {
  const { data, error, loading, reload } = useAutoLoad<QueueMap>("operacao:mapa", () => api.queueMap());
  const [open, setOpen] = useState<string | null>(null);
  const [incidentKey, setIncidentKey] = useState(0);
  return (
    <div className="dv-dashboard op-page">
      <div className="page-heading dv-heading">
        <div>
          <span className="section-kicker">OPERAÇÃO</span>
          <h1>Mapa da fila</h1>
          <p>Chamados ativos por região e bairro, com a cor da situação do prazo. Clique num bairro para ver os chamados.</p>
        </div>
        <RefreshButton loading={loading} onClick={() => { void reload(); setIncidentKey((key) => key + 1); }} />
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <IncidentsPanel refreshKey={incidentKey} />
      {!data ? (!error && <SkeletonRows rows={6} columns={4} />) : <>
        <div className="dv-kpi-grid">
          <KpiTile label="Ativos" value={formatCount(data.total)} note={`${data.noTechnician} sem técnico`} icon={Users} />
          <KpiTile label="Vencem em < 2h" value={formatCount(data.states.soon)} note="Ainda no prazo" icon={Users} tone={data.states.soon ? "warning" : "default"} />
          <KpiTile label="Fora do prazo" value={formatCount(data.states.late)} note="Entre 6h e 9h" icon={Users} tone={data.states.late ? "warning" : "default"} />
          <KpiTile label="Outliers" value={formatCount(data.states.outlier)} note="Acima de 9h" icon={Users} tone={data.states.outlier ? "critical" : "default"} />
        </div>
        <div className="op-legend" aria-label="Legenda">{STATES.slice().reverse().map((state) => <span key={state}><i className={`op-dot is-${state}`} aria-hidden="true" />{STATE_LABEL[state]}</span>)}</div>
        {!data.regions.length ? <div className="panel dv-empty">Nenhum chamado ativo agora.</div> : (
          <div className="op-regions">
            {data.regions.map((region) => (
              <section key={region.name} className={`panel op-region is-${region.worst}`}>
                <header>
                  <h2>{region.name}</h2>
                  <span className="op-region-count">{region.total} ativo(s){region.noTechnician ? ` · ${region.noTechnician} sem técnico` : ""}</span>
                  <StateBar area={region} />
                </header>
                <div className="op-bairros">
                  {region.bairros.map((bairro) => {
                    const key = `${region.name}|${bairro.name}`;
                    const isOpen = open === key;
                    return (
                      <div key={key} className={`op-bairro is-${bairro.worst}${isOpen ? " is-open" : ""}`}>
                        <button type="button" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}>
                          <span className="op-bairro-name"><i className={`op-dot is-${bairro.worst}`} aria-hidden="true" />{bairro.name}</span>
                          <b>{bairro.total}</b>
                          <ChevronDown size={14} aria-hidden="true" />
                        </button>
                        {isOpen && <CallList calls={bairro.calls} />}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        <p className="rp-note">O mapa é por região e bairro (os chamados não têm coordenadas). Regiões e bairros com chamados mais atrasados aparecem primeiro.</p>
      </>}
    </div>
  );
}

// ---------- Linha do dia (18/11/2026) ----------
// Cada tecnico numa faixa: os chamados de hoje de quando foram atribuidos ate a conclusao (claros) ou ate agora
// (fortes), coloridos pelo prazo. O vazio entre eles e tempo sem chamado; a linha vermelha e agora.
const clockText = (value: number) => new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
function DayTimeline({ rows, dayStart }: { rows: TechnicianLoadRow[]; dayStart: string }) {
  const now = Date.now();
  const base = Date.parse(dayStart);
  const starts = rows.flatMap((row) => row.timeline.map((item) => Date.parse(item.start)));
  const from = Math.min(base + 6 * 3_600_000, ...starts);
  const fromHour = Math.floor((from - base) / 3_600_000);
  const toHour = Math.min(24, Math.max(fromHour + 6, Math.ceil((now - base) / 3_600_000) + 1));
  const start = base + fromHour * 3_600_000, span = (toHour - fromHour) * 3_600_000;
  const pos = (value: number) => Math.max(0, Math.min(100, ((value - start) / span) * 100));
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, index) => fromHour + index).filter((hour, index, all) => all.length <= 9 || (hour - fromHour) % 2 === 0);
  const nowPos = now >= start && now <= start + span ? pos(now) : null;
  return (
    <div className="op-tl" role="list">
      <div className="op-tl-row op-tl-axis" aria-hidden="true"><span /><div className="op-tl-hours">{hours.map((hour) => <span key={hour} style={{ left: `${((hour - fromHour) / (toHour - fromHour)) * 100}%` }}>{String(hour).padStart(2, "0")}h</span>)}</div></div>
      {rows.map((row) => (
        <div className="op-tl-row" role="listitem" key={row.id}>
          <span className="op-tl-name" title={row.name}>{row.name}</span>
          <div className="op-tl-track" aria-label={row.timeline.length ? `${row.name}: ${row.timeline.map((item) => `${item.orderNumber} das ${clockText(Date.parse(item.start))} ${item.active ? "até agora" : `às ${clockText(Date.parse(item.end))}`}, ${STATE_LABEL[item.state]}`).join("; ")}` : `${row.name}: sem chamado hoje`}>
            {hours.map((hour) => <i key={hour} className="op-tl-grid" style={{ left: `${((hour - fromHour) / (toHour - fromHour)) * 100}%` }} />)}
            {!row.timeline.length && <span className="op-tl-empty">Sem chamado hoje</span>}
            {row.timeline.map((item) => {
              const left = pos(Date.parse(item.start));
              const width = Math.max(1.2, pos(Date.parse(item.end)) - left);
              return <span key={item.id} className={`op-tl-block is-${item.state}${item.active ? " is-active" : ""}`} style={{ left: `${left}%`, width: `${width}%` }} title={`${item.orderNumber} · ${item.type}
${clockText(Date.parse(item.start))} – ${item.active ? "agora" : clockText(Date.parse(item.end))} · ${STATE_LABEL[item.state]}`}>{width > 7 ? item.orderNumber : ""}</span>;
            })}
            {nowPos !== null && <i className="op-tl-now" style={{ left: `${nowPos}%` }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Carga dos tecnicos ----------
export function TechnicianLoadPage() {
  const { data, error, loading, reload } = useAutoLoad<TechnicianLoad>("operacao:carga", () => api.technicianLoad());
  const [open, setOpen] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const rows = (data?.technicians ?? []).filter((row) => !onlyFree || row.free);
  const pagedRows = usePaged(rows, rows.length);
  return (
    <div className="dv-dashboard op-page">
      <div className="page-heading dv-heading">
        <div>
          <span className="section-kicker">EQUIPES</span>
          <h1>Carga dos técnicos</h1>
          <p>Quantos chamados cada técnico tem agora, o mais antigo, e quanto já finalizou hoje. Livres primeiro, para ajudar na atribuição.</p>
        </div>
        <RefreshButton loading={loading} onClick={() => void reload()} />
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {!data ? (!error && <SkeletonRows rows={6} columns={4} />) : <>
        <div className="dv-kpi-grid">
          <KpiTile label="Livres" value={formatCount(data.free)} note="Sem chamado ativo" icon={UserCheck} />
          <KpiTile label="Ocupados" value={formatCount(data.busy)} note="Com chamado ativo" icon={UserX} />
          <KpiTile label="Ativos sem técnico" value={formatCount(data.unassignedActive)} note="Aguardando atribuição" icon={Users} tone={data.unassignedActive ? "warning" : "default"} to="/chamados/abertos" />
          <KpiTile label="Técnicos" value={formatCount(data.technicians.length)} note="Trabalhando e ativos" icon={Users} />
        </div>
        <Panel kicker="HOJE" title="Linha do dia" aside={<div className="op-legend"><span><i className="op-tl-key is-ok" /> No prazo</span><span><i className="op-tl-key is-late" /> Fora do prazo</span><span><i className="op-tl-key is-outlier" /> Outlier</span><span><i className="op-tl-key is-done" /> Concluído (claro)</span></div>}>
          {!rows.length ? <div className="dv-empty">Nenhum técnico para mostrar.</div> : <DayTimeline rows={pagedRows.pageItems} dayStart={data.dayStart} />}
        </Panel>
        <Panel kicker="EQUIPE" title="Técnicos" aside={<label className="checkbox-label op-only-free"><input type="checkbox" checked={onlyFree} onChange={(event) => setOnlyFree(event.target.checked)} /> Só livres</label>}>
          {!rows.length ? <div className="dv-empty">{onlyFree ? "Ninguém livre agora." : "Nenhum técnico ativo."}</div> : (
            <div className="sa-table-wrap">
              <table className="sa-table rp-table op-load">
                <thead><tr><th>Técnico</th><th>Agora</th><th>Mais antigo</th><th>Situação</th><th>Finalizados hoje</th><th>Tempo médio hoje</th><th aria-label="Ver chamados" /></tr></thead>
                <tbody>
                  {pagedRows.pageItems.map((row) => (
                    <Fragment key={row.id}>
                      <tr>
                        <td><strong>{row.name}</strong><small>{[row.supervisorName, row.region].filter(Boolean).join(" · ")}</small></td>
                        <td>{row.free ? <span className="op-chip is-free">Livre</span> : <b>{row.active} chamado(s)</b>}</td>
                        <td>{row.oldestMinutes === null ? "–" : elapsed(row.oldestMinutes)}</td>
                        <td>{row.worst ? <StateChip state={row.worst} /> : "–"}</td>
                        <td>{row.finishedToday}{row.finishedToday ? <small>{row.onTimeToday} no prazo</small> : null}</td>
                        <td>{hoursText(row.avgHoursToday)}</td>
                        <td>{row.active > 0 && <button type="button" className="link-button" onClick={() => setOpen(open === row.id ? null : row.id)} aria-expanded={open === row.id}>{open === row.id ? "Esconder" : "Ver chamados"}</button>}</td>
                      </tr>
                      {open === row.id && <tr className="op-load-calls"><td colSpan={7}><CallList calls={row.activeCalls} /></td></tr>}
                    </Fragment>
                  ))}
                </tbody>
              </table><Pager {...pagedRows} noun={["técnico", "técnicos"]} />
            </div>
          )}
        </Panel>
      </>}
    </div>
  );
}
