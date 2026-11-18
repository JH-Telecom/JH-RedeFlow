import { isCallClosed, type Call, type CallListQuery, type CallStatus } from "../api";

// Fila no navegador (18/11/2026): a tela baixa a lista inteira uma vez (GET /api/chamados?full=true), guarda, e aqui
// filtra, pesquisa, ordena e pagina sem ir ao banco. Mesmas regras do servidor (backend/src/store/calls.ts).
export type FullCall = Call & { area?: string };

export function normalizeQueryText(value: string | undefined | null) {
  return value?.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim() ?? "";
}

// Varias palavras em qualquer ordem; todas precisam aparecer em algum campo do chamado.
export function matchesCallSearch(call: Call, search: string | undefined) {
  const words = normalizeQueryText(search).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeQueryText([
    call.orderNumber, call.officeTrack, call.bdesk, ...((call as { sourceIdentifiers?: string[] }).sourceIdentifiers || []), call.client, call.status, call.ofsStatus, call.type, call.reason,
    call.region, call.city, call.bairro, call.address, call.olt, call.slotPon, call.cluster, call.atrelada,
    call.technicianName, call.supportTechnicianName, call.supervisorName, call.result, call.closingReason, call.closingSubreason, call.cableType, call.notes,
  ].filter(Boolean).join(" | "));
  return words.every((word) => haystack.includes(word));
}

export function sortCalls<T extends Call>(calls: T[], sort: CallListQuery["sort"] = "openedAt", direction: CallListQuery["direction"] = "desc") {
  const factor = direction === "asc" ? 1 : -1;
  const value = (call: Call) => sort === "openedAt" ? new Date(call.openedAt).getTime() : sort === "status" ? call.status : sort === "region" ? call.region : sort === "technicianName" ? (call.technicianName || "").toLowerCase() : sort === "client" ? call.client.toLowerCase() : call.orderNumber.toLowerCase();
  return [...calls].sort((left, right) => {
    const a = value(left), b = value(right);
    if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
    return String(a).localeCompare(String(b)) * factor;
  });
}

const asList = (status: CallStatus | CallStatus[] | undefined) => (status === undefined ? undefined : Array.isArray(status) ? status : [status]);

// Filtros da fila menos a OLT (a lista de OLTs do filtro sai do resultado antes de aplicar a OLT, como no servidor).
export function filterCalls(calls: FullCall[], status: CallStatus | CallStatus[] | undefined, query: CallListQuery) {
  const statuses = asList(status);
  return calls.filter((call) => (!statuses || statuses.includes(call.status))
    && (query.hasTechnician === undefined || Boolean(call.technicianId) === query.hasTechnician)
    && (query.gigaClosed === undefined || call.status !== "GIGA+" || isCallClosed(call) === query.gigaClosed)
    && (!query.region || call.region === query.region)
    && (!query.neighborhood || call.bairro === query.neighborhood)
    && (!query.area || call.area === query.area)
    && matchesCallSearch(call, query.search));
}

export function localCallsPage(calls: FullCall[], status: CallStatus | CallStatus[] | undefined, query: CallListQuery, page: number, pageSize: number) {
  const matching = filterCalls(calls, status, query);
  const olts = [...new Set(matching.map((call) => call.olt.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const withOlt = query.olt ? matching.filter((call) => normalizeQueryText(call.olt) === normalizeQueryText(query.olt)) : matching;
  const sorted = sortCalls(withOlt, query.sort, query.direction);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return { calls: sorted.slice(start, start + pageSize), total, page: currentPage, pageSize, totalPages, olts };
}

export function localCallsCount(calls: FullCall[], status: CallStatus | CallStatus[] | undefined, query: CallListQuery) {
  const matching = filterCalls(calls, status, query);
  return query.olt ? matching.filter((call) => normalizeQueryText(call.olt) === normalizeQueryText(query.olt)).length : matching.length;
}
