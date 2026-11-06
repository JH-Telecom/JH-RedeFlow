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
export async function listAllAuditLogs(range: { fromIso: string; toIso: string }, limit = 2000): Promise<{ logs: AuditLogRow[]; truncated: boolean }> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('call_logs').select('id, call_id, user_id, action, field, previous_value, new_value, created_at, profiles(name)').gte('created_at', range.fromIso).lte('created_at', range.toIso).order('created_at', { ascending: false }).limit(limit + 1);
    if (error) throw new Error(error.message);
    const rows = (data || []) as any[];
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

export async function listAuditLogs(callId: string): Promise<CallAuditLog[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('call_logs').select('id, call_id, user_id, action, field, previous_value, new_value, created_at, profiles(name)').eq('call_id', callId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map((row: any) => ({ id: row.id, callId: row.call_id, userId: row.user_id || '', userName: Array.isArray(row.profiles) ? row.profiles[0]?.name || 'Google Drive - Base historica operacional' : row.profiles?.name || 'Google Drive - Base historica operacional', action: row.action, field: row.field, previousValue: row.previous_value || '', newValue: row.new_value || '', createdAt: row.created_at }));
  }
  return [...auditLogs.values()].filter((item) => item.callId === callId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
