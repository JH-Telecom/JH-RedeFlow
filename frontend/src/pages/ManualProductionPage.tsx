import { useEffect, useRef, useState } from "react";
import { Copy, Search, RefreshCcw } from "lucide-react";
import { api, type Call } from "../api";
import { shareReportImage, type ReportCell, type ReportColumn, type ReportSpec, type ReportTone } from "../lib/report-image";
import { ManualDashboardArea, ManualProductionData, buildManualDashboardSegments, parseManualProductionData, sumProductionRows } from "../lib/manual-production";
import { Pager, usePaged } from "../components/Pager";

export function manualMetricCell(value: number, state: string) {
  return <td className={`manual-metric-cell manual-metric-${state} ${value === 0 ? "is-zero" : "is-active"}`}><span>{value.toLocaleString("pt-BR")}</span></td>;
}

export type ManualProductionCardKey = "activities" | "technicians" | "orders";

export type ManualProductionCopyState = "idle" | "copied" | "downloaded" | "error";

export function ManualCardCopyButton({ cardKey, state, onCopy }: { cardKey: ManualProductionCardKey; state: ManualProductionCopyState; onCopy: () => void }) {
  const labels: Record<ManualProductionCardKey, string> = { activities: "atividades", technicians: "técnicos", orders: "ordens" };
  const buttonText = state === "copied" ? "Imagem copiada" : state === "downloaded" ? "PNG baixado" : state === "error" ? "Falha ao exportar" : "Copiar imagem";
  return <button className="secondary-button compact manual-card-copy-button" onClick={onCopy} type="button" aria-label={`Copiar imagem de ${labels[cardKey]}`}><Copy size={14} /> {buttonText}</button>;
}

