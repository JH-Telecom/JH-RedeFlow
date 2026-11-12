import { isCallClosed, matchesGigaState } from '../call-status.js';
import { cancelSupabaseCall, finishSupabaseCall, getSupabaseAdmin, invalidateCallsSnapshot, isSupabaseConfigured, listSupabaseCalls, reopenSupabaseCall, updateSupabaseCall } from "../integrations/supabase/client.js";
import { resolveOltRegion } from "../integrations/wuzapi/noc-consolidation.js";
import { toOperationalDate } from "../timezone.js";
import { classifyCallArea } from "../igp.js";
import type { Call, CallAuditLog, CallStatus, EditableCallFields, User } from "../types.js";
import { activations, auditLogs, calls, ensureDemoData, observations, supervisors, technicians } from "./demo-data.js";
import { captureUnknownOltRequests } from "./settings.js";
import { MANUAL_END_DATE_ACTION } from "./observations.js";

// Nome do tecnico de apoio: a coluna support_technician_id nao tem chave estrangeira (uma segunda ligacao com
// technicians deixaria ambiguo o join do tecnico principal), entao o nome vem de um mapa id -> nome (5 min).
let technicianNames: { at: number; names: Map<string, string> } | null = null;
async function supportNameMap() {
  if (!isSupabaseConfigured()) return new Map([...technicians.values()].map((technician) => [technician.id, technician.name]));
  if (technicianNames && Date.now() - technicianNames.at < 5 * 60_000) return technicianNames.names;
  const { data, error } = await getSupabaseAdmin().from('technicians').select('id, name');
  if (error) throw new Error(error.message);
  technicianNames = { at: Date.now(), names: new Map((data || []).map((row) => [String(row.id), String(row.name)])) };
  return technicianNames.names;
}
export function forgetTechnicianNames() { technicianNames = null; }
export async function withSupportNames<T extends Call>(rows: T[]): Promise<T[]> {
  if (!rows.some((call) => call.supportTechnicianId)) return rows;
  const names = await supportNameMap().catch(() => new Map<string, string>());
  return rows.map((call) => (call.supportTechnicianId ? { ...call, supportTechnicianName: names.get(call.supportTechnicianId) } : call));
}

export type CallQuery = { id?: string; from?: string; to?: string; supervisorId?: string; status?: CallStatus | CallStatus[]; search?: string; region?: string; neighborhood?: string; olt?: string; hasTechnician?: boolean; gigaClosed?: boolean; area?: 'SP' | 'GRU' | 'ALTO_TIETE' | 'ABC'; page?: number; pageSize?: number; sort?: 'openedAt' | 'status' | 'region' | 'technicianName' | 'client' | 'orderNumber'; direction?: 'asc' | 'desc'; };

export function matchesCallStatus(status: CallStatus, filter?: CallStatus | CallStatus[]) {
  return !filter || (Array.isArray(filter) ? filter : [filter]).includes(status);
}

export function callReferenceDate(call: Call) {
  return toOperationalDate(isCallClosed(call) ? call.executedAt || call.openedAt : call.openedAt);
}

export function isCallInDateRange(call: Call, query: CallQuery) {
  const referenceDate = callReferenceDate(call);
  return (!query.from || referenceDate >= query.from) && (!query.to || referenceDate <= query.to);
}

export function normalizeQueryText(value: string | undefined) {
  return value?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() ?? '';
}

// Pesquisa da fila (11/11/2026: "pesquisar coisas mais aleatorias, tipo o status do OFS"): olha quase todos os campos
// do chamado e aceita varias palavras em qualquer ordem (todas precisam aparecer), ex.: "pendente guarulhos".
export function matchesCallSearch(call: Call, search: string | undefined) {
  const words = normalizeQueryText(search).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeQueryText([
    call.orderNumber, call.officeTrack, call.bdesk, ...(call.sourceIdentifiers || []), call.client, call.status, call.ofsStatus, call.type, call.reason,
    call.region, call.city, call.bairro, call.address, call.olt, call.slotPon, call.cluster, call.atrelada,
    call.technicianName, call.supportTechnicianName, call.supervisorName, call.result, call.closingReason, call.closingSubreason, call.cableType, call.notes,
  ].filter(Boolean).join(' | '));
  return words.every((word) => haystack.includes(word));
}

