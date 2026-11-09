import { getSupabaseAdmin, isSupabaseConfigured } from "../integrations/supabase/client.js";
import type { CallAuditLog, CallObservation, CallObservationAttachment, CallObservationAttachmentInput, StoredCallObservationAttachment, User } from "../types.js";
import { auditLogs, calls, observationAttachments, observations } from "./demo-data.js";

export function mapObservationAttachment(row: { id: string; file_name: string; mime_type: string; size_bytes: number | string; created_at: string }): CallObservationAttachment {
  return { id: row.id, fileName: row.file_name, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes), createdAt: row.created_at };
}

export async function listObservations(callId: string): Promise<CallObservation[]> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('call_observations').select('id, call_id, user_id, text, created_at, profiles(name)').eq('call_id', callId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data || [];
    const attachmentsByObservation = new Map<string, CallObservationAttachment[]>();
    if (rows.length) {
      const { data: attachments, error: attachmentError } = await admin.from('call_observation_attachments').select('id, observation_id, file_name, mime_type, size_bytes, created_at').in('observation_id', rows.map((row: any) => row.id)).order('created_at', { ascending: true });
      if (attachmentError) throw new Error(attachmentError.message);
      for (const row of attachments || []) {
        const group = attachmentsByObservation.get(row.observation_id) || [];
        group.push(mapObservationAttachment(row));
        attachmentsByObservation.set(row.observation_id, group);
      }
    }
    return rows.map((row: any) => ({ id: row.id, callId: row.call_id, userId: row.user_id, userName: Array.isArray(row.profiles) ? row.profiles[0]?.name || 'Usuario' : row.profiles?.name || 'Usuario', text: row.text, createdAt: row.created_at, attachments: attachmentsByObservation.get(row.id) || [] }));
  }
  return [...observations.values()].filter((item) => item.callId === callId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => ({ ...item, attachments: [...observationAttachments.values()].filter((attachment) => attachment.observationId === item.id).map(({ observationId: _observationId, contentBase64: _contentBase64, ...metadata }) => metadata) }));
}

export async function addObservation(callId: string, actor: User, text: string, attachments: CallObservationAttachmentInput[] = []): Promise<CallObservation> {
  const auditValue = text || `Anexos: ${attachments.map((attachment) => attachment.fileName).join(', ')}`;
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('call_observations').insert({ call_id: callId, user_id: actor.id, text }).select('id, call_id, user_id, text, created_at, profiles(name)').single();
    if (error || !data) throw new Error(error?.message || 'Nao foi possivel adicionar a observacao.');
    const savedAttachments: CallObservationAttachment[] = [];
    if (attachments.length) {
      const { data: savedRows, error: attachmentError } = await admin.from('call_observation_attachments').insert(attachments.map((attachment) => ({ observation_id: data.id, file_name: attachment.fileName, mime_type: attachment.mimeType, size_bytes: attachment.sizeBytes, content_base64: attachment.contentBase64 }))).select('id, file_name, mime_type, size_bytes, created_at');
      if (attachmentError) {
        await admin.from('call_observations').delete().eq('id', data.id);
        throw new Error(attachmentError.message);
      }
      savedAttachments.push(...(savedRows || []).map(mapObservationAttachment));
    }
    const observation: CallObservation = { id: data.id, callId: data.call_id, userId: data.user_id, userName: actor.name, text: data.text, createdAt: data.created_at, attachments: savedAttachments };
    const { error: logError } = await admin.from('call_logs').insert({ call_id: callId, user_id: actor.id, action: 'Observacao adicionada', field: 'observations', previous_value: '', new_value: auditValue });
    if (logError) throw new Error(logError.message);
    return observation;
  }
  const observation: CallObservation = { id: `obs-${crypto.randomUUID()}`, callId, userId: actor.id, userName: actor.name, text, createdAt: new Date().toISOString(), attachments: [] };
  observations.set(observation.id, observation);
  for (const attachment of attachments) {
    const saved: StoredCallObservationAttachment = { id: `attachment-${crypto.randomUUID()}`, observationId: observation.id, fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, contentBase64: attachment.contentBase64, createdAt: observation.createdAt };
    observationAttachments.set(saved.id, saved);
    observation.attachments.push({ id: saved.id, fileName: saved.fileName, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes, createdAt: saved.createdAt });
  }
  const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId, userId: actor.id, userName: actor.name, action: 'Observacao adicionada', field: 'observations', previousValue: '', newValue: auditValue, createdAt: observation.createdAt };
  auditLogs.set(log.id, log);
  return observation;
}

