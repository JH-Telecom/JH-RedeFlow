import { AlertTriangle, ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type DashboardMetrics, type DueSoonResult, type SlaAnalysis } from "../api";
import { toOperationalDate } from "../dates";

// Modo TV: painel em tela cheia para a TV da operacao. Alterna sozinho entre as visoes a cada 20 s e
// atualiza os dados a cada minuto. Teclas: setas trocam a visao, espaco pausa, Esc sai.
const SLIDE_MS = 20_000;
const REFRESH_MS = 60_000;
const SLIDES = ["Agora", "Mais antigos", "Prazo do mês"] as const;

const elapsed = (iso: string, now: number) => {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return days ? `${days}d ${hours}h` : `${hours}h${String(minutes % 60).padStart(2, "0")}`;
};
const slaTone = (iso: string, now: number) => {
  const minutes = (now - Date.parse(iso)) / 60_000;
  return minutes > 540 ? "is-critical" : minutes > 360 ? "is-warning" : "is-good";
};
const pct = (value: number | null | undefined) => (value === null || value === undefined ? "–" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export function TvModePage() {
  const navigate = useNavigate();
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [dueSoon, setDueSoon] = useState<DueSoonResult | null>(null);
  const [month, setMonth] = useState<SlaAnalysis | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    let active = true;
    async function load() {
      const today = toOperationalDate();
      const from = `${today.slice(0, 8)}01`;
      const [dashboard, due, analysis] = await Promise.allSettled([api.dashboard(), api.dueSoon(), api.slaAnalysis(from, today)]);
      if (!active) return;
      if (dashboard.status === "fulfilled") setMetrics(dashboard.value.metrics);
      if (due.status === "fulfilled") setDueSoon(due.value);
      if (analysis.status === "fulfilled") setMonth(analysis.value.analysis);
      setUpdatedAt(Date.now());
    }
    void load();
    const refresh = window.setInterval(() => void load(), REFRESH_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; window.clearInterval(refresh); window.clearInterval(clock); };
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => setSlide((current) => (current + 1) % SLIDES.length), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [slide, paused]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setSlide((current) => (current + 1) % SLIDES.length);
      else if (event.key === "ArrowLeft") setSlide((current) => (current + SLIDES.length - 1) % SLIDES.length);
      else if (event.key === " ") { event.preventDefault(); setPaused((current) => !current); }
      else if (event.key === "Escape" && !document.fullscreenElement) navigate("/");
    };
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFullscreen); };
  }, [navigate]);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }

  const dueItems = (dueSoon?.dueSoon ?? []).map((item) => ({ ...item, left: Math.floor(360 - (now - Date.parse(item.openedAt)) / 60_000) })).filter((item) => item.left > 0);
  const sla = metrics?.activeSla;
  const clock = new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dateText = new Date(now).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const date = dateText.charAt(0).toUpperCase() + dateText.slice(1);

  return (
    <div className="tv-mode">
      <header className="tv-header">
        <div className="tv-brand"><strong>JH Telecom · Rede</strong><span>{date}</span></div>
        <nav className="tv-tabs" aria-label="Visões">
          {SLIDES.map((name, index) => <button key={name} type="button" className={index === slide ? "is-active" : ""} onClick={() => setSlide(index)}>{name}</button>)}
        </nav>
        <div className="tv-controls">
          <span className="tv-live"><i aria-hidden="true" />ao vivo{updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
          <strong className="tv-clock">{clock}</strong>
          <button type="button" onClick={() => setSlide((current) => (current + SLIDES.length - 1) % SLIDES.length)} aria-label="Visão anterior"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => setPaused((current) => !current)} aria-label={paused ? "Continuar" : "Pausar"}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
          <button type="button" onClick={() => setSlide((current) => (current + 1) % SLIDES.length)} aria-label="Próxima visão"><ChevronRight size={18} /></button>
          <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          <button type="button" onClick={() => navigate("/")} aria-label="Sair do modo TV"><X size={18} /></button>
        </div>
      </header>
      {!paused && <div className="tv-progress" key={`${slide}-${paused}`} style={{ animationDuration: `${SLIDE_MS}ms` }} />}

      {dueItems.length > 0 && (
        <div className="tv-alert" role="alert"><AlertTriangle size={20} /> <strong>{dueItems.length === 1 ? "1 OS vence" : `${dueItems.length} OS vencem`} em menos de 30 min:</strong> {dueItems.slice(0, 6).map((item) => `${item.orderNumber} (${Math.floor(item.left / 60)}h${String(item.left % 60).padStart(2, "0")})`).join(" · ")}</div>
      )}

      <main className="tv-body">
        {!metrics ? <div className="tv-empty">Carregando...</div> : slide === 0 ? (
          <div className="tv-now">
            <div className="tv-kpis">
              <div className="tv-kpi"><span>Sem técnico</span><strong>{metrics.activeUnassigned}</strong><small>aguardando atribuição</small></div>
              <div className="tv-kpi"><span>Em atendimento</span><strong>{Math.max(0, metrics.activeTotal - metrics.activeUnassigned)}</strong><small>com técnico</small></div>
              <div className="tv-kpi is-critical"><span>Fora do prazo agora</span><strong>{(sla?.late ?? 0) + (sla?.outlier ?? 0)}</strong><small>{sla?.outlier ?? 0} outliers (acima de 9h)</small></div>
              <div className="tv-kpi"><span>Acionamentos pendentes</span><strong>{metrics.pendingActivations}</strong><small>aguardando aceite</small></div>
            </div>
            <div className="tv-split">
              <section className="tv-card"><h2>Chamados ativos por técnico</h2>
                <ul className="tv-bars">{metrics.activeByTechnician.slice(0, 8).map((item) => {
                  const max = Math.max(1, ...metrics.activeByTechnician.map((entry) => entry.value));
                  return <li key={item.label}><span>{item.label}</span><i><b style={{ width: `${(item.value / max) * 100}%` }} /></i><strong>{item.value}</strong></li>;
                })}{!metrics.activeByTechnician.length && <li className="tv-muted">Nenhum chamado com técnico agora.</li>}</ul>
              </section>
              <section className="tv-card"><h2>Hoje</h2>
                <dl className="tv-today"><div><dt>Recebidos</dt><dd>{metrics.receivedToday}</dd></div><div><dt>No prazo agora</dt><dd>{sla?.onTime ?? 0}</dd></div><div><dt>Finalizados no período</dt><dd>{metrics.finished}</dd></div><div><dt>MTTR</dt><dd>{metrics.closedSla.mttrHours === null ? "–" : `${metrics.closedSla.mttrHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`}</dd></div></dl>
              </section>
            </div>
          </div>
        ) : slide === 1 ? (
          <section className="tv-card tv-oldest"><h2>Chamados ativos mais antigos</h2>
            <table><thead><tr><th>Ordem</th><th>Evento</th><th>Região</th><th>Técnico</th><th>Status</th><th>Na fila</th></tr></thead>
              <tbody>{metrics.oldestActive.slice(0, 10).map((call) => (
                <tr key={call.id}><td><strong>{call.orderNumber}</strong></td><td>{call.type}</td><td>{call.region}</td><td>{call.technicianName || <span className="tv-muted">sem técnico</span>}</td><td>{call.status}</td><td><b className={slaTone(call.openedAt, now)}>{elapsed(call.openedAt, now)}</b></td></tr>
              ))}{!metrics.oldestActive.length && <tr><td colSpan={6} className="tv-muted">Nenhum chamado ativo.</td></tr>}</tbody>
            </table>
          </section>
        ) : (
          <div className="tv-month">
            {!month ? <div className="tv-empty">Carregando prazo do mês...</div> : <>
              <div className="tv-kpis">
                <div className="tv-kpi"><span>Finalizados no mês</span><strong>{month.total.orders.toLocaleString("pt-BR")}</strong><small>pela Data Fim</small></div>
                <div className={`tv-kpi ${month.total.lostPercent === null ? "" : month.total.lostPercent <= 11 ? "is-good" : month.total.lostPercent <= 15 ? "is-warning" : "is-critical"}`}><span>Perderam prazo</span><strong>{pct(month.total.lostPercent)}</strong><small>{month.total.lost} acima de 6h · meta até 11%</small></div>
                <div className="tv-kpi"><span>Outliers</span><strong>{pct(month.total.outlierPercent)}</strong><small>{month.total.outliers} acima de 9h</small></div>
                <div className="tv-kpi"><span>Média de entrantes</span><strong>{month.incoming.avgPerDay === null ? "–" : month.incoming.avgPerDay.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</strong><small>chamados por dia</small></div>
              </div>
              <div className="tv-split">
                <section className="tv-card"><h2>Técnicos que mais perdem prazo</h2><ol className="tv-rank">{month.technicians.filter((item) => item.lost).slice(0, 6).map((item) => <li key={item.name}><span>{item.name}</span><strong>{item.lost}</strong><small>{pct(item.lostPercent)}</small></li>)}{!month.technicians.some((item) => item.lost) && <li className="tv-muted">Ninguém perdeu prazo no mês até agora.</li>}</ol></section>
                <section className="tv-card"><h2>Bairros que mais perdem prazo</h2><ol className="tv-rank">{month.neighborhoods.filter((item) => item.lost).slice(0, 6).map((item) => <li key={item.name}><span>{item.name}</span><strong>{item.lost}</strong><small>{pct(item.lostPercent)}</small></li>)}{!month.neighborhoods.some((item) => item.lost) && <li className="tv-muted">Ninguém perdeu prazo no mês até agora.</li>}</ol></section>
              </div>
            </>}
          </div>
        )}
      </main>
    </div>
  );
}