export function sortCalls(calls: Call[], query: CallQuery) {
  const direction = query.direction === 'asc' ? 1 : -1;
  const key = query.sort ?? 'openedAt';
  const values = [...calls];
  values.sort((left, right) => {
    const leftValue = key === 'openedAt' ? new Date(left.openedAt).getTime() : key === 'status' ? left.status : key === 'region' ? left.region : key === 'technicianName' ? (left.technicianName || '').toLowerCase() : key === 'client' ? left.client.toLowerCase() : left.orderNumber.toLowerCase();
    const rightValue = key === 'openedAt' ? new Date(right.openedAt).getTime() : key === 'status' ? right.status : key === 'region' ? right.region : key === 'technicianName' ? (right.technicianName || '').toLowerCase() : key === 'client' ? right.client.toLowerCase() : right.orderNumber.toLowerCase();
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction;
    return String(leftValue).localeCompare(String(rightValue)) * direction;
  });
  return values;
}

export async function listCalls(status?: CallStatus | CallStatus[], query: CallQuery = {}): Promise<Call[]> {
  ensureDemoData();
  const baseStatus = status ?? query.status;
  const baseQuery = { ...query, status: baseStatus };
  if (isSupabaseConfigured()) {
    // O escopo de supervisor e aplicado no banco (join com technicians.supervisor_id), tanto aqui quanto no PostgreSQL local.
    // Nome do apoio antes do filtro: a pesquisa tambem acha pelo tecnico de apoio.
    const rows = await withSupportNames(await listSupabaseCalls(baseStatus, { from: baseQuery.from, to: baseQuery.to, supervisorId: baseQuery.supervisorId, id: baseQuery.id }));
    return sortCalls(rows.filter((call) => (!baseQuery.id || call.id === baseQuery.id) && (baseQuery.hasTechnician === undefined || Boolean(call.technicianId) === baseQuery.hasTechnician) && matchesCallSearch(call, baseQuery.search) && (!baseQuery.region || call.region === baseQuery.region) && (!baseQuery.neighborhood || call.bairro === baseQuery.neighborhood) && (!baseQuery.olt || normalizeQueryText(call.olt) === normalizeQueryText(baseQuery.olt)) && matchesCallStatus(call.status, baseQuery.status) && matchesGigaState(call, baseQuery.gigaClosed) && isCallInDateRange(call, baseQuery)), baseQuery);
  }
  const rows = (await withSupportNames([...calls.values()])).map((call) => {
    const lastObservationAt = [...observations.values()].filter((observation) => observation.callId === call.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.createdAt;
    return { ...call, lastObservationAt };
  }).filter((call) => {
    if (baseQuery.id && call.id !== baseQuery.id) return false;
    if (baseQuery.hasTechnician !== undefined && Boolean(call.technicianId) !== baseQuery.hasTechnician) return false;
    if (!matchesCallStatus(call.status, baseStatus)) return false;
    if (!matchesGigaState(call, baseQuery.gigaClosed)) return false;
    if (!isCallInDateRange(call, baseQuery)) return false;
    if (baseQuery.region && call.region !== baseQuery.region) return false;
    if (baseQuery.neighborhood && call.bairro !== baseQuery.neighborhood) return false;
    if (baseQuery.olt && normalizeQueryText(call.olt) !== normalizeQueryText(baseQuery.olt)) return false;
    if (!matchesCallSearch(call, baseQuery.search)) return false;
    if (!baseQuery.supervisorId) return true;
    if (call.technicianId) {
      const technician = technicians.get(call.technicianId);
      return technician?.supervisorId === baseQuery.supervisorId;
    }
    if (call.supervisorName) {
      const target = supervisors.get(baseQuery.supervisorId);
      return target?.name === call.supervisorName;
    }
    return false;
  });
  return sortCalls(rows, baseQuery);
}

export type CallPageResult = { calls: Call[]; total: number; page: number; pageSize: number; totalPages: number; olts: string[] };

export async function listCallsPage(status: CallStatus | CallStatus[] | undefined, query: CallQuery, requestedPage: number, requestedPageSize: number): Promise<CallPageResult> {
  ensureDemoData();
  const pageSize = Math.min(100, Math.max(1, Math.floor(requestedPageSize)));
  const page = Math.max(1, Math.floor(requestedPage));

  // Supabase: a fila e servida da copia dos chamados em memoria (listCalls), sem a consulta paginada no banco a
  // cada busca/aba/pagina - era a maior fonte de trafego (egress) depois da leitura completa. Mesma regra da RPC.


  const matchingCalls = (await listCalls(status, { ...query, id: undefined, olt: undefined, page: undefined, pageSize: undefined }))
    .filter((call) => !query.area || classifyCallArea(call) === query.area);
  const olts = [...new Set(matchingCalls.map((call) => call.olt.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const filteredCalls = query.olt ? matchingCalls.filter((call) => call.olt.trim().toLocaleUpperCase() === query.olt!.toLocaleUpperCase()) : matchingCalls;
  const total = filteredCalls.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  return { calls: filteredCalls.slice(start, start + pageSize), total, page: currentPage, pageSize, totalPages, olts };
}

export function normalizeExternalCallIdentifier(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function findExistingCallIdentifiers(): Promise<Set<string>> {
  ensureDemoData();
  const identifiers = new Set<string>();
  const addRow = (row: { order_number?: string | null; bdesk?: string | null; office_track?: string | null }) => {
    [row.order_number, row.bdesk, row.office_track].forEach((value) => {
      const normalized = value ? normalizeExternalCallIdentifier(value) : '';
      if (normalized) identifiers.add(normalized);
    });
  };

  if (isSupabaseConfigured()) {
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await getSupabaseAdmin().from('calls').select('order_number, bdesk, office_track').range(from, from + pageSize - 1);
      if (error) throw new Error(error.message || 'Nao foi possivel verificar chamados existentes.');
      (data || []).forEach(addRow);
      if (!data || data.length < pageSize) break;
    }
    return identifiers;
  }
  calls.forEach((call) => addRow({ order_number: call.orderNumber, bdesk: call.bdesk, office_track: call.officeTrack }));
  return identifiers;
}

export async function insertWorkbookCalls(importedCalls: Call[], sourceLabel: string): Promise<number> {
  if (!importedCalls.length) return 0;
  await captureUnknownOltRequests(importedCalls.map((call) => call.olt), sourceLabel);
  if (isSupabaseConfigured()) {
    let inserted = 0;
    for (let from = 0; from < importedCalls.length; from += 250) {
      const batch = importedCalls.slice(from, from + 250).map((call) => ({
        id: call.id,
        order_number: call.orderNumber,
        bdesk: call.bdesk || null,
        office_track: call.officeTrack || null,
        client: call.client || 'Cliente nao identificado',
        type: call.type,
        reason: call.reason,
        region: call.region,
        city: call.city || null,
        address: call.address || null,
        bairro: call.bairro || null,
        technician_id: call.technicianId || null,
        olt: call.olt || null,
        slot_pon: call.slotPon || null,
        status: call.status,
        opened_at: call.openedAt,
        event_at: call.eventAt || null,
        assigned_at: call.assignedAt || null,
        executed_at: call.executedAt || null,
        result: call.result || null,
        notes: call.notes,
        cancellation_reason: null,
        source: call.source || null,
        source_identity: call.sourceIdentity || null,
        source_identifiers: call.sourceIdentifiers || [],
        source_file_name: call.sourceFileName || null,
        source_reference_date: call.sourceReferenceDate || null,
        source_fingerprint: call.sourceFingerprint || null,
        source_processed_at: call.sourceProcessedAt || null,
      }));
      const { data, error } = await getSupabaseAdmin().from('calls').upsert(batch, { onConflict: 'id', ignoreDuplicates: true }).select('id');
      if (error) throw new Error(error.message || 'Nao foi possivel importar chamados historicos.');
      inserted += data?.length || 0;
    }
    return inserted;
  }
  ensureDemoData();
  let inserted = 0;
  importedCalls.forEach((call) => {
    if (calls.has(call.id)) return;
    calls.set(call.id, call);
    inserted += 1;
  });
  return inserted;
}

export async function insertHistoricalCalls(historicalCalls: Call[]): Promise<number> {
  return insertWorkbookCalls(historicalCalls.map((call) => ({ ...call, status: 'Finalizado' })), 'Importacao historica');
}

export type DriveCallSource = { identity: string; identifiers: string[]; fileId: string; fileName: string; referenceDate?: string; fingerprint: string; payload: Record<string, string> };

export async function createDriveCall(call: Call, sourceData: DriveCallSource): Promise<{ call: Call; created: boolean }> {
  await captureUnknownOltRequests([call.olt], 'Google Drive');
  const processedAt = new Date().toISOString();
  const sourcedCall: Call = { ...call, source: 'google-drive', sourceIdentity: sourceData.identity, sourceIdentifiers: sourceData.identifiers, sourceFileId: sourceData.fileId, sourceFileName: sourceData.fileName, sourceReferenceDate: sourceData.referenceDate, sourceFingerprint: sourceData.fingerprint, sourceProcessedAt: processedAt };
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('calls').insert({ id: sourcedCall.id, order_number: sourcedCall.orderNumber, bdesk: sourcedCall.bdesk || null, office_track: sourcedCall.officeTrack || null, client: sourcedCall.client || null, type: sourcedCall.type || null, reason: sourcedCall.reason || null, region: sourcedCall.region || null, city: sourcedCall.city || null, address: sourcedCall.address || null, bairro: sourcedCall.bairro || null, olt: sourcedCall.olt || null, slot_pon: sourcedCall.slotPon || null, status: sourcedCall.status, opened_at: sourcedCall.openedAt, event_at: sourcedCall.eventAt || null, executed_at: sourcedCall.executedAt || null, result: sourcedCall.result || null, notes: sourcedCall.notes, cancellation_reason: sourcedCall.cancellationReason || null, source: 'google-drive', source_identity: sourceData.identity, source_identifiers: sourceData.identifiers, source_file_id: sourceData.fileId, source_file_name: sourceData.fileName, source_reference_date: sourceData.referenceDate || null, source_payload: sourceData.payload, source_fingerprint: sourceData.fingerprint, source_processed_at: processedAt }).select('id').maybeSingle();
    if (error) {
      if (error.code === '23505') {
        const existing = (await listCalls()).find((item) => item.source === 'google-drive' && item.sourceIdentity === sourceData.identity);
        if (existing) return { call: existing, created: false };
      }
      throw new Error(error.message || 'Nao foi possivel persistir o chamado historico do Drive.');
    }
    if (!data) throw new Error('Nao foi possivel confirmar o chamado historico do Drive.');
    const { error: snapshotError } = await getSupabaseAdmin().from('google_drive_call_snapshots').insert({ call_id: sourcedCall.id, source_identity: sourceData.identity, file_id: sourceData.fileId, file_name: sourceData.fileName, reference_date: sourceData.referenceDate || null, fingerprint: sourceData.fingerprint, payload: sourceData.payload, processed_at: processedAt });
    if (snapshotError) throw new Error(snapshotError.message);
    return { call: sourcedCall, created: true };
  }
  const existing = [...calls.values()].find((item) => item.source === 'google-drive' && item.sourceIdentity === sourceData.identity);
  if (existing) return { call: existing, created: false };
  calls.set(sourcedCall.id, sourcedCall);
  return { call: sourcedCall, created: true };
}

export async function recordDriveCallSnapshot(callId: string, sourceData: DriveCallSource) {
  const processedAt = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const { error: updateError } = await getSupabaseAdmin().from('calls').update({ updated_at: new Date().toISOString(), source: 'google-drive', source_identity: sourceData.identity, source_identifiers: sourceData.identifiers, source_file_id: sourceData.fileId, source_file_name: sourceData.fileName, source_reference_date: sourceData.referenceDate || null, source_payload: sourceData.payload, source_fingerprint: sourceData.fingerprint, source_processed_at: processedAt }).eq('id', callId);
    if (updateError) throw new Error(updateError.message);
    const { error } = await getSupabaseAdmin().from('google_drive_call_snapshots').insert({ call_id: callId, source_identity: sourceData.identity, file_id: sourceData.fileId, file_name: sourceData.fileName, reference_date: sourceData.referenceDate || null, fingerprint: sourceData.fingerprint, payload: sourceData.payload, processed_at: processedAt });
    if (error) throw new Error(error.message);
    return;
  }
  const existing = calls.get(callId);
  if (existing) calls.set(callId, { ...existing, source: 'google-drive', sourceIdentity: sourceData.identity, sourceIdentifiers: sourceData.identifiers, sourceFileId: sourceData.fileId, sourceFileName: sourceData.fileName, sourceReferenceDate: sourceData.referenceDate, sourceFingerprint: sourceData.fingerprint, sourceProcessedAt: processedAt });
}

export async function getCall(id: string, query: CallQuery = {}): Promise<Call | undefined> {
  ensureDemoData();
  if (isSupabaseConfigured()) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return undefined;
    return (await listCalls(undefined, { ...query, id }))[0];
  }
  const call = calls.get(id);
  if (!call) return undefined;
  if (query.supervisorId) {
    if (call.technicianId) {
      const technician = technicians.get(call.technicianId);
      if (technician?.supervisorId !== query.supervisorId) return undefined;
    } else if (call.supervisorName) {
      const target = supervisors.get(query.supervisorId);
      if (target?.name !== call.supervisorName) return undefined;
    } else {
      return undefined;
    }
  }
  if (query.from && toOperationalDate(call.openedAt) < query.from) return undefined;
  if (query.to && toOperationalDate(call.openedAt) > query.to) return undefined;
  return (await withSupportNames([call]))[0];
}

export async function deleteCall(id: string): Promise<boolean> {
  ensureDemoData();
  if (isSupabaseConfigured()) {
    try {
      const admin = getSupabaseAdmin();
      const { error: logsError } = await admin.from('call_logs').delete().eq('call_id', id);
      if (logsError) throw new Error(logsError.message || 'Nao foi possivel remover os logs do chamado.');
      const { error: observationsError } = await admin.from('call_observations').delete().eq('call_id', id);
      if (observationsError) throw new Error(observationsError.message || 'Nao foi possivel remover as observacoes do chamado.');
      invalidateCallsSnapshot(true);
      const { error } = await admin.from('calls').delete().eq('id', id).select('id').maybeSingle();
      if (error) throw new Error(error.message || 'Nao foi possivel apagar o chamado.');
      return true;
    } catch (error) {
      const removed = calls.delete(id);
        if (removed) {
          for (const [observationId, observation] of [...observations.entries()]) {
            if (observation.callId === id) observations.delete(observationId);
          }
          for (const [logId, log] of [...auditLogs.entries()]) {
            if (log.callId === id) auditLogs.delete(logId);
          }
          return true;
        }
        const message = error instanceof Error ? error.message : 'Nao foi possivel apagar o chamado.';
        throw new Error(`Supabase indisponivel ao apagar o chamado. ${message}`);
    }
  }


  const removed = calls.delete(id);
  if (!removed) return false;
  for (const [observationId, observation] of [...observations.entries()]) {
    if (observation.callId === id) observations.delete(observationId);
  }
  for (const [logId, log] of [...auditLogs.entries()]) {
    if (log.callId === id) auditLogs.delete(logId);
  }
  return true;
}

export async function deleteAllCalls(): Promise<number> {
  ensureDemoData();
  if (isSupabaseConfigured()) {
    invalidateCallsSnapshot(true);
    const { data, error } = await getSupabaseAdmin().rpc('delete_all_calls');
    if (error) throw new Error(error.message || 'Nao foi possivel apagar os chamados.');
    return Number(data || 0);
  }
  const deleted = calls.size;
  calls.clear();
  observations.clear();
  auditLogs.clear();
  for (const activation of activations.values()) activation.createdCallId = undefined;
  return deleted;
}

export function normalizeTechnicianId(id?: string | null) {
  if (!id) return id;
  const candidate = id.replace(/^tech-/, '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : id;
}

export function prepareCallUpdate(current: Call, input: Partial<EditableCallFields>): Partial<EditableCallFields> {
  const olt = input.olt ?? current.olt;
  const nextStatus = input.status ?? current.status;
  // GIGA+ nao e encerramento: marcar GIGA+ nao grava Data Fim (ela vem do OFS quando concluir).
  const terminalStatuses = ['Finalizado', 'Cancelado', 'Baixar'] as const;
  const shouldSetCompletionDate = terminalStatuses.includes(nextStatus as typeof terminalStatuses[number]) && input.executedAt === undefined;
  const reopening = isCallClosed(current) && !terminalStatuses.includes(nextStatus as typeof terminalStatuses[number]) && !(nextStatus === 'GIGA+' && current.status === 'GIGA+');

  return {
    ...input,
    region: resolveOltRegion(olt).region || input.region?.trim() || current.region,
    address: input.address?.trim() || current.address || '',
    bairro: input.bairro?.trim() || current.bairro || '',
    // Reaberto (encerrado -> ativo): limpa a Data Fim para nao contar como finalizado no IGP e na analise de prazo.
    executedAt: shouldSetCompletionDate ? (current.executedAt ?? new Date().toISOString()) : reopening ? null : input.executedAt,
  };
}

export async function updateCall(id: string, input: Partial<EditableCallFields>, actor: User): Promise<Call | undefined> {
  ensureDemoData();
  if (input.olt) await captureUnknownOltRequests([input.olt], 'Edicao manual');
  if (isSupabaseConfigured()) {
    const current = await getCall(id);
    if (!current) return undefined;
    const saved = await updateSupabaseCall(id, prepareCallUpdate(current, input), actor);
    return saved ? (await withSupportNames([{ ...saved, supportTechnicianId: input.supportTechnicianId === undefined ? current.supportTechnicianId : input.supportTechnicianId || undefined }]))[0] : saved;
  }
  const current = calls.get(id);
  if (!current) return undefined;
  input = prepareCallUpdate(current, input);
  const technician = input.technicianId ? technicians.get(input.technicianId) : undefined;
  const updated = { ...current, ...input, cancellationReason: input.cancellationReason === null ? undefined : input.cancellationReason ?? current.cancellationReason, supportTechnicianId: input.supportTechnicianId === null ? undefined : input.supportTechnicianId ?? current.supportTechnicianId, technicianId: input.technicianId === null ? undefined : input.technicianId ?? current.technicianId, technicianName: input.technicianId === null ? undefined : technician?.name ?? current.technicianName, supervisorName: input.technicianId === null ? undefined : technician?.supervisorId ? supervisors.get(technician.supervisorId)?.name : current.supervisorName, assignedAt: input.technicianId && !current.assignedAt ? new Date().toISOString() : input.technicianId === null ? undefined : current.assignedAt };
  calls.set(id, updated);
  const labels: Record<string, string> = { orderNumber: 'Ordem', bdesk: 'BDESK', officeTrack: 'Office Track', client: 'Tecnico B2C', type: 'Tipo', reason: 'Motivo', region: 'Regiao', city: 'Cidade', address: 'Endereco', bairro: 'Bairro', ofsStatus: 'Status OFS', olt: 'OLT', slotPon: 'Slot/PON', status: 'Status', technicianId: 'Tecnico', supportTechnicianId: 'Tecnico de apoio', openedAt: 'Data de abertura', executedAt: 'Data de finalizacao', result: 'Resultado', cancellationReason: 'Motivo de cancelamento', closingReason: 'Motivo de fechamento', closingSubreason: 'Submotivo de fechamento', cableType: 'Tipo do cabo', notes: 'Observacoes' };
  Object.keys(input).forEach((field) => {
    const previousValue = String(current[field as keyof Call] ?? '');
    const newValue = String(updated[field as keyof Call] ?? '');
    if (previousValue === newValue) return;
    const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId: id, userId: actor.id, userName: actor.name, action: `${labels[field] || field} alterado`, field, previousValue, newValue, createdAt: new Date().toISOString() };
    auditLogs.set(log.id, log);
  });
  return (await withSupportNames([updated]))[0];
}

// Corrige so a Data Fim, inclusive com o chamado encerrado (sem reabrir e sem mexer em mais nada). O log
// "Data de finalizacao alterado" com usuario faz a sincronizacao do OFS manter esta data (callsWithManualEndDate).
export async function updateCallEndDate(id: string, executedAt: string, actor: User): Promise<Call | undefined> {
  ensureDemoData();
  const current = await getCall(id);
  if (!current) return undefined;
  const previousValue = current.executedAt ?? '';
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('calls').update({ executed_at: executedAt, updated_at: new Date().toISOString() }).eq('id', id).select('id').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return undefined;
    const { error: logError } = await admin.from('call_logs').insert({ call_id: id, user_id: actor.id, action: MANUAL_END_DATE_ACTION, field: 'executedAt', previous_value: previousValue, new_value: executedAt });
    if (logError) throw new Error(logError.message);
    return getCall(id);
  }
  const updated = { ...current, executedAt };
  calls.set(id, updated);
  const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId: id, userId: actor.id, userName: actor.name, action: MANUAL_END_DATE_ACTION, field: 'executedAt', previousValue, newValue: executedAt, createdAt: new Date().toISOString() };
  auditLogs.set(log.id, log);
  return updated;
}

