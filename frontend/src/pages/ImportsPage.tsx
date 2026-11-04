import { useEffect, useState } from "react";
import { ChevronRight, ClipboardList, Trash2 } from "lucide-react";
import { api, type HistoricalActivationImportPreview, type CurrentCallsImportPreview, type D0BaseSummary } from "../api";

export function CurrentCallsImportPanel() {
  const [preview, setPreview] = useState<CurrentCallsImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [importedMessage, setImportedMessage] = useState("");
  const [error, setError] = useState("");

  async function selectCurrentCallsFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setPreview(null);
    setImportedMessage("");
    setError("");
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("Nao foi possivel ler o arquivo."));
        reader.readAsDataURL(file);
      });
      setPreview(await api.previewCurrentCallsImport(file.name, contentBase64));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel preparar a previa.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCurrentCallsImport() {
    if (!preview?.canWrite || !preview.importableRows || preview.unmatchedTechnicians.length) return;
    const accepted = window.confirm(`Importar ${preview.importableRows.toLocaleString("pt-BR")} chamados com os status da planilha em ${preview.target}? Os registros ja existentes e as ordens repetidas serao ignorados.`);
    if (!accepted) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.confirmCurrentCallsImport(preview.previewId);
      setImportedMessage(`${result.imported.toLocaleString("pt-BR")} chamados importados; ${result.skippedAlreadyPresent.toLocaleString("pt-BR")} ja existiam ou foram ignorados.`);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel importar os chamados.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel historical-import-panel">
    <div className="panel-heading">
      <div><span className="section-kicker">BASE OPERACIONAL</span><h2>Importar chamados atuais</h2><p>Pré-visualize a planilha antes de inserir os chamados e seus status.</p></div>
      <label className={`primary-button compact file-button ${busy ? "is-disabled" : ""}`}><ClipboardList size={15}/>{busy ? "Analisando..." : "Selecionar XLSX"}<input type="file" accept=".xlsx,.xls" onChange={(event) => void selectCurrentCallsFile(event)} disabled={busy}/></label>
    </div>
    {error && <div className="form-error import-error">{error}</div>}
    {importedMessage && <div className="save-message import-message">{importedMessage}</div>}
    {preview && <div className="historical-import-review">
      <div className={`historical-import-target ${preview.canWrite ? "is-ready" : "is-demo"}`}><strong>Destino: {preview.target}</strong><span>{preview.canWrite ? "A confirmação gravará os chamados neste banco." : "Esta instância não grava no banco ativo; use o ambiente conectado ao banco de destino."}</span></div>
      <div className="historical-import-stats">
        <span><b>{preview.totalRows.toLocaleString("pt-BR")}</b> linhas na planilha</span>
        <span><b>{preview.importableRows.toLocaleString("pt-BR")}</b> novas</span>
        <span><b>{preview.alreadyInSystem.toLocaleString("pt-BR")}</b> já existentes</span>
        <span><b>{preview.duplicateRows.toLocaleString("pt-BR")}</b> em ordens repetidas</span>
        <span><b>{preview.invalidRows.length.toLocaleString("pt-BR")}</b> inválidas</span>
        <span><b>{preview.missingFinishRows.length.toLocaleString("pt-BR")}</b> sem data fim</span>
      </div>
      <p className="historical-import-note">Status importados: {Object.entries(preview.byStatus).map(([status, count]) => `${status} ${count}`).join(" · ") || "nenhum"}. Pendente vira Aberto; Data Fim de chamados abertos é ignorada.</p>
      {preview.invalidRows.length > 0 && <p className="historical-import-warning">Linhas inválidas ignoradas: {preview.invalidRows.slice(0, 20).join(", ")}{preview.invalidRows.length > 20 ? "…" : ""}.</p>}
      {preview.missingFinishRows.length > 0 && <p className="historical-import-warning">Chamados Finalizado/Baixar sem Data Fim: {preview.missingFinishRows.slice(0, 20).join(", ")}{preview.missingFinishRows.length > 20 ? "…" : ""}. Eles serão importados sem Data Fim.</p>}
      {preview.ignoredFinishRows.length > 0 && <p className="historical-import-note">Data Fim ignorada para chamados Pendente nas linhas {preview.ignoredFinishRows.slice(0, 20).join(", ")}{preview.ignoredFinishRows.length > 20 ? "…" : ""}.</p>}
      {preview.unmatchedTechnicians.length > 0 && <p className="historical-import-warning">Técnicos não cadastrados: {preview.unmatchedTechnicians.join(", ")}. Cadastre-os ou corrija os nomes antes de importar.</p>}
      {preview.duplicateRows > 0 && <p className="historical-import-warning">Todas as linhas de ordens repetidas dentro da planilha foram excluídas para evitar importação ambígua.</p>}
      <div className="historical-import-table import-table-wrap"><table><thead><tr><th>Linha</th><th>Ordem</th><th>Status</th><th>Abertura</th><th>Data Fim</th><th>Técnico</th><th>Região</th></tr></thead><tbody>{preview.sample.map((item) => <tr key={`${item.rowNumber}-${item.orderNumber}`}><td>{item.rowNumber}</td><td>{item.orderNumber}</td><td>{item.status}</td><td>{new Date(item.openedAt).toLocaleString("pt-BR")}</td><td>{item.executedAt ? new Date(item.executedAt).toLocaleString("pt-BR") : "-"}</td><td>{item.technicianName || "-"}</td><td>{item.region}</td></tr>)}</tbody></table></div>
      <button className="primary-button compact confirm-import" type="button" onClick={() => void confirmCurrentCallsImport()} disabled={busy || !preview.canWrite || !preview.importableRows || preview.unmatchedTechnicians.length > 0}>{busy ? "Importando..." : `Importar ${preview.importableRows.toLocaleString("pt-BR")} chamados`}<ChevronRight size={16}/></button>
    </div>}
  </section>;
}

