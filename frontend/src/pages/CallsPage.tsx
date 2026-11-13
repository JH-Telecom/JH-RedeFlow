import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Activity, ArrowDown, ArrowUp, ArrowUpDown, Copy, FileSpreadsheet, Search, X } from "lucide-react";
import { api, isCallClosed, type Call, type CallListQuery, type CallListResult, type CallStatus, type Role, type User } from "../api";
import { TimerCell, formatCallTimestamp, getSlaState } from "../components/call-cells";
import { slaLimits } from "../lib/sla";
import { CALLS_PAGE_SIZE, operationalRegions } from "../lib/constants";
import { shareReportImage, slugFileName, type ReportCell, type ReportColumn, type ReportTone } from "../lib/report-image";
import { useFitToViewport } from "../hooks/useFitToViewport";
import { RiskBadge } from "../components/AssistWidgets";
import { ObservationPopup } from "../components/ObservationPopup";
import { CopyText } from "../components/CopyText";
import type { CallRisk } from "../api";

export function RangeCallTable({ calls }: { calls: Call[] }) {
  return (
    <section className="panel compact-range-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">PERIODO</span>
          <h2>Chamados no intervalo</h2>
        </div>
      </div>
      <div className="range-call-table">
        <table>
          <thead>
            <tr>
              <th>Ordem</th>
              <th>Cliente</th>
              <th>Tipo</th>
              <th>Regiao</th>
              <th>Bairro / Endereço</th>
              <th>Status</th>
              <th>Tecnico</th>
            </tr>
          </thead>
          <tbody>
            {calls.length ? calls.slice(0, 8).map((call) => (
              <tr key={call.id}>
                <td><strong>{call.orderNumber}</strong><small>{call.bdesk}</small></td>
                <td><strong>{call.client}</strong><small>{call.city}</small></td>
                <td>{call.type}<small>{call.reason}</small></td>
                <td>{call.region}</td>
                <td><strong>{call.bairro || <span className="muted-cell">-</span>}</strong><small>{call.address}</small></td>
                <td><span className={`call-badge ${call.status.toLowerCase().replace(" ", "-")}`}>{call.status}</span></td>
                <td>{call.technicianName || <span className="unassigned">Sem tecnico</span>}</td>
              </tr>
            )) : <tr><td colSpan={7} className="empty-state-cell">Sem chamados neste periodo.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SupervisorOrdersPage({ user }: { user: User & { role: Role } }) {
  if (user.role.name !== "Supervisor") return <Navigate to="/" replace />;
  return <CallsPage title="Ordens dos meus tecnicos" teamScoped />;
}

export const callsPageStateCookieName = "jh-redeflow-calls-page-state";

export const CALLS_PAGE_CACHE_TTL_MS = 30000;

export const callsPageCache = new Map<string, { expiresAt: number; result: CallListResult }>();

export const callsPageRequests = new Map<string, Promise<CallListResult>>();

export let callsPageCacheGeneration = 0;

export function callsPageCacheKey(status: CallStatus | CallStatus[] | undefined, filters: CallListQuery) {
  return JSON.stringify({ status: status ?? null, filters });
}

export function loadCallsPage(key: string, status: CallStatus | CallStatus[] | undefined, filters: CallListQuery) {
  const cached = callsPageCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.result);
  if (cached) callsPageCache.delete(key);
  const pending = callsPageRequests.get(key);
  if (pending) return pending;

  const generation = callsPageCacheGeneration;
  let request: Promise<CallListResult>;
  request = api.calls(status, filters).then((result) => {
    if (generation === callsPageCacheGeneration) callsPageCache.set(key, { expiresAt: Date.now() + CALLS_PAGE_CACHE_TTL_MS, result });
    return result;
  }).finally(() => {
    if (callsPageRequests.get(key) === request) callsPageRequests.delete(key);
  });
  callsPageRequests.set(key, request);
  return request;
}

export function invalidateCallsPageCache() {
  callsPageCacheGeneration += 1;
  callsPageCache.clear();
  callsPageRequests.clear();
}

if (typeof window !== "undefined") window.addEventListener("jh-redeflow:calls-changed", invalidateCallsPageCache);

export function readCallsPageState(pageKey: string) {
  const fallback = { query: "", statusFilter: "Todos" as CallStatus | "Todos", regionFilter: "Todas", areaFilter: "Todas", neighborhoodFilter: "Todos", oltFilter: "Todas", dateRange: { from: "", to: "" }, showFilters: false, callsPage: 1 };
  try {
    const raw = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${callsPageStateCookieName}=`));
    const cookieValue = raw ? decodeURIComponent(raw.slice(`${callsPageStateCookieName}=`.length)) : "";
    const parsed = cookieValue ? JSON.parse(cookieValue) : {};
    const state = parsed?.[pageKey] ?? {};
    return { ...fallback, ...state };
  } catch {
    return fallback;
  }
}

export function writeCallsPageState(pageKey: string, state: Record<string, unknown>) {
  try {
    const raw = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${callsPageStateCookieName}=`));
    const existing = raw ? JSON.parse(decodeURIComponent(raw.slice(`${callsPageStateCookieName}=`.length))) : {};
    const next = { ...existing, [pageKey]: state };
    document.cookie = `${callsPageStateCookieName}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${60 * 60 * 24 * 30}`;
  } catch {
    // Ignore cookie write failures silently to keep the UI responsive.
  }
}

type AreaFilter = "Todas" | "SP" | "GRU" | "ALTO_TIETE" | "ABC";
export const inProgressCallStatuses: CallStatus[] = ["Aberto", "Atribuido", "Atrelado", "Deslocamento", "Em campo"];
// Filtro de status de "Em atendimento": so lista chamados com tecnico, entao "Aberto" (sem tecnico) sempre vinha vazio.
const attendanceStatusOptions: CallStatus[] = ["Atribuido", "Atrelado", "Deslocamento", "Em campo"];