export async function finishCall(id: string, input: { result: string; executedAt: string; notes: string }, actor: User): Promise<{ call?: Call; missing: string[] }> {
  if (isSupabaseConfigured()) {
    const current = await getCall(id);
    if (!current) return { missing: ['Chamado nao encontrado'] };
    if (isCallClosed(current)) return { missing: ['Chamado ja encerrado'] };
    const missing = [!current.technicianId && 'Tecnico', !current.reason && 'Motivo', !input.result.trim() && 'Resultado', !input.executedAt && 'Data e hora de execucao', !input.notes.trim() && 'Observacao'].filter(Boolean) as string[];
    if (missing.length) return { missing };
    const call = await finishSupabaseCall(id, input, actor);
    return call ? { call, missing: [] } : { missing: ['Chamado ja encerrado'] };
  }
  const current = calls.get(id);
  if (!current) return { missing: ['Chamado nao encontrado'] };
  if (isCallClosed(current)) return { missing: ['Chamado ja encerrado'] };
  const missing = [!current.technicianId && 'Tecnico', !current.reason && 'Motivo', !input.result.trim() && 'Resultado', !input.executedAt && 'Data e hora de execucao', !input.notes.trim() && 'Observacao'].filter(Boolean) as string[];
  if (missing.length) return { missing };
  const updated = { ...current, ...input, status: 'Finalizado' as const };
  calls.set(id, updated);
  (['status', 'result', 'executedAt', 'notes'] as const).forEach((field) => {
    const previousValue = String(current[field as keyof Call] ?? '');
    const newValue = String(updated[field] ?? '');
    if (previousValue === newValue) return;
    const labels: Record<string, string> = { status: 'Status', result: 'Resultado', executedAt: 'Data de execucao', notes: 'Observacoes' };
    const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId: id, userId: actor.id, userName: actor.name, action: `${labels[field]} alterado`, field, previousValue, newValue, createdAt: new Date().toISOString() };
    auditLogs.set(log.id, log);
  });
  return { call: updated, missing: [] };
}

