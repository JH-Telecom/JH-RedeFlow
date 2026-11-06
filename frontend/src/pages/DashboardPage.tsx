import { MonthGoals } from "../components/MonthGoals";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, BarChart3, BellRing, CheckCircle2, ChevronRight, Clock3, Inbox, RefreshCcw, SlidersHorizontal, Timer, UserX, XCircle } from "lucide-react";
import { api, type Call, type DashboardActiveCall, type DashboardMetrics, type Role, type User } from "../api";
import { toOperationalDate } from "../dates";
import { ActivityRow, DateRangeFilter, Metric } from "../components/ui";
import { DailyBars, KpiTile, Panel, RankBars, SlaStack, formatCount, formatHours, formatPercent, percentOf } from "../components/charts";
import { RangeCallTable } from "./CallsPage";

type PeriodPreset = "today" | "7d" | "30d" | "month" | "all" | "custom";
const periodPresets: { key: PeriodPreset; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "month", label: "Este mês" },
  { key: "all", label: "Tudo" },
  { key: "custom", label: "Personalizado" },
];
const periodStorageKey = "jh-redeflow-dashboard-period";
const refreshIntervalMs = 60_000;

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function rangeForPreset(preset: PeriodPreset, today: string) {
  if (preset === "today") return { from: today, to: today };
  if (preset === "7d") return { from: shiftDate(today, -6), to: today };
  if (preset === "30d") return { from: shiftDate(today, -29), to: today };
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: "", to: "" };
}

function formatDay(date: string) {
  return date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : "";
}

