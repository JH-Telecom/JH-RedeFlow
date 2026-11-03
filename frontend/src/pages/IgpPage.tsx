import { useEffect, useState } from "react";
import { api, type IgpArea, type IgpMetrics } from "../api";
import { toOperationalDate } from "../dates";
import { Metric } from "../components/ui";

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

export function IGPPage() {
  const [month, setMonth] = useState(() => toOperationalDate().slice(0, 7));
  const [area, setArea] = useState<IgpArea>('ALL');
  const [metrics, setMetrics] = useState<IgpMetrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setMetrics(null);
    setError("");
    api.igp(month, area)
      .then((data) => { if (active) setMetrics(data.igp); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Não foi possível calcular o IGP."); });
    return () => { active = false; };
  }, [month, area]);

  const metricRows = metrics ? [
    { label: "Outlier", key: "outlierPercent" as const, target: 4.9, minimum: 5.2, lowerIsBetter: true, format: formatIgpPercent },
    { label: "Prazo", key: "onTimePercent" as const, target: 89, minimum: 85, lowerIsBetter: false, format: formatIgpPercent },
    { label: "MTTR", key: "mttrHours" as const, target: 5, minimum: 6, lowerIsBetter: true, format: formatIgpHours },
  ] : [];

  return <>
    <div className="page-heading">
      <div><span className="section-kicker">IGP · REDES</span><h1>Indicadores de performance</h1><p>Consolidado mensal de Acesso e Backbone, ponderado pela quantidade de ordens.</p></div>
      <div className="igp-filter-controls"><label className="igp-area-picker">Região<select value={area} onChange={(event) => setArea(event.target.value as IgpArea)}><option value="ALL">Todas</option><option value="SP">SP</option><option value="GRU">GRU</option><option value="ALTO_TIETE">Alto Tietê</option></select></label><label className="igp-month-picker">Mês de execução<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label></div>
    </div>
    {error ? <div className="empty-state">{error}</div> : !metrics ? <div className="empty-state">Calculando indicadores do mês...</div> : <>
      <div className="metric-grid igp-summary">
        <Metric label="Ordens consideradas" value={metrics.total.orders.toLocaleString("pt-BR")} note={`${metrics.access.orders} Acesso · ${metrics.backbone.orders} Backbone`} positive />
        <Metric label="Outlier" value={formatIgpPercent(metrics.total.outlierPercent)} note="Meta 4,90% · limite mínimo 5,20%" />
        <Metric label="Dentro do prazo" value={formatIgpPercent(metrics.total.onTimePercent)} note="Meta 89,00% · mínimo 85,00%" positive />
        <Metric label="MTTR médio" value={formatIgpHours(metrics.total.mttrHours)} note="Meta 5,0h · limite 6,0h" />
      </div>
      <section className="panel igp-panel">
        <div className="panel-heading"><div><span className="section-kicker">{new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).toUpperCase()} · {area === 'ALL' ? 'SP + GRU + ALTO TIETÊ' : area === 'ALTO_TIETE' ? 'ALTO TIETÊ' : area}</span><h2>Resultado mensal</h2></div></div>
        {metrics.total.orders === 0 ? <div className="empty-state">Não há ordens finalizadas e classificáveis neste mês.</div> : <div className="igp-table-wrap"><table className="igp-table"><thead><tr><th>Indicador</th><th>Acesso <small>{metrics.access.orders} OS</small></th><th>Backbone <small>{metrics.backbone.orders} OS</small></th><th>Total ponderado <small>{metrics.total.orders} OS</small></th><th>Meta 100%</th><th>Meta mínima</th><th>Resultado</th></tr></thead><tbody>{metricRows.map((row) => {
          const totalValue = metrics.total[row.key];
          const state = getIgpGoalState(totalValue, row.target, row.minimum, row.lowerIsBetter);
          return <tr key={row.label}><th scope="row">{row.label}</th><td>{row.format(metrics.access[row.key])}</td><td>{row.format(metrics.backbone[row.key])}</td><td><strong>{row.format(totalValue)}</strong></td><td>{row.format(row.target)}</td><td>{row.format(row.minimum)}</td><td><span className={`igp-goal ${state.className}`}>{state.label}</span></td></tr>;
        })}</tbody></table></div>}
        <div className="igp-methodology"><strong>Ponderação Acesso × Backbone:</strong> média das duas redes ponderada pela quantidade de OS finalizadas classificáveis no mês. Acesso inclui NOC ACESSO/FIELD; Backbone inclui NOC TX/Backbone. Ordens sem tipo reconhecido: <b>{metrics.excludedOrders}</b>.<br /><span>Prazo: reparo até 6h · Fora do prazo: acima de 6h até 9h · Outlier: reparo acima de 9h · MTTR: Data Fim − Data de Abertura.</span></div>
      </section>
    </>}
  </>;
}