const SLA_LABELS = { "on-time": "No prazo", late: "Fora do prazo", outlier: "Outlier" } as const;
type SlaState = keyof typeof SLA_LABELS;
const CALL_STATUSES: CallStatus[] = ["Aberto", "Atribuido", "Atrelado", "Deslocamento", "Em campo", "Finalizado", "Cancelado", "Baixar", "GIGA+"];

function minutesBetween(from: string, to?: string | null) {
  const end = to ? new Date(to).getTime() : Date.now();
  return Math.max(0, Math.floor((end - new Date(from).getTime()) / 60000));
}

function formatDuration(totalMinutes: number) {
  if (totalMinutes < 60) return `${totalMinutes}min`;
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return days ? `${days}d ${hours}h` : `${hours}h ${minutes.toString().padStart(2, "0")}min`;
}

const shortDateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Relogio da regra 6h/9h: tempo grande, barra ate 9h com marca nas 6h e a classificacao.
// Em aberto conta ate agora; encerrado conta da abertura ate a Data Fim.
// Links (NOC TX): prazo de 15 dias (lib/sla.ts); a barra vai ate o prazo deles.
function QueueClock({ openedAt, endedAt, closed = false, type }: { openedAt: string; endedAt?: string | null; closed?: boolean; type?: string }) {
  if (closed && !endedAt) return <span className="muted-cell">Sem Data Fim</span>;
  const minutes = minutesBetween(openedAt, endedAt);
  const state = getSlaState(minutes, type) as SlaState;
  const limits = slaLimits(type);
  const fill = Math.min(100, (minutes / limits.outlierMinutes) * 100);
  const tick = (limits.onTimeMinutes / limits.outlierMinutes) * 100;
  return (
    <div className={`cq-clock is-${state}`} data-prazo={`${formatDuration(minutes)} ${SLA_LABELS[state]}`}>
      <strong>{formatDuration(minutes)}</strong>
      <span className="cq-clock-bar" aria-hidden="true"><i style={{ width: `${fill}%` }} /><b style={{ left: `${tick}%` }} /></span>
      <small>{closed ? `${SLA_LABELS[state]} no encerramento` : SLA_LABELS[state]}</small>
    </div>
  );
}

function FilterField({ label, active, children }: { label: string; active: boolean; children: React.ReactNode }) {
  return <label className={`cq-field${active ? " is-active" : ""}`}><span>{label}</span>{children}</label>;
}

type CallSortKey = NonNullable<CallListQuery["sort"]>;
type CallSortState = { sort: CallSortKey; direction: "asc" | "desc" };
// "Na fila" e "Abertura" ordenam pela abertura: crescente = ha mais tempo esperando primeiro.
const SORTABLE_COLUMNS: Partial<Record<string, CallSortKey>> = {
  Ordem: "orderNumber", Protocolo: "orderNumber", "Técnico": "technicianName", "Na fila": "openedAt", Abertura: "openedAt",
  Local: "region", "Local e OLT": "region", Status: "status",
};

