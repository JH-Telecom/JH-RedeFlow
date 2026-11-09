import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileSpreadsheet, Search } from "lucide-react";
import { api, type AuditLogRow, type PersonCard } from "../api";
import { toOperationalDate } from "../dates";
import { Panel } from "../components/charts";
import { Pager } from "../components/Pager";

// Historico de alteracoes de todos os chamados: quem mudou o que, quando, e o valor antes e depois.
// Mesma permissao da aba Auditoria do chamado (calls.view_logs). 100 por pagina, filtros aplicados no servidor.

const FIELD_LABEL: Record<string, string> = {
  status: "Status", technicianId: "Técnico", result: "Resultado", executedAt: "Data Fim", notes: "Observações do chamado", openedAt: "Abertura",
  observations: "Observação", orderNumber: "Ordem", bdesk: "BDESK", officeTrack: "Office Track", client: "Cliente", type: "Tipo", reason: "Motivo",
  region: "Região", city: "Cidade", address: "Endereço", bairro: "Bairro", olt: "OLT", slotPon: "Slot/PON", ofsStatus: "Status OFS",
  closingReason: "Motivo de fechamento", closingSubreason: "Submotivo", cableType: "Tipo do cabo", cluster: "Cluster",
};
const label = (field: string) => FIELD_LABEL[field] || field;
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const daysAgo = (today: string, days: number) => { const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() - days); return toOperationalDate(date); };
const PAGE_SIZE = 100;

export function AuditHistoryPage() {
  const today = toOperationalDate();
  const [range, setRange] = useState({ from: daysAgo(today, 6), to: today });
  const [userId, setUserId] = useState("");
  const [field, setField] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ logs: AuditLogRow[]; total: number; totalPages: number } | null>(null);
  const [error, setError] = useState("");
  const [people, setPeople] = useState<PersonCard[]>([]);
  const [technicians, setTechnicians] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const validRange = Boolean(range.from && range.to && range.from <= range.to);

  useEffect(() => { api.people().then((result) => setPeople(result.people)).catch(() => undefined); }, []);
  // Tecnico aparece pelo nome (o historico guarda o id).
  useEffect(() => { api.technicians().then((result) => setTechnicians(Object.fromEntries(result.technicians.map((tech) => [tech.id, tech.name])))).catch(() => undefined); }, []);
  // Busca so depois de parar de digitar.
  useEffect(() => { const timer = window.setTimeout(() => setSearch(query.trim()), 400); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => { setPage(1); }, [range.from, range.to, userId, field, search]);
  useEffect(() => {
    if (!validRange) return;
    let active = true;
    setData(null);
    setError("");
    api.auditHistory({ from: range.from, to: range.to, page, pageSize: PAGE_SIZE, userId, field, q: search }).then((result) => { if (active) setData(result); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar o histórico."); });
    return () => { active = false; };
  }, [range.from, range.to, page, userId, field, search, validRange]);

  const show = (log: AuditLogRow, text: string) => {
    if (!text) return "";
    if (log.field === "technicianId") return technicians[text] || text;
    return /^\d{4}-\d{2}-\d{2}T/.test(text) && Number.isFinite(Date.parse(text)) ? when(text) : text;
  };

  async function exportExcel() {
    setExporting(true);
    try {
      const result = await api.auditHistory({ from: range.from, to: range.to, page: 1, pageSize: 2000, userId, field, q: search });
      const XLSX = await import("xlsx");
      const rows = result.logs.map((log) => ({ Quando: when(log.createdAt), Pessoa: log.userName, Ordem: log.orderNumber, "Ação": log.action, Campo: label(log.field), Antes: show(log, log.previousValue), Depois: show(log, log.newValue) }));
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = [{ wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 26 }, { wch: 18 }, { wch: 40 }, { wch: 40 }];
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Histórico");
      XLSX.writeFile(book, `Histórico de alterações ${range.from} a ${range.to}.xlsx`);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível exportar."); }
    finally { setExporting(false); }
  }

  const from = data && data.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = data ? Math.min(data.total, page * PAGE_SIZE) : 0;
  return (
    <div className="dv-dashboard sa-page rp-page">
      <div className="page-heading dv-heading">
        <div>
          <span className="section-kicker">ADMINISTRAÇÃO</span>
          <h1>Histórico de alterações</h1>
          <p>Quem mudou o quê em cada chamado, e quando: status, técnico, datas, resultado e os demais campos, com o valor de antes e o de depois.</p>
        </div>
        <button className="secondary-button compact" type="button" onClick={() => void exportExcel()} disabled={exporting || !data?.total} title="Exporta até 2.000 registros com os filtros atuais"><FileSpreadsheet size={15} /> {exporting ? "Exportando..." : "Exportar Excel"}</button>
      </div>

      <div className="rp-filters">
        <div className="sa-dates">
          <label>De<input type="date" value={range.from} max={range.to || undefined} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label>
          <label>Até<input type="date" value={range.to} min={range.from || undefined} max={today} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label>
        </div>
        <label className="sa-area">Pessoa<select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Todas</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label className="sa-area">Campo<select value={field} onChange={(event) => setField(event.target.value)}><option value="">Todos</option>{Object.entries(FIELD_LABEL).sort((a, b) => a[1].localeCompare(b[1], "pt-BR")).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
        <label className="search-field au-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ordem ou valor" aria-label="Buscar por ordem ou valor" /></label>
      </div>

      {!validRange ? <div className="dv-empty">Escolha um período válido.</div>
        : error ? <div className="dv-empty is-error" role="alert">{error}</div>
        : !data ? <div className="dv-empty" role="status">Carregando...</div>
        : (
          <Panel kicker="ALTERAÇÕES" title={`${data.total.toLocaleString("pt-BR")} registro(s)`} aside={data.totalPages > 1 ? <span className="sa-aside">100 por página</span> : undefined}>
            {!data.logs.length ? <div className="dv-empty">Nenhuma alteração com esses filtros.</div> : <>
              <div className="sa-table-wrap">
                <table className="sa-table rp-table au-table">
                  <thead><tr><th>Quando</th><th>Pessoa</th><th>Ordem</th><th>O que mudou</th><th>Antes</th><th>Depois</th></tr></thead>
                  <tbody>
                    {data.logs.map((log) => (
                      <tr key={log.id}>
                        <td>{when(log.createdAt)}</td>
                        <td><strong>{log.userName}</strong></td>
                        <td>{log.orderNumber ? <Link to={`/chamados/${log.callId}`} className="rp-order">{log.orderNumber}</Link> : "–"}</td>
                        <td><strong>{label(log.field)}</strong><small>{log.action}</small></td>
                        <td className="au-value">{show(log, log.previousValue) || <span className="muted-cell">vazio</span>}</td>
                        <td className="au-value">{show(log, log.newValue) || <span className="muted-cell">vazio</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={page} totalPages={data.totalPages} total={data.total} from={from} to={to} setPage={setPage} noun={["registro", "registros"]} />
            </>}
          </Panel>
        )}
    </div>
  );
}