export function HistoricalActivationImportPanel() {
  const [preview, setPreview] = useState<HistoricalActivationImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [importedMessage, setImportedMessage] = useState("");
  const [error, setError] = useState("");

  async function selectHistoricalFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setPreview(null);
    setImportedMessage("");
    setError("");
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("Nao foi possivel ler o arquivo."));
        reader.readAsDataURL(file);
      });
      setPreview(await api.previewHistoricalActivationImport(file.name, contentBase64));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel preparar a previa.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmHistoricalImport() {
    if (!preview?.canWrite || !preview.importableRows) return;
    const accepted = window.confirm(`Importar ${preview.importableRows.toLocaleString("pt-BR")} chamados como Finalizado em ${preview.target}? Os registros ja existentes serao ignorados.`);
    if (!accepted) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.confirmHistoricalActivationImport(preview.previewId);
      setImportedMessage(`${result.imported.toLocaleString("pt-BR")} chamados importados; ${result.skippedAlreadyPresent.toLocaleString("pt-BR")} ja estavam no sistema.`);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel importar os chamados.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel historical-import-panel">
    <div className="panel-heading">
      <div><span className="section-kicker">HISTORICO OPERACIONAL</span><h2>Acionamentos finalizados</h2><p>Importe a planilha antiga como chamados Finalizados, com deduplicação por identificadores.</p></div>
      <label className={`primary-button compact file-button ${busy ? "is-disabled" : ""}`}><ClipboardList size={15}/>{busy ? "Analisando..." : "Selecionar XLSX"}<input type="file" accept=".xlsx,.xls" onChange={(event) => void selectHistoricalFile(event)} disabled={busy}/></label>
    </div>
    {error && <div className="form-error import-error">{error}</div>}
    {importedMessage && <div className="save-message import-message">{importedMessage}</div>}
    {preview && <div className="historical-import-review">
      <div className={`historical-import-target ${preview.canWrite ? "is-ready" : "is-demo"}`}><strong>Destino: {preview.target}</strong><span>{preview.canWrite ? "A confirmação gravará os chamados neste banco." : "Esta instância não grava no banco ativo; use a tela no ambiente conectado à produção."}</span></div>
      <div className="historical-import-stats">
        <span><b>{preview.totalRows.toLocaleString("pt-BR")}</b> linhas</span>
        <span><b>{preview.importableRows.toLocaleString("pt-BR")}</b> novas</span>
        <span><b>{preview.alreadyInSystem.toLocaleString("pt-BR")}</b> já existentes</span>
        <span><b>{preview.duplicatesWithinFile.toLocaleString("pt-BR")}</b> duplicadas idênticas</span>
        <span><b>{preview.conflictingOrderRows.toLocaleString("pt-BR")}</b> em O.S. conflitante</span>
        <span><b>{(preview.missingOpeningDate + preview.missingFinishedDate + preview.missingOrder).toLocaleString("pt-BR")}</b> campos obrigatórios ausentes</span>
      </div>
      <p className="historical-import-note">Data Abertura e Data-Fim são preservadas. Linhas sem esses dados ou sem O.S. não entram; Data-Fim define Finalizado. Motivo/OLT ausentes: {preview.missingReason}/{preview.missingOlt}. Sem técnico identificado: {preview.missingTechnician}. Bairro/Slot-PON omitidos por limite do banco: {preview.omittedLongNeighborhood}/{preview.omittedLongSlotPon}; o texto completo fica nas observações importadas.</p>
      {preview.unmatchedTechnicians.length > 0 && <p className="historical-import-warning">Estes nomes não correspondem a um técnico cadastrado: {preview.unmatchedTechnicians.join(", ")}. Cadastre-os ou corrija os nomes antes de importar.</p>}
      {preview.conflictingOrderRows > 0 && <p className="historical-import-warning">Linhas com a mesma O.S. e conteúdo diferente foram excluídas da confirmação para revisão manual.</p>}
      {preview.conflicts.length > 0 && <div className="import-table-wrap historical-import-conflicts"><table><thead><tr><th>O.S. conflitante</th><th>Linha</th><th>Abertura</th><th>Acionamento</th><th>Data-Fim</th></tr></thead><tbody>{preview.conflicts.flatMap((conflict) => conflict.rows.map((row) => <tr key={`${conflict.orderNumber}-${row.rowNumber}`}><td>{conflict.orderNumber}</td><td>{row.rowNumber}</td><td>{new Date(row.openedAt).toLocaleString("pt-BR")}</td><td>{row.assignedAt ? new Date(row.assignedAt).toLocaleString("pt-BR") : "-"}</td><td>{new Date(row.executedAt).toLocaleString("pt-BR")}</td></tr>))}</tbody></table></div>}
      <div className="historical-import-type-counts">{Object.entries(preview.byType).map(([type, count]) => <span key={type}>{type}: <b>{count.toLocaleString("pt-BR")}</b></span>)}</div>
      {preview.sample.length > 0 && <div className="import-table-wrap historical-import-table"><table><thead><tr><th>Linha</th><th>O.S. OT</th><th>Tipo</th><th>Técnico</th><th>Status</th><th>Abertura</th><th>Data-Fim</th><th>Região</th></tr></thead><tbody>{preview.sample.map((item) => <tr key={`${item.rowNumber}-${item.orderNumber}`}><td>{item.rowNumber}</td><td>{item.orderNumber}</td><td>{item.type}</td><td>{item.technicianName || "-"}</td><td>{item.status}</td><td>{new Date(item.openedAt).toLocaleString("pt-BR")}</td><td>{item.executedAt ? new Date(item.executedAt).toLocaleString("pt-BR") : "-"}</td><td>{item.region}</td></tr>)}</tbody></table></div>}
      <button className="primary-button compact confirm-import" type="button" onClick={() => void confirmHistoricalImport()} disabled={busy || !preview.canWrite || !preview.importableRows || preview.unmatchedTechnicians.length > 0}>{busy ? "Importando..." : `Importar ${preview.importableRows.toLocaleString("pt-BR")} finalizados`}<ChevronRight size={16}/></button>
    </div>}
  </section>;
}