export function CallsPage({ status, title, assignedOnly = false, unassignedOnly = false, teamScoped = false, closedOnly = false }: { status?: CallStatus; title: string; assignedOnly?: boolean; unassignedOnly?: boolean; teamScoped?: boolean; closedOnly?: boolean }) {
  const pageKey = `${teamScoped ? 'team' : 'global'}:${closedOnly ? 'closed' : assignedOnly ? 'assigned-v2' : unassignedOnly ? 'unassigned' : status ?? 'all'}:${title}`;
  const initialState = readCallsPageState(pageKey);
  // Cartao da fila ocupa o resto da tela: filtros e paginacao fixos, so as linhas rolam.
  const panelRef = useFitToViewport<HTMLElement>("fill");
  // Ordenacao por coluna: filas em andamento comecam pelo mais antigo; finalizados pela ordem padrao do servidor.
  const defaultSort: CallSortState | null = closedOnly ? null : { sort: "openedAt", direction: "asc" };
  const [sortState, setSortState] = useState<CallSortState | null>(initialState.sortState ?? defaultSort);
  const [statusCounts, setStatusCounts] = useState<Partial<Record<string, number>>>({});
  const [exporting, setExporting] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [countsVersion, setCountsVersion] = useState(0);
  const [calls, setCalls] = useState<Call[]>([]);
  // Popup de observacao (fila Em atendimento): chamado aberto no popup e o texto das observacoes salvas por ele.
  const [observationCall, setObservationCall] = useState<Call | null>(null);
  // Ultima observacao (texto e autor) de cada chamado da pagina, numa chamada so; sem observacao, mostra as notas.
  const [latestObservations, setLatestObservations] = useState<Record<string, { text: string; userName: string; createdAt: string }>>({});
  const observationIdsKey = assignedOnly ? calls.map((call) => call.id).join(",") : "";
  useEffect(() => {
    if (!observationIdsKey) { setLatestObservations({}); return; }
    let active = true;
    api.latestObservations(observationIdsKey.split(","), { teamScope: teamScoped })
      .then((data) => { if (active) setLatestObservations(data.observations); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [observationIdsKey, teamScoped]);
  const canAddObservation = (() => {
    try { return Boolean(JSON.parse(localStorage.getItem("jh-redeflow-session") || "null")?.user?.role?.permissions?.includes("calls.add_observation")); }
    catch { return false; }
  })();
  // Reincidentes da pagina (mesmo endereco + OLT + slot/PON em ate 30 dias), checados no servidor.
  const [repeatFlags, setRepeatFlags] = useState<Record<string, number>>({});
  useEffect(() => {
    const ids = calls.map((call) => call.id).slice(0, 300);
    if (!ids.length) { setRepeatFlags({}); return; }
    let active = true;
    api.repeatFlags(ids).then((data) => { if (active) setRepeatFlags(data.flags); }).catch(() => undefined);
    return () => { active = false; };
  }, [calls]);
  // Risco de estourar o prazo (ativos ainda no prazo), estimado pelo historico de 90 dias.
  const [risks, setRisks] = useState<Record<string, CallRisk>>({});
  useEffect(() => {
    const ids = calls.filter((call) => !isCallClosed(call)).map((call) => call.id).slice(0, 300);
    if (!ids.length) { setRisks({}); return; }
    let active = true;
    api.callRisks(ids).then((data) => { if (active) setRisks(data.risks); }).catch(() => undefined);
    return () => { active = false; };
  }, [calls]);
  const [query, setQuery] = useState(initialState.query ?? "");
  // Busca so vai ao servidor 400 ms depois de parar de digitar (antes era uma consulta por tecla).
  const [searchQuery, setSearchQuery] = useState(() => (initialState.query ?? "").trim());
  useEffect(() => { const timer = window.setTimeout(() => setSearchQuery(query.trim()), 400); return () => window.clearTimeout(timer); }, [query]);
  const [loading, setLoading] = useState(false);
  const [regionFilter, setRegionFilter] = useState(initialState.regionFilter ?? "Todas");
  // Area do IGP (SP, GRU, Alto Tiete): conjunto de regioes, igual ao filtro do IGP.
  const [areaFilter, setAreaFilter] = useState<AreaFilter>((initialState as { areaFilter?: AreaFilter }).areaFilter ?? "Todas");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState(initialState.neighborhoodFilter ?? "Todos");
  const [oltFilter, setOltFilter] = useState(initialState.oltFilter ?? "Todas");
  const [availableOlts, setAvailableOlts] = useState<string[]>([]);
  const savedStatusFilter = initialState.statusFilter ?? "Todos";
  const initialStatusFilter = unassignedOnly ? "Aberto" : assignedOnly && savedStatusFilter !== "Todos" && savedStatusFilter !== "GIGA+" && !attendanceStatusOptions.includes(savedStatusFilter as CallStatus) ? "Todos" : savedStatusFilter;
  const [statusFilter, setStatusFilter] = useState<CallStatus | "Todos">(initialStatusFilter);
  const [dateRange, setDateRange] = useState(initialState.dateRange ?? { from: "", to: "" });
  const [showFilters, setShowFilters] = useState(Boolean(initialState.showFilters));
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "downloaded" | "error">("idle");
  const [callsPage, setCallsPage] = useState(initialState.callsPage ?? 1);
  const [totalCalls, setTotalCalls] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [, setClock] = useState(Date.now());
  const navigate = useNavigate();
  // Atalhos da fila: "/" vai para a busca; seta para baixo (fora de campos) entra na primeira linha.
  // Nas linhas: setas ou j/k navegam, Home/End vao ao inicio/fim, Enter abre o chamado.
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "/") { event.preventDefault(); searchRef.current?.focus(); }
      else if (event.key === "ArrowDown" && (!target || target === document.body)) { event.preventDefault(); document.querySelector<HTMLElement>(".cq-row")?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { const interval = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(interval); }, []);
  useEffect(() => { writeCallsPageState(pageKey, { query, statusFilter, regionFilter, areaFilter, neighborhoodFilter, oltFilter, dateRange, showFilters, callsPage, sortState }); }, [pageKey, sortState, query, statusFilter, regionFilter, areaFilter, neighborhoodFilter, oltFilter, dateRange, showFilters, callsPage]);
  useEffect(() => { setCallsPage(1); }, [sortState, searchQuery, statusFilter, regionFilter, areaFilter, neighborhoodFilter, oltFilter, dateRange.from, dateRange.to, status, teamScoped, closedOnly, assignedOnly]);
  // Imagem para WhatsApp: montada a partir dos dados (gerador unico em lib/report-image.ts), com letra grande,
  // poucas colunas e etiquetas coloridas para prazo e status.
  async function copyTableAsImage() {
    setCopyState("idle");
    const slaTone = (state: SlaState): ReportTone => (state === "outlier" ? "red" : state === "late" ? "amber" : "green");
    const statusTone = (value: CallStatus): ReportTone => (value === "Finalizado" ? "green" : value === "Cancelado" ? "red" : value === "Baixar" ? "gray" : value === "GIGA+" ? "cyan" : value === "Aberto" ? "amber" : "blue");
    const columns: ReportColumn[] = [
      { label: "Ordem", width: 210 },
      ...(showTechnician ? [{ label: "Técnico", width: 220 }] : []),
      { label: closedView ? "Tempo total" : "Na fila", width: 180 },
      { label: "Evento", width: 200 },
      { label: "Local", width: 270 },
      { label: "Status", width: 170 },
      { label: "Observação", width: 340 },
    ];
    // Ultima observacao de cada chamado da pagina (so o texto: sem autor e hora, pedido de 13/11/2026); sem observacao,
    // o campo de notas do chamado.
    const lastObservations = new Map<string, string>();
    try {
      const found = (await api.latestObservations(currentCalls.map((call) => call.id), { teamScope: teamScoped })).observations;
      for (const [callId, item] of Object.entries(found)) lastObservations.set(callId, item.text);
    } catch { /* sem permissao ou falha: cai nas notas do chamado */ }
    const clip = (text: string, max = 180) => { const flat = text.replace(/\s+/g, " ").trim(); return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat; };
    const rows: ReportCell[][] = currentCalls.map((call) => {
      const minutes = minutesBetween(call.openedAt, closedView ? call.executedAt : undefined);
      const state = getSlaState(minutes, call.type) as SlaState;
      const clock: ReportCell = closedView && !call.executedAt
        ? { text: "Sem Data Fim", tone: "muted" }
        : { text: formatDuration(minutes), tone: slaTone(state), sub: `${SLA_LABELS[state]} · desde ${shortDateTime(call.openedAt)}` };
      return [
        { text: call.orderNumber, strong: true, sub: call.bdesk && call.bdesk !== call.orderNumber ? `BDESK ${call.bdesk}` : undefined },
        ...(showTechnician ? [{ text: call.technicianName || "Sem técnico", sub: call.supervisorName || undefined }] : []),
        clock,
        { text: call.type, sub: call.reason || undefined },
        { text: call.bairro || call.city || call.region || "Sem bairro", sub: [call.bairro || call.city ? call.region : "", call.olt].filter(Boolean).join(" · ") || undefined },
        { text: call.status, tone: statusTone(call.status), sub: call.ofsStatus ? `OFS: ${call.ofsStatus}` : undefined },
        (() => {
          const latest = lastObservations.get(call.id);
          if (latest) return { text: clip(latest) };
          return call.notes?.trim() ? { text: clip(call.notes) } : { text: "–" };
        })(),
      ];
    });
    const stamp = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());
    try {
      const copied = await shareReportImage({
        kicker: "JH Telecom · Rede",
        title,
        subtitle: `${totalPages > 1 ? `Página ${callsPage} de ${totalPages} · ` : ""}${activeFilters ? "com os filtros atuais · " : ""}${stamp}`,
        badge: `${rows.length} ${rows.length === 1 ? "chamado" : "chamados"}`,
        columns,
        rows,
        empty: "Nenhum chamado com os filtros atuais.",
      }, `${slugFileName(title)}-${new Date().toISOString().slice(0, 10)}.png`);
      setCopyState(copied ? "copied" : "downloaded");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 2200);
  }

  // Filas em andamento: por padrao quem esta ha mais tempo esperando vem primeiro (clique no cabecalho muda).
  const queueOrder: Pick<CallListQuery, "sort" | "direction"> = sortState ? { sort: sortState.sort, direction: sortState.direction } : {};
  const statusesFor = (choice: CallStatus | "Todos"): CallStatus | CallStatus[] | undefined =>
    unassignedOnly ? inProgressCallStatuses : choice === "Todos" ? (closedOnly ? ["Finalizado", "Cancelado", "Baixar", "GIGA+"] as CallStatus[] : assignedOnly ? inProgressCallStatuses : status) : choice;
  // Aba GIGA+ (Em atendimento): chamados do outro escritorio, com ou sem tecnico.
  const listFilters = (choice: CallStatus | "Todos" = statusFilter): CallListQuery => ({
    from: dateRange.from,
    to: dateRange.to,
    teamScope: teamScoped,
    search: searchQuery,
    region: regionFilter === "Todas" ? undefined : regionFilter,
    area: areaFilter === "Todas" ? undefined : areaFilter,
    neighborhood: neighborhoodFilter === "Todos" ? undefined : neighborhoodFilter,
    olt: oltFilter === "Todas" ? undefined : oltFilter,
    hasTechnician: assignedOnly ? (choice === "GIGA+" ? undefined : true) : unassignedOnly ? false : undefined,
    // GIGA+ em aberto fica em Em atendimento; concluido no OFS, em Finalizados.
    gigaClosed: closedOnly ? true : assignedOnly ? false : undefined,
    ...queueOrder,
  });
  function toggleSort(key: CallSortKey) {
    setSortState((current) => current?.sort === key ? { sort: key, direction: current.direction === "asc" ? "desc" : "asc" } : { sort: key, direction: "asc" });
  }

  // Exporta todas as paginas com os filtros e a ordem atuais (o servidor entrega no maximo 100 por pagina).
  async function exportExcel() {
    setExporting("Preparando...");
    try {
      const requestStatus = statusesFor(statusFilter);
      const first = await api.calls(requestStatus, { ...listFilters(), page: 1, pageSize: 100 });
      const all = [...first.calls];
      for (let page = 2; page <= first.totalPages; page += 4) {
        const batch = Array.from({ length: Math.min(4, first.totalPages - page + 1) }, (_, index) => page + index);
        setExporting("Exportando " + Math.min(page + 3, first.totalPages) + "/" + first.totalPages);
        const results = await Promise.all(batch.map((item) => api.calls(requestStatus, { ...listFilters(), page: item, pageSize: 100 })));
        results.forEach((result) => all.push(...result.calls));
      }
      const XLSX = await import("xlsx");
      const spDate = (iso?: string | null) => iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";
      const rows = all.map((call) => {
        const minutes = minutesBetween(call.openedAt, closedView ? call.executedAt : undefined);
        const sla = getSlaState(minutes, call.type);
        return {
          Ordem: call.orderNumber, BDESK: call.bdesk, "Office Track": call.officeTrack, Tipo: call.type, Motivo: call.reason,
          "Região": call.region, Bairro: call.bairro || "", "Endereço": call.address || "", OLT: call.olt, "Slot/PON": call.slotPon,
          "Técnico": call.technicianName || "", Supervisor: call.supervisorName || "", Status: call.status, "Status OFS": call.ofsStatus || "",
          Abertura: spDate(call.openedAt), "Data Fim": spDate(call.executedAt),
          "Motivo de fechamento": call.closingReason || "", Submotivo: call.closingSubreason || "", "Tipo do cabo": call.cableType || "",
          "Tempo (h)": Math.round((minutes / 60) * 10) / 10,
          Prazo: sla === "outlier" ? "Outlier" : sla === "late" ? "Fora do prazo" : "No prazo",
        };
      });
      const sheet = XLSX.utils.json_to_sheet(rows);
      const headers = Object.keys(rows[0] ?? { Ordem: "" });
      sheet["!cols"] = headers.map((key) => ({ wch: Math.min(40, Math.max(10, key.length + 2, ...rows.slice(0, 200).map((row) => String((row as Record<string, unknown>)[key] ?? "").length))) }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Chamados");
      XLSX.writeFile(book, title + " " + new Date().toLocaleDateString("pt-BR").replace(/\//g, "-") + ".xlsx");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel exportar os chamados.");
    } finally {
      setExporting(null);
    }
  }

  async function refreshCalls() {
    setLoading(true);
    try {
      const requestStatus = unassignedOnly ? inProgressCallStatuses : statusFilter === "Todos" ? (closedOnly ? ["Finalizado", "Cancelado", "Baixar", "GIGA+"] as CallStatus[] : assignedOnly ? inProgressCallStatuses : status) : statusFilter;
      const data = await api.calls(requestStatus, {
        from: dateRange.from,
        to: dateRange.to,
        teamScope: teamScoped,
        search: searchQuery,
        region: regionFilter === "Todas" ? undefined : regionFilter,
    area: areaFilter === "Todas" ? undefined : areaFilter,
        neighborhood: neighborhoodFilter === "Todos" ? undefined : neighborhoodFilter,
        olt: oltFilter === "Todas" ? undefined : oltFilter,
        hasTechnician: assignedOnly ? (statusFilter === "GIGA+" ? undefined : true) : unassignedOnly ? false : undefined,
        gigaClosed: closedOnly ? true : assignedOnly ? false : undefined,
        page: callsPage,
        pageSize: CALLS_PAGE_SIZE,
        ...queueOrder,
      });
      setCalls(data.calls);
      setTotalCalls(data.total);
      setTotalPages(data.totalPages);
      setAvailableOlts(data.olts);
      callsPageCache.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel atualizar chamados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    const requestStatus = unassignedOnly ? inProgressCallStatuses : statusFilter === "Todos" ? (closedOnly ? ["Finalizado", "Cancelado", "Baixar", "GIGA+"] as CallStatus[] : assignedOnly ? inProgressCallStatuses : status) : statusFilter;
    const requestRegion = regionFilter === "Todas" ? undefined : regionFilter;
    const requestNeighborhood = neighborhoodFilter === "Todos" ? undefined : neighborhoodFilter;
    const requestOlt = oltFilter === "Todas" ? undefined : oltFilter;
    const cacheKey = JSON.stringify({ status: requestStatus, from: dateRange.from, to: dateRange.to, teamScope: teamScoped, search: searchQuery, region: requestRegion, area: areaFilter, neighborhood: requestNeighborhood, olt: requestOlt, hasTechnician: assignedOnly ? (statusFilter === "GIGA+" ? undefined : true) : unassignedOnly ? false : undefined, page: callsPage, pageSize: CALLS_PAGE_SIZE, order: queueOrder, closedOnly, assignedOnly, unassignedOnly });
    const cached = callsPageCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      if (active) {
        setCalls(cached.result.calls);
        setTotalCalls(cached.result.total);
        setTotalPages(cached.result.totalPages);
        setAvailableOlts(cached.result.olts);
      }
      return () => { active = false; };
    }

    setLoading(true);
    setError('');
    api
      .calls(requestStatus, {
        from: dateRange.from,
        to: dateRange.to,
        teamScope: teamScoped,
        search: searchQuery,
        region: requestRegion,
        area: areaFilter === "Todas" ? undefined : areaFilter,
        neighborhood: requestNeighborhood,
        olt: requestOlt,
        hasTechnician: assignedOnly ? (statusFilter === "GIGA+" ? undefined : true) : unassignedOnly ? false : undefined,
        gigaClosed: closedOnly ? true : assignedOnly ? false : undefined,
        page: callsPage,
        pageSize: CALLS_PAGE_SIZE,
        ...queueOrder,
      })
      .then((data) => {
        if (!active) return;
        setCalls(data.calls);
        setTotalCalls(data.total);
        setTotalPages(data.totalPages);
        setAvailableOlts(data.olts);
        callsPageCache.set(cacheKey, { expiresAt: Date.now() + 15000, result: data });
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Nao foi possivel carregar os chamados.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [status, assignedOnly, unassignedOnly, closedOnly, teamScoped, searchQuery, statusFilter, regionFilter, areaFilter, neighborhoodFilter, oltFilter, dateRange.from, dateRange.to, callsPage, sortState]);

  async function updateCallStatus(call: Call, nextStatus: CallStatus) {
    if (nextStatus === call.status) return;
    try {
      await api.updateCall(call.id, { status: nextStatus });
      setActionError('');
      await refreshCalls();
      setCountsVersion((current) => current + 1);
      window.dispatchEvent(new Event('jh-redeflow:calls-changed'));
    } catch (err) {
      // Erro ao salvar nao esconde a lista (o 'error' da pagina e so para falha ao carregar).
      setActionError(`${call.orderNumber}: ${err instanceof Error ? err.message : 'nao foi possivel alterar o status.'}`);
    }
  }

  const closedView = closedOnly;
  const showTechnician = !unassignedOnly;
  const currentCalls = calls.map((call) => (isCallClosed(call) ? call : { ...call, executedAt: null }));
  const firstVisibleCall = totalCalls ? (callsPage - 1) * CALLS_PAGE_SIZE + 1 : 0;
  const lastVisibleCall = totalCalls ? Math.min(callsPage * CALLS_PAGE_SIZE, totalCalls) : 0;
  // Opcoes que nao somem ao filtrar: regioes oficiais + as que aparecem nos chamados + a selecionada.
  const regions = [...new Set([...operationalRegions, ...calls.map((call) => call.region), ...(regionFilter === "Todas" ? [] : [regionFilter])].filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const neighborhoods = [...new Set([...calls.map((call) => call.bairro).filter((item): item is string => Boolean(item)), ...(neighborhoodFilter === "Todos" ? [] : [neighborhoodFilter])])].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const olts = [...new Set([...availableOlts, ...(oltFilter === "Todas" ? [] : [oltFilter])])];
  const statusChoices: (CallStatus | "Todos")[] = unassignedOnly ? [] : closedView ? ["Todos", "Finalizado", "Cancelado", "Baixar", "GIGA+"] : assignedOnly ? ["Todos", ...attendanceStatusOptions, "GIGA+"] : ["Todos", ...CALL_STATUSES];
  // Quantos chamados cada aba de status teria com os filtros atuais (uma consulta leve por aba: pageSize 1).
  useEffect(() => {
    if (!statusChoices.length) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void Promise.all(statusChoices.map((choice) => api.calls(statusesFor(choice), { ...listFilters(choice), page: 1, pageSize: 1 }).then((result) => [choice, result.total] as const).catch(() => [choice, undefined] as const)))
        .then((entries) => { if (active) setStatusCounts(Object.fromEntries(entries)); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, assignedOnly, unassignedOnly, closedOnly, teamScoped, searchQuery, regionFilter, areaFilter, neighborhoodFilter, oltFilter, dateRange.from, dateRange.to, totalCalls, countsVersion]);
  const activeFilters = [
    !unassignedOnly && statusFilter !== "Todos",
    regionFilter !== "Todas",
    areaFilter !== "Todas",
    neighborhoodFilter !== "Todos",
    oltFilter !== "Todas",
    Boolean(dateRange.from || dateRange.to),
    Boolean(query.trim()),
  ].filter(Boolean).length;
  function clearFilters() {
    if (!unassignedOnly) setStatusFilter("Todos");
    setRegionFilter("Todas");
    setAreaFilter("Todas");
    setNeighborhoodFilter("Todos");
    setOltFilter("Todas");
    setDateRange({ from: "", to: "" });
    setQuery("");
  }
  const slaTally = closedView ? null : currentCalls.reduce((tally, call) => { tally[getSlaState(minutesBetween(call.openedAt), call.type) as SlaState] += 1; return tally; }, { "on-time": 0, late: 0, outlier: 0 } as Record<SlaState, number>);
  const plural = (count: number, one: string, many: string) => `${count.toLocaleString("pt-BR")} ${count === 1 ? one : many}`;
  const description = unassignedOnly ? "Chamados ainda sem técnico." : assignedOnly ? "Chamados com técnico, em andamento." : closedView ? "Chamados finalizados, cancelados ou a baixar." : "Chamados da equipe.";
  const rowSla = (call: Call) => getSlaState(minutesBetween(call.openedAt, closedView ? call.executedAt : undefined), call.type) as SlaState;
  const statusSelect = (call: Call) => (
    <select className={`cq-status is-${call.status.toLowerCase().replace("+", "-mais").replace(" ", "-")}`} value={call.status} onClick={(event) => event.stopPropagation()} onChange={async (event) => { event.stopPropagation(); await updateCallStatus(call, event.target.value as CallStatus); }} aria-label={`Status do chamado ${call.orderNumber}`}>
      {CALL_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
  );
  const orderCell = (call: Call) => <td data-label="Ordem"><CopyText value={call.orderNumber} label={`o chamado ${call.orderNumber}`} className="cq-order" />{call.bdesk && call.bdesk !== call.orderNumber && <small className="table-subtext">BDESK <CopyText value={call.bdesk} label={`o BDESK ${call.bdesk}`} className="cq-bdesk" /></small>}<div className="cq-order-badges">{call.atrelada && <span className="call-badge atrelado" title={`Atrelada à ordem ${call.atrelada}`}>Atrelada {call.atrelada}</span>}<RiskBadge risk={risks[call.id]} />{repeatFlags[call.id] ? <span className="call-badge reincidente" title={`${repeatFlags[call.id]} chamado(s) no mesmo endereço, OLT e slot/PON nos 30 dias anteriores`}>Reincidente</span> : null}</div></td>;
  const eventCell = (call: Call) => <td data-label="Evento"><strong>{call.type}</strong><small className="table-subtext">{call.reason}</small></td>;
  const placeCell = (call: Call, withOlt = false) => <td data-label="Local" className="cq-place"><strong>{call.bairro || call.city || <span className="muted-cell">Sem bairro</span>}</strong><small className="table-subtext">{[call.region, call.address].filter(Boolean).join(", ") || "-"}</small>{withOlt && call.olt && <small className="table-subtext cq-olt-line">{call.olt}{call.slotPon ? ` PON ${call.slotPon}` : ""}</small>}</td>;
  const oltCell = (call: Call) => <td data-label="OLT"><span className="cq-olt">{call.olt || <span className="muted-cell">-</span>}</span>{call.slotPon && <small className="table-subtext">PON {call.slotPon}</small>}</td>;
  const technicianCell = (call: Call) => <td data-label="Técnico">{call.technicianName ? <strong>{call.technicianName}</strong> : <span className="unassigned">Sem técnico</span>}<small className="table-subtext">{call.supportTechnicianName ? <>Apoio: {call.supportTechnicianName}</> : call.supervisorName || "Sem supervisor"}</small></td>;
  const columns = closedView
    ? ["Ordem", "Técnico", "Evento", "Local", "Abertura", "Data Fim", "Tempo total", "Status"]
    : assignedOnly
      ? ["Protocolo", "Técnico", "Na fila", "Evento", "Local e OLT", "Última observação", "Status"]
      : [...(showTechnician ? ["Ordem", "Técnico"] : ["Ordem"]), "Na fila", "Evento", "Local", "OLT", "Status OFS", "Status"];

  return (
    <>
      <div className="page-heading cq-heading">
        <div>
          <span className="section-kicker">OPERAÇÃO</span>
          <h1>{title}</h1>
          <p>
            {description} {plural(totalCalls, "chamado", "chamados")}{activeFilters ? " com os filtros atuais" : ""}.
            {slaTally && currentCalls.length > 0 && <span className="cq-tally">{totalPages > 1 ? " Nesta página: " : " "}<b className={slaTally["on-time"] ? "is-on-time" : ""}>{slaTally["on-time"]} no prazo</b>, <b className={slaTally.late ? "is-late" : ""}>{slaTally.late} fora do prazo</b> e <b className={slaTally.outlier ? "is-outlier" : ""}>{plural(slaTally.outlier, "outlier", "outliers")}</b>.</span>}
          </p>
        </div>
        <div className="cq-heading-actions">
          <button className="secondary-button compact" onClick={() => void exportExcel()} type="button" disabled={Boolean(exporting) || totalCalls === 0} title="Exportar todos os chamados com os filtros atuais">
            <FileSpreadsheet size={15} /> {exporting ?? "Exportar Excel"}
          </button>
          <button className="secondary-button compact" onClick={() => void copyTableAsImage()} type="button" aria-label="Copiar tabela como imagem">
            <Copy size={15} />
            {copyState === "copied" ? "Imagem copiada" : copyState === "downloaded" ? "PNG baixado" : copyState === "error" ? "Falha ao exportar" : "Copiar imagem"}
          </button>
          <button className={`secondary-button compact ${loading ? "is-refreshing" : ""}`} onClick={() => void refreshCalls()} disabled={loading} type="button">
            <Activity size={15} /> {loading ? "Atualizando" : "Atualizar"}
          </button>
        </div>
      </div>
      <section className="panel cq-panel" ref={panelRef}>
        <div className="cq-filters" role="search">
          <div className="cq-filters-top">
            <label className="cq-search">
              <Search size={16} aria-hidden="true" />
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); document.querySelector<HTMLElement>(".cq-row")?.focus(); } }} placeholder="Pesquisar" aria-label="Pesquisar chamados (atalho: /)" title="Pesquisa em todos os campos do chamado: ordem, BDESK, status, status do OFS, técnico, apoio, região, bairro, endereço, OLT, PON, observações... Várias palavras em qualquer ordem." />
              {query && <button type="button" className="cq-search-clear" onClick={() => setQuery("")} aria-label="Limpar busca"><X size={14} /></button>}
            </label>
            {statusChoices.length > 0 && (
              <div className="cq-status-tabs" role="group" aria-label="Filtrar por status">
                {statusChoices.map((item) => <button key={item} type="button" title={assignedOnly && item === "GIGA+" ? "Chamados do outro escritório (GIGA+): ficam à parte e não entram no Todos" : undefined} className={`${statusFilter === item ? "is-selected" : ""}${assignedOnly && item === "GIGA+" ? " cq-tab-apart" : ""}`.trim()} aria-pressed={statusFilter === item} onClick={() => setStatusFilter(item)}>{item}{statusCounts[item] !== undefined && <span className="cq-tab-count">{statusCounts[item]!.toLocaleString("pt-BR")}</span>}</button>)}
              </div>
            )}
          </div>
          <div className="cq-filters-grid">
            <FilterField label="Área" active={areaFilter !== "Todas"}>
              <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value as AreaFilter)}><option value="Todas">Todas as áreas</option><option value="SP">SP</option><option value="GRU">GRU</option><option value="ALTO_TIETE">Alto Tietê</option><option value="ABC">ABC</option></select>
            </FilterField>
            <FilterField label="Região" active={regionFilter !== "Todas"}>
              <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option value="Todas">Todas as regiões</option>{regions.map((region) => <option key={region} value={region}>{region}</option>)}</select>
            </FilterField>
            <FilterField label="Bairro" active={neighborhoodFilter !== "Todos"}>
              <select value={neighborhoodFilter} onChange={(event) => setNeighborhoodFilter(event.target.value)}><option value="Todos">Todos os bairros</option>{neighborhoods.map((neighborhood) => <option key={neighborhood} value={neighborhood}>{neighborhood}</option>)}</select>
            </FilterField>
            <FilterField label="OLT" active={oltFilter !== "Todas"}>
              <select value={oltFilter} onChange={(event) => setOltFilter(event.target.value)}><option value="Todas">Todas as OLTs</option>{olts.map((olt) => <option key={olt} value={olt}>{olt}</option>)}</select>
            </FilterField>
            <FilterField label={closedView ? "Encerrados de" : "Abertos de"} active={Boolean(dateRange.from)}>
              <input type="date" value={dateRange.from} max={dateRange.to || undefined} onChange={(event) => setDateRange({ ...dateRange, from: event.target.value })} />
            </FilterField>
            <FilterField label="Até" active={Boolean(dateRange.to)}>
              <input type="date" value={dateRange.to} min={dateRange.from || undefined} onChange={(event) => setDateRange({ ...dateRange, to: event.target.value })} />
            </FilterField>
            <div className="cq-filters-summary">
              <span aria-live="polite">{loading ? "Atualizando..." : plural(totalCalls, "resultado", "resultados")}</span>
              {activeFilters > 0 && <button type="button" className="cq-clear" onClick={clearFilters}>Limpar filtros ({activeFilters})</button>}
            </div>
          </div>
        </div>
        {actionError && <div className="cq-action-error" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError("")} aria-label="Fechar aviso"><X size={14} /></button></div>}
        {error ? (
          <div className="cq-empty is-error" role="alert"><strong>Não foi possível carregar os chamados.</strong><span>{error}</span><button type="button" className="secondary-button compact" onClick={() => void refreshCalls()}>Tentar de novo</button></div>
        ) : (
          <div className="table-scroll-container cq-scroll">
            <table ref={tableRef} className={`cq-table${loading ? " is-loading" : ""}`}>
              <thead><tr>{columns.map((column) => {
                const key = SORTABLE_COLUMNS[column];
                if (!key) return <th key={column}>{column}</th>;
                const active = sortState?.sort === key;
                const Icon = !active ? ArrowUpDown : sortState?.direction === "asc" ? ArrowUp : ArrowDown;
                return <th key={column} aria-sort={active ? (sortState?.direction === "asc" ? "ascending" : "descending") : "none"}><button type="button" className={`cq-sort${active ? " is-active" : ""}`} onClick={() => toggleSort(key)} title={`Ordenar por ${column.toLowerCase()}`}>{column}<Icon size={12} aria-hidden="true" /></button></th>;
              })}</tr></thead>
              <tbody>
                {currentCalls.map((call) => (
                  <tr key={call.id} className={`cq-row is-${rowSla(call)}`} tabIndex={0} onClick={() => navigate(`/chamados/${call.id}${teamScoped ? "?teamScope=true" : ""}`)} onKeyDown={(event) => {
                    // So quando a propria linha esta em foco (nao o seletor de status dentro dela).
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter") navigate(`/chamados/${call.id}${teamScoped ? "?teamScope=true" : ""}`);
                    else if (event.key === "ArrowDown" || event.key === "j") { event.preventDefault(); (event.currentTarget.nextElementSibling as HTMLElement | null)?.focus(); }
                    else if (event.key === "ArrowUp" || event.key === "k") { event.preventDefault(); (event.currentTarget.previousElementSibling as HTMLElement | null)?.focus(); }
                    else if (event.key === "Home") { event.preventDefault(); (event.currentTarget.parentElement?.firstElementChild as HTMLElement | null)?.focus(); }
                    else if (event.key === "End") { event.preventDefault(); (event.currentTarget.parentElement?.lastElementChild as HTMLElement | null)?.focus(); }
                  }}>
                    {closedView ? <>
                      {orderCell(call)}{technicianCell(call)}{eventCell(call)}{placeCell(call)}
                      <td data-label="Abertura">{shortDateTime(call.openedAt)}</td>
                      <td data-label="Data Fim">{formatCallTimestamp(call.executedAt)}</td>
                      <td data-label="Tempo total"><QueueClock openedAt={call.openedAt} endedAt={call.executedAt} closed type={call.type} /></td>
                      <td data-label="Status">{statusSelect(call)}</td>
                    </> : assignedOnly ? <>
                      {orderCell(call)}{technicianCell(call)}
                      <td data-label="Na fila"><QueueClock openedAt={call.openedAt} type={call.type} /><small className="table-subtext">desde {shortDateTime(call.openedAt)}</small></td>
                      {eventCell(call)}{placeCell(call, true)}
                      <td data-label="Última observação" className="cq-observation">{(() => {
                        const latest = latestObservations[call.id];
                        const shown = latest ? `${latest.userName}: ${latest.text}` : call.notes;
                        const content = <><TimerCell lastObservationAt={call.lastObservationAt} />{shown && <small className="table-subtext" title={shown}>{shown}</small>}</>;
                        return canAddObservation
                          ? <button type="button" className="cq-observation-button" title="Escrever nova observação" aria-label={`Nova observação no chamado ${call.orderNumber}`} onClick={(event) => { event.stopPropagation(); setObservationCall(call); }} onKeyDown={(event) => event.stopPropagation()}>{content}</button>
                          : content;
                      })()}</td>
                      <td data-label="Status">{statusSelect(call)}<small className="table-subtext">OFS: {call.ofsStatus || "-"}</small></td>
                    </> : <>
                      {orderCell(call)}{showTechnician && technicianCell(call)}
                      <td data-label="Na fila"><QueueClock openedAt={call.openedAt} type={call.type} /><small className="table-subtext">desde {shortDateTime(call.openedAt)}</small></td>
                      {eventCell(call)}{placeCell(call)}{oltCell(call)}
                      <td data-label="Status OFS">{call.ofsStatus || <span className="muted-cell">-</span>}</td>
                      <td data-label="Status">{statusSelect(call)}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && currentCalls.length === 0 && (
              <div className="cq-empty">
                {activeFilters > 0
                  ? <><strong>Nenhum chamado com esses filtros.</strong><span>Revise a busca ou os filtros para ver mais chamados.</span><button type="button" className="secondary-button compact" onClick={clearFilters}>Limpar filtros</button></>
                  : <><strong>{unassignedOnly ? "Nenhum chamado sem técnico agora." : assignedOnly ? "Nenhum chamado em atendimento agora." : closedView ? "Nenhum chamado encerrado ainda." : "Nenhum chamado para mostrar."}</strong><span>{unassignedOnly ? "Novos acionamentos aceitos aparecem aqui." : "A lista atualiza ao clicar em Atualizar."}</span></>}
              </div>
            )}
          </div>
        )}
        {!error && totalCalls > 0 && <div className="calls-pagination">
          <span>{firstVisibleCall.toLocaleString("pt-BR")}–{lastVisibleCall.toLocaleString("pt-BR")} de {plural(totalCalls, "chamado", "chamados")}</span>
          <div className="calls-pagination-controls">
            <button className="secondary-button compact" type="button" onClick={() => setCallsPage((page: number) => Math.max(1, page - 1))} disabled={callsPage <= 1} aria-label="Página anterior">Anterior</button>
            <span aria-live="polite">Página {callsPage.toLocaleString("pt-BR")} de {totalPages.toLocaleString("pt-BR")}</span>
            <button className="secondary-button compact" type="button" onClick={() => setCallsPage((page: number) => Math.min(totalPages, page + 1))} disabled={callsPage >= totalPages} aria-label="Próxima página">Próxima</button>
          </div>
        </div>}
      </section>
      {observationCall && <ObservationPopup call={observationCall} teamScoped={teamScoped} onClose={() => setObservationCall(null)} onSaved={(observation) => {
        // A linha atualiza na hora: texto novo e o contador volta a zero (lastObservationAt = agora).
        setLatestObservations((current) => ({ ...current, [observationCall.id]: { text: observation.text, userName: observation.userName, createdAt: observation.createdAt } }));
        setCalls((current) => current.map((item) => item.id === observationCall.id ? { ...item, lastObservationAt: observation.createdAt } : item));
        setObservationCall(null);
      }} />}
    </>
  );
}
