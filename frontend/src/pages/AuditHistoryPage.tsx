import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileSpreadsheet, Search } from "lucide-react";
import { api, type AuditLogRow } from "../api";
import { toOperationalDate } from "../dates";
import { Panel } from "../components/charts";

// Historico de alteracoes de todos os chamados: quem mudou o que, quando, e o valor antes e depois.
// Mesma permissao da aba Auditoria do chamado (calls.view_logs). Ate 2000 registros por periodo.

const FIELD_LABEL: Record<string, string> = {
  status: "Status", technicianId: "Técnico", result: "Resultado", executedAt: "Data Fim", notes: "Observações", openedAt: "Abertura",
  orderNumber: "Ordem", bdesk: "BDESK", officeTrack: "Office Track", client: "Cliente", type: "Tipo", reason: "Motivo", region: "Região",
  city: "Cidade", address: "Endereço", bairro: "Bairro", olt: "OLT", slotPon: "Slot/PON", ofsStatus: "Status OFS", closingReason: "Motivo de fechamento",
  closingSubreason: "Submotivo", cableType: "Tipo do cabo", cluster: "Cluster",
};
const label = (field: string) => FIELD_LABEL[field] || field;
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const daysAgo = (today: string, days: number) => { const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() - days); return toOperationalDate(date); };
// Datas ISO viram data/hora legivel; o resto fica como esta.
const value = (text: string) => (/^\d{4}-\d{2}-\d{2}T/.test(text) && Number.isFinite(Date.parse(text)) ? when(text) : text);

export function AuditHistoryPage() {
  const today = toOperationalDate();
  const [range, setRange] = useState({ from: daysAgo(today, 6), to: today });
  const [data, setData] = useState<{ logs: AuditLogRow[]; truncated: boolean } | null>(null);
  const [error, setError] = useState("");
  const [person, setPerson] = useState("");
  const [field, setField] = useState("");
  const [query, setQuery] = useState("");
  const validRange = Boolean(range.from && range.to && range.from <= range.to);

  useEffect(() => {
    if (!validRange) return;
    let active = true;
    setData(null);
    setError("");
    api.auditHistory(range.from, range.to).then((result) => { if (active) setData(result); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar o histórico."); });
    return () => { active = false; };
  }, [range.from, range.to, validRange]);

  const people = useMemo(() => [...new Set((data?.logs ?? []).map((log) => log.userName))].sort((a, b) => a.localeCompare(b, "pt-BR")), [data]);
  const fields = useMemo(() => [...new Set((data?.logs ?? []).map((log) => log.field))].sort((a, b) => label(a).localeCompare(label(b), "pt-BR")), [data]);
  const visible = (data?.logs ?? []).filter((log) => (!person || log.userName === person) && (!field || log.field === field) && (!query.trim() || `${log.orderNumber} ${log.previousValue} ${log.newValue} ${log.action}`.toLowerCase().includes(query.trim().toLowerCase())));

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const rows = visible.map((log) => ({ Quando: when(log.createdAt), Pessoa: log.userName, Ordem: log.orderNumber, "Ação": log.action, Campo: label(log.field), Antes: value(log.previousValue), Depois: value(log.newValue) }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [{ wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 26 }, { wch: 18 }, { wch: 40 }, { wch: 40 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Histórico");
    XLSX.writeFile(book, `Histórico de alterações ${range.from} a ${range.to}.xlsx`);
  }

  return (
    <div className="dv-dashboard sa-page rp-page">
      <div className="page-heading dv-heading">
        <div>
          <span className="section-kicker">ADMINISTRAÇÃO</span>
          <h1>Histórico de alterações</h1>
          <p>Quem mudou o quê em cada chamado, e quando: status, técnico, datas, resultado e os demais campos, com o valor de antes e o de depois.</p>
        </div>
        <button className="secondary-button compact" type="button" onClick={() => void exportExcel()} disabled={!visible.length}><FileSpreadsheet size={15} /> Exportar Excel</button>
      </div>

      <div className="rp-filters">
        <div className="sa-dates">
          <label>De<input type="date" value={range.from} max={range.to || undefined} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label>
          <label>Até<input type="date" value={range.to} min={range.from || undefined} max={today} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label>
        </div>
        <label className="sa-area">Pessoa<select value={person} onChange={(event) => setPerson(event.target.value)}><option value="">Todas</option>{people.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="sa-area">Campo<select value={field} onChange={(event) => setField(event.target.value)}><option value="">Todos</option>{fields.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label className="search-field au-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ordem ou valor" aria-label="Buscar por ordem ou valor" /></label>
      </div>

      {!validRange ? <div className="dv-empty">Escolha um período válido.</div>
        : error ? <div className="dv-empty is-error" role="alert">{error}</div>
        : !data ? <div className="dv-empty" role="status">Carregando...</div>
        : (
          <Panel kicker="ALTERAÇÕES" title={`${visible.length.toLocaleString("pt-BR")} registro(s)`} aside={data.truncated ? <span className="sa-aside">Mostrando os 2.000 mais recentes: escolha um período menor para ver todos.</span> : undefined}>
            {!visible.length ? <div className="dv-empty">Nenhuma alteração com esses filtros.</div> : (
              <div className="sa-table-wrap">
                <table className="sa-table rp-table au-table">
                  <thead><tr><th>Quando</th><th>Pessoa</th><th>Ordem</th><th>O que mudou</th><th>Antes</th><th>Depois</th></tr></thead>
                  <tbody>
                    {visible.map((log) => (
                      <tr key={log.id}>
                        <td>{when(log.createdAt)}</td>
                        <td><strong>{log.userName}</strong></td>
                        <td>{log.orderNumber ? <Link to={`/chamados/${log.callId}`} className="rp-order">{log.orderNumber}</Link> : "–"}</td>
                        <td><strong>{label(log.field)}</strong><small>{log.action}</small></td>
                        <td className="au-value">{value(log.previousValue) || <span className="muted-cell">vazio</span>}</td>
                        <td className="au-value">{value(log.newValue) || <span className="muted-cell">vazio</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
    </div>
  );
}
