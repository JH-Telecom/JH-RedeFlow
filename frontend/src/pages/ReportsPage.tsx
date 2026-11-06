import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ClipboardList, FileSpreadsheet, Timer } from "lucide-react";
import { api, type LateCallRow, type SlaArea } from "../api";
import { toOperationalDate } from "../dates";
import { KpiTile, Panel, formatCount, formatHours } from "../components/charts";

// Relatorios. Primeiro tipo: chamados finalizados (pela Data Fim) que passaram de 6h entre abertura e fim.
// Mesma regra da Analise de prazo: acima de 6h = fora do prazo; acima de 9h = outlier.

type ReportType = "late-finished";
const REPORTS: { value: ReportType; label: string; description: string }[] = [
  { value: "late-finished", label: "Finalizados fora do prazo (acima de 6h)", description: "Chamados finalizados no período, pela Data Fim, que levaram mais de 6h entre a abertura e o fim. Acima de 9h é outlier." },
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
const duration = (hours: number) => { const minutes = Math.round(hours * 60); return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`; };
const brDate = (iso: string) => iso.split("-").reverse().join("/");
const closing = (row: LateCallRow) => [row.closingReason, row.closingSubreason].filter(Boolean).join(" — ") || row.result;

function monthStart(today: string) { return `${today.slice(0, 8)}01`; }

export function ReportsPage() {
  const today = toOperationalDate();
  const [report, setReport] = useState<ReportType>("late-finished");
  // Periodo pode vir no endereco (?de=AAAA-MM-DD&ate=AAAA-MM-DD), como na Analise de prazo.
  const [searchParams] = useSearchParams();
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const [range, setRange] = useState(() => isoDate.test(searchParams.get("de") || "") && isoDate.test(searchParams.get("ate") || "") ? { from: searchParams.get("de")!, to: searchParams.get("ate")! } : { from: monthStart(today), to: today });
  const [area, setArea] = useState<SlaArea>("ALL");
  const [rows, setRows] = useState<LateCallRow[] | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const validRange = Boolean(range.from && range.to && range.from <= range.to);

  useEffect(() => {
    if (!validRange) return;
    let active = true;
    setRows(null);
    setError("");
    api.lateFinishedReport(range.from, range.to, area)
      .then((data) => { if (active) setRows(data.calls); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Não foi possível gerar o relatório."); });
    return () => { active = false; };
  }, [range.from, range.to, area, validRange]);

  const summary = useMemo(() => {
    const list = rows ?? [];
    const outliers = list.filter((row) => row.state === "outlier").length;
    const avg = list.length ? list.reduce((sum, row) => sum + row.hours, 0) / list.length : null;
    return { total: list.length, late: list.length - outliers, outliers, avg };
  }, [rows]);

  async function exportExcel() {
    if (!rows?.length) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const data = rows.map((row) => ({
        Ordem: row.orderNumber, BDESK: row.bdesk, Tipo: row.type, Motivo: row.reason,
        "Área": AREA_LABEL[row.area] || row.area, "Região": row.region, Bairro: row.bairro, OLT: row.olt,
        "Técnico": row.technicianName, Supervisor: row.supervisorName,
        Abertura: spDateTime(row.openedAt), "Data Fim": spDateTime(row.executedAt),
        "Tempo (h)": row.hours, Tempo: duration(row.hours), Prazo: row.state === "outlier" ? "Outlier (> 9h)" : "Fora do prazo (6h a 9h)",
        "Motivo de fechamento": row.closingReason, Submotivo: row.closingSubreason, "Tipo do cabo": row.cableType, Resultado: row.result,
      }));
      const sheet = XLSX.utils.json_to_sheet(data);
      const headers = Object.keys(data[0]);
      sheet["!cols"] = headers.map((key) => ({ wch: Math.min(40, Math.max(10, key.length + 2, ...data.slice(0, 200).map((row) => String((row as Record<string, unknown>)[key] ?? "").length))) }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Fora do prazo");
      XLSX.writeFile(book, `Finalizados fora do prazo ${brDate(range.from).replace(/\//g, "-")} a ${brDate(range.to).replace(/\//g, "-")}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível exportar o relatório.");
    } finally {
      setExporting(false);
    }
  }

  const current = REPORTS.find((item) => item.value === report)!;
  return (
    <div className="dv-dashboard sa-page rp-page">
      <div className="page-heading dv-heading">
        <div>
          <span className="section-kicker">INDICADORES</span>
          <h1>Relatórios</h1>
          <p>{current.description}</p>
        </div>
        <button className="secondary-button compact" type="button" onClick={() => void exportExcel()} disabled={exporting || !rows?.length} title="Exportar o relatório em Excel">
          <FileSpreadsheet size={15} /> {exporting ? "Exportando..." : "Exportar Excel"}
        </button>
      </div>

      <div className="rp-filters">
        <label className="sa-area rp-type">Relatório<select value={report} onChange={(event) => setReport(event.target.value as ReportType)}>{REPORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <div className="sa-dates">
          <label>De<input type="date" value={range.from} max={range.to || undefined} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label>
          <label>Até<input type="date" value={range.to} min={range.from || undefined} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label>
        </div>
        <label className="sa-area">Área<select value={area} onChange={(event) => setArea(event.target.value as SlaArea)}>{AREAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>

      {!validRange ? <div className="dv-empty" role="status">Escolha um período válido: a data "De" não pode ser depois de "Até".</div>
        : error ? <div className="dv-empty is-error" role="alert">{error}</div>
        : !rows ? <div className="dv-empty" role="status">Gerando o relatório...</div>
        : <>
          <div className="dv-kpi-grid">
            <KpiTile label="Fora do prazo" value={formatCount(summary.total)} note={`Finalizados de ${brDate(range.from)} a ${brDate(range.to)} acima de 6h`} icon={ClipboardList} />
            <KpiTile label="Entre 6h e 9h" value={formatCount(summary.late)} note="Fora do prazo" icon={Timer} tone={summary.late ? "warning" : "default"} />
            <KpiTile label="Acima de 9h" value={formatCount(summary.outliers)} note="Outliers" icon={AlertTriangle} tone={summary.outliers ? "critical" : "default"} />
            <KpiTile label="Tempo médio" value={formatHours(summary.avg)} note="Da abertura à Data Fim, só destes chamados" icon={Timer} />
          </div>

          <Panel kicker="CHAMADOS" title="Finalizados fora do prazo" aside={<span className="sa-aside">Do mais demorado para o menos</span>}>
            {!rows.length ? <div className="dv-empty">Nenhum chamado finalizado acima de 6h no período.</div> : (
              <div className="sa-table-wrap">
                <table className="sa-table rp-table">
                  <thead><tr><th>Ordem</th><th>Técnico</th><th>Abertura</th><th>Data Fim</th><th>Tempo</th><th>Evento</th><th>Local</th><th>Fechamento</th></tr></thead>
                  <tbody>
                    {rows.map((row) => (
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
        </>}
    </div>
  );
}
