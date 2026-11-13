import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, PanelRightClose, PanelRightOpen, RefreshCw, SlidersHorizontal } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, type NetworkArea, type NetworkCableRow, type NetworkSituation, type PonClient, type PonView, type PopOlt } from "../api";
import { NetworkSidePanel, since, type NetworkSelection } from "../components/network/NetworkSidePanel";
import { CABLE_FALLBACK_COLOR, ELEMENT_COLORS, SITUATION_COLORS, SITUATION_LABELS, SITUATION_ORDER } from "../components/network/network-colors";

// Mapa da rede: CTOs, CEOs, POPs e cabos dos KMZ importados + clientes de uma PON lidos do AutoISP.
// Usado nas massivas: escolher OLT + PON, ver quem esta com problema e as CTOs mais proximas.
// URL: ?olt=<hostname>&ponlink=<0/s/p>&call=<id>&pons=0/4/10,0/9/11 (pons: varias PONs da mesma massiva).
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const INITIAL_CENTER: L.LatLngTuple = [-23.5, -46.45];
const INITIAL_ZOOM = 12;
const MAX_SPAN = 0.5; // o backend recusa caixas maiores que 0,5 grau
const HIGHLIGHT_METERS = 150;
const POLL_MS = 20_000;
const STALE_REQUEST_MS = 10 * 60_000; // pedido aberto ha mais de 10 min: a extensao nao esta lendo, para de consultar
const OTHER_OLT = "__outra__";

type Layers = { cables: boolean; elements: boolean; pops: boolean; clients: boolean };
type Box = { minLat: number; minLng: number; maxLat: number; maxLng: number };
type MapLayers = { cables: L.LayerGroup; elements: L.LayerGroup; clusters: L.LayerGroup; clients: L.LayerGroup; selection: L.LayerGroup; cableRenderer: L.Canvas; elementRenderer: L.Canvas; clientRenderer: L.Canvas };

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Mesma forma canonica do backend (normalizeOlt): sem rotulo "OLT:", OLT- vira VIP- e sem "-0" final.
const oltKey = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/^OLT\s*:\s*|^OLT\s+/i, "").replace(/\s+/g, "").toUpperCase().replace(/^OLT-/, "VIP-").replace(/-0$/, "");
const messageOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// Aceita "1/4/10", "4/10" e "04/10"; devolve frame, slot e PON sem zeros a esquerda. O frame recebido e mantido;
// "0" so quando a entrada tem 2 partes (slot/PON).
type PonParts = { frame: string; slot: string; pon: string };
function parsePonlink(text: string | null | undefined): PonParts | null {
  const parts = String(text || "").split("/").map((part) => part.trim()).filter(Boolean);
  if ((parts.length !== 2 && parts.length !== 3) || !parts.every((part) => /^\d{1,3}$/.test(part))) return null;
  const [frame, slot, pon] = (parts.length === 3 ? parts : ["0", ...parts]).map((part) => String(Number(part)));
  return { frame, slot, pon };
}
const toPonlink = (frame: string, slot: string, pon: string) => (/^\d{1,3}$/.test(frame.trim()) && /^\d{1,2}$/.test(slot.trim()) && /^\d{1,3}$/.test(pon.trim()) ? `${Number(frame)}/${Number(slot)}/${Number(pon)}` : null);

function meters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function cableBox(cable: NetworkCableRow): Box | null {
  if (!cable.points.length) return null;
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const [lng, lat] of cable.points) {
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}
// Tooltip com texto puro (textContent): nomes vem dos KMZ e o Leaflet poe tooltip de string como HTML.
function textTip(text: string): HTMLElement {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}
// Tooltip criado so no primeiro mouseover: milhares de elementos nao pagam o custo antes da hora.
function lazyTip<T extends L.Layer>(layer: T, text: string, options?: L.TooltipOptions): T {
  layer.once("mouseover", (event) => {
    layer.bindTooltip(textTip(text), options);
    layer.openTooltip((event as L.LeafletMouseEvent).latlng);
  });
  return layer;
}
const intersects = (a: Box, b: Box) => a.minLat <= b.maxLat && a.maxLat >= b.minLat && a.minLng <= b.maxLng && a.maxLng >= b.minLng;
const inside = (box: Box, lat: number, lng: number) => lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;

