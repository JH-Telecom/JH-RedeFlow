import { useState } from "react";
import { DownloadCloud } from "lucide-react";
import { api } from "../api";
import { toOperationalDate } from "../dates";

// Exportacao completa (Configuracoes, so administrador): chamados, observacoes e historico de alteracoes de um
// periodo numa planilha so, para guardar fora do sistema. Ate 366 dias por vez.
const daysAgo = (days: number) => { const date = new Date(); date.setDate(date.getDate() - days); return toOperationalDate(date); };
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

export function FullExportPanel() {
  const [from, setFrom] = useState(daysAgo(90));
  const [to, setTo] = useState(toOperationalDate());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function run() {
    setBusy(true); setMessage(""); setError("");
    try {
      const data = await api.fullExport(from, to);
      const XLSX = await import("xlsx");
      const book = XLSX.utils.book_new();
      const orders = new Map(data.calls.map((call) => [call.id, call.orderNumber]));
      const sheet = (name: string, rows: Record<string, unknown>[]) => XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Aviso: "Sem registros no período" }]), name);
      sheet("Chamados", data.calls.map((call) => ({
        Ordem: call.orderNumber, BDESK: call.bdesk, "Office Track": call.officeTrack, Cliente: call.client, Tipo: call.type, Motivo: call.reason,
        "Região": call.region, Cidade: call.city, Bairro: call.bairro ?? "", "Endereço": call.address ?? "", OLT: call.olt, "Slot/PON": call.slotPon, Cluster: call.cluster ?? "",
        Status: call.status, "Status OFS": call.ofsStatus ?? "", "Técnico": call.technicianName ?? "", Supervisor: call.supervisorName ?? "",
        Abertura: when(call.openedAt), "Atribuição": when(call.assignedAt), "Data Fim": when(call.executedAt), Resultado: call.result ?? "",
        "Motivo de fechamento": call.closingReason ?? "", Submotivo: call.closingSubreason ?? "", "Tipo do cabo": call.cableType ?? "", "Cancelamento": call.cancellationReason ?? "", "Observações do chamado": call.notes,
      })));
      sheet("Observações", data.observations.map((item) => ({ Quando: when(item.createdAt), Ordem: orders.get(item.callId) ?? item.callId, Pessoa: item.userName, Texto: item.text, Anexos: item.attachments })));
      sheet("Histórico", data.logs.map((log) => ({ Quando: when(log.createdAt), Ordem: log.orderNumber || orders.get(log.callId) || log.callId, Pessoa: log.userName, "Ação": log.action, Campo: log.field, Antes: log.previousValue, Depois: log.newValue })));
      XLSX.writeFile(book, `RedeFlow exportação ${from} a ${to}.xlsx`);
      setMessage(`Planilha gerada: ${data.calls.length} chamados, ${data.observations.length} observações e ${data.logs.length} alterações.${data.truncated ? " Atenção: o período tem mais registros que o limite (50 mil); exporte em partes menores." : ""}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível exportar."); }
    finally { setBusy(false); }
  }

  return (
    <section className="panel fx-panel" aria-labelledby="fx-title">
      <div><span className="section-kicker">BACKUP</span><h2 id="fx-title">Exportar tudo</h2><p className="rp-note">Chamados abertos ou finalizados no período, todas as observações (anexos só pelo nome) e o histórico de alterações, numa planilha com três abas. Até 366 dias por vez.</p></div>
      <div className="fx-row">
        <label>De<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Até<input type="date" value={to} min={from} max={toOperationalDate()} onChange={(event) => setTo(event.target.value)} /></label>
        <button className="primary-button compact" type="button" disabled={busy || !from || !to || from > to} onClick={() => void run()}><DownloadCloud size={15} /> {busy ? "Exportando..." : "Exportar planilha"}</button>
      </div>
      {error ? <div className="form-error" role="alert">{error}</div> : message && <div className="save-message" role="status">{message}</div>}
    </section>
  );
}