export async function getObservationAttachment(callId: string, observationId: string, attachmentId: string): Promise<StoredCallObservationAttachment | undefined> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { data: observation, error: observationError } = await admin.from('call_observations').select('id').eq('id', observationId).eq('call_id', callId).maybeSingle();
    if (observationError) throw new Error(observationError.message);
    if (!observation) return undefined;
    const { data, error } = await admin.from('call_observation_attachments').select('id, observation_id, file_name, mime_type, size_bytes, content_base64, created_at').eq('id', attachmentId).eq('observation_id', observationId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { id: data.id, observationId: data.observation_id, fileName: data.file_name, mimeType: data.mime_type, sizeBytes: Number(data.size_bytes), contentBase64: data.content_base64, createdAt: data.created_at } : undefined;
  }
  const observation = observations.get(observationId);
  const attachment = observationAttachments.get(attachmentId);
  return observation?.callId === callId && attachment?.observationId === observationId ? attachment : undefined;
}

// Historico de alteracoes de todos os chamados (tela Historico de alteracoes), mais recentes primeiro, com a ordem
// de cada chamado. Periodo pela data da alteracao (dia de Sao Paulo, de 00:00 de "from" ate 23:59 de "to").
export type AuditLogRow = CallAuditLog & { orderNumber: string };
// Uma pagina do historico (tela Historico de alteracoes): 100 por vez, com os filtros aplicados no banco.
export type AuditPageFilters = { field?: string; userId?: string; q?: string };
export async function listAuditLogPage(range: { fromIso: string; toIso: string }, filters: AuditPageFilters, page: number, pageSize: number): Promise<{ logs: AuditLogRow[]; total: number }> {
  const q = (filters.q || '').replace(/[^\p{L}\p{N} ._/-]/gu, '').trim().slice(0, 60);
  const offset = (page - 1) * pageSize;
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    let query = admin.from('call_logs').select('id, call_id, user_id, action, field, previous_value, new_value, created_at, profiles(name)', { count: 'exact' }).gte('created_at', range.fromIso).lte('created_at', range.toIso);
    if (filters.field) query = query.eq('field', filters.field);
    if (filters.userId) query = query.eq('user_id', filters.userId);
    if (q) {
      const { data: matched } = await admin.from('calls').select('id').ilike('order_number', `%${q}%`).limit(200);
      const ids = (matched || []).map((row) => row.id);
      const parts = [`previous_value.ilike.*${q}*`, `new_value.ilike.*${q}*`];
      if (ids.length) parts.push(`call_id.in.(${ids.join(',')})`);
      query = query.or(parts.join(','));
    }
    const { data, error, count } = await query.order('created_at', { ascending: false }).order('id', { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data || []) as any[];
    const callIds = [...new Set(rows.map((row) => row.call_id).filter(Boolean))];
    const orders = new Map<string, string>();
    if (callIds.length) {
      const { data: callRows, error: callError } = await admin.from('calls').select('id, order_number').in('id', callIds);
      if (callError) throw new Error(callError.message);
      for (const row of callRows || []) orders.set(row.id, row.order_number);
    }
    return { total: count ?? rows.length, logs: rows.map((row) => ({ id: row.id, callId: row.call_id, orderNumber: orders.get(row.call_id) || '', userId: row.user_id || '', userName: Array.isArray(row.profiles) ? row.profiles[0]?.name || 'Sistema' : row.profiles?.name || 'Sistema', action: row.action, field: row.field, previousValue: row.previous_value || '', newValue: row.new_value || '', createdAt: row.created_at })) };
  }
  const lower = q.toLowerCase();
  const all = [...auditLogs.values()]
    .filter((item) => item.createdAt >= range.fromIso && item.createdAt <= range.toIso)
    .filter((item) => (!filters.field || item.field === filters.field) && (!filters.userId || item.userId === filters.userId))
    .map((item) => ({ ...item, orderNumber: calls.get(item.callId)?.orderNumber || '' }))
    .filter((item) => !lower || `${item.orderNumber} ${item.previousValue} ${item.newValue}`.toLowerCase().includes(lower))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { total: all.length, logs: all.slice(offset, offset + pageSize) };
}
export async function listAllAuditLogs(range: { fromIso: string; toIso: string }, limit = 2000): Promise<{ logs: AuditLogRow[]; truncated: boolean }> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const rows: any[] = [];
    // O PostgREST devolve no maximo 1000 linhas por consulta: busca em paginas ate limit + 1.
    for (let offset = 0; rows.length <= limit; offset += 1000) {
      const { data, error } = await admin.from('call_logs').select('id, call_id, user_id, action, field, previous_value, new_value, created_at, profiles(name)').gte('created_at', range.fromIso).lte('created_at', range.toIso).order('created_at', { ascending: false }).order('id', { ascending: true }).range(offset, Math.min(offset + 999, limit));
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
      if (!data || data.length < Math.min(1000, limit + 1 - offset)) break;
    }
    const callIds = [...new Set(rows.slice(0, limit).map((row) => row.call_id).filter(Boolean))];
    const orders = new Map<string, string>();
    for (let offset = 0; offset < callIds.length; offset += 300) {
      const { data: callRows, error: callError } = await admin.from('calls').select('id, order_number').in('id', callIds.slice(offset, offset + 300));
      if (callError) throw new Error(callError.message);
      for (const row of callRows || []) orders.set(row.id, row.order_number);
    }
    const logs = rows.slice(0, limit).map((row) => ({ id: row.id, callId: row.call_id, orderNumber: orders.get(row.call_id) || '', userId: row.user_id || '', userName: Array.isArray(row.profiles) ? row.profiles[0]?.name || 'Sistema' : row.profiles?.name || 'Sistema', action: row.action, field: row.field, previousValue: row.previous_value || '', newValue: row.new_value || '', createdAt: row.created_at }));
    return { logs, truncated: rows.length > limit };
  }
  const all = [...auditLogs.values()].filter((item) => item.createdAt >= range.fromIso && item.createdAt <= range.toIso).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { logs: all.slice(0, limit).map((item) => ({ ...item, orderNumber: calls.get(item.callId)?.orderNumber || '' })), truncated: all.length > limit };
}