// A sincronizacao pelo Google Drive foi removida (2026-11-03): os dados do OFS chegam pela extensao da Rede.
export function ImportsPage() {
  return <>
    <div className="page-heading"><div><span className="section-kicker">DADOS</span><h1>Importações</h1><p>As atualizações do OFS chegam automaticamente pela extensão "JH RedeFlow – Coletor OFS" (painel de hoje a cada hora e o dia anterior às 07:00).</p></div></div>
    {/* Planilha antiga de chamados finalizados (ORDEM, Data Abertura, Data-Fim, ACIONAMENTO): prévia e confirmação */}
    <HistoricalActivationImportPanel />
  </>;
}

export function D0ImportPanel() {
  const [base, setBase] = useState<D0BaseSummary>({ rowCount: 0 });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [processingStage, setProcessingStage] = useState<"reading" | "syncing" | null>(null);
  useEffect(() => { api.d0Base().then((result) => setBase(result.base)).catch((err) => setError(err.message)); }, []);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (base.rowCount && !window.confirm(`A base atual (${base.fileName}) será substituída. Os dados já sincronizados nos chamados serão mantidos. Continuar?`)) return;
    setBusy(true);
    setProcessingStage("reading");
    setError("");
    setMessage("");
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("Nao foi possivel ler o arquivo."));
        reader.readAsDataURL(file);
      });
      setProcessingStage("syncing");
      setMessage("Cruzando chamados e aplicando atualizações em lotes...");
      const result = await api.importD0(file.name, content);
      setBase(result.base);
      setMessage(`Base atualizada: ${result.sync.rows} linha(s), ${result.sync.matchedCalls} chamado(s) cruzado(s), ${result.sync.updatedCalls} atualizado(s), ${result.sync.unmatchedRows} sem correspondência.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel sincronizar a base D-0.");
    } finally {
      setBusy(false);
      setProcessingStage(null);
    }
  }

  async function clear() {
    if (!window.confirm("Limpar a base D-0 armazenada? Os dados já sincronizados nos chamados não serão removidos.")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.clearD0Base();
      setBase(result.base);
      setMessage(`${result.deleted} linha(s) removida(s) da base D-0.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel limpar a base D-0.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel d0-import-panel"><div className="panel-heading"><div><span className="section-kicker">BASE OPERACIONAL DO DIA</span><h2>Importar base D-0</h2><p>{base.rowCount ? `${base.fileName} · ${base.rowCount} linhas · enviada por ${base.uploadedBy || "Sistema"}${base.uploadedAt ? ` · ${new Date(base.uploadedAt).toLocaleString("pt-BR")}` : ""}` : "Nenhuma base D-0 armazenada."}</p></div><div className="page-actions"><label className="primary-button compact file-button"><ClipboardList size={16}/>{processingStage === "reading" ? "Lendo arquivo..." : processingStage === "syncing" ? "Atualizando chamados..." : "Enviar D-0"}<input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => void upload(event)} disabled={busy}/></label><button className="secondary-button compact" type="button" onClick={() => void clear()} disabled={busy || !base.rowCount}><Trash2 size={15}/> Limpar base</button></div></div>{error && <div className="form-error import-error">{error}</div>}{message && <div className="save-message import-message">{message}</div>}</section>;
}
