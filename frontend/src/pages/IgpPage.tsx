import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3, Timer, XCircle } from "lucide-react";
import { api, type IgpArea, type IgpMetrics } from "../api";
import { toOperationalDate } from "../dates";
import { KpiTile, Panel, formatCount } from "../components/charts";

export function formatIgpPercent(value: number | null) {
  return value === null ? "-" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function formatIgpHours(value: number | null) {
  return value === null ? "-" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`;
}

export function getIgpGoalState(value: number | null, target: number, minimum: number, lowerIsBetter: boolean) {
  if (value === null) return { label: "Sem dados", className: "empty" };
  const hitsTarget = lowerIsBetter ? value <= target : value >= target;
  if (hitsTarget) return { label: "Meta 100%", className: "hit" };
  const hitsMinimum = lowerIsBetter ? value <= minimum : value >= minimum;
  return hitsMinimum ? { label: "Meta mínima", className: "minimum" } : { label: "Abaixo da meta", className: "miss" };
}

const goalTone = { hit: "good", minimum: "warning", miss: "critical", empty: "default" } as const;
const goalIcon = { hit: CheckCircle2, minimum: Clock3, miss: XCircle, empty: Clock3 } as const;
const igpGoals = {
  outlierPercent: { label: "Outlier", target: 4.9, minimum: 5.2, lowerIsBetter: true, format: formatIgpPercent },
  onTimePercent: { label: "Prazo", target: 89, minimum: 85, lowerIsBetter: false, format: formatIgpPercent },
  mttrHours: { label: "MTTR", target: 5, minimum: 6, lowerIsBetter: true, format: formatIgpHours },
};
const trendMonths = 6;

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function monthLabel(month: string, style: "short" | "long" = "short") {
  const date = new Date(`${month}-15T12:00:00Z`);
  if (style === "long") {
    const text = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return `${date.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "")}/${month.slice(2, 4)}`;
}
const shortGoalLabel: Record<string, string> = { hit: "Meta", minimum: "Mínima", miss: "Abaixo", empty: "" };

function GoalNote({ value, goal }: { value: number | null; goal: typeof igpGoals[keyof typeof igpGoals] }) {
  const state = getIgpGoalState(value, goal.target, goal.minimum, goal.lowerIsBetter);
  const Icon = goalIcon[state.className as keyof typeof goalIcon];
  return <><span className={`igp-goal-inline is-${state.className}`}><Icon size={13} aria-hidden="true" />{state.label}</span> · meta {goal.format(goal.target)} · mínimo {goal.format(goal.minimum)}</>;
}

// Colunas de % no prazo por mes, com linhas de meta (89%) e minimo (85%).
function OnTimeTrend({ months }: { months: { month: string; metrics: IgpMetrics | null }[] }) {
  const floor = 60;
  const position = (value: number) => `${Math.max(0, Math.min(100, ((value - floor) / (100 - floor)) * 100))}%`;
  return (
    <div className="igp-trend">
      <div className="igp-trend-plot">
        <div className="igp-trend-guides" aria-hidden="true">
          <div className="igp-trend-line is-target" style={{ bottom: position(89) }}><span>Meta 89%</span></div>
          <div className="igp-trend-line is-minimum" style={{ bottom: position(85) }}><span>Mínimo 85%</span></div>
        </div>
        {months.map(({ month, metrics }) => {
          const value = metrics?.total.onTimePercent ?? null;
          const state = getIgpGoalState(value, 89, 85, false).className;
          return (
            <div className="igp-trend-column" key={month} title={value === null ? `${monthLabel(month, "long")}: sem ordens` : `${monthLabel(month, "long")}: ${formatIgpPercent(value)} no prazo · ${metrics?.total.orders ?? 0} OS`}>
              <span className="igp-trend-bar-area">
                {value === null
                  ? <span className="igp-trend-value is-empty">sem OS</span>
                  : <i className={`is-${state}`} style={{ height: position(value) }}><span className="igp-trend-value">{value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span></i>}
              </span>
              <small>{monthLabel(month)}</small>
            </div>
          );
        })}
      </div>
      <p className="dv-footnote">Escala de 60% a 100%. Cor da coluna: verde atinge a meta, amarelo atinge o mínimo, vermelho abaixo do mínimo.</p>
    </div>
  );
}

export function IGPPage() {
  const [month, setMonth] = useState(() => toOperationalDate().slice(0, 7));
  const [area, setArea] = useState<IgpArea>('ALL');
  const [metrics, setMetrics] = useState<IgpMetrics | null>(null);
  const [trend, setTrend] = useState<{ month: string; metrics: IgpMetrics | null }[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setMetrics(null);
    setError("");
    api.igp(month, area)
      .then((data) => { if (active) setMetrics(data.igp); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Não foi possível calcular o IGP."); });
    const months = Array.from({ length: trendMonths }, (_, index) => shiftMonth(month, index - (trendMonths - 1)));
    setTrend(months.map((item) => ({ month: item, metrics: null })));
    Promise.all(months.map((item) => api.igp(item, area).then((data) => data.igp).catch(() => null)))
      .then((results) => { if (active) setTrend(months.map((item, index) => ({ month: item, metrics: results[index] }))); });
    return () => { active = false; };
  }, [month, area]);

  const metricRows = metrics ? Object.values(igpGoals).map((goal, index) => ({ ...goal, key: (Object.keys(igpGoals) as (keyof typeof igpGoals)[])[index] })) : [];
  const areaLabel = area === 'ALL' ? 'SP + GRU + Alto Tietê' : area === 'ALTO_TIETE' ? 'Alto Tietê' : area;

  return <div className="dv-dashboard">
    <div className="page-heading dv-heading">
      <div><span className="section-kicker">IGP · REDES</span><h1>Indicadores de performance</h1><p>Consolidado mensal de Acesso e Backbone, ponderado pela quantidade de ordens.</p></div>
      <div className="igp-filter-controls"><label className="igp-area-picker">Região<select value={area} onChange={(event) => setArea(event.target.value as IgpArea)}><option value="ALL">Todas</option><option value="SP">SP</option><option value="GRU">GRU</option><option value="ALTO_TIETE">Alto Tietê</option></select></label><label className="igp-month-picker">Mês de execução<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label></div>
    </div>
    {error ? <div className="dv-empty is-error" role="alert">{error}</div> : !metrics ? <div className="dv-empty" role="status">Calculando indicadores do mês...</div> : <>
      <div className="dv-kpi-grid">
        <KpiTile label="Ordens consideradas" value={formatCount(metrics.total.orders)} note={`${metrics.access.orders} Acesso · ${metrics.backbone.orders} Backbone${metrics.excludedOrders ? ` · ${metrics.excludedOrders} sem tipo reconhecido` : ""}`} icon={ClipboardList} />
        {metricRows.map((row) => {
          const value = metrics.total[row.key];
          const state = getIgpGoalState(value, row.target, row.minimum, row.lowerIsBetter).className as keyof typeof goalTone;
          const icon = row.key === "outlierPercent" ? AlertTriangle : row.key === "onTimePercent" ? Timer : Clock3;
          return <KpiTile key={row.key} label={row.key === "onTimePercent" ? "Dentro do prazo" : row.key === "mttrHours" ? "MTTR médio" : "Outlier"} value={row.format(value)} note={<GoalNote value={value} goal={row} />} icon={icon} tone={goalTone[state]} />;
        })}
      </div>

      <Panel kicker={`${monthLabel(month, "long").toUpperCase()} · ${areaLabel.toUpperCase()}`} title="Resultado por rede">
          {metrics.total.orders === 0 ? <div className="dv-empty">Não há ordens finalizadas e classificáveis neste mês.</div> : <div className="igp-table-wrap"><table className="igp-table"><thead><tr><th>Indicador</th><th>Acesso <small>{metrics.access.orders} OS</small></th><th>Backbone <small>{metrics.backbone.orders} OS</small></th><th>Total ponderado <small>{metrics.total.orders} OS</small></th><th>Meta 100%</th><th>Meta mínima</th><th>Resultado</th></tr></thead><tbody>{metricRows.map((row) => {
            const totalValue = metrics.total[row.key];
            const state = getIgpGoalState(totalValue, row.target, row.minimum, row.lowerIsBetter);
            return <tr key={row.label}><th scope="row">{row.label}</th><td>{row.format(metrics.access[row.key])}</td><td>{row.format(metrics.backbone[row.key])}</td><td><strong>{row.format(totalValue)}</strong></td><td>{row.format(row.target)}</td><td>{row.format(row.minimum)}</td><td><span className={`igp-goal ${state.className}`}>{state.label}</span></td></tr>;
          })}</tbody></table></div>}
      </Panel>

      <div className="dv-grid dv-grid-split">
        <Panel kicker="EVOLUÇÃO" title={`Dentro do prazo · últimos ${trendMonths} meses`} aside={<span className="dv-panel-meta">{areaLabel}</span>}>
          <OnTimeTrend months={trend} />
        </Panel>
      <Panel kicker="HISTÓRICO" title="Indicadores mês a mês">
        <div className="igp-table-wrap"><table className="igp-table igp-history"><thead><tr><th>Mês</th><th>OS</th><th>Prazo</th><th>Outlier</th><th>MTTR</th></tr></thead><tbody>
          {[...trend].reverse().map(({ month: item, metrics: row }) => <tr key={item} className={item === month ? "is-current" : ""}>
            <th scope="row">{monthLabel(item, "long")}</th>
            <td>{row ? formatCount(row.total.orders) : "…"}</td>
            {(["onTimePercent", "outlierPercent", "mttrHours"] as const).map((key) => {
              const value = row ? row.total[key] : null;
              const goal = igpGoals[key];
              const state = getIgpGoalState(value, goal.target, goal.minimum, goal.lowerIsBetter);
              return <td key={key}>{row ? <>{goal.format(value)} {value !== null && <span className={`igp-goal ${state.className}`} title={state.label}>{shortGoalLabel[state.className]}</span>}</> : "…"}</td>;
            })}
          </tr>)}
        </tbody></table></div>
      </Panel>
      </div>
      <Panel kicker="METODOLOGIA" title="Como o IGP é calculado">
        <div className="igp-methodology"><strong>Ponderação Acesso × Backbone:</strong> média das duas redes ponderada pela quantidade de OS finalizadas classificáveis no mês. Acesso inclui NOC ACESSO/FIELD; Backbone inclui NOC TX/Backbone. Ordens sem tipo reconhecido: <b>{metrics.excludedOrders}</b>.<br /><span>Prazo: reparo até 6h · Fora do prazo: acima de 6h até 9h · Outlier: reparo acima de 9h · MTTR: Data Fim − Data de Abertura.</span></div>
      </Panel>
    </>}
  </div>;
}
