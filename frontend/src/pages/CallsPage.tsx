import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Activity, Copy, Search, X } from "lucide-react";
import { api, type Call, type CallListQuery, type CallListResult, type CallStatus, type Role, type User } from "../api";
import { SLA_ON_TIME_MAX_MINUTES, SLA_OUTLIER_AFTER_MINUTES, TimerCell, formatCallTimestamp, getSlaState } from "../components/call-cells";
import { CALLS_PAGE_SIZE, operationalRegions } from "../lib/constants";
import { getImageCaptureScale } from "../lib/image-export";

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
  const fallback = { query: "", statusFilter: "Todos" as CallStatus | "Todos", regionFilter: "Todas", neighborhoodFilter: "Todos", oltFilter: "Todas", dateRange: { from: "", to: "" }, showFilters: false, callsPage: 1 };
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

export const inProgressCallStatuses: CallStatus[] = ["Aberto", "Atribuido", "Deslocamento", "Em campo"];
// Filtro de status de "Em atendimento": so lista chamados com tecnico, entao "Aberto" (sem tecnico) sempre vinha vazio.
const attendanceStatusOptions: CallStatus[] = ["Atribuido", "Deslocamento", "Em campo"];

const SLA_LABELS = { "on-time": "No prazo", late: "Fora do prazo", outlier: "Outlier" } as const;
type SlaState = keyof typeof SLA_LABELS;
const CALL_STATUSES: CallStatus[] = ["Aberto", "Atribuido", "Deslocamento", "Em campo", "Finalizado", "Cancelado", "Baixar"];

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
function QueueClock({ openedAt, endedAt, closed = false }: { openedAt: string; endedAt?: string | null; closed?: boolean }) {
  if (closed && !endedAt) return <span className="muted-cell">Sem Data Fim</span>;
  const minutes = minutesBetween(openedAt, endedAt);
  const state = getSlaState(minutes) as SlaState;
  const fill = Math.min(100, (minutes / SLA_OUTLIER_AFTER_MINUTES) * 100);
  const tick = (SLA_ON_TIME_MAX_MINUTES / SLA_OUTLIER_AFTER_MINUTES) * 100;
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

export function CallsPage({ status, title, assignedOnly = false, unassignedOnly = false, teamScoped = false, closedOnly = false }: { status?: CallStatus; title: string; assignedOnly?: boolean; unassignedOnly?: boolean; teamScoped?: boolean; closedOnly?: boolean }) {
  const pageKey = `${teamScoped ? 'team' : 'global'}:${closedOnly ? 'closed' : assignedOnly ? 'assigned-v2' : unassignedOnly ? 'unassigned' : status ?? 'all'}:${title}`;
  const initialState = readCallsPageState(pageKey);
  const [calls, setCalls] = useState<Call[]>([]);
  const [query, setQuery] = useState(initialState.query ?? "");
  const [loading, setLoading] = useState(false);
  const [regionFilter, setRegionFilter] = useState(initialState.regionFilter ?? "Todas");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState(initialState.neighborhoodFilter ?? "Todos");
  const [oltFilter, setOltFilter] = useState(initialState.oltFilter ?? "Todas");
  const [availableOlts, setAvailableOlts] = useState<string[]>([]);
  const savedStatusFilter = initialState.statusFilter ?? "Todos";
  const initialStatusFilter = unassignedOnly ? "Aberto" : assignedOnly && savedStatusFilter !== "Todos" && !attendanceStatusOptions.includes(savedStatusFilter as CallStatus) ? "Todos" : savedStatusFilter;
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

  useEffect(() => { const interval = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(interval); }, []);
  useEffect(() => { writeCallsPageState(pageKey, { query, statusFilter, regionFilter, neighborhoodFilter, oltFilter, dateRange, showFilters, callsPage }); }, [pageKey, query, statusFilter, regionFilter, neighborhoodFilter, oltFilter, dateRange, showFilters, callsPage]);
  useEffect(() => { setCallsPage(1); }, [query, statusFilter, regionFilter, neighborhoodFilter, oltFilter, dateRange.from, dateRange.to, status, teamScoped, closedOnly, assignedOnly]);
  async function copyTableAsImage() {
    const table = tableRef.current;
    if (!table) return;

    const readCellLines = (cell: HTMLTableCellElement) => {
      const prazo = cell.dataset.prazo || cell.querySelector<HTMLElement>("[data-prazo]")?.dataset.prazo;
      // Caixa de status: so o valor escolhido (innerText traria todas as opcoes) + a linha "OFS" quando houver.
      const select = cell.querySelector("select");
      const selectText = select ? [select.value, ...Array.from(cell.querySelectorAll<HTMLElement>(".table-subtext"), (item) => item.innerText)].join("\n") : "";
      const text = prazo || selectText || cell.innerText || cell.textContent || "";
      return text.split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    };
    const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"), (cell) => readCellLines(cell).join(" "));
    const dataRows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))
      .filter((row) => row.cells.length === headers.length)
      .map((row) => Array.from(row.cells, readCellLines));
    if (!headers.length) return;

    const normalizedHeaders = headers.map((header) => header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
    const columnWidths = normalizedHeaders.map((header) => {
      if (/ordem|protocolo/.test(header)) return 140;
      if (/local/.test(header)) return 300;
      if (/evento/.test(header)) return 210;
      if (/na fila|tempo total/.test(header)) return 150;
      if (/ultima observacao/.test(header)) return 210;
      if (/cliente/.test(header)) return 235;
      if (/tipo|motivo/.test(header)) return 210;
      if (/bairro|endere/.test(header)) return 330;
      if (/abertura|data fim/.test(header)) return 155;
      if (/tempo aguardando|timer|sla/.test(header)) return 145;
      if (/prazo/.test(header)) return 135;
      if (/afet/.test(header)) return 82;
      if (/status/.test(header)) return 138;
      if (/regiao/.test(header)) return 145;
      if (/tecnico/.test(header)) return 175;
      if (/olt/.test(header)) return 130;
      if (/cidade/.test(header)) return 140;
      if (/obs/.test(header)) return 240;
      return 150;
    });
    const tableWidth = columnWidths.reduce((total, width) => total + width, 0);
    const hostWidth = tableWidth + 64;
    const captureHost = document.createElement("div");
    captureHost.style.cssText = `position:fixed;left:-100000px;top:0;width:${hostWidth}px;box-sizing:border-box;padding:32px;background:#edf2f8;color:#25364d;font-family:'Manrope','Segoe UI',Arial,sans-serif;`;

    const card = document.createElement("div");
    card.style.cssText = "overflow:hidden;border:1px solid #dce4ef;border-radius:12px;background:#fff;box-shadow:0 8px 24px rgba(32,51,77,.08)";
    const heading = document.createElement("div");
    heading.style.cssText = "display:flex;justify-content:space-between;align-items:flex-end;gap:24px;padding:26px 28px 22px;border-bottom:1px solid #e5ebf3";
    const titleBlock = document.createElement("div");
    const brand = document.createElement("div");
    brand.textContent = "JH TELECOM  /  REDEFLOW";
    brand.style.cssText = "margin-bottom:8px;color:#2375d8;font-size:11px;font-weight:800;letter-spacing:1px";
    const headingTitle = document.createElement("div");
    headingTitle.textContent = title;
    headingTitle.style.cssText = "color:#182b45;font-size:25px;font-weight:800;line-height:1.2";
    const metadata = document.createElement("div");
    metadata.textContent = `${dataRows.length} ${dataRows.length === 1 ? "chamado" : "chamados"}  |  ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`;
    metadata.style.cssText = "margin-top:8px;color:#718198;font-size:12px;font-weight:500";
    titleBlock.append(brand, headingTitle, metadata);
    const count = document.createElement("div");
    count.style.cssText = "flex:none;padding:10px 14px;border:1px solid #d9e7f8;border-radius:8px;background:#f2f7fd;color:#315f96;font-size:13px;font-weight:700";
    count.textContent = `${dataRows.length} REGISTROS`;
    heading.append(titleBlock, count);

    const imageTable = document.createElement("table");
    imageTable.style.cssText = `width:${tableWidth}px;table-layout:fixed;border-collapse:collapse;font-family:'Manrope','Segoe UI',Arial,sans-serif`;
    const colgroup = document.createElement("colgroup");
    columnWidths.forEach((width) => {
      const column = document.createElement("col");
      column.style.width = `${width}px`;
      colgroup.appendChild(column);
    });
    imageTable.appendChild(colgroup);
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headers.forEach((header) => {
      const cell = document.createElement("th");
      cell.textContent = header;
      cell.style.cssText = "padding:13px 12px;border-bottom:1px solid #dce4ef;background:#f4f7fb;color:#5b6b80;text-align:left;font-size:10px;font-weight:800;text-transform:uppercase;vertical-align:middle";
      headerRow.appendChild(cell);
    });
    thead.appendChild(headerRow);
    imageTable.appendChild(thead);
    const tbody = document.createElement("tbody");
    dataRows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      tr.style.background = rowIndex % 2 === 0 ? "#ffffff" : "#f9fbfe";
      row.forEach((lines, columnIndex) => {
        const cell = document.createElement("td");
        cell.style.cssText = "padding:13px 12px;border-bottom:1px solid #e8edf4;color:#40516a;text-align:left;vertical-align:top;font-size:12px;line-height:1.45;overflow-wrap:anywhere;white-space:normal";
        const header = normalizedHeaders[columnIndex] || "";
        const value = lines.join(" ");
        if (/status|prazo/.test(header) && value && value !== "-") {
          const badge = document.createElement("span");
          badge.textContent = value;
          let badgeColors = "background:#edf4fd;color:#315f96";
          if (/cancelad|outlier|fora do prazo/.test(value.toLowerCase())) badgeColors = "background:#fff0f0;color:#a83b43";
          else if (/finalizado|no prazo/.test(value.toLowerCase())) badgeColors = "background:#eaf7f0;color:#18744e";
          badge.style.cssText = `display:inline-block;padding:5px 8px;border-radius:5px;font-size:11px;font-weight:700;${badgeColors}`;
          cell.appendChild(badge);
        } else if (lines.length) {
          lines.forEach((line, lineIndex) => {
            const text = document.createElement("div");
            text.textContent = line;
            text.style.cssText = lineIndex === 0 ? "color:#273b55;font-weight:700" : "margin-top:4px;color:#78869a;font-size:10px;font-weight:500";
            cell.appendChild(text);
          });
        } else {
          cell.textContent = "-";
          cell.style.color = "#a0aaba";
        }
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    if (!dataRows.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = headers.length;
      cell.textContent = "Nenhum chamado para os filtros selecionados.";
      cell.style.cssText = "padding:28px;color:#718198;text-align:center;font-size:13px";
      row.appendChild(cell);
      tbody.appendChild(row);
    }
    imageTable.appendChild(tbody);
    const footer = document.createElement("div");
    footer.textContent = "JH RedeFlow  |  Relatório operacional";
    footer.style.cssText = "padding:12px 18px;background:#fbfcfe;color:#8a97a8;text-align:right;font-size:10px;font-weight:600";
    card.append(heading, imageTable, footer);
    captureHost.appendChild(card);
    document.body.appendChild(captureHost);

    try {
      await document.fonts.ready;
      const captureHeight = captureHost.scrollHeight;
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(captureHost, {
        backgroundColor: "#edf2f8",
        scale: getImageCaptureScale(hostWidth, captureHeight),
        width: hostWidth,
        height: captureHeight,
        windowWidth: hostWidth,
        windowHeight: captureHeight,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Nao foi possivel gerar a imagem.");

      if (navigator.clipboard?.write && window.ClipboardItem) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setCopyState("copied");
        } catch {
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = downloadUrl;
          link.download = "redeflow-chamados.png";
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
          setCopyState("downloaded");
        }
      } else {
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = "redeflow-chamados.png";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        setCopyState("downloaded");
      }
    } catch {
      setCopyState("error");
    } finally {
      captureHost.remove();
    }

    window.setTimeout(() => setCopyState("idle"), 2200);
  }

  async function refreshCalls() {
    setLoading(true);
    try {
      const requestStatus = unassignedOnly ? inProgressCallStatuses : statusFilter === "Todos" ? (closedOnly ? ["Finalizado", "Cancelado", "Baixar"] as CallStatus[] : assignedOnly ? inProgressCallStatuses : status) : statusFilter;
      const data = await api.calls(requestStatus, {
        from: dateRange.from,
        to: dateRange.to,
        teamScope: teamScoped,
        search: query.trim(),
        region: regionFilter === "Todas" ? undefined : regionFilter,
        neighborhood: neighborhoodFilter === "Todos" ? undefined : neighborhoodFilter,
        olt: oltFilter === "Todas" ? undefined : oltFilter,
        hasTechnician: assignedOnly ? true : unassignedOnly ? false : undefined,
        page: callsPage,
        pageSize: CALLS_PAGE_SIZE,
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
    const requestStatus = unassignedOnly ? inProgressCallStatuses : statusFilter === "Todos" ? (closedOnly ? ["Finalizado", "Cancelado", "Baixar"] as CallStatus[] : assignedOnly ? inProgressCallStatuses : status) : statusFilter;
    const requestRegion = regionFilter === "Todas" ? undefined : regionFilter;
    const requestNeighborhood = neighborhoodFilter === "Todos" ? undefined : neighborhoodFilter;
    const requestOlt = oltFilter === "Todas" ? undefined : oltFilter;
    const cacheKey = JSON.stringify({ status: requestStatus, from: dateRange.from, to: dateRange.to, teamScope: teamScoped, search: query.trim(), region: requestRegion, neighborhood: requestNeighborhood, olt: requestOlt, hasTechnician: assignedOnly ? true : unassignedOnly ? false : undefined, page: callsPage, pageSize: CALLS_PAGE_SIZE, closedOnly, assignedOnly, unassignedOnly });
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
        search: query.trim(),
        region: requestRegion,
        neighborhood: requestNeighborhood,
        olt: requestOlt,
        hasTechnician: assignedOnly ? true : unassignedOnly ? false : undefined,
        page: callsPage,
        pageSize: CALLS_PAGE_SIZE,
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
  }, [status, assignedOnly, unassignedOnly, closedOnly, teamScoped, query, statusFilter, regionFilter, neighborhoodFilter, oltFilter, dateRange.from, dateRange.to, callsPage]);

  async function updateCallStatus(call: Call, nextStatus: CallStatus) {
    if (nextStatus === call.status) return;
    try {
      await api.updateCall(call.id, { status: nextStatus });
      setError('');
      await refreshCalls();
      window.dispatchEvent(new Event('jh-redeflow:calls-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel alterar o status do chamado.');
    }
  }

  const closedView = closedOnly;
  const showTechnician = !unassignedOnly;
  const currentCalls = calls.map((call) => (["Finalizado", "Cancelado", "Baixar"].includes(call.status) ? call : { ...call, executedAt: null }));
  const firstVisibleCall = totalCalls ? (callsPage - 1) * CALLS_PAGE_SIZE + 1 : 0;
  const lastVisibleCall = totalCalls ? Math.min(callsPage * CALLS_PAGE_SIZE, totalCalls) : 0;
  // Opcoes que nao somem ao filtrar: regioes oficiais + as que aparecem nos chamados + a selecionada.
  const regions = [...new Set([...operationalRegions, ...calls.map((call) => call.region), ...(regionFilter === "Todas" ? [] : [regionFilter])].filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const neighborhoods = [...new Set([...calls.map((call) => call.bairro).filter((item): item is string => Boolean(item)), ...(neighborhoodFilter === "Todos" ? [] : [neighborhoodFilter])])].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const olts = [...new Set([...availableOlts, ...(oltFilter === "Todas" ? [] : [oltFilter])])];
  const statusChoices: (CallStatus | "Todos")[] = unassignedOnly ? [] : closedView ? ["Todos", "Finalizado", "Cancelado", "Baixar"] : assignedOnly ? ["Todos", ...attendanceStatusOptions] : ["Todos", ...CALL_STATUSES];
  const activeFilters = [
    !unassignedOnly && statusFilter !== "Todos",
    regionFilter !== "Todas",
    neighborhoodFilter !== "Todos",
    oltFilter !== "Todas",
    Boolean(dateRange.from || dateRange.to),
    Boolean(query.trim()),
  ].filter(Boolean).length;
  function clearFilters() {
    if (!unassignedOnly) setStatusFilter("Todos");
    setRegionFilter("Todas");
    setNeighborhoodFilter("Todos");
    setOltFilter("Todas");
    setDateRange({ from: "", to: "" });
    setQuery("");
  }
  const slaTally = closedView ? null : currentCalls.reduce((tally, call) => { tally[getSlaState(minutesBetween(call.openedAt)) as SlaState] += 1; return tally; }, { "on-time": 0, late: 0, outlier: 0 } as Record<SlaState, number>);
  const plural = (count: number, one: string, many: string) => `${count.toLocaleString("pt-BR")} ${count === 1 ? one : many}`;
  const description = unassignedOnly ? "Chamados ainda sem técnico." : assignedOnly ? "Chamados com técnico, em andamento." : closedView ? "Chamados finalizados, cancelados ou a baixar." : "Chamados da equipe.";
  const rowSla = (call: Call) => getSlaState(minutesBetween(call.openedAt, closedView ? call.executedAt : undefined)) as SlaState;
  const statusSelect = (call: Call) => (
    <select className={`cq-status is-${call.status.toLowerCase().replace(" ", "-")}`} value={call.status} onClick={(event) => event.stopPropagation()} onChange={async (event) => { event.stopPropagation(); await updateCallStatus(call, event.target.value as CallStatus); }} aria-label={`Status do chamado ${call.orderNumber}`}>
      {CALL_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
  );
  const orderCell = (call: Call) => <td data-label="Ordem"><strong className="cq-order">{call.orderNumber}</strong>{call.bdesk && call.bdesk !== call.orderNumber && <small className="table-subtext">BDESK {call.bdesk}</small>}{call.atrelada && <span className="call-badge atrelado" title={`Atrelada à ordem ${call.atrelada}`}>Atrelada {call.atrelada}</span>}</td>;
  const eventCell = (call: Call) => <td data-label="Evento"><strong>{call.type}</strong><small className="table-subtext">{call.reason}</small></td>;
  const placeCell = (call: Call, withOlt = false) => <td data-label="Local" className="cq-place"><strong>{call.bairro || call.city || <span className="muted-cell">Sem bairro</span>}</strong><small className="table-subtext">{[call.region, call.address].filter(Boolean).join(", ") || "-"}</small>{withOlt && call.olt && <small className="table-subtext cq-olt-line">{call.olt}{call.slotPon ? ` PON ${call.slotPon}` : ""}</small>}</td>;
  const oltCell = (call: Call) => <td data-label="OLT"><span className="cq-olt">{call.olt || <span className="muted-cell">-</span>}</span>{call.slotPon && <small className="table-subtext">PON {call.slotPon}</small>}</td>;
  const technicianCell = (call: Call) => <td data-label="Técnico">{call.technicianName ? <strong>{call.technicianName}</strong> : <span className="unassigned">Sem técnico</span>}<small className="table-subtext">{call.supervisorName || "Sem supervisor"}</small></td>;
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
          <button className="secondary-button compact" onClick={() => void copyTableAsImage()} type="button" aria-label="Copiar tabela como imagem">
            <Copy size={15} />
            {copyState === "copied" ? "Imagem copiada" : copyState === "downloaded" ? "PNG baixado" : copyState === "error" ? "Falha ao exportar" : "Copiar imagem"}
          </button>
          <button className={`secondary-button compact ${loading ? "is-refreshing" : ""}`} onClick={() => void refreshCalls()} disabled={loading} type="button">
            <Activity size={15} /> {loading ? "Atualizando" : "Atualizar"}
          </button>
        </div>
      </div>
      <section className="panel cq-panel">
        <div className="cq-filters" role="search">
          <div className="cq-filters-top">
            <label className="cq-search">
              <Search size={16} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por ordem, BDESK, técnico, região ou OLT" aria-label="Buscar chamados" />
              {query && <button type="button" className="cq-search-clear" onClick={() => setQuery("")} aria-label="Limpar busca"><X size={14} /></button>}
            </label>
            {statusChoices.length > 0 && (
              <div className="cq-status-tabs" role="group" aria-label="Filtrar por status">
                {statusChoices.map((item) => <button key={item} type="button" className={statusFilter === item ? "is-selected" : ""} aria-pressed={statusFilter === item} onClick={() => setStatusFilter(item)}>{item}</button>)}
              </div>
            )}
          </div>
          <div className="cq-filters-grid">
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
        {error ? (
          <div className="cq-empty is-error" role="alert"><strong>Não foi possível carregar os chamados.</strong><span>{error}</span><button type="button" className="secondary-button compact" onClick={() => void refreshCalls()}>Tentar de novo</button></div>
        ) : (
          <div className="table-scroll-container cq-scroll">
            <table ref={tableRef} className={`cq-table${loading ? " is-loading" : ""}`}>
              <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
              <tbody>
                {currentCalls.map((call) => (
                  <tr key={call.id} className={`cq-row is-${rowSla(call)}`} tabIndex={0} onClick={() => navigate(`/chamados/${call.id}${teamScoped ? "?teamScope=true" : ""}`)} onKeyDown={(event) => { if (event.key === "Enter") navigate(`/chamados/${call.id}${teamScoped ? "?teamScope=true" : ""}`); }}>
                    {closedView ? <>
                      {orderCell(call)}{technicianCell(call)}{eventCell(call)}{placeCell(call)}
                      <td data-label="Abertura">{shortDateTime(call.openedAt)}</td>
                      <td data-label="Data Fim">{formatCallTimestamp(call.executedAt)}</td>
                      <td data-label="Tempo total"><QueueClock openedAt={call.openedAt} endedAt={call.executedAt} closed /></td>
                      <td data-label="Status">{statusSelect(call)}</td>
                    </> : assignedOnly ? <>
                      {orderCell(call)}{technicianCell(call)}
                      <td data-label="Na fila"><QueueClock openedAt={call.openedAt} /><small className="table-subtext">desde {shortDateTime(call.openedAt)}</small></td>
                      {eventCell(call)}{placeCell(call, true)}
                      <td data-label="Última observação" className="cq-observation"><TimerCell lastObservationAt={call.lastObservationAt} />{call.notes && <small className="table-subtext" title={call.notes}>{call.notes}</small>}</td>
                      <td data-label="Status">{statusSelect(call)}<small className="table-subtext">OFS: {call.ofsStatus || "-"}</small></td>
                    </> : <>
                      {orderCell(call)}{showTechnician && technicianCell(call)}
                      <td data-label="Na fila"><QueueClock openedAt={call.openedAt} /><small className="table-subtext">desde {shortDateTime(call.openedAt)}</small></td>
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
    </>
  );
}