// Exportacao completa: observacoes de todos os chamados no periodo (texto e autor; anexos so pelo nome).
export type ObservationExportRow = { id: string; callId: string; userName: string; text: string; attachments: string; createdAt: string };
export async function listObservationsInRange(range: { fromIso: string; toIso: string }, limit = 50_000): Promise<{ rows: ObservationExportRow[]; truncated: boolean }> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const rows: any[] = [];
    for (let offset = 0; rows.length <= limit; offset += 1000) {
      const { data, error } = await admin.from('call_observations').select('id, call_id, text, created_at, profiles(name), call_observation_attachments(file_name)').gte('created_at', range.fromIso).lte('created_at', range.toIso).order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 999);
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return {
      rows: rows.slice(0, limit).map((row) => ({ id: row.id, callId: row.call_id, userName: Array.isArray(row.profiles) ? row.profiles[0]?.name || '' : row.profiles?.name || '', text: row.text || '', attachments: (row.call_observation_attachments || []).map((item: { file_name: string }) => item.file_name).join('; '), createdAt: row.created_at })),
      truncated: rows.length > limit,
    };
  }
  const all = [...observations.values()].filter((item) => item.createdAt >= range.fromIso && item.createdAt <= range.toIso).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { rows: all.slice(0, limit).map((item) => ({ id: item.id, callId: item.callId, userName: item.userName, text: item.text, attachments: (item.attachments || []).map((attachment) => attachment.fileName).join('; '), createdAt: item.createdAt })), truncated: all.length > limit };
}

