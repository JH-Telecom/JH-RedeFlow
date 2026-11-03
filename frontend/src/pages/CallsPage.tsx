import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Activity, Copy, Search, SlidersHorizontal } from "lucide-react";
import { api, type Call, type CallListQuery, type CallListResult, type CallStatus, type Role, type User } from "../api";
import { SlaCell, SlaDurationCell, TimerCell, formatCallTimestamp, formatWaiting } from "../components/call-cells";
import { DateRangeFilter } from "../components/ui";
import { CALLS_PAGE_SIZE } from "../lib/constants";
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
  const initialStatusFilter = unassignedOnly ? "Aberto" : assignedOnly && savedStatusFilter !== "Todos" && !inProgressCallStatuses.includes(savedStatusFilter as CallStatus) ? "Todos" : savedStatusFilter;
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
      const text = prazo || cell.innerText || cell.textContent || "";
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
      const requestStatus = unassignedOnly ? "Aberto" : statusFilter === "Todos" ? (closedOnly ? ["Finalizado", "Cancelado", "Baixar"] as CallStatus[] : assignedOnly ? inProgressCallStatuses : status) : statusFilter;
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
    const requestStatus = unassignedOnly ? "Aberto" : statusFilter === "Todos" ? (closedOnly ? ["Finalizado", "Cancelado", "Baixar"] as CallStatus[] : assignedOnly ? inProgressCallStatuses : status) : statusFilter;
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

  const currentCalls = calls.map((call) => (["Finalizado", "Cancelado", "Baixar"].includes(call.status) ? call : { ...call, executedAt: null }));
  const firstVisibleCall = totalCalls ? (callsPage - 1) * CALLS_PAGE_SIZE + 1 : 0;
  const lastVisibleCall = totalCalls ? Math.min(callsPage * CALLS_PAGE_SIZE, totalCalls) : 0;
  const regions = [...new Set(calls.map((call) => call.region).filter(Boolean))];
  const neighborhoods = [...new Set(calls.map((call) => call.bairro).filter((item): item is string => Boolean(item)))];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">OPERACAO</span>
          <h1>{title}</h1>
          <p>
            {totalCalls} chamados na fila atual. Clique em uma linha
            para abrir o atendimento.
          </p>
        </div>
        <div className="calls-heading-actions">
          <button
            className={`secondary-button compact ${loading ? "is-refreshing" : ""}`}
            onClick={() => void refreshCalls()}
            disabled={loading}
          >
            <Activity size={15} /> Atualizar
          </button>
        </div>
      </div>
      <section className={`panel table-panel calls-table${assignedOnly ? " attendance-table" : ""}`}>
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar ordem, cliente/técnico, BDESK, região ou OLT"
            />
          </div>
          <div className="table-toolbar-actions">
            <button className="secondary-button compact" onClick={() => setShowFilters((current) => !current)}>
              <SlidersHorizontal size={15} /> Filtros
            </button>
            <button className="secondary-button compact" onClick={() => void copyTableAsImage()} type="button" aria-label="Copiar tabela como imagem">
              <Copy size={15} />
              {copyState === "copied" ? "Imagem copiada" : copyState === "downloaded" ? "PNG baixado" : copyState === "error" ? "Falha ao exportar" : "Copiar imagem"}
            </button>
            <span className="result-count">{totalCalls} resultados</span>
          </div>
        </div>
        {showFilters && <div className="table-filter-row"><select className="toolbar-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CallStatus | "Todos")}>{unassignedOnly ? <option>Aberto</option> : <><option>Todos</option>{closedOnly ? <><option>Finalizado</option><option>Cancelado</option><option>Baixar</option></> : assignedOnly ? inProgressCallStatuses.map((callStatus) => <option key={callStatus}>{callStatus}</option>) : <><option>Aberto</option><option>Atribuido</option><option>Deslocamento</option><option>Em campo</option><option>Finalizado</option><option>Cancelado</option><option>Baixar</option></>}</>}</select><select className="toolbar-select" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option>Todas</option>{regions.map((region) => <option key={region}>{region}</option>)}</select><select className="toolbar-select" value={neighborhoodFilter} onChange={(event) => setNeighborhoodFilter(event.target.value)}><option>Todos</option>{neighborhoods.map((neighborhood) => <option key={neighborhood}>{neighborhood}</option>)}</select><select className="toolbar-select" value={oltFilter} onChange={(event) => setOltFilter(event.target.value)}><option value="Todas">Todas as OLTs</option>{[...new Set([...availableOlts, ...(oltFilter === "Todas" ? [] : [oltFilter])])].map((olt) => <option key={olt} value={olt}>{olt}</option>)}</select><DateRangeFilter value={dateRange} onChange={setDateRange}/></div>}
        {error ? (
          <div className="empty-state">{error}</div>
        ) : (
          <div className="table-scroll-container">
          <table ref={tableRef}>
            <thead>
              <tr>
                {assignedOnly ? <><th>Protocolo</th><th>Atrelada</th><th>Tecnico</th><th>SLA</th><th>Prazo</th><th>Afet.</th><th>Tipo de evento</th><th>OLT</th><th>Obs.</th><th>Cidade</th><th>Bairro / Endereço</th><th>Status interno</th><th>Status OFS</th><th>Data Fim</th><th>Timer</th></> : <><th>Ordem</th><th>Atrelada</th><th>Tecnico</th><th>Tipo / motivo</th><th>Regiao</th><th>Bairro / Endereço</th><th>Abertura</th><th>Tempo aguardando</th><th>Status interno</th><th>Status OFS</th><th>Data Fim</th></>}
              </tr>
            </thead>
            <tbody>
              {currentCalls.map((call) => (
                <tr
                  key={call.id}
                  onClick={() => navigate(`/chamados/${call.id}${teamScoped ? "?teamScope=true" : ""}`)}
                >
                  {assignedOnly ? <><td><strong>{call.orderNumber}</strong><small className="table-subtext">{call.bdesk}</small></td><td>{call.atrelada || <span className="muted-cell">-</span>}</td><td><strong>{call.technicianName || "Sem tecnico"}</strong><small className="table-subtext">{call.supervisorName || "Sem supervisor"}</small></td><td><SlaDurationCell openedAt={call.openedAt} /></td><td><SlaCell openedAt={call.openedAt} /></td><td className="muted-cell">-</td><td><strong>{call.type}</strong><small className="table-subtext">{call.reason}</small></td><td>{call.olt || <span className="muted-cell">-</span>}</td><td className="observation-cell" title={call.notes}>{call.notes || <span className="muted-cell">-</span>}</td><td>{call.city || <span className="muted-cell">-</span>}</td><td><strong>{call.bairro || <span className="muted-cell">-</span>}</strong><small className="table-subtext">{call.address}</small></td><td><select className="status-select" value={call.status} onClick={(event) => event.stopPropagation()} onChange={async (event) => { event.stopPropagation(); await updateCallStatus(call, event.target.value as CallStatus); }} aria-label={`Status do chamado ${call.orderNumber}`}>{["Aberto", "Atribuido", "Deslocamento", "Em campo", "Finalizado", "Cancelado", "Baixar"].map((status) => <option key={status} value={status}>{status}</option>)}</select>{call.atrelada && <span className="call-badge atrelado">Atrelado</span>}</td><td>{call.ofsStatus || <span className="muted-cell">-</span>}</td><td>{formatCallTimestamp(call.executedAt)}</td><td><TimerCell lastObservationAt={call.lastObservationAt} /></td></> : <><td><strong>{call.orderNumber}</strong><small className="table-subtext">{call.bdesk}</small></td><td>{call.atrelada || <span className="muted-cell">-</span>}</td><td>{call.technicianName || <span className="unassigned">Sem tecnico</span>}<small className="table-subtext">{call.supervisorName || "Sem supervisor"}</small></td><td>{call.type}<small className="table-subtext">{call.reason}</small></td><td>{call.region}</td><td><strong>{call.bairro || <span className="muted-cell">-</span>}</strong><small className="table-subtext">{call.address}</small></td><td>{new Date(call.openedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td><td>{formatWaiting(call.openedAt)}</td><td><select className="status-select" value={call.status} onClick={(event) => event.stopPropagation()} onChange={async (event) => { event.stopPropagation(); await updateCallStatus(call, event.target.value as CallStatus); }} aria-label={`Status do chamado ${call.orderNumber}`}>{["Aberto", "Atribuido", "Deslocamento", "Em campo", "Finalizado", "Cancelado", "Baixar"].map((status) => <option key={status} value={status}>{status}</option>)}</select>{call.atrelada && <span className="call-badge atrelado">Atrelado</span>}</td><td>{call.ofsStatus || <span className="muted-cell">-</span>}</td><td>{formatCallTimestamp(call.executedAt)}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {!error && <div className="calls-pagination">
          <span>{firstVisibleCall.toLocaleString("pt-BR")}–{lastVisibleCall.toLocaleString("pt-BR")} de {totalCalls.toLocaleString("pt-BR")} chamados</span>
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