function formatAge(openedAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(openedAt)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function slaOf(openedAt: string, now: number) {
  const hours = (now - Date.parse(openedAt)) / 3_600_000;
  if (hours > 9) return { className: "is-outlier", label: "Outlier", icon: AlertTriangle };
  if (hours > 6) return { className: "is-late", label: "Fora do prazo", icon: Clock3 };
  return { className: "is-onTime", label: "No prazo", icon: CheckCircle2 };
}

function readStoredPreset(): PeriodPreset {
  try {
    const stored = localStorage.getItem(periodStorageKey);
    return periodPresets.some((preset) => preset.key === stored) && stored !== "custom" ? stored as PeriodPreset : "7d";
  } catch {
    return "7d";
  }
}

export function DashboardWithDateFilter({ user }: { user: User & { role: Role } }) {
  const [preset, setPreset] = useState<PeriodPreset>(readStoredPreset);
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const today = toOperationalDate();
  const dateRange = preset === "custom" ? customRange : rangeForPreset(preset, today);
  function choosePreset(next: PeriodPreset) {
    setPreset(next);
    if (next === "custom" && !customRange.from && !customRange.to) setCustomRange(rangeForPreset("7d", today));
    try { if (next !== "custom") localStorage.setItem(periodStorageKey, next); } catch { /* preferencia opcional */ }
  }
  return <OperationalDashboard user={user} preset={preset} onPresetChange={choosePreset} dateRange={dateRange} onDateRangeChange={setCustomRange} />;
}

function OldestCallsList({ calls, now }: { calls: DashboardActiveCall[]; now: number }) {
  if (!calls.length) return <div className="dv-empty">Nenhum chamado ativo.</div>;
  return (
    <ol className="dv-oldest">
      {calls.map((call) => {
        const sla = slaOf(call.openedAt, now);
        return (
          <li key={call.id}>
            <Link to={`/chamados/${call.id}`}>
              <span className="dv-oldest-main"><b>{call.orderNumber}</b><small>{call.type} · {call.region || "Sem região"}</small></span>
              <span className={`dv-oldest-tech${call.technicianName ? "" : " is-missing"}`}>{call.technicianName || "Sem técnico"}</span>
              <span className={`dv-sla-badge ${sla.className}`}><sla.icon size={13} aria-hidden="true" />{sla.label}</span>
              <span className="dv-oldest-age">{formatAge(call.openedAt, now)}</span>
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function OperationalDashboard({ preset, onPresetChange, dateRange, onDateRangeChange }: { user: User; preset: PeriodPreset; onPresetChange: (value: PeriodPreset) => void; dateRange: { from: string; to: string }; onDateRangeChange: (value: { from: string; to: string }) => void }) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [callsInRange, setCallsInRange] = useState<Call[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([
      api.dashboard(dateRange).then((data) => { setMetrics(data.metrics); setError(""); setUpdatedAt(Date.now()); }),
      api.calls(undefined, { from: dateRange.from, to: dateRange.to }).then((data) => setCallsInRange(data.calls)).catch(() => setCallsInRange([])),
    ])
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível carregar os indicadores."))
      .finally(() => setLoading(false));
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), refreshIntervalMs);
    return () => window.clearInterval(interval);
  }, [load]);

  const periodLabel = !dateRange.from && !dateRange.to
    ? "Todo o histórico"
    : dateRange.from === dateRange.to ? formatDay(dateRange.from) : `${formatDay(dateRange.from) || "início"} a ${formatDay(dateRange.to) || "hoje"}`;

  const toolbar = (
    <div className="dv-toolbar">
      <div className="dv-segmented" role="group" aria-label="Período dos indicadores">
        {periodPresets.map((option) => (
          <button key={option.key} type="button" className={preset === option.key ? "is-selected" : ""} aria-pressed={preset === option.key} onClick={() => onPresetChange(option.key)}>{option.label}</button>
        ))}
      </div>
      {preset === "custom" && <DateRangeFilter value={dateRange} onChange={onDateRangeChange} />}
      <button type="button" className={`secondary-button dv-refresh${loading ? " is-refreshing" : ""}`} onClick={() => void load()} disabled={loading} aria-label="Atualizar indicadores">
        <RefreshCcw size={15} aria-hidden="true" /> Atualizar
      </button>
    </div>
  );

  const heading = (
    <div className="page-heading dv-heading">
      <div>
        <span className="section-kicker">OPERAÇÃO DE REDE</span>
        <h1>Visão geral</h1>
        <p>Fila em tempo real e indicadores do período · atualizado às {new Date(updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
      </div>
      {toolbar}
    </div>
  );

  if (error && !metrics) return <>{heading}<div className="dv-empty is-error" role="alert">{error}</div></>;
  if (!metrics) return <>{heading}<div className="dv-empty" role="status">Carregando indicadores...</div></>;

  const now = updatedAt;
  const outOfDeadline = metrics.activeSla.late + metrics.activeSla.outlier;
  const closedTotal = metrics.closedSla.onTime + metrics.closedSla.late + metrics.closedSla.outlier;
  const onTimeRate = percentOf(metrics.closedSla.onTime, closedTotal);
  const dailyCapped = metrics.daily.length > 0 && Boolean(dateRange.from) && metrics.daily[0].date > dateRange.from;

  return (
    <div className="dv-dashboard">
      {heading}
      <MonthGoals />
      {error && <div className="dv-inline-error" role="alert">{error} Exibindo os últimos dados carregados.</div>}

      <h2 className="dv-section-title">Agora <small>fila ativa, independente do período</small></h2>
      <div className="dv-kpi-grid">
        <KpiTile label="Sem técnico" value={formatCount(metrics.activeUnassigned)} note="Aguardando atribuição" icon={UserX} tone={metrics.activeUnassigned ? "warning" : "default"} to="/chamados/abertos" />
        <KpiTile label="Em atendimento" value={formatCount(metrics.activeTotal - metrics.activeUnassigned)} note="Atribuídos, em deslocamento ou em campo" icon={Activity} to="/chamados/atendimento" />
        <KpiTile label="Fora do prazo agora" value={formatCount(outOfDeadline)} note={`${formatCount(metrics.activeSla.outlier)} outliers (acima de 9h)`} icon={AlertTriangle} tone={metrics.activeSla.outlier ? "critical" : outOfDeadline ? "warning" : "good"} to="/chamados/atendimento" />
        <KpiTile label="Acionamentos pendentes" value={formatCount(metrics.pendingActivations)} note="Aguardando aceite ou recusa" icon={BellRing} tone={metrics.pendingActivations ? "warning" : "default"} to="/acionamentos" />
      </div>

      <div className="dv-grid dv-grid-split">
        <Panel kicker="SLA DA FILA" title="Prazo dos chamados ativos" aside={<span className="dv-panel-meta">{formatCount(metrics.activeTotal)} ativos</span>}>
          <SlaStack value={metrics.activeSla} caption="Prazo dos chamados ativos" />
          <p className="dv-footnote">Tempo desde a abertura até agora. Regra JH: até 6h no prazo, de 6h a 9h fora do prazo, acima de 9h outlier.</p>
        </Panel>
        <Panel kicker="ATENÇÃO" title="Chamados ativos mais antigos" aside={<Link className="dv-panel-link" to="/chamados/atendimento">Ver fila <ChevronRight size={14} aria-hidden="true" /></Link>}>
          <OldestCallsList calls={metrics.oldestActive} now={now} />
        </Panel>
      </div>

      <h2 className="dv-section-title">Período <small>{periodLabel}</small></h2>
      <div className="dv-kpi-grid dv-kpi-grid-5">
        <KpiTile label="Abertos" value={formatCount(metrics.openedInPeriod)} note="Pela data de abertura" icon={Inbox} />
        <KpiTile label="Finalizados" value={formatCount(metrics.finished)} note="Pela Data Fim" icon={CheckCircle2} />
        <KpiTile label="Cancelados" value={formatCount(metrics.cancelled)} note="Pela Data Fim" icon={XCircle} />
        <KpiTile label="Finalizados no prazo" value={formatPercent(onTimeRate)} note={closedTotal ? `${formatCount(metrics.closedSla.outlier)} outliers · meta 89%` : "Sem finalizados no período"} icon={Timer} tone={onTimeRate === null ? "default" : onTimeRate >= 89 ? "good" : onTimeRate >= 85 ? "warning" : "critical"} />
        <KpiTile label="MTTR" value={formatHours(metrics.closedSla.mttrHours)} note="Tempo médio de reparo · meta 5,0h" icon={Clock3} tone={metrics.closedSla.mttrHours === null ? "default" : metrics.closedSla.mttrHours <= 5 ? "good" : metrics.closedSla.mttrHours <= 6 ? "warning" : "critical"} />
      </div>

      <Panel kicker="TENDÊNCIA" title="Abertos e finalizados por dia" aside={dailyCapped ? <span className="dv-panel-meta">Últimos 31 dias do período</span> : !dateRange.from ? <span className="dv-panel-meta">Últimos 14 dias</span> : undefined}>
        <DailyBars days={metrics.daily} />
      </Panel>

      <div className="dv-grid dv-grid-3">
        <Panel kicker="REGIÕES" title="Volume por região"><RankBars items={metrics.byRegion} empty="Nenhum chamado no período." /></Panel>
        <Panel kicker="TIPOS" title="Tipo de evento"><RankBars items={metrics.byType} empty="Nenhum chamado no período." /></Panel>
        <Panel kicker="EQUIPES" title="Carga atual por técnico" aside={<span className="dv-panel-meta">ativos agora</span>}><RankBars items={metrics.activeByTechnician} empty="Nenhum chamado ativo atribuído." unit="chamados ativos" /></Panel>
      </div>

      <div className="dv-grid dv-grid-2">
        <Panel kicker="LOCALIDADE" title="Bairros com mais chamados"><RankBars items={metrics.byNeighborhood} empty="Nenhum chamado com bairro no período." /></Panel>
        <Panel kicker="STATUS" title="Status no período"><RankBars items={metrics.byStatus} empty="Nenhum chamado no período." /></Panel>
      </div>

      <RangeCallTable calls={callsInRange} />
    </div>
  );
}

export function Dashboard({ user }: { user: User }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">
            QUARTA-FEIRA, 18 DE SETEMBRO DE 2026
          </span>
          <h1>Bom dia, {user.name.split(" ")[0]}.</h1>
          <p>
            Acompanhe o pulso da operação e mantenha sua equipe em movimento.
          </p>
        </div>
        <button className="secondary-button">
          <SlidersHorizontal size={16} /> Personalizar
        </button>
      </div>
      <div className="metric-grid">
        <Metric
          label="Chamados recebidos hoje"
          value="128"
          note="+12,4% vs. ontem"
          positive
        />
        <Metric label="Chamados abertos" value="42" note="8 sem técnico" />
        <Metric label="Em atendimento" value="67" note="14 em campo" />
        <Metric
          label="Finalizados hoje"
          value="19"
          note="Tempo médio 03h42"
          positive
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">FLUXO OPERACIONAL</span>
              <h2>Chamados por período</h2>
            </div>
            <button className="select-button">
              Últimos 7 dias <ChevronRight size={15} />
            </button>
          </div>
          <div className="chart">
            <div className="chart-y">
              <span>160</span>
              <span>120</span>
              <span>80</span>
              <span>40</span>
              <span>0</span>
            </div>
            <div className="chart-area">
              <div className="grid-line" />
              <div className="grid-line" />
              <div className="grid-line" />
              <div className="grid-line" />
              <svg viewBox="0 0 700 220" preserveAspectRatio="none">
                <path
                  className="chart-fill"
                  d="M0,176 C40,160 70,162 110,128 S175,145 220,112 S280,95 325,114 S380,75 430,88 S490,50 535,78 S590,45 640,61 S680,30 700,38 L700,220 L0,220Z"
                />
                <path
                  className="chart-line"
                  d="M0,176 C40,160 70,162 110,128 S175,145 220,112 S280,95 325,114 S380,75 430,88 S490,50 535,78 S590,45 640,61 S680,30 700,38"
                />
              </svg>
              <div className="chart-labels">
                <span>12 set</span>
                <span>13 set</span>
                <span>14 set</span>
                <span>15 set</span>
                <span>16 set</span>
                <span>17 set</span>
                <span>18 set</span>
              </div>
            </div>
          </div>
        </section>
        <section className="panel status-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">DISTRIBUICAO</span>
              <h2>Status dos chamados</h2>
            </div>
            <BarChart3 size={19} className="muted-icon" />
          </div>
          <div className="donut-wrap">
            <div className="donut">
              <div>
                <strong>128</strong>
                <small>Total</small>
              </div>
            </div>
            <div className="legend">
              <span>
                <i className="blue" />
                Em atendimento <b>67</b>
              </span>
              <span>
                <i className="cyan" />
                Abertos <b>42</b>
              </span>
              <span>
                <i className="gray" />
                Finalizados <b>19</b>
              </span>
            </div>
          </div>
        </section>
      </div>
      <section className="panel activity-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">ACOMPANHAMENTO</span>
            <h2>Atividade recente</h2>
          </div>
          <button className="link-button">
            Ver tudo <ChevronRight size={15} />
          </button>
        </div>
        <div className="activity-list">
          <ActivityRow
            color="blue"
            text="Novo chamado recebido"
            detail="Ordem #RF-240918 · Região Sul"
            time="há 4 min"
          />
          <ActivityRow
            color="green"
            text="Chamado finalizado"
            detail="Ordem #RF-240912 · Carlos Mendes"
            time="há 18 min"
          />
          <ActivityRow
            color="orange"
            text="Chamado sem técnico"
            detail="Ordem #RF-240905 · Região Leste"
            time="há 31 min"
          />
        </div>
      </section>
    </>
  );
}