export async function listAuditLogs(callId: string): Promise<CallAuditLog[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('call_logs').select('id, call_id, user_id, action, field, previous_value, new_value, created_at, profiles(name)').eq('call_id', callId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map((row: any) => ({ id: row.id, callId: row.call_id, userId: row.user_id || '', userName: Array.isArray(row.profiles) ? row.profiles[0]?.name || 'Google Drive - Base historica operacional' : row.profiles?.name || 'Google Drive - Base historica operacional', action: row.action, field: row.field, previousValue: row.previous_value || '', newValue: row.new_value || '', createdAt: row.created_at }));
  }
  return [...auditLogs.values()].filter((item) => item.callId === callId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Chamados em que uma pessoa corrigiu a Data Fim na tela do chamado (log "Data de finalizacao alterado" com
// usuario). A sincronizacao do OFS nao sobrescreve mais essa data: a correcao manual vale. Finalizar pelo
// sistema grava "Data de execucao alterado" e nao conta aqui (o OFS continua ajustando a data nesses casos).
const MANUAL_END_DATE_ACTION = 'Data de finalizacao alterado';
export async function callsWithManualEndDate(callIds: string[]): Promise<Set<string>> {
  const locked = new Set<string>();
  if (!callIds.length) return locked;
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    for (let offset = 0; offset < callIds.length; offset += 200) {
      const chunk = callIds.slice(offset, offset + 200);
      const { data, error } = await admin.from('call_logs').select('call_id').eq('field', 'executedAt').eq('action', MANUAL_END_DATE_ACTION).not('user_id', 'is', null).in('call_id', chunk);
      if (error) throw new Error(error.message);
      for (const row of data || []) locked.add(String((row as { call_id: string }).call_id));
    }
    return locked;
  }
  const wanted = new Set(callIds);
  for (const log of auditLogs.values()) {
    if (wanted.has(log.callId) && log.field === 'executedAt' && log.action === MANUAL_END_DATE_ACTION && log.userId && !log.userId.startsWith('system')) locked.add(log.callId);
  }
  return locked;
}

// Horario da ultima vez que cada chamado recebeu um tecnico (log "Tecnico alterado" com tecnico novo).
// Usado pela limpeza diaria para saber se a alocacao foi a partir das 19h do dia anterior.
export async function lastTechnicianAssignmentTimes(callIds: string[]): Promise<Map<string, string>> {
  const latest = new Map<string, string>();
  if (!callIds.length) return latest;
  const keep = (callId: string, at: string) => { const current = latest.get(callId); if (!current || at > current) latest.set(callId, at); };
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    for (let offset = 0; offset < callIds.length; offset += 200) {
      const chunk = callIds.slice(offset, offset + 200);
      const { data, error } = await admin.from('call_logs').select('call_id, created_at').eq('field', 'technicianId').neq('new_value', '').in('call_id', chunk);
      if (error) throw new Error(error.message);
      for (const row of data || []) keep(String((row as { call_id: string }).call_id), String((row as { created_at: string }).created_at));
    }
    return latest;
  }
  const wanted = new Set(callIds);
  for (const log of auditLogs.values()) if (wanted.has(log.callId) && log.field === 'technicianId' && log.newValue) keep(log.callId, log.createdAt);
  return latest;
}

// Ultima observacao (texto, autor e hora) de cada chamado, numa consulta so. Usado pela coluna "Ultima observacao"
// da fila (ate 100 chamados por pagina) e pela imagem da fila.
export type LatestObservation = { text: string; userName: string; createdAt: string };
export async function latestObservations(callIds: string[]): Promise<Record<string, LatestObservation>> {
  const result: Record<string, LatestObservation> = {};
  if (!callIds.length) return result;
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('call_observations').select('call_id, text, created_at, profiles(name)').in('call_id', callIds).order('created_at', { ascending: false }).limit(2000);
    if (error) throw new Error(error.message);
    for (const row of (data || []) as any[]) {
      if (result[row.call_id] || !String(row.text || '').trim()) continue;
      result[row.call_id] = { text: String(row.text).trim(), userName: (Array.isArray(row.profiles) ? row.profiles[0]?.name : row.profiles?.name) || 'Usuario', createdAt: row.created_at };
    }
    return result;
  }
  const wanted = new Set(callIds);
  for (const item of [...observations.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!wanted.has(item.callId) || result[item.callId] || !item.text.trim()) continue;
    result[item.callId] = { text: item.text.trim(), userName: item.userName, createdAt: item.createdAt };
  }
  return result;
}