export async function cancelCall(id: string, reason: string, actor: User): Promise<Call | undefined> {
  if (isSupabaseConfigured()) return await cancelSupabaseCall(id, reason, actor);
  const current = calls.get(id);
  if (!current) return undefined;
  if (isCallClosed(current) && actor.roleId !== 'system') return undefined;
  const updated = { ...current, status: 'Cancelado' as const, cancellationReason: reason };
  calls.set(id, updated);
  const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId: id, userId: actor.id, userName: actor.name, action: 'Chamado cancelado', field: 'cancellationReason', previousValue: '', newValue: reason, createdAt: new Date().toISOString() };
  auditLogs.set(log.id, log);
  return updated;
}

export async function reopenCall(id: string, actor: User): Promise<Call | undefined> {
  if (isSupabaseConfigured()) return await reopenSupabaseCall(id, actor);
  const current = calls.get(id);
  if (!current || !isCallClosed(current)) return undefined;
  const updated = { ...current, status: 'Aberto' as const, result: undefined, executedAt: undefined, cancellationReason: undefined };
  calls.set(id, updated);
  const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId: id, userId: actor.id, userName: actor.name, action: 'Chamado reaberto', field: 'status', previousValue: current.status, newValue: 'Aberto', createdAt: new Date().toISOString() };
  auditLogs.set(log.id, log);
  return updated;
}