export function NetworkMapPage() {
  const [params, setParams] = useSearchParams();
  const callId = params.get("call") || "";
  const [initial] = useState(() => parsePonlink(params.get("ponlink")));
  const ponsList = useMemo(() => {
    const list = String(params.get("pons") || "").split(",").map((item) => parsePonlink(item)).filter((item): item is PonParts => Boolean(item)).map((item) => `${item.frame}/${item.slot}/${item.pon}`);
    return [...new Set(list)];
  }, [params]);

  const [popOlts, setPopOlts] = useState<PopOlt[]>([]);
  const [pop, setPop] = useState("");
  const [olt, setOlt] = useState(() => params.get("olt")?.trim() || "");
  const [typingOlt, setTypingOlt] = useState(false);
  const [frame, setFrame] = useState(initial?.frame ?? "0");
  const [slot, setSlot] = useState(initial?.slot ?? "");
  const [pon, setPon] = useState(initial?.pon ?? "");
  const [ctoCode, setCtoCode] = useState("");
  const [layers, setLayers] = useState<Layers>({ cables: true, elements: true, pops: true, clients: true });
  const [visible, setVisible] = useState<Record<NetworkSituation, boolean>>({ problema: true, atencao: true, ok: true, sem: true });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const [area, setArea] = useState<NetworkArea | null>(null);
  const [areaState, setAreaState] = useState<"idle" | "loading" | "zoom" | "error">("idle");
  const [areaError, setAreaError] = useState("");
  const [ponData, setPonData] = useState<PonView | null>(null);
  const [ponLoading, setPonLoading] = useState(false);
  const [ponError, setPonError] = useState("");
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueMsg, setQueueMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [selection, setSelection] = useState<NetworkSelection>(null);

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<MapLayers | null>(null);
  const ponSeq = useRef(0);
  const fittedKey = useRef<string | null>(null);

  const ponlink = toPonlink(frame, slot, pon);
  const ponKey = olt.trim() && ponlink ? `${olt.trim()}|${ponlink}` : null;
  const activePon = useMemo(() => (ponKey ? { olt: ponKey.split("|")[0], ponlink: ponKey.split("|")[1] } : null), [ponKey]);

  // ---- POP -> OLT (filtros) ----
  useEffect(() => {
    let alive = true;
    api.popOlts().then((data) => { if (alive) setPopOlts(data.popOlts.filter((row) => row.active)); }).catch(() => { /* filtro livre continua funcionando */ });
    return () => { alive = false; };
  }, []);
  const pops = useMemo(() => [...new Set(popOlts.map((row) => row.pop))].sort((a, b) => a.localeCompare(b, "pt-BR")), [popOlts]);
  const oltGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const row of popOlts) {
      if (pop && row.pop !== pop && oltKey(row.olt) !== oltKey(olt)) continue; // a OLT escolhida continua na lista
      groups.set(row.pop, [...(groups.get(row.pop) ?? []), row.olt]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([name, olts]) => ({ pop: name, olts: [...new Set(olts)].sort() }));
  }, [popOlts, pop, olt]);
  const knownOlt = popOlts.find((row) => oltKey(row.olt) === oltKey(olt))?.olt ?? null;
  const showOltInput = typingOlt || Boolean(olt.trim() && !knownOlt);
  const oltSelectValue = knownOlt && !typingOlt ? knownOlt : showOltInput ? OTHER_OLT : "";

  function choosePop(value: string) {
    setPop(value);
    const olts = [...new Set(popOlts.filter((row) => row.pop === value).map((row) => row.olt))];
    if (value && olts.length === 1 && !olt.trim()) { setOlt(olts[0]); setTypingOlt(false); }
  }
  function chooseOlt(value: string) {
    if (value === OTHER_OLT) { setTypingOlt(true); return; }
    setTypingOlt(false); setOlt(value);
  }
  function choosePonlink(value: string) {
    const parsed = parsePonlink(value);
    if (parsed) { setFrame(parsed.frame); setSlot(parsed.slot); setPon(parsed.pon); }
  }

  // ---- URL acompanha a PON escolhida (para copiar o link) ----
  useEffect(() => {
    const next = new URLSearchParams();
    if (activePon) { next.set("olt", activePon.olt); next.set("ponlink", activePon.ponlink); }
    if (callId) next.set("call", callId);
    if (ponsList.length) next.set("pons", ponsList.join(","));
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [ponKey]);

  // ---- Clientes da PON ----
  const loadPon = useCallback(async (target: { olt: string; ponlink: string }, silent = false) => {
    const seq = ++ponSeq.current;
    if (!silent) { setPonLoading(true); setPonError(""); }
    try {
      const data = await api.networkPon(target.olt, target.ponlink);
      if (seq === ponSeq.current) { setPonData(data); setPonError(""); }
    } catch (err) {
      if (seq === ponSeq.current) setPonError(messageOf(err, "Não foi possível carregar a PON."));
    } finally {
      if (seq === ponSeq.current) setPonLoading(false);
    }
  }, []);

  useEffect(() => {
    ponSeq.current += 1; // resposta (ou consulta periodica) da PON anterior que ainda chegar e descartada
    setPonData(null); setPonError(""); setQueueMsg(null);
    setSelection((current) => (current?.type === "client" ? null : current));
    if (!activePon) { setPonLoading(false); return; }
    setPonLoading(true);
    const timer = window.setTimeout(() => void loadPon(activePon), 400);
    return () => { window.clearTimeout(timer); ponSeq.current += 1; };
  }, [activePon, loadPon]);

  // Pedido na fila: confere de novo ate a extensao terminar a leitura (ou ate 10 min sem resposta).
  useEffect(() => {
    if (!activePon || !ponData?.request || ponData.request.doneAt) return;
    if (Date.now() - Date.parse(ponData.request.requestedAt) > STALE_REQUEST_MS) return;
    const timer = window.setTimeout(() => void loadPon(activePon, true), POLL_MS);
    return () => window.clearTimeout(timer);
  }, [activePon, ponData, loadPon]);

  async function refreshPon() {
    if (!activePon) return;
    setQueueBusy(true); setQueueMsg(null);
    try {
      const result = await api.requestPon(activePon);
      if (result.queued > 0) setQueueMsg({ kind: "ok", text: "Na fila — a extensão Rede lê na próxima rodada" });
      else if (result.skippedRecent > 0) setQueueMsg({ kind: "ok", text: "Esta PON já tem leitura de menos de 30 minutos; não foi para a fila." });
      else setQueueMsg({ kind: "ok", text: "Esta PON já está na fila — a extensão Rede lê na próxima rodada" });
      void loadPon(activePon, true);
    } catch (err) {
      setQueueMsg({ kind: "error", text: messageOf(err, "Não foi possível colocar a PON na fila.") });
    } finally { setQueueBusy(false); }
  }

  // ---- Mapa (Leaflet puro) ----
  useEffect(() => {
    const element = mapEl.current;
    if (!element) return;
    const map = L.map(element, { center: INITIAL_CENTER, zoom: INITIAL_ZOOM, preferCanvas: true, zoomControl: true });
    L.tileLayer(TILE_URL, { attribution: "&copy; OpenStreetMap", maxZoom: 19 }).addTo(map);
    // Paneis separados: cabos embaixo, elementos no meio, clientes da PON por cima.
    const panes: Array<[string, number]> = [["netCables", 405], ["netElements", 420], ["netClients", 440]];
    for (const [name, zIndex] of panes) map.createPane(name).style.zIndex = String(zIndex);
    layersRef.current = {
      cables: L.layerGroup().addTo(map),
      elements: L.layerGroup().addTo(map),
      clusters: L.layerGroup().addTo(map),
      clients: L.layerGroup().addTo(map),
      selection: L.layerGroup().addTo(map),
      cableRenderer: L.canvas({ pane: "netCables", padding: 0.5 }),
      elementRenderer: L.canvas({ pane: "netElements", padding: 0.5 }),
      clientRenderer: L.canvas({ pane: "netClients", padding: 0.5 }),
    };
    mapRef.current = map;

    let timer: number | undefined;
    let controller: AbortController | null = null;
    const fetchArea = () => {
      controller?.abort(); controller = null;
      const bounds = map.getBounds();
      const box = { minLat: bounds.getSouth(), minLng: bounds.getWest(), maxLat: bounds.getNorth(), maxLng: bounds.getEast() };
      if (box.maxLat - box.minLat > MAX_SPAN || box.maxLng - box.minLng > MAX_SPAN) { setArea(null); setAreaState("zoom"); return; }
      const current = new AbortController();
      controller = current;
      setAreaState("loading");
      api.networkArea(box, Math.round(map.getZoom()), current.signal)
        .then((data) => { if (!current.signal.aborted) { setArea(data); setAreaState("idle"); setAreaError(""); } })
        .catch((err) => {
          if (current.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
          setAreaState("error"); setAreaError(messageOf(err, "Não foi possível carregar a rede."));
        });
    };
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(fetchArea, 300); };
    map.on("moveend", schedule);
    schedule();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(element);
    return () => {
      window.clearTimeout(timer);
      controller?.abort();
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  // ---- Destaque da massiva: CTOs a ate 150 m de um cliente e cabos que passam pela area ----
  const precise = useMemo(() => (ponData?.clients ?? []).filter((client): client is PonClient & { lat: number; lng: number } => client.precise && typeof client.lat === "number" && typeof client.lng === "number"), [ponData]);
  const massBox = useMemo<Box | null>(() => {
    if (!precise.length) return null;
    let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
    for (const client of precise) {
      minLat = Math.min(minLat, client.lat); maxLat = Math.max(maxLat, client.lat);
      minLng = Math.min(minLng, client.lng); maxLng = Math.max(maxLng, client.lng);
    }
    const padLat = HIGHLIGHT_METERS / 111_320;
    const padLng = HIGHLIGHT_METERS / (111_320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
    return { minLat: minLat - padLat, maxLat: maxLat + padLat, minLng: minLng - padLng, maxLng: maxLng + padLng };
  }, [precise]);
  const highlight = useMemo(() => {
    const ctos = new Set<string>();
    const cables = new Set<string>();
    if (!massBox || !area) return { ctos, cables };
    for (const item of area.elements) {
      if ((item.kind === "cto" || item.kind === "ceo") && inside(massBox, item.lat, item.lng) && precise.some((client) => meters(client.lat, client.lng, item.lat, item.lng) <= HIGHLIGHT_METERS)) ctos.add(item.id);
    }
    for (const cable of area.cables) {
      const box = cableBox(cable);
      if (box && intersects(box, massBox)) cables.add(cable.id);
    }
    return { ctos, cables };
  }, [area, massBox, precise]);

  // Enquadra os clientes com localizacao quando uma PON nova carrega.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ponKey || !precise.length || fittedKey.current === ponKey) return;
    fittedKey.current = ponKey;
    map.fitBounds(L.latLngBounds(precise.map((client) => [client.lat, client.lng] as L.LatLngTuple)), { padding: [40, 40], maxZoom: 17 });
  }, [ponKey, precise]);

  // Codigo da CTO com atraso de 200 ms: digitar nao redesenha todas as camadas a cada tecla.
  const [codeQuery, setCodeQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setCodeQuery(ctoCode), 200);
    return () => window.clearTimeout(timer);
  }, [ctoCode]);
  const codeFilter = normalize(codeQuery);
  const selectElement = useCallback((element: NetworkArea["elements"][number]) => setSelection({ type: "element", element }), []);

  // Cabos, CTOs/CEOs/POPs e clusters da area visivel.
  useEffect(() => {
    const groups = layersRef.current;
    const map = mapRef.current;
    if (!groups || !map) return;
    groups.cables.clearLayers(); groups.elements.clearLayers(); groups.clusters.clearLayers();
    if (!area) return;
    if (layers.cables) {
      for (const cable of area.cables) {
        if (cable.points.length < 2) continue;
        const strong = highlight.cables.has(cable.id);
        // So os cabos destacados recebem mouse (tooltip); os demais sao so desenho.
        const line = L.polyline(cable.points.map(([lng, lat]) => [lat, lng] as L.LatLngTuple), { renderer: groups.cableRenderer, color: cable.color || CABLE_FALLBACK_COLOR, weight: strong ? 5 : 2, opacity: strong ? 1 : 0.85, interactive: strong });
        (strong ? lazyTip(line, cable.name || "Cabo", { sticky: true }) : line).addTo(groups.cables);
      }
    }
    if (layers.elements) {
      for (const cluster of area.clusters) {
        const size = cluster.count >= 1000 ? 46 : cluster.count >= 100 ? 38 : 30;
        L.marker([cluster.lat, cluster.lng], { icon: L.divIcon({ className: "netmap-cluster", html: `<span>${(Number(cluster.count) || 0).toLocaleString("pt-BR")}</span>`, iconSize: [size, size] }), keyboard: false, title: `${cluster.count} CTOs/CEOs — aproxime para ver` })
          .on("click", () => map.setView([cluster.lat, cluster.lng], Math.max(map.getZoom() + 2, 15)))
          .addTo(groups.clusters);
      }
    }
    for (const item of area.elements) {
      if (item.kind === "pop" ? !layers.pops : !layers.elements) continue;
      const isBox = item.kind === "cto" || item.kind === "ceo";
      const matches = Boolean(codeFilter) && isBox && normalize(`${item.code ?? ""} ${item.name}`).includes(codeFilter);
      if (codeFilter && item.kind !== "pop" && !matches) continue;
      const strong = highlight.ctos.has(item.id) || matches;
      const radius = item.kind === "pop" ? 8 : strong ? 8 : item.kind === "outro" ? 3 : 5;
      lazyTip(L.circleMarker([item.lat, item.lng], { renderer: groups.elementRenderer, radius, color: strong ? "#111827" : "#ffffff", weight: strong ? 3 : 1.5, fillColor: ELEMENT_COLORS[item.kind], fillOpacity: 0.95 }), item.code || item.name || "Elemento")
        .on("click", () => selectElement(item))
        .addTo(groups.elements);
    }
  }, [area, layers.cables, layers.elements, layers.pops, codeFilter, highlight, selectElement]);

  // Clientes da PON (so os com localizacao precisa).
  useEffect(() => {
    const groups = layersRef.current;
    if (!groups) return;
    groups.clients.clearLayers();
    if (!layers.clients) return;
    for (const client of precise) {
      if (!visible[client.situation]) continue;
      L.circleMarker([client.lat, client.lng], { renderer: groups.clientRenderer, radius: 7, color: "#0f172a", weight: 1.5, fillColor: SITUATION_COLORS[client.situation], fillOpacity: 0.95 })
        .bindTooltip(textTip(`${client.contract} · ${SITUATION_LABELS[client.situation]}`))
        .on("click", () => setSelection({ type: "client", client }))
        .addTo(groups.clients);
    }
  }, [precise, visible, layers.clients]);

  // Anel no item selecionado.
  useEffect(() => {
    const groups = layersRef.current;
    if (!groups) return;
    groups.selection.clearLayers();
    const point = selection?.type === "client" ? (selection.client.precise && selection.client.lat !== null && selection.client.lng !== null ? [selection.client.lat, selection.client.lng] : null) : selection ? [selection.element.lat, selection.element.lng] : null;
    if (!point) return;
    L.circleMarker(point as L.LatLngTuple, { renderer: groups.clientRenderer, radius: 13, color: "#1264e8", weight: 3, fill: false, interactive: false }).addTo(groups.selection);
  }, [selection]);

  function selectClient(client: PonClient) {
    setSelection({ type: "client", client });
    const map = mapRef.current;
    if (map && client.precise && client.lat !== null && client.lng !== null) map.setView([client.lat, client.lng], Math.max(map.getZoom(), 17));
  }

  // ---- Contagens do topo ----
  const ctoCount = area ? area.elements.filter((item) => item.kind === "cto" || item.kind === "ceo").length + area.clusters.reduce((sum, cluster) => sum + cluster.count, 0) : 0;
  const shownClients = precise.filter((client) => visible[client.situation]).length;
  const lastRead = useMemo(() => (ponData?.clients ?? []).reduce<string | null>((latest, client) => (!latest || client.readAt > latest ? client.readAt : latest), null), [ponData]);
  const request = ponData?.request ?? null;
  const staleRequest = Boolean(request && !request.doneAt && Date.now() - Date.parse(request.requestedAt) > STALE_REQUEST_MS);

  return (
    <div className="netmap-page">
      <div className="page-heading">
        <div>
          <span className="section-kicker">OPERAÇÃO</span>
          <h1>Mapa da rede</h1>
          <p>Escolha a OLT e a PON para ver os clientes do AutoISP por situação, as CTOs mais próximas e os cabos do projeto.</p>
        </div>
        {callId && <Link className="secondary-button" to={`/chamados/${encodeURIComponent(callId)}`}><ArrowLeft size={15} aria-hidden="true" /> Voltar ao chamado</Link>}
      </div>

      <section className="panel netmap-top" aria-label="Resumo e filtros">
        <div className="netmap-strip">
          <div className="netmap-counts" aria-live="polite">
            <span><b>{ctoCount.toLocaleString("pt-BR")}</b> CTOs/CEOs</span>
            <span><b>{(area?.cables.length ?? 0).toLocaleString("pt-BR")}</b> cabos</span>
            <span><b>{shownClients.toLocaleString("pt-BR")}</b> clientes no mapa{ponData ? ` de ${ponData.summary.total.toLocaleString("pt-BR")}` : ""}</span>
          </div>
          <div className="netmap-chips" role="group" aria-label="Situação dos clientes">
            {SITUATION_ORDER.map((situation) => (
              <button key={situation} type="button" className={`netmap-chip${visible[situation] ? " is-on" : ""}`} aria-pressed={visible[situation]} onClick={() => setVisible((current) => ({ ...current, [situation]: !current[situation] }))}>
                <i style={{ background: SITUATION_COLORS[situation] }} aria-hidden="true" />{SITUATION_LABELS[situation]} <b>{(ponData?.summary[situation] ?? 0).toLocaleString("pt-BR")}</b>
              </button>
            ))}
          </div>
          <button type="button" className="secondary-button compact netmap-filters-toggle" aria-expanded={filtersOpen} aria-controls="netmap-filters" onClick={() => setFiltersOpen((open) => !open)}>
            <SlidersHorizontal size={15} aria-hidden="true" /> {filtersOpen ? "Ocultar filtros" : "Filtros"}
          </button>
        </div>

        <div id="netmap-filters" className={`netmap-filters${filtersOpen ? " is-open" : ""}`}>
          <label>POP
            <select value={pop} onChange={(event) => choosePop(event.target.value)}>
              <option value="">Todos</option>
              {pops.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>OLT
            <select value={oltSelectValue} onChange={(event) => chooseOlt(event.target.value)}>
              <option value="">Escolha a OLT</option>
              {oltGroups.map((group) => (
                <optgroup key={group.pop} label={group.pop}>
                  {group.olts.map((name) => <option key={`${group.pop}|${name}`} value={name}>{name}</option>)}
                </optgroup>
              ))}
              <option value={OTHER_OLT}>Outra OLT (digitar)</option>
            </select>
          </label>
          {showOltInput && (
            <label>Hostname da OLT
              <input value={olt} onChange={(event) => setOlt(event.target.value)} placeholder="Ex.: VIP-GRU-2-SPO-ONK-01" autoFocus={typingOlt} spellCheck={false} />
            </label>
          )}
          <label className="netmap-short">Slot
            <input value={slot} onChange={(event) => setSlot(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="4" />
          </label>
          <label className="netmap-short">PON
            <input value={pon} onChange={(event) => setPon(event.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="10" />
          </label>
          <label>Código da CTO
            <input type="search" value={ctoCode} onChange={(event) => setCtoCode(event.target.value)} placeholder="Na área visível" />
          </label>
          <fieldset className="netmap-layers">
            <legend>Camadas</legend>
            {([["cables", "Cabos"], ["elements", "CTOs/CEOs"], ["pops", "POPs"], ["clients", "Clientes"]] as Array<[keyof Layers, string]>).map(([key, label]) => (
              <label key={key} className="netmap-check">
                <input type="checkbox" checked={layers[key]} onChange={(event) => setLayers((current) => ({ ...current, [key]: event.target.checked }))} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        </div>

        {ponsList.length > 1 && (
          <div className="netmap-pons">
            <span>PONs desta massiva</span>
            <div className="dv-segmented" role="group" aria-label="PONs da massiva">
              {ponsList.map((item) => (
                <button key={item} type="button" className={ponlink === item ? "is-selected" : ""} aria-pressed={ponlink === item} onClick={() => choosePonlink(item)}>{item}</button>
              ))}
            </div>
          </div>
        )}

        <div className="netmap-actions">
          <button type="button" className="primary-button netmap-refresh" onClick={() => void refreshPon()} disabled={!activePon || queueBusy}>
            <RefreshCw size={15} aria-hidden="true" /> {queueBusy ? "Pedindo..." : "Atualizar clientes desta PON"}
          </button>
          {activePon && (
            <span className="netmap-hint">
              {ponLoading && !ponData ? "Carregando clientes..." : lastRead ? `Clientes lidos ${since(lastRead)}` : ponData ? "Sem leitura desta PON ainda" : ""}
              {request && !request.doneAt ? ` · pedido na fila ${since(request.requestedAt)}` : ""}
            </span>
          )}
          {!activePon && <span className="netmap-hint">Escolha a OLT, o slot e a PON.</span>}
        </div>
        {queueMsg && <p className={queueMsg.kind === "error" ? "netmap-error" : "netmap-ok"} role={queueMsg.kind === "error" ? "alert" : "status"}>{queueMsg.text}</p>}
        {staleRequest && <p className="netmap-error" role="alert">A extensão Rede ainda não leu esta PON. Abra o AutoISP (auto.alloha.com) logado no Chrome com a extensão Rede.</p>}
        {request?.error && <p className="netmap-error" role="alert">Última leitura com erro: {request.error}</p>}
        {ponError && <p className="netmap-error" role="alert">{ponError}</p>}
      </section>

      <div className={`netmap-body${panelOpen ? "" : " is-panel-closed"}`}>
        <div className="netmap-map-wrap">
          <div ref={mapEl} className="netmap-map" role="region" aria-label="Mapa da rede" />
          {areaState === "zoom" && <div className="netmap-notice" role="status">Aproxime o mapa para ver a rede</div>}
          {areaState === "loading" && <div className="netmap-notice is-quiet" role="status">Carregando a rede...</div>}
          {areaState === "error" && <div className="netmap-notice is-error" role="alert">{areaError}</div>}
          {areaState === "idle" && area?.truncated && <div className="netmap-notice" role="status">Aproxime o mapa para ver tudo</div>}
          <button type="button" className="secondary-button compact netmap-panel-toggle" onClick={() => setPanelOpen((open) => !open)} aria-expanded={panelOpen}>
            {panelOpen ? <PanelRightClose size={15} aria-hidden="true" /> : <PanelRightOpen size={15} aria-hidden="true" />} {panelOpen ? "Ocultar painel" : "Mostrar painel"}
          </button>
        </div>
        {panelOpen && (
          <NetworkSidePanel
            pon={ponData}
            ponLabel={activePon ? `${activePon.olt} ${activePon.ponlink}` : null}
            loading={ponLoading}
            visible={visible}
            selection={selection}
            onSelectClient={selectClient}
            onClearSelection={() => setSelection(null)}
          />
        )}
      </div>
    </div>
  );
}