export function ManualProductionDashboard() {
  const [data, setData] = useState<ManualProductionData | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [copyStates, setCopyStates] = useState<Record<ManualProductionCardKey, ManualProductionCopyState>>({ activities: "idle", technicians: "idle", orders: "idle" });
  const [technicianQuery, setTechnicianQuery] = useState("");
  const [areaSegment, setAreaSegment] = useState<ManualDashboardArea>("guarulhos");
  const [callsForArea, setCallsForArea] = useState<Call[]>([]);
  const [areaCallsReady, setAreaCallsReady] = useState(false);
  const [areaLookupError, setAreaLookupError] = useState(false);
  const [refreshingBase, setRefreshingBase] = useState(false);
  const manualDashboardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadBase = () => api.dailyBase().then((result) => {
      if (!result.base) {
        setData(null);
        setSelectedFileName("");
        return;
      }
      setData(result.base.data);
      setSelectedFileName(result.base.fileName);
    }).catch((error) => setUploadError(error instanceof Error ? error.message : "Nao foi possivel carregar a base salva."));
    void loadBase();
    api.calls().then((result) => { setCallsForArea(result.calls); setAreaCallsReady(true); setAreaLookupError(false); }).catch(() => { setCallsForArea([]); setAreaCallsReady(true); setAreaLookupError(true); });
    const interval = window.setInterval(loadBase, 15000);
    return () => window.clearInterval(interval);
  }, []);

  async function clearBase() {
    try {
      await api.clearDailyBase();
      setData(null);
      setUploadError("");
      setUploadMessage("");
      setSelectedFileName("");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Nao foi possivel limpar a base.");
    }
  }

  async function refreshBase() {
    setRefreshingBase(true);
    try {
      const [result, callsResult] = await Promise.all([api.dailyBase(), api.calls().catch(() => null)]);
      setData(result.base?.data || null);
      setSelectedFileName(result.base?.fileName || "");
      if (callsResult) { setCallsForArea(callsResult.calls); setAreaCallsReady(true); setAreaLookupError(false); }
      else { setAreaCallsReady(true); setAreaLookupError(true); }
      setUploadError("");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Nao foi possivel atualizar a base.");
    } finally {
      setRefreshingBase(false);
    }
  }

  // Imagem de cada quadro do painel (gerador unico em lib/report-image.ts): um titulo so, letra grande e
  // as mesmas cores de status da tela. A busca por tecnico vale para a imagem de tecnicos.
  async function copyManualCard(cardKey: ManualProductionCardKey, title: string, fileName: string) {
    if (!selectedData) return;
    setCopyStates((current) => ({ ...current, [cardKey]: "idle" }));
    const metricColumns: ReportColumn[] = [
      { label: "Pendente", width: 112, align: "center" },
      { label: "Em Rota", width: 112, align: "center" },
      { label: "Iniciado", width: 112, align: "center" },
      { label: "Concluído", width: 120, align: "center" },
      { label: "Cancelado", width: 120, align: "center" },
      { label: "Suspenso", width: 116, align: "center" },
      { label: "Total", width: 100, align: "center" },
    ];
    const tones: ReportTone[] = ["blue", "cyan", "amber", "green", "red", "gray"];
    const metricCells = (row: { pending: number; enRoute: number; started: number; concluded: number; cancelled: number; suspended: number; total: number }): ReportCell[] => [
      ...[row.pending, row.enRoute, row.started, row.concluded, row.cancelled, row.suspended].map((value, index) => ({ text: value.toLocaleString("pt-BR"), tone: value ? tones[index] : "muted" as ReportTone })),
      { text: row.total.toLocaleString("pt-BR"), strong: true },
    ];
    const subtitle = [selectedFileName || "Base operacional", data?.updatedAt ? `base de ${data.updatedAt}` : ""].filter(Boolean).join(" · ");
    let spec: ReportSpec;
    if (cardKey === "orders") {
      spec = {
        kicker: "Ordens", title, subtitle, badge: `${selectedData.orders.length} ordens`,
        columns: [{ label: "Ordem", width: 230 }, { label: "Técnico", width: 330 }, { label: "Início", width: 170 }, { label: "Tempo", width: 170 }],
        rows: selectedData.orders.map((item) => [
          { text: item.order, strong: true },
          { text: item.technician || "-" },
          { text: item.inicio || "-" },
          item.tempo ? { text: item.tempo, tone: /atrasad|vencid|excedid|estourad|outlier|fora do prazo/i.test(item.tempo) ? "red" : "gray" } : { text: "-" },
        ]),
        empty: "Nenhuma ordem iniciada.",
      };
    } else {
      const source = cardKey === "activities"
        ? selectedData.activities.map((item) => ({ ...item, label: item.type }))
        : selectedData.technicians.filter((item) => item.name.toLowerCase().includes(technicianQuery.trim().toLowerCase())).map((item) => ({ ...item, label: item.name }));
      const totals = sumProductionRows(source);
      spec = {
        kicker: cardKey === "activities" ? "Produção" : "Técnicos",
        title,
        subtitle,
        badge: `${totals.total.toLocaleString("pt-BR")} atividades`,
        columns: [{ label: cardKey === "activities" ? "Tipo da atividade" : "Técnico", width: cardKey === "activities" ? 340 : 330 }, ...metricColumns],
        rows: source.map((item) => [{ text: item.label, strong: true }, ...metricCells(item)]),
        totalRow: [{ text: "Total", strong: true }, ...metricCells(totals)],
        empty: "Nada para mostrar com o filtro atual.",
      };
    }
    try {
      const copied = await shareReportImage(spec, fileName);
      setCopyStates((current) => ({ ...current, [cardKey]: copied ? "copied" : "downloaded" }));
    } catch {
      setCopyStates((current) => ({ ...current, [cardKey]: "error" }));
    } finally {
      window.setTimeout(() => setCopyStates((current) => ({ ...current, [cardKey]: "idle" })), 2200);
    }
  }

  async function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setUploadMessage("");

    try {
      const fileName = file.name.toLowerCase();
      let nextRaw = "";

      if (fileName.endsWith(".csv") || fileName.endsWith(".txt") || fileName.endsWith(".tsv")) {
        nextRaw = await file.text();
      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = workbook.Sheets[firstSheetName];
        nextRaw = XLSX.utils.sheet_to_csv(firstSheet);
      } else {
        throw new Error("Formato de arquivo não suportado. Use CSV, TSV, TXT, XLS ou XLSX.");
      }

      const parsed = parseManualProductionData(nextRaw);
      if (!parsed.activities.length && !parsed.technicians.length && !parsed.orders.length) {
        throw new Error("Arquivo carregado, mas não foi possível identificar as tabelas de produção. Verifique se o arquivo é o base do painel diário.");
      }
      const saved = await api.saveDailyBase(file.name, parsed);
      setSelectedFileName(saved.base.fileName);
      setData(saved.base.data);
      setUploadError("");
      try {
        const contentBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
          reader.onerror = () => reject(new Error("Nao foi possivel ler novamente o arquivo para sincronizar os chamados."));
          reader.readAsDataURL(file);
        });
        const result = await api.importD0(file.name, contentBase64);
        setUploadMessage(`Base diária salva. Chamados D-0: ${result.sync.matchedCalls} cruzados, ${result.sync.updatedCalls} atualizados e ${result.sync.unmatchedRows} sem correspondência.`);
      } catch (syncError) {
        const syncMessage = syncError instanceof Error ? syncError.message : "falha desconhecida";
        setUploadError(`Base diária salva, mas os chamados não foram atualizados: ${syncMessage}`);
      }
      api.calls().then((result) => { setCallsForArea(result.calls); setAreaCallsReady(true); setAreaLookupError(false); }).catch(() => { setAreaCallsReady(true); setAreaLookupError(true); });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nao foi possivel carregar o arquivo.";
      setUploadError(message);
      setData(null);
    } finally {
      event.target.value = "";
    }
  }

  const canSplitByArea = Boolean(data?.records?.length && areaCallsReady && !areaLookupError);
  const areaSegments = canSplitByArea && data?.records ? buildManualDashboardSegments(data.records, callsForArea) : null;
  const hasDetailedRecords = Boolean(data?.records?.length);
  const selectedData = hasDetailedRecords ? areaSegments?.[areaSegment] || null : data;
  // Ate 100 por pagina (listas grandes travavam).
  const pagedTechnicians = usePaged((selectedData?.technicians ?? []).filter((item) => item.name.toLowerCase().includes(technicianQuery.trim().toLowerCase())), `${technicianQuery}|${areaSegment}`);
  const pagedOrders = usePaged(selectedData?.orders ?? [], areaSegment);
  const selectedAreaLabel = areaSegment === "guarulhos" ? "Guarulhos" : "SP";
  const segmentFileSuffix = areaSegment === "guarulhos" ? "guarulhos" : "sp";

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">OPERACAO DE REDE</span>
          <div className="manual-dashboard-heading-title">
            <h1>Painel diário de produção</h1>
            <span className={`manual-base-status ${data ? "is-ready" : "is-empty"}`}>{data ? "Base carregada" : "Aguardando base"}</span>
          </div>
          <p>{data ? "Produção operacional consolidada por atividade, técnico e ordem." : "Selecione a base do dia para atualizar as ordens e a produção."}</p>
        </div>
        <div className="page-actions compact-actions">
          {data && <div className="manual-update-meta"><span>ÚLTIMA ATUALIZAÇÃO</span><strong>{data.updatedAt}</strong><small>{selectedFileName}</small></div>}
          <button className={`secondary-button compact ${refreshingBase ? "is-refreshing" : ""}`} onClick={() => void refreshBase()} type="button" disabled={refreshingBase} aria-label="Atualizar painel diário">
            <RefreshCcw size={15} /> {refreshingBase ? "Atualizando..." : "Atualizar"}
          </button>
          <button className="secondary-button compact danger-button" onClick={clearBase} type="button">
            Limpar base
          </button>
        </div>
      </div>

      <div className="manual-dashboard-tools">
        <div className="manual-file-actions">
          <label className="manual-file-picker">
            <input type="file" accept=".csv,.tsv,.txt,.xls,.xlsx" onChange={handleFileSelection} />
            <span>Selecionar arquivo</span>
          </label>
        </div>

        {canSplitByArea && areaSegments && <div className="manual-area-switch" role="tablist" aria-label="Segmento regional">
          <button className={areaSegment === "guarulhos" ? "active" : ""} type="button" role="tab" aria-selected={areaSegment === "guarulhos"} onClick={() => { setAreaSegment("guarulhos"); setTechnicianQuery(""); }}>Guarulhos <b>{areaSegments.guarulhos.recordCount}</b></button>
          <button className={areaSegment === "sp" ? "active" : ""} type="button" role="tab" aria-selected={areaSegment === "sp"} onClick={() => { setAreaSegment("sp"); setTechnicianQuery(""); }}>SP <b>{areaSegments.sp.recordCount}</b></button>
        </div>}
        {data && !data.records?.length && <div className="manual-area-message">Para separar Guarulhos e SP, reimporte a exportação OFS detalhada com Ordem de Serviço, Status da Atividade, Técnico e Tipo de Atividade. Bases antigas agregadas não têm as linhas necessárias para recalcular cada região.</div>}
        {data?.records?.length && !areaCallsReady && <div className="manual-area-message">Carregando regiões dos chamados para separar o OFS...</div>}
        {data?.records?.length && areaLookupError && <div className="manual-area-message is-error">Não foi possível consultar as Regiões dos chamados. Verifique o acesso de consulta a chamados e tente Atualizar.</div>}
        {areaSegments && <div className="manual-area-note">Região cruzada pela Ordem de Serviço. Ordens sem correspondência são incluídas em SP.</div>}
        {areaSegments?.[areaSegment].unmatchedOrderCount ? <div className="manual-area-caption">{areaSegments[areaSegment].unmatchedOrderCount} Ordem(ns) sem correspondência com os chamados foram consideradas em SP.</div> : null}
        {uploadMessage && <div className="manual-area-message">{uploadMessage}</div>}
        {uploadError && <div className="form-error import-error">{uploadError}</div>}
      </div>

      {data && selectedData && (
        <div ref={manualDashboardRef} className="manual-dashboard-capture manual-dashboard-screen">
        <>
          {(() => {
            const activityTotals = sumProductionRows(selectedData.activities);
            const visibleTechnicians = selectedData.technicians.filter((item) => item.name.toLowerCase().includes(technicianQuery.trim().toLowerCase()));
            const technicianTotals = sumProductionRows(visibleTechnicians);
            return (
              <>
          <div className="manual-production-grid">
            <section className="panel panel-elevated" data-manual-card="activities">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">PRODUCAO</span>
                    <h2>Produção por atividades{areaSegments ? ` · ${selectedAreaLabel}` : ""}</h2>
                </div>
                <ManualCardCopyButton cardKey="activities" state={copyStates.activities} onCopy={() => void copyManualCard("activities", `Produção por atividades · ${areaSegments ? selectedAreaLabel : "Geral"}`, `producao-atividades-${areaSegments ? segmentFileSuffix : "geral"}.png`)} />
              </div>
              <div className="manual-table-wrap">
                <table className="manual-table">
                  <thead>
                    <tr>
                      <th>Tipo da Atividade</th>
                      <th>Pendente</th>
                      <th>Em Rota</th>
                      <th>Iniciado</th>
                      <th>Concluído</th>
                      <th>Cancelado</th>
                      <th>Suspenso</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedData.activities.map((item) => (
                      <tr key={`${item.type}-${item.total}`}>
                        <td>{item.type}</td>
                        {manualMetricCell(item.pending, "pending")}
                        {manualMetricCell(item.enRoute, "en-route")}
                        {manualMetricCell(item.started, "started")}
                        {manualMetricCell(item.concluded, "concluded")}
                        {manualMetricCell(item.cancelled, "cancelled")}
                        {manualMetricCell(item.suspended, "suspended")}
                        <td className="manual-total-cell">{item.total.toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                    <tr className="manual-total-row">
                      <td>Total</td>
                      {manualMetricCell(activityTotals.pending, "pending")}
                      {manualMetricCell(activityTotals.enRoute, "en-route")}
                      {manualMetricCell(activityTotals.started, "started")}
                      {manualMetricCell(activityTotals.concluded, "concluded")}
                      {manualMetricCell(activityTotals.cancelled, "cancelled")}
                      {manualMetricCell(activityTotals.suspended, "suspended")}
                      <td className="manual-total-cell">{activityTotals.total.toLocaleString("pt-BR")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel panel-elevated" data-manual-card="technicians">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">TÉCNICOS</span>
                  <h2>Produção por técnico{areaSegments ? ` · ${selectedAreaLabel}` : ""}</h2>
                </div>
                <div className="manual-technician-heading-actions">
                  <label className="manual-technician-search">
                    <Search size={14} aria-hidden="true" />
                    <input value={technicianQuery} onChange={(event) => setTechnicianQuery(event.target.value)} placeholder="Buscar técnico" aria-label="Buscar técnico" />
                  </label>
                  <ManualCardCopyButton cardKey="technicians" state={copyStates.technicians} onCopy={() => void copyManualCard("technicians", `Produção por técnico · ${areaSegments ? selectedAreaLabel : "Geral"}`, `producao-por-tecnico-${areaSegments ? segmentFileSuffix : "geral"}.png`)} />
                </div>
              </div>
              <div className="manual-table-wrap compact">
                <table className="manual-table">
                  <thead>
                    <tr>
                      <th>Técnicos</th>
                      <th>Pendente</th>
                      <th>Em Rota</th>
                      <th>Iniciado</th>
                      <th>Concluído</th>
                      <th>Cancelado</th>
                      <th>Suspenso</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedTechnicians.pageItems.map((item) => (
                      <tr key={`${item.name}-${item.total}`}>
                        <td>{item.name}</td>
                        {manualMetricCell(item.pending, "pending")}
                        {manualMetricCell(item.enRoute, "en-route")}
                        {manualMetricCell(item.started, "started")}
                        {manualMetricCell(item.concluded, "concluded")}
                        {manualMetricCell(item.cancelled, "cancelled")}
                        {manualMetricCell(item.suspended, "suspended")}
                        <td className="manual-total-cell">{item.total.toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                    <tr className="manual-total-row">
                      <td>Total</td>
                      {manualMetricCell(technicianTotals.pending, "pending")}
                      {manualMetricCell(technicianTotals.enRoute, "en-route")}
                      {manualMetricCell(technicianTotals.started, "started")}
                      {manualMetricCell(technicianTotals.concluded, "concluded")}
                      {manualMetricCell(technicianTotals.cancelled, "cancelled")}
                      {manualMetricCell(technicianTotals.suspended, "suspended")}
                      <td className="manual-total-cell">{technicianTotals.total.toLocaleString("pt-BR")}</td>
                    </tr>
                  </tbody>
                </table><Pager {...pagedTechnicians} noun={["técnico", "técnicos"]} />
              </div>
            </section>

            <section className="panel panel-elevated orders-panel" data-manual-card="orders">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">ORDENS</span>
                  <h2>Ordens iniciadas{areaSegments ? ` · ${selectedAreaLabel}` : ""}</h2>
                </div>
                <ManualCardCopyButton cardKey="orders" state={copyStates.orders} onCopy={() => void copyManualCard("orders", `Ordens iniciadas · ${areaSegments ? selectedAreaLabel : "Geral"}`, `ordens-iniciadas-${areaSegments ? segmentFileSuffix : "geral"}.png`)} />
              </div>
              <div className="manual-table-wrap compact">
                <table className="manual-table">
                  <thead>
                    <tr>
                      <th>Ordem</th>
                      <th>Técnico</th>
                      <th>Início</th>
                      <th>Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedOrders.pageItems.map((item, index) => (
                      <tr key={`${item.order}-${index}`}>
                        <td>{item.order}</td>
                        <td>{item.technician}</td>
                        <td>{item.inicio}</td>
                        <td><span className={`manual-order-time${/atrasad|vencid|excedid|estourad|outlier|fora do prazo/i.test(item.tempo) ? " is-alert" : ""}`}>{item.tempo || "-"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table><Pager {...pagedOrders} noun={["ordem", "ordens"]} />
              </div>
            </section>
          </div>
              </>
            );
          })()}
        </>
        </div>
      )}
    </>
  );
}
