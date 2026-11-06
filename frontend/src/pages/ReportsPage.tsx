import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ClipboardList, Copy, FileSpreadsheet, Minus, Timer } from "lucide-react";
import { api, type RepeatRanking, type BottleneckReport, type HeatmapReport, type StageStats, type CompareReport, type DailySummary, type LateCallRow, type PeriodMetrics, type ProductivityReport, type ProductivityRow, type ReasonsReport, type SlaArea } from "../api";
import { toOperationalDate } from "../dates";
import { KpiTile, Panel, formatCount, formatHours } from "../components/charts";

// Relatorios. Mesma regra de prazo de todo o sistema: ate 6h no prazo, acima de 6h fora, acima de 9h outlier.
// Finalizados contam pela Data Fim; abertos pela abertura.

type ReportType = "late-finished" | "productivity" | "reasons" | "compare" | "daily" | "bottlenecks" | "heatmap" | "repeat-ranking" | "monthly";
const REPORTS: { value: ReportType; label: string; description: string }[] = [
  { value: "late-finished", label: "Finalizados fora do prazo (acima de 6h)", description: "Chamados finalizados no período, pela Data Fim, que levaram mais de 6h entre a abertura e o fim. Acima de 9h é outlier." },
  { value: "productivity", label: "Produtividade por técnico e supervisor", description: "Finalizados no período por técnico e por supervisor, com quantos ficaram no prazo, fora e outliers, e o tempo médio." },
  { value: "reasons", label: "Motivos de fechamento", description: "Ranking dos motivos de fechamento dos finalizados no período, com submotivos, área e evolução por mês." },
  { value: "compare", label: "Comparar com o período anterior", description: "Os indicadores do período lado a lado com o período anterior de mesmo tamanho." },
  { value: "bottlenecks", label: "Gargalos: espera x atendimento", description: "Onde o tempo se perde nos finalizados do período: esperando técnico (da abertura à atribuição) ou em atendimento (da atribuição à Data Fim). Mediana e p90 (9 em cada 10 ficaram abaixo), por região e por técnico." },
  { value: "heatmap", label: "Mapa de calor por horário", description: "Por dia da semana e hora: chamados que entram, técnicos que finalizaram chamados e quantos chamados por técnico. Ajuda a montar escala e plantão." },
  { value: "repeat-ranking", label: "Reincidência por técnico", description: "Dos reparos finalizados no período, quantos tiveram outro chamado no mesmo endereço, OLT e slot/PON em até 30 dias depois da Data Fim (o reparo não segurou). % por técnico (ranking a partir de 5 reparos)." },
  { value: "monthly", label: "Relatório mensal (PDF)", description: "Relatório do mês para enviar ao contrato: indicadores contra as metas, por área, comparação com o mês anterior, motivos de fechamento e reincidência. Abre numa página para imprimir ou salvar em PDF." },
  { value: "daily", label: "Resumo do dia", description: "O resumo de um dia (o mesmo que vai no WhatsApp às 7h, com o dia anterior, quando ligado)." },
];
const AREAS: { value: SlaArea; label: string }[] = [
  { value: "ALL", label: "Todas as áreas" },
  { value: "SP", label: "C.8 São Paulo" },
  { value: "GRU", label: "C.12 Guarulhos" },
  { value: "ALTO_TIETE", label: "C.11 Alto Tietê" },
  { value: "ABC", label: "C.9 ABC" },
  { value: "OUTRAS", label: "Outras (sem cluster)" },
];
const AREA_LABEL: Record<string, string> = { SP: "São Paulo", GRU: "Guarulhos", ALTO_TIETE: "Alto Tietê", ABC: "ABC", OUTRAS: "Outras" };

const spDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
// 15,5 -> "15h30"
const duration = (hours: number | null) => { if (hours === null) return "–"; const minutes = Math.round(hours * 60); return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`; };
const brDate = (iso: string) => iso.split("-").reverse().join("/");
const pct = (value: number | null) => (value === null ? "–" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const monthLabel = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
const closing = (row: LateCallRow) => [row.closingReason, row.closingSubreason].filter(Boolean).join(" — ") || row.result;
const fileDate = (iso: string) => brDate(iso).replace(/\//g, "-");

function monthStart(today: string) { return `${today.slice(0, 8)}01`; }
function yesterday(today: string) { const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() - 1); return toOperationalDate(date); }

async function writeExcel(fileName: string, sheets: { name: string; rows: Record<string, unknown>[] }[]) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    if (!rows.length) continue;
    const sheet = XLSX.utils.json_to_sheet(rows);
    const headers = Object.keys(rows[0]);
    sheet["!cols"] = headers.map((key) => ({ wch: Math.min(40, Math.max(10, key.length + 2, ...rows.slice(0, 200).map((row) => String(row[key] ?? "").length))) }));
    XLSX.utils.book_append_sheet(book, sheet, name.slice(0, 31));
  }
  XLSX.writeFile(book, fileName);
}

export function ReportsPage() {
  const today = toOperationalDate();
  const [searchParams] = useSearchParams();
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const initialType = REPORTS.some((item) => item.value === searchParams.get("tipo")) ? searchParams.get("tipo") as ReportType : "late-finished";
  const [report, setReport] = useState<ReportType>(initialType);
  // Periodo pode vir no endereco (?de=AAAA-MM-DD&ate=AAAA-MM-DD), como na Analise de prazo.
  const [range, setRange] = useState(() => isoDate.test(searchParams.get("de") || "") && isoDate.test(searchParams.get("ate") || "") ? { from: searchParams.get("de")!, to: searchParams.get("ate")! } : { from: monthStart(today), to: today });
  const [area, setArea] = useState<SlaArea>("ALL");
  const [day, setDay] = useState(() => yesterday(today));
  const validRange = Boolean(range.from && range.to && range.from <= range.to);
  const current = REPORTS.find((item) => item.value === report)!;

  return (
    <div className="dv-dashboard sa-page rp-page">
      <div className="page-heading dv-heading">
        <div>
          <span className="section-kicker">INDICADORES</span>
          <h1>Relatórios</h1>
          <p>{current.description}</p>
        </div>
      </div>

      <div className="rp-filters">
        <label className="sa-area rp-type">Relatório<select value={report} onChange={(event) => setReport(event.target.value as ReportType)}>{REPORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        {report === "monthly" ? null : report === "daily" ? (
          <div className="sa-dates"><label>Dia<input type="date" value={day} max={today} onChange={(event) => setDay(event.target.value)} /></label></div>
        ) : (
          <div className="sa-dates">
            <label>De<input type="date" value={range.from} max={range.to || undefined} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label>
            <label>Até<input type="date" value={range.to} min={range.from || undefined} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label>
          </div>
        )}
        {report !== "daily" && report !== "monthly" && <label className="sa-area">Área<select value={area} onChange={(event) => setArea(event.target.value as SlaArea)}>{AREAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
      </div>

      {report === "monthly" ? <MonthlyLauncher />
        : report === "daily" ? (day ? <DailyReport date={day} /> : <div className="dv-empty">Escolha um dia.</div>)
        : !validRange ? <div className="dv-empty" role="status">Escolha um período válido: a data "De" não pode ser depois de "Até".</div>
        : report === "late-finished" ? <LateReport from={range.from} to={range.to} area={area} />
        : report === "productivity" ? <ProductivityView from={range.from} to={range.to} area={area} />
        : report === "reasons" ? <ReasonsView from={range.from} to={range.to} area={area} />
        : report === "repeat-ranking" ? <RepeatRankingView from={range.from} to={range.to} area={area} />
        : report === "bottlenecks" ? <BottleneckView from={range.from} to={range.to} area={area} />
        : report === "heatmap" ? <HeatmapView from={range.from} to={range.to} area={area} />
        : <CompareView from={range.from} to={range.to} area={area} />}
    </div>
  );
}

// Carrega um relatorio e cuida de carregando/erro.
function useReport<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    load().then((result) => { if (active) setData(result); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "Não foi possível gerar o relatório."); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}

function ReportState({ error }: { error: string }) {
  return error ? <div className="dv-empty is-error" role="alert">{error}</div> : <div className="dv-empty" role="status">Gerando o relatório...</div>;
}

function ExportButton({ onClick, disabled }: { onClick: () => Promise<void>; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return <button className="secondary-button compact" type="button" disabled={busy || disabled} onClick={() => { setBusy(true); void onClick().finally(() => setBusy(false)); }}><FileSpreadsheet size={15} /> {busy ? "Exportando..." : "Exportar Excel"}</button>;
}

// ---------- Finalizados fora do prazo ----------
function LateReport({ from, to, area }: { from: string; to: string; area: SlaArea }) {
  const { data, error } = useReport(() => api.lateFinishedReport(from, to, area).then((result) => result.calls), [from, to, area]);
  const summary = useMemo(() => {
    const list = data ?? [];
    const outliers = list.filter((row) => row.state === "outlier").length;
    const avg = list.length ? list.reduce((sum, row) => sum + row.hours, 0) / list.length : null;
    return { total: list.length, late: list.length - outliers, outliers, avg };
  }, [data]);
  if (!data) return <ReportState error={error} />;
  const exportExcel = () => writeExcel(`Finalizados fora do prazo ${fileDate(from)} a ${fileDate(to)}.xlsx`, [{ name: "Fora do prazo", rows: data.map((row) => ({
    Ordem: row.orderNumber, BDESK: row.bdesk, Tipo: row.type, Motivo: row.reason,
    "Área": AREA_LABEL[row.area] || row.area, "Região": row.region, Bairro: row.bairro, OLT: row.olt,
    "Técnico": row.technicianName, Supervisor: row.supervisorName,
    Abertura: spDateTime(row.openedAt), "Data Fim": spDateTime(row.executedAt),
    "Tempo (h)": row.hours, Tempo: duration(row.hours), Prazo: row.state === "outlier" ? "Outlier (> 9h)" : "Fora do prazo (6h a 9h)",
    "Motivo de fechamento": row.closingReason, Submotivo: row.closingSubreason, "Tipo do cabo": row.cableType, Resultado: row.result,
  })) }]);
  return <>
    <div className="dv-kpi-grid">
      <KpiTile label="Fora do prazo" value={formatCount(summary.total)} note={`Finalizados de ${brDate(from)} a ${brDate(to)} acima de 6h`} icon={ClipboardList} />
      <KpiTile label="Entre 6h e 9h" value={formatCount(summary.late)} note="Fora do prazo" icon={Timer} tone={summary.late ? "warning" : "default"} />
      <KpiTile label="Acima de 9h" value={formatCount(summary.outliers)} note="Outliers" icon={AlertTriangle} tone={summary.outliers ? "critical" : "default"} />
      <KpiTile label="Tempo médio" value={formatHours(summary.avg)} note="Da abertura à Data Fim, só destes chamados" icon={Timer} />
    </div>
    <Panel kicker="CHAMADOS" title="Finalizados fora do prazo" aside={<span className="rp-aside"><span className="sa-aside">Do mais demorado para o menos</span><ExportButton onClick={exportExcel} disabled={!data.length} /></span>}>
      {!data.length ? <div className="dv-empty">Nenhum chamado finalizado acima de 6h no período.</div> : (
        <div className="sa-table-wrap">
          <table className="sa-table rp-table">
            <thead><tr><th>Ordem</th><th>Técnico</th><th>Abertura</th><th>Data Fim</th><th>Tempo</th><th>Evento</th><th>Local</th><th>Fechamento</th></tr></thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id}>
                  <td><Link to={`/chamados/${row.id}`} className="rp-order">{row.orderNumber}</Link>{row.bdesk && <small>BDESK {row.bdesk}</small>}</td>
                  <td><strong>{row.technicianName || "Sem técnico"}</strong>{row.supervisorName && <small>{row.supervisorName}</small>}</td>
                  <td>{spDateTime(row.openedAt)}</td>
                  <td>{spDateTime(row.executedAt)}</td>
                  <td><span className={`rp-state is-${row.state}`}><b>{duration(row.hours)}</b><small>{row.state === "outlier" ? "Outlier" : "Fora do prazo"}</small></span></td>
                  <td><strong>{row.type}</strong>{row.reason && <small>{row.reason}</small>}</td>
                  <td><strong>{row.bairro || row.region || "Não informado"}</strong><small>{[AREA_LABEL[row.area], row.bairro ? row.region : ""].filter(Boolean).join(" · ")}</small></td>
                  <td>{closing(row) || "–"}{row.cableType && <small>Cabo {row.cableType}</small>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  </>;
}

// ---------- Produtividade ----------
function ProductivityTable({ rows, first }: { rows: ProductivityRow[]; first: string }) {
  if (!rows.length) return <div className="dv-empty">Nenhum chamado finalizado no período.</div>;
  return (
    <div className="sa-table-wrap">
      <table className="sa-table rp-table">
        <thead><tr><th>{first}</th><th>Finalizados</th><th>No prazo</th><th>Fora (6h–9h)</th><th>Outliers</th><th>% no prazo</th><th>Tempo médio</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td><strong>{row.name}</strong>{row.detail && <small>{row.detail}</small>}</td>
              <td>{row.finished}</td>
              <td>{row.onTime}</td>
              <td>{row.late}</td>
              <td>{row.outliers}</td>
              <td><span className="rp-meter"><span className="rp-meter-bar" aria-hidden="true"><i style={{ width: `${row.onTimePercent ?? 0}%` }} /></span>{pct(row.onTimePercent)}</span></td>
              <td>{duration(row.avgHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const productivitySheet = (rows: ProductivityRow[], first: string) => rows.map((row) => ({ [first]: row.name, ...(row.detail !== undefined ? { Supervisor: row.detail || "" } : {}), Finalizados: row.finished, "No prazo": row.onTime, "Fora (6h-9h)": row.late, Outliers: row.outliers, "% no prazo": row.onTimePercent, "Tempo médio (h)": row.avgHours }));

function ProductivityView({ from, to, area }: { from: string; to: string; area: SlaArea }) {
  const { data, error } = useReport<ProductivityReport>(() => api.productivityReport(from, to, area), [from, to, area]);
  if (!data) return <ReportState error={error} />;
  const withTech = data.technicians.filter((row) => row.name !== "Sem técnico");
  const best = [...withTech].filter((row) => row.finished >= 3).sort((a, b) => (b.onTimePercent ?? 0) - (a.onTimePercent ?? 0))[0];
  return <>
    <div className="dv-kpi-grid">
      <KpiTile label="Finalizados" value={formatCount(data.total)} note={`De ${brDate(from)} a ${brDate(to)}`} icon={ClipboardList} />
      <KpiTile label="Técnicos" value={formatCount(withTech.length)} note="Com ao menos 1 finalizado" icon={ClipboardList} />
      <KpiTile label="Mais finalizados" value={withTech[0]?.name || "–"} note={withTech[0] ? `${withTech[0].finished} finalizados` : "Nenhum"} icon={Timer} />
      <KpiTile label="Melhor % no prazo" value={best?.name || "–"} note={best ? `${pct(best.onTimePercent)} de ${best.finished} (mín. 3)` : "Ninguém com 3 ou mais"} icon={Timer} />
    </div>
    <Panel kicker="EQUIPE" title="Por técnico" aside={<span className="rp-aside"><ExportButton disabled={!data.total} onClick={() => writeExcel(`Produtividade ${fileDate(from)} a ${fileDate(to)}.xlsx`, [{ name: "Técnicos", rows: productivitySheet(data.technicians, "Técnico") }, { name: "Supervisores", rows: productivitySheet(data.supervisors.map(({ detail: _detail, ...row }) => row), "Supervisor") }])} /></span>}>
      <ProductivityTable rows={data.technicians} first="Técnico" />
    </Panel>
    <Panel kicker="EQUIPE" title="Por supervisor">
      <ProductivityTable rows={data.supervisors} first="Supervisor" />
    </Panel>
  </>;
}

// ---------- Motivos de fechamento ----------
function ReasonsView({ from, to, area }: { from: string; to: string; area: SlaArea }) {
  const { data, error } = useReport<ReasonsReport>(() => api.reasonsReport(from, to, area), [from, to, area]);
  if (!data) return <ReportState error={error} />;
  const top = data.reasons[0];
  const exportExcel = () => writeExcel(`Motivos de fechamento ${fileDate(from)} a ${fileDate(to)}.xlsx`, [
    { name: "Motivos", rows: data.reasons.map((item) => ({ Motivo: item.reason, Chamados: item.count, "%": item.percent, "Tempo médio (h)": item.avgHours, Submotivos: item.subreasons.map((sub) => `${sub.name} (${sub.count})`).join("; "), ...Object.fromEntries(Object.entries(item.byArea).map(([key, count]) => [AREA_LABEL[key] || key, count])) })) },
    { name: "Por mês", rows: data.byMonth.flatMap((month) => month.top.map((item) => ({ "Mês": month.month, Motivo: item.reason, Chamados: item.count, "Total do mês": month.total }))) },
  ]);
  return <>
    <div className="dv-kpi-grid">
      <KpiTile label="Finalizados" value={formatCount(data.total)} note={`De ${brDate(from)} a ${brDate(to)}`} icon={ClipboardList} />
      <KpiTile label="Com motivo" value={formatCount(data.withReason)} note={`${data.withoutReason} sem motivo de fechamento`} icon={ClipboardList} />
      <KpiTile label="Motivos diferentes" value={formatCount(data.reasons.length)} note="No período" icon={Timer} />
      <KpiTile label="Mais comum" value={top ? pct(top.percent) : "–"} note={top ? top.reason : "Nenhum"} icon={AlertTriangle} />
    </div>
    <Panel kicker="RANKING" title="Motivos de fechamento" aside={<span className="rp-aside"><ExportButton onClick={exportExcel} disabled={!data.reasons.length} /></span>}>
      {!data.reasons.length ? <div className="dv-empty">Nenhum finalizado com motivo de fechamento no período.</div> : (
        <div className="sa-table-wrap">
          <table className="sa-table rp-table">
            <thead><tr><th>Motivo</th><th>Chamados</th><th>Participação</th><th>Tempo médio</th><th>Submotivos</th><th>Por área</th></tr></thead>
            <tbody>
              {data.reasons.map((item) => (
                <tr key={item.reason}>
                  <td><strong>{item.reason}</strong></td>
                  <td>{item.count}</td>
                  <td><span className="rp-meter"><span className="rp-meter-bar" aria-hidden="true"><i style={{ width: `${item.percent ?? 0}%` }} /></span>{pct(item.percent)}</span></td>
                  <td>{duration(item.avgHours)}</td>
                  <td>{item.subreasons.length ? item.subreasons.slice(0, 3).map((sub) => `${sub.name} (${sub.count})`).join(", ") : "–"}</td>
                  <td>{Object.entries(item.byArea).sort((a, b) => b[1] - a[1]).map(([key, count]) => `${AREA_LABEL[key] || key} ${count}`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
    {data.byMonth.length > 1 && (
      <Panel kicker="EVOLUÇÃO" title="Principais motivos por mês">
        <div className="sa-table-wrap">
          <table className="sa-table rp-table">
            <thead><tr><th>Mês</th><th>Com motivo</th><th>Principais</th></tr></thead>
            <tbody>{data.byMonth.map((month) => <tr key={month.month}><td><strong>{monthLabel(month.month)}</strong></td><td>{month.total}</td><td>{month.top.map((item) => `${item.reason} (${item.count})`).join(", ")}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
    )}
  </>;
}

// ---------- Comparar periodos ----------
type CompareKey = "opened" | "finished" | "onTimePercent" | "outlierPercent" | "avgHours" | "outliers";
const COMPARE_ROWS: { key: CompareKey; label: string; better: "up" | "down" | "none"; format: (value: number | null) => string }[] = [
  { key: "opened", label: "Abertos", better: "none", format: (value) => formatCount(value ?? 0) },
  { key: "finished", label: "Finalizados", better: "up", format: (value) => formatCount(value ?? 0) },
  { key: "onTimePercent", label: "% no prazo (até 6h)", better: "up", format: pct },
  { key: "outlierPercent", label: "% outliers (acima de 9h)", better: "down", format: pct },
  { key: "outliers", label: "Outliers", better: "down", format: (value) => formatCount(value ?? 0) },
  { key: "avgHours", label: "Tempo médio", better: "down", format: duration },
];

function Delta({ current, previous, better, isPercent }: { current: number | null; previous: number | null; better: "up" | "down" | "none"; isPercent: boolean }) {
  if (current === null || previous === null) return <span className="rp-delta">–</span>;
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return <span className="rp-delta"><Minus size={14} aria-hidden="true" /> igual</span>;
  const up = diff > 0;
  const tone = better === "none" ? "" : (up === (better === "up") ? " is-good" : " is-bad");
  const text = isPercent ? `${up ? "+" : ""}${diff.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.` : previous ? `${up ? "+" : ""}${Math.round((diff / previous) * 100)}%` : `${up ? "+" : ""}${diff.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`;
  return <span className={`rp-delta${tone}`}>{up ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}{text}{tone === " is-good" ? " · melhorou" : tone === " is-bad" ? " · piorou" : ""}</span>;
}

function CompareView({ from, to, area }: { from: string; to: string; area: SlaArea }) {
  const { data, error } = useReport<CompareReport>(() => api.compareReport(from, to, area), [from, to, area]);
  if (!data) return <ReportState error={error} />;
  const label = (period: PeriodMetrics) => `${brDate(period.from)} a ${brDate(period.to)}`;
  return (
    <Panel kicker="COMPARAÇÃO" title={`${data.days} dia(s) contra os ${data.days} anteriores`} aside={<span className="rp-aside"><ExportButton onClick={() => writeExcel(`Comparação ${fileDate(from)} a ${fileDate(to)}.xlsx`, [{ name: "Comparação", rows: COMPARE_ROWS.map((row) => ({ Indicador: row.label, [label(data.current)]: data.current[row.key], [label(data.previous)]: data.previous[row.key] })) }])} /></span>}>
      <div className="sa-table-wrap">
        <table className="sa-table rp-table rp-compare">
          <thead><tr><th>Indicador</th><th>Este período<small>{label(data.current)}</small></th><th>Anterior<small>{label(data.previous)}</small></th><th>Variação</th></tr></thead>
          <tbody>
            {COMPARE_ROWS.map((row) => (
              <tr key={row.key}>
                <td><strong>{row.label}</strong></td>
                <td><b className="rp-compare-value">{row.format(data.current[row.key])}</b></td>
                <td>{row.format(data.previous[row.key])}</td>
                <td><Delta current={data.current[row.key]} previous={data.previous[row.key]} better={row.better} isPercent={row.key.endsWith("Percent")} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rp-note">Finalizados contam pela Data Fim e abertos pela abertura (cancelados fora). Verde = melhorou, vermelho = piorou.</p>
    </Panel>
  );
}

// ---------- Resumo do dia ----------
function DailyReport({ date }: { date: string }) {
  const { data, error } = useReport(() => api.dailySummary(date), [date]);
  const [copied, setCopied] = useState(false);
  if (!data) return <ReportState error={error} />;
  const summary: DailySummary = data.summary;
  return <>
    <div className="dv-kpi-grid">
      <KpiTile label="Abertos" value={formatCount(summary.opened)} note={`Em ${brDate(summary.date)}${summary.cancelled ? ` · ${summary.cancelled} cancelado(s)` : ""}`} icon={ClipboardList} />
      <KpiTile label="Finalizados" value={formatCount(summary.finished)} note={`${pct(summary.onTimePercent)} no prazo · tempo médio ${duration(summary.avgHours)}`} icon={Timer} />
      <KpiTile label="Outliers" value={formatCount(summary.outliers)} note={`${summary.late} entre 6h e 9h`} icon={AlertTriangle} tone={summary.outliers ? "critical" : "default"} />
      <KpiTile label="IGP do mês" value={pct(summary.igp.onTimePercent)} note={`${pct(summary.igp.outlierPercent)} outliers · ${summary.igp.orders} ordens`} icon={Timer} />
    </div>
    <Panel kicker="WHATSAPP" title="Texto do resumo" aside={<button className="secondary-button compact" type="button" onClick={() => void navigator.clipboard.writeText(data.text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); })}><Copy size={15} /> {copied ? "Copiado" : "Copiar texto"}</button>}>
      <pre className="rp-summary-text">{data.text}</pre>
      <p className="rp-note">{data.whatsapp.configured ? `Envio automático ligado: todo dia às ${data.whatsapp.sendsAt} vai o resumo do dia anterior.` : "Envio automático desligado: liga junto com o aviso de prazo, ao configurar o WuzAPI no Render (veja Integração OFS). Opcional: WUZAPI_REPORT_CHAT manda o resumo para outro grupo."}</p>
    </Panel>
  </>;
}

// ---------- Gargalos ----------
const mins = (value: number | null) => (value === null ? "–" : value < 60 ? `${Math.round(value)} min` : `${Math.floor(value / 60)}h${String(Math.round(value % 60)).padStart(2, "0")}`);
function StageTable({ rows, first }: { rows: StageStats[]; first: string }) {
  if (!rows.length) return <div className="dv-empty">Sem chamados suficientes (mínimo 3 por linha).</div>;
  return (
    <div className="sa-table-wrap">
      <table className="sa-table rp-table">
        <thead><tr><th>{first}</th><th>Chamados</th><th>Esperando técnico<small>mediana · p90</small></th><th>Em atendimento<small>mediana · p90</small></th><th>% do tempo esperando</th><th>Fora do prazo<small>por espera</small></th></tr></thead>
        <tbody>{rows.map((row) => (
          <tr key={row.name}>
            <td><strong>{row.name}</strong></td>
            <td>{row.calls}</td>
            <td><b>{mins(row.waitMedian)}</b><small>p90 {mins(row.waitP90)}</small></td>
            <td><b>{mins(row.execMedian)}</b><small>p90 {mins(row.execP90)}</small></td>
            <td><span className="rp-meter"><span className="rp-meter-bar" aria-hidden="true"><i style={{ width: `${row.waitShare ?? 0}%` }} /></span>{pct(row.waitShare)}</span></td>
            <td>{row.late}{row.late ? <small>{row.lateByWait} por espera</small> : null}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
const stageSheet = (rows: StageStats[], first: string) => rows.map((row) => ({ [first]: row.name, Chamados: row.calls, "Espera mediana (min)": row.waitMedian === null ? null : Math.round(row.waitMedian), "Espera p90 (min)": row.waitP90 === null ? null : Math.round(row.waitP90), "Atendimento mediana (min)": row.execMedian === null ? null : Math.round(row.execMedian), "Atendimento p90 (min)": row.execP90 === null ? null : Math.round(row.execP90), "% esperando": row.waitShare, "Fora do prazo": row.late, "Fora por espera": row.lateByWait }));

function BottleneckView({ from, to, area }: { from: string; to: string; area: SlaArea }) {
  const { data, error } = useReport<BottleneckReport>(() => api.bottleneckReport(from, to, area), [from, to, area]);
  if (!data) return <ReportState error={error} />;
  const total = data.total;
  return <>
    <div className="dv-kpi-grid">
      <KpiTile label="Esperando técnico" value={mins(total.waitMedian)} note={`Mediana · p90 ${mins(total.waitP90)}`} icon={Timer} tone={(total.waitMedian ?? 0) > 60 ? "warning" : "default"} />
      <KpiTile label="Em atendimento" value={mins(total.execMedian)} note={`Mediana · p90 ${mins(total.execP90)}`} icon={Timer} />
      <KpiTile label="Tempo esperando" value={pct(total.waitShare)} note="Do tempo total dos chamados" icon={ClipboardList} />
      <KpiTile label="Fora do prazo por espera" value={formatCount(total.lateByWait)} note={`De ${total.late} acima de 6h: mais da metade esperando técnico`} icon={AlertTriangle} tone={total.lateByWait ? "critical" : "default"} />
    </div>
    <Panel kicker="POR REGIÃO" title="Onde se espera mais por técnico" aside={<span className="rp-aside"><ExportButton disabled={!total.calls} onClick={() => writeExcel(`Gargalos ${fileDate(from)} a ${fileDate(to)}.xlsx`, [{ name: "Geral", rows: stageSheet([total], "Recorte") }, { name: "Por região", rows: stageSheet(data.byRegion, "Região") }, { name: "Por técnico", rows: stageSheet(data.byTechnician, "Técnico") }])} /></span>}>
      <StageTable rows={data.byRegion} first="Região" />
    </Panel>
    <Panel kicker="POR TÉCNICO" title="Quem demora mais em atendimento">
      <StageTable rows={data.byTechnician} first="Técnico" />
    </Panel>
    <p className="rp-note">Conta {total.calls} finalizados do período com horário de atribuição coerente (entre a abertura e a Data Fim). Mediana: metade ficou abaixo; p90: 9 em cada 10 ficaram abaixo.</p>
  </>;
}

// ---------- Mapa de calor ----------
type HeatMetric = "incoming" | "technicians" | "callsPerTechnician" | "latePercent";
const HEAT_METRICS: { value: HeatMetric; label: string; note: string }[] = [
  { value: "incoming", label: "Chamados que entram", note: "Média por dia, pela hora de abertura" },
  { value: "technicians", label: "Técnicos finalizando", note: "Técnicos diferentes que finalizaram chamados naquela hora (média por dia)" },
  { value: "callsPerTechnician", label: "Chamados por técnico", note: "Entradas ÷ técnicos finalizando: quanto maior, mais apertado" },
  { value: "latePercent", label: "% fora do prazo", note: "Dos finalizados que abriram naquela hora (mínimo 3)" },
];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function HeatmapView({ from, to, area }: { from: string; to: string; area: SlaArea }) {
  const { data, error } = useReport<HeatmapReport>(() => api.heatmapReport(from, to, area), [from, to, area]);
  const [metric, setMetric] = useState<HeatMetric>("incoming");
  if (!data) return <ReportState error={error} />;
  const grid = data[metric];
  const max = Math.max(0, ...grid.flat().map((value) => value ?? 0));
  const current = HEAT_METRICS.find((item) => item.value === metric)!;
  const show = (value: number | null) => (value === null || (value === 0 && metric !== "latePercent") ? "" : metric === "latePercent" ? `${Math.round(value)}` : value >= 10 ? value.toFixed(0) : value.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
  return (
    <Panel kicker="ESCALA" title="Mapa de calor por dia e hora" aside={<span className="rp-aside"><ExportButton disabled={!data.totalIncoming} onClick={() => writeExcel(`Mapa de calor ${fileDate(from)} a ${fileDate(to)}.xlsx`, HEAT_METRICS.map((item) => ({ name: item.label, rows: data[item.value].map((row, weekday) => ({ Dia: WEEKDAYS[weekday], ...Object.fromEntries(row.map((value, hour) => [`${hour}h`, value])) })) })))} /></span>}>
      <div className="hm-metrics" role="group" aria-label="O que mostrar">{HEAT_METRICS.map((item) => <button key={item.value} type="button" className={metric === item.value ? "is-active" : ""} aria-pressed={metric === item.value} onClick={() => setMetric(item.value)}>{item.label}</button>)}</div>
      <p className="rp-note">{current.note}. {data.totalIncoming.toLocaleString("pt-BR")} chamados no período.</p>
      <div className="hm-wrap">
        <table className={`hm-table is-${metric}`}>
          <thead><tr><th />{Array.from({ length: 24 }, (_, hour) => <th key={hour} scope="col">{hour}h</th>)}</tr></thead>
          <tbody>{grid.map((row, weekday) => (
            <tr key={weekday}><th scope="row">{WEEKDAYS[weekday]}</th>{row.map((value, hour) => {
              const level = value === null || !max ? 0 : value / max;
              return <td key={hour} className={level > 0.55 ? "is-strong" : ""} style={{ ["--hm" as string]: `${Math.round(level * 100)}%` }} title={`${WEEKDAYS[weekday]} ${hour}h: ${value === null ? "sem dados" : show(value)}${metric === "latePercent" && value !== null ? "%" : ""}`}>{show(value)}</td>;
            })}</tr>
          ))}</tbody>
        </table>
      </div>
    </Panel>
  );
}

// ---------- Reincidencia por tecnico ----------
function RepeatRankingView({ from, to, area }: { from: string; to: string; area: SlaArea }) {
  const { data, error } = useReport<RepeatRanking>(() => api.repeatRanking(from, to, area), [from, to, area]);
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <ReportState error={error} />;
  const ranked = data.technicians.filter((row) => row.eligible >= 5);
  const worst = ranked[0];
  return <>
    <div className="dv-kpi-grid">
      <KpiTile label="Reparos com ponto completo" value={formatCount(data.eligible)} note={`De ${data.finished} finalizados (endereço, OLT e slot/PON)`} icon={ClipboardList} />
      <KpiTile label="Voltaram em 30 dias" value={formatCount(data.repeated)} note={pct(data.percent)} icon={AlertTriangle} tone={data.repeated ? "warning" : "default"} />
      <KpiTile label="Maior reincidência" value={worst?.name || "–"} note={worst ? `${pct(worst.percent)} de ${worst.eligible} reparos` : "Ninguém com 5 ou mais"} icon={Timer} />
    </div>
    <Panel kicker="RANKING" title="Reincidência por técnico" aside={<span className="rp-aside"><ExportButton disabled={!data.technicians.length} onClick={() => writeExcel(`Reincidência por técnico ${fileDate(from)} a ${fileDate(to)}.xlsx`, [{ name: "Técnicos", rows: data.technicians.map((row) => ({ "Técnico": row.name, Finalizados: row.finished, "Com ponto completo": row.eligible, "Voltaram em 30 dias": row.repeated, "%": row.percent })) }, { name: "Reparos que voltaram", rows: data.technicians.flatMap((row) => row.items.map((item) => ({ "Técnico": row.name, Ordem: item.orderNumber, "Voltou como": item.nextOrder, "Dias depois": item.days }))) }])} /></span>}>
      {!data.technicians.length ? <div className="dv-empty">Nenhum reparo finalizado no período.</div> : (
        <div className="sa-table-wrap">
          <table className="sa-table rp-table">
            <thead><tr><th>Técnico</th><th>Finalizados</th><th>Com ponto completo</th><th>Voltaram em 30 dias</th><th>%</th><th aria-label="Ver ordens" /></tr></thead>
            <tbody>{data.technicians.map((row) => (
              <Fragment key={row.name}>
                <tr className={row.eligible < 5 ? "rp-muted-row" : ""}>
                  <td><strong>{row.name}</strong>{row.eligible < 5 && <small>menos de 5 reparos: fora do ranking</small>}</td>
                  <td>{row.finished}</td><td>{row.eligible}</td><td>{row.repeated}</td>
                  <td><span className="rp-meter"><span className="rp-meter-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (row.percent ?? 0) * 2)}%` }} /></span>{pct(row.percent)}</span></td>
                  <td>{row.items.length > 0 && <button type="button" className="link-button" onClick={() => setOpen(open === row.name ? null : row.name)} aria-expanded={open === row.name}>{open === row.name ? "Esconder" : "Ver ordens"}</button>}</td>
                </tr>
                {open === row.name && <tr><td colSpan={6}><ul className="rp-repeat-list">{row.items.map((item) => <li key={item.id}><Link to={`/chamados/${item.id}`} className="rp-order">{item.orderNumber}</Link> voltou como <Link to={`/chamados/${item.nextId}`} className="rp-order">{item.nextOrder}</Link> {item.days.toLocaleString("pt-BR")} dia(s) depois</li>)}</ul></td></tr>}
              </Fragment>
            ))}</tbody>
          </table>
        </div>
      )}
    </Panel>
  </>;
}

// ---------- Relatorio mensal (PDF) ----------
function MonthlyLauncher() {
  const thisMonth = toOperationalDate().slice(0, 7);
  const [month, setMonth] = useState(() => { const date = new Date(`${thisMonth}-15T12:00:00`); date.setMonth(date.getMonth() - 1); return toOperationalDate(date).slice(0, 7); });
  return (
    <Panel kicker="PDF" title="Relatório mensal">
      <div className="rp-monthly">
        <label className="sa-area">Mês<input type="month" value={month} max={thisMonth} onChange={(event) => setMonth(event.target.value)} /></label>
        <a className="primary-button compact" href={`/relatorio-mensal/${month}`} target="_blank" rel="noreferrer"><FileSpreadsheet size={15} /> Abrir para imprimir / PDF</a>
      </div>
      <p className="rp-note">Abre o relatório numa aba nova, no formato de folha A4. Use "Imprimir" e escolha "Salvar como PDF". O mês atual sai como parcial.</p>
    </Panel>
  );
}
