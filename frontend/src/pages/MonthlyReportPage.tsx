import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { api, type CompareReport, type IgpArea, type IgpMetrics, type IgpPlan, type ReasonsReport } from "../api";
import { goalSentence } from "../components/MonthGoals";

// Relatorio mensal para imprimir / salvar em PDF (Relatorios > Relatorio mensal). Pagina sem lateral nem topo,
// pensada para A4: indicadores do mes contra as metas, por area, comparacao com o mes anterior, principais
// motivos de fechamento e reincidencia.

const AREAS: { value: IgpArea; label: string }[] = [{ value: "SP", label: "C.8 São Paulo" }, { value: "GRU", label: "C.12 Guarulhos" }, { value: "ALTO_TIETE", label: "C.11 Alto Tietê" }, { value: "ABC", label: "C.9 ABC" }];
const pct = (value: number | null | undefined) => (value === null || value === undefined ? "–" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const hrs = (value: number | null | undefined) => (value === null || value === undefined ? "–" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`);
const monthName = (month: string) => { const text = new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return text.charAt(0).toUpperCase() + text.slice(1); };
const lastDay = (month: string) => { const [year, number] = month.split("-").map(Number); return `${month}-${String(new Date(Date.UTC(year, number, 0)).getUTCDate()).padStart(2, "0")}`; };

type Data = { total: { igp: IgpMetrics; plan?: IgpPlan }; areas: { area: string; igp: IgpMetrics }[]; reasons: ReasonsReport; compare: CompareReport; repeat: { finished: number; eligible: number; repeated: number; percent: number | null } };

export function MonthlyReportPage() {
  const { month = "" } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) { setError("Mês inválido."); return; }
    const from = `${month}-01`;
    const to = lastDay(month);
    Promise.all([
      api.igp(month),
      Promise.all(AREAS.map((area) => api.igp(month, area.value).then((result) => ({ area: area.label, igp: result.igp })))),
      api.reasonsReport(from, to),
      api.compareReport(from, to),
      api.repeatRanking(from, to),
    ]).then(([total, areas, reasons, compare, repeat]) => setData({ total, areas, reasons, compare, repeat }))
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível montar o relatório."));
  }, [month]);
  // Folha para imprimir: sempre no tema claro e sem tema de cor (o papel e branco). Volta ao sair.
  useEffect(() => {
    const root = document.documentElement;
    const previous = { theme: root.dataset.theme, palette: root.dataset.palette };
    root.dataset.theme = "light";
    delete root.dataset.palette;
    return () => { if (previous.theme) root.dataset.theme = previous.theme; if (previous.palette) root.dataset.palette = previous.palette; };
  }, []);
  // Depois do titulo padrao do Shell (que roda depois deste componente).
  useEffect(() => { const timer = window.setTimeout(() => { document.title = `Relatório mensal ${month} · JH Telecom - Rede`; }, 0); return () => window.clearTimeout(timer); }, [month, data]);

  if (error) return <div className="mr-page"><p role="alert">{error}</p></div>;
  if (!data) return <div className="mr-page"><p role="status">Montando o relatório...</p></div>;
  const { total, areas, reasons, compare, repeat } = data;
  const plan = total.plan;
  const group = total.igp.total;
  return (
    <div className="mr-page">
      <div className="mr-toolbar"><button className="primary-button compact" type="button" onClick={() => window.print()}><Printer size={15} /> Imprimir / salvar em PDF</button><span>No diálogo de impressão, escolha "Salvar como PDF".</span></div>
      <header className="mr-header">
        <div><strong>JH Telecom · Rede O&amp;M</strong><span>Relatório mensal de operação</span></div>
        <h1>{monthName(month)}</h1>
        <small>Gerado em {new Date().toLocaleString("pt-BR")}{plan?.currentMonth ? ` · mês em andamento (dia ${plan.elapsedDays} de ${plan.daysInMonth})` : ""}</small>
      </header>

      <section className="mr-kpis">
        <article><span>Ordens finalizadas</span><strong>{group.orders.toLocaleString("pt-BR")}</strong><small>{compare.previous.finished ? `${compare.current.finished >= compare.previous.finished ? "+" : ""}${Math.round(((compare.current.finished - compare.previous.finished) / compare.previous.finished) * 100)}% vs mês anterior` : "sem mês anterior"}</small></article>
        <article className={plan?.onTime.target.met ? "is-met" : "is-missed"}><span>No prazo (até 6h)</span><strong>{pct(group.onTimePercent)}</strong><small>Meta {pct(plan?.onTime.target.goal)} · mínimo {pct(plan?.onTime.minimum.goal)}</small></article>
        <article className={plan?.outlier.target.met ? "is-met" : "is-missed"}><span>Outliers (acima de 9h)</span><strong>{pct(group.outlierPercent)}</strong><small>Meta até {pct(plan?.outlier.target.goal)}</small></article>
        <article className={plan?.mttr.target.met ? "is-met" : "is-missed"}><span>MTTR</span><strong>{hrs(group.mttrHours)}</strong><small>Meta até {hrs(plan?.mttr.target.goal)}</small></article>
      </section>
      {plan && plan.currentMonth && <p className="mr-note">{goalSentence("onTime", plan.onTime.target)} {goalSentence("outlier", plan.outlier.target)}</p>}

      <h2>Por área</h2>
      <table className="mr-table">
        <thead><tr><th>Área</th><th>Ordens</th><th>No prazo</th><th>Outliers</th><th>MTTR</th></tr></thead>
        <tbody>{areas.map((row) => <tr key={row.area}><td>{row.area}</td><td>{row.igp.total.orders.toLocaleString("pt-BR")}</td><td>{pct(row.igp.total.onTimePercent)}</td><td>{pct(row.igp.total.outlierPercent)}</td><td>{hrs(row.igp.total.mttrHours)}</td></tr>)}
          <tr className="mr-total"><td>Total</td><td>{group.orders.toLocaleString("pt-BR")}</td><td>{pct(group.onTimePercent)}</td><td>{pct(group.outlierPercent)}</td><td>{hrs(group.mttrHours)}</td></tr></tbody>
      </table>
      <p className="mr-note">Acesso: {total.igp.access.orders} ordens ({pct(total.igp.access.onTimePercent)} no prazo) {total.igp.backbone.orders ? <> · Backbone: {total.igp.backbone.orders} ordens ({pct(total.igp.backbone.onTimePercent)} no prazo)</> : null}.{total.igp.nocTxOrders ? ` ${total.igp.nocTxOrders} NOC TX fora do IGP.` : ""}{total.igp.excludedOrders ? ` ${total.igp.excludedOrders} ordem(ns) fora do cálculo.` : ""}</p>

      <h2>Comparação com o mês anterior</h2>
      <table className="mr-table">
        <thead><tr><th>Indicador</th><th>Este mês</th><th>Mês anterior</th></tr></thead>
        <tbody>
          <tr><td>Chamados abertos</td><td>{compare.current.opened}</td><td>{compare.previous.opened}</td></tr>
          <tr><td>Finalizados</td><td>{compare.current.finished}</td><td>{compare.previous.finished}</td></tr>
          <tr><td>% no prazo</td><td>{pct(compare.current.onTimePercent)}</td><td>{pct(compare.previous.onTimePercent)}</td></tr>
          <tr><td>% outliers</td><td>{pct(compare.current.outlierPercent)}</td><td>{pct(compare.previous.outlierPercent)}</td></tr>
          <tr><td>Tempo médio</td><td>{hrs(compare.current.avgHours)}</td><td>{hrs(compare.previous.avgHours)}</td></tr>
        </tbody>
      </table>

      <h2>Principais motivos de fechamento</h2>
      {reasons.reasons.length ? (
        <table className="mr-table">
          <thead><tr><th>Motivo</th><th>Chamados</th><th>Participação</th><th>Tempo médio</th></tr></thead>
          <tbody>{reasons.reasons.slice(0, 10).map((item) => <tr key={item.reason}><td>{item.reason}</td><td>{item.count}</td><td>{pct(item.percent)}</td><td>{hrs(item.avgHours)}</td></tr>)}</tbody>
        </table>
      ) : <p className="mr-note">Sem motivos de fechamento registrados no mês.</p>}

      <h2>Reincidência</h2>
      <p className="mr-note">{repeat.eligible ? <>{repeat.repeated} de {repeat.eligible} reparos ({pct(repeat.percent)}) tiveram outro chamado no mesmo endereço, OLT e slot/PON em até 30 dias.</> : "Sem reparos com endereço, OLT e slot/PON completos no mês."}</p>
      <footer className="mr-footer">Prazo: até 6h no prazo, acima de 9h outlier. Finalizados pela Data Fim, horário de São Paulo.</footer>
    </div>
  );
}
