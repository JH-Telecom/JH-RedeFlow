import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Activation, ActivationAnalysis, ActivationStatus, Call, CallStatus } from '../../types.js';

let adminClient: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;

export function isSupabaseRuntime() {
  return process.env.REDEFLOW_RUNTIME === 'supabase' || (!process.env.REDEFLOW_RUNTIME && process.env.NODE_ENV === 'production');
}

export function isSupabaseConfigured() {
  const hasRequiredKeys = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_ANON_KEY);
  if (hasRequiredKeys) return true;
  return isSupabaseRuntime() && Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin() {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Supabase nao configurado no backend.');
  adminClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return adminClient;
}

export function getSupabaseAuthClient() {
  if (authClient) return authClient;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('SUPABASE_ANON_KEY nao configurada no backend.');
  authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return authClient;
}

export async function authenticateSupabaseUser(email: string, password: string) {
  const { data, error } = await getSupabaseAuthClient().auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  return getSupabaseProfile(data.user.id, data.user.created_at);
}

export async function getSupabaseProfile(id: string, createdAt?: string) {
  const { data: profile, error: profileError } = await getSupabaseAdmin()
    .from('profiles')
    .select('id, name, email, role_id, active, created_at, roles(id, name, description, role_permissions(permissions(code)))')
    .eq('id', id)
    .maybeSingle();
  if (profileError || !profile || profile.active === false) return null;
  const profileRecord = profile as any;
  const role = Array.isArray(profileRecord.roles) ? profileRecord.roles[0] : profileRecord.roles;
  const rolePermissions = Array.isArray(role?.role_permissions) ? role.role_permissions : [];
  const permissions = rolePermissions.flatMap((item: { permissions?: { code?: string } | { code?: string }[] | null }) => {
    const permissionRows = Array.isArray(item.permissions) ? item.permissions : item.permissions ? [item.permissions] : [];
    return permissionRows.map((permission) => permission.code).filter(Boolean);
  });
  return { id: profileRecord.id, name: profileRecord.name, email: profileRecord.email, roleId: profileRecord.role_id, active: profileRecord.active, createdAt: createdAt || profileRecord.created_at, role: { id: role?.id || profileRecord.role_id, name: role?.name || 'Sem cargo', description: role?.description || '', permissions } };
}

export async function listSupabaseUsers() {
  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('id, name, email, role_id, active, created_at, roles(id, name, description, role_permissions(permissions(code)))')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((profile) => {
    const record = profile as any;
    const roleRecord = Array.isArray(record.roles) ? record.roles[0] : record.roles;
    const rolePermissions = Array.isArray(roleRecord?.role_permissions) ? roleRecord.role_permissions : [];
    const permissions = rolePermissions.flatMap((item: { permissions?: { code?: string } | { code?: string }[] | null }) => {
      const values = Array.isArray(item.permissions) ? item.permissions : item.permissions ? [item.permissions] : [];
      return values.map((permission) => permission.code).filter(Boolean);
    });
    return {
      id: record.id,
      name: record.name,
      email: record.email,
      roleId: record.role_id,
      active: record.active,
      createdAt: record.created_at,
      role: record.role_id ? { id: roleRecord?.id || record.role_id, name: roleRecord?.name || 'Sem cargo', description: roleRecord?.description || '', permissions } : undefined,
    };
  });
}

export async function listSupabaseSupervisors() {
  const { data, error } = await getSupabaseAdmin().from('supervisors').select('id, profile_id, name, region, active').is('deleted_at', null).order('name');
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({ id: row.id, userId: row.profile_id || undefined, name: row.name, region: row.region || '', active: row.active, technicianCount: 0 }));
}

export async function createSupabaseSupervisor(input: { userId?: string; name: string; region: string; active: boolean }) {
  const { data, error } = await getSupabaseAdmin().from('supervisors').insert({ profile_id: input.userId || null, name: input.name, region: input.region, active: input.active }).select('id, profile_id, name, region, active').single();
  if (error || !data) throw new Error(error?.message || 'Nao foi possivel cadastrar o supervisor.');
  return { id: data.id, userId: data.profile_id || undefined, name: data.name, region: data.region || '', active: data.active, technicianCount: 0 };
}

export async function updateSupabaseSupervisor(id: string, input: { userId?: string | null; name?: string; region?: string; active?: boolean }) {
  const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.userId !== undefined) changes.profile_id = input.userId || null;
  if (input.name !== undefined) changes.name = input.name;
  if (input.region !== undefined) changes.region = input.region;
  if (input.active !== undefined) changes.active = input.active;
  const { data, error } = await getSupabaseAdmin().from('supervisors').update(changes).eq('id', id).is('deleted_at', null).select('id, profile_id, name, region, active').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  return { id: data.id, userId: data.profile_id || undefined, name: data.name, region: data.region || '', active: data.active, technicianCount: 0 };
}

export async function listSupabaseTechnicians() {
  const { data, error } = await getSupabaseAdmin().from('technicians').select('id, supervisor_id, lead_technician_id, name, registration, region, shift, current_status, active, active_override, team_role, supervisors(name), lead_technician:lead_technician_id(name)').is('deleted_at', null).order('name');
  if (error) throw new Error(error.message);
  return (data || []).map((row) => {
    const supervisor = Array.isArray(row.supervisors) ? row.supervisors[0] : row.supervisors;
    const lead = Array.isArray((row as any).lead_technician) ? (row as any).lead_technician[0] : (row as any).lead_technician;
    return { id: row.id, supervisorId: row.supervisor_id || undefined, leadTechnicianId: row.lead_technician_id ?? undefined, leadTechnicianName: lead?.name || undefined, name: row.name, registration: row.registration, supervisorName: supervisor?.name || undefined, region: row.region || '', shift: row.shift || '', currentStatus: row.current_status as 'Disponivel' | 'Em campo' | 'Indisponivel', active: row.active, activeOverride: row.active_override ?? false, teamRole: row.team_role as 'Tecnico' | 'Auxiliar' };
  });
}

export async function createSupabaseTechnician(input: { supervisorId?: string; leadTechnicianId?: string | null; teamRole: string; name: string; registration: string; region: string; shift: string; currentStatus: string; active: boolean }) {
  const { data, error } = await getSupabaseAdmin().from('technicians').insert({ supervisor_id: input.supervisorId || null, lead_technician_id: input.leadTechnicianId || null, team_role: input.teamRole, name: input.name, registration: input.registration, region: input.region, shift: input.shift, current_status: input.currentStatus, active: input.active, active_override: false }).select('id, supervisor_id, lead_technician_id, name, registration, region, shift, current_status, active, active_override, team_role, supervisors(name)').single();
  if (error || !data) throw new Error(error?.message || 'Nao foi possivel cadastrar o tecnico.');
  const supervisor = Array.isArray(data.supervisors) ? data.supervisors[0] : data.supervisors;
  return { id: data.id, supervisorId: data.supervisor_id || undefined, leadTechnicianId: data.lead_technician_id ?? undefined, name: data.name, registration: data.registration, supervisorName: supervisor?.name || undefined, region: data.region || '', shift: data.shift || '', currentStatus: data.current_status as 'Disponivel' | 'Em campo' | 'Indisponivel', active: data.active, activeOverride: data.active_override ?? false, teamRole: data.team_role as 'Tecnico' | 'Auxiliar' };
}

export async function updateSupabaseTechnician(id: string, input: { supervisorId?: string; currentStatus?: string; active?: boolean; teamRole?: string; leadTechnicianId?: string | null }) {
  const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.supervisorId !== undefined) changes.supervisor_id = input.supervisorId || null;
  if (input.currentStatus !== undefined) changes.current_status = input.currentStatus;
  if (input.active !== undefined) { changes.active = input.active; changes.active_override = true; }
  if (input.teamRole !== undefined) changes.team_role = input.teamRole;
  if (input.leadTechnicianId !== undefined) changes.lead_technician_id = input.leadTechnicianId || null;
  const { data, error } = await getSupabaseAdmin().from('technicians').update(changes).eq('id', id).is('deleted_at', null).select('id, supervisor_id, lead_technician_id, name, registration, region, shift, current_status, active, active_override, team_role, supervisors(name), lead_technician:lead_technician_id(name)').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  const supervisor = Array.isArray(data.supervisors) ? data.supervisors[0] : data.supervisors;
  const lead = Array.isArray((data as any).lead_technician) ? (data as any).lead_technician[0] : (data as any).lead_technician;
  return { id: data.id, supervisorId: data.supervisor_id || undefined, leadTechnicianId: data.lead_technician_id ?? undefined, leadTechnicianName: lead?.name || undefined, name: data.name, registration: data.registration, supervisorName: supervisor?.name || undefined, region: data.region || '', shift: data.shift || '', currentStatus: data.current_status as 'Disponivel' | 'Em campo' | 'Indisponivel', active: data.active, activeOverride: data.active_override ?? false, teamRole: data.team_role as 'Tecnico' | 'Auxiliar' };
}

export async function deleteSupabaseTechnician(id: string) {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from('technicians').update({ active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null);
  if (error) throw new Error(error.message || 'Nao foi possivel remover o tecnico.');
  const { error: detachError } = await admin.from('technicians').update({ lead_technician_id: null, updated_at: new Date().toISOString() }).eq('lead_technician_id', id).is('deleted_at', null);
  if (detachError) throw new Error(detachError.message || 'Nao foi possivel desvincular os auxiliares.');
  return true;
}

export async function listSupabaseCalls(status?: CallStatus, filters: { from?: string; to?: string; supervisorId?: string } = {}): Promise<Call[]> {
  const technicianJoin = filters.supervisorId ? 'technicians!inner(name, supervisor_id, supervisors(name))' : 'technicians(name, supervisor_id, supervisors(name))';
  let query = getSupabaseAdmin().from('calls').select(`id, order_number, bdesk, office_track, client, type, reason, region, city, olt, slot_pon, status, technician_id, opened_at, assigned_at, executed_at, result, cancellation_reason, notes, call_observations(created_at), ${technicianJoin}`).order('opened_at', { ascending: false });
  if (status) query = query.eq('status', status);
  if (filters.from) query = query.gte('opened_at', `${filters.from}T00:00:00.000Z`);
  if (filters.to) query = query.lt('opened_at', `${filters.to}T23:59:59.999Z`);
  if (filters.supervisorId) query = query.eq('technicians.supervisor_id', filters.supervisorId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((row) => {
    const technician = Array.isArray(row.technicians) ? row.technicians[0] : row.technicians;
    const supervisor = Array.isArray(technician?.supervisors) ? technician.supervisors[0] : technician?.supervisors;
    const observationRows = Array.isArray((row as any).call_observations) ? (row as any).call_observations : [];
    const lastObservationAt = observationRows.map((observation: { created_at?: string }) => observation.created_at).filter(Boolean).sort().pop();
    return { id: row.id, orderNumber: row.order_number, bdesk: row.bdesk || '', officeTrack: row.office_track || '', client: row.client || '', type: row.type || '', reason: row.reason || '', region: row.region || '', city: row.city || '', olt: row.olt || '', slotPon: row.slot_pon || '', status: row.status as CallStatus, technicianId: row.technician_id || undefined, technicianName: technician?.name || undefined, supervisorName: supervisor?.name || undefined, openedAt: row.opened_at, assignedAt: row.assigned_at || undefined, executedAt: row.executed_at || undefined, result: row.result || undefined, cancellationReason: row.cancellation_reason || undefined, notes: row.notes || '', lastObservationAt };
  });
}

export async function finishSupabaseCall(id: string, input: { result: string; executedAt: string; notes: string }, actor: { id: string; name: string }) {
  const current = (await listSupabaseCalls()).find((call) => call.id === id);
  if (!current || ['Finalizado', 'Cancelado'].includes(current.status)) return undefined;
  const { data, error } = await getSupabaseAdmin().from('calls').update({ result: input.result, executed_at: input.executedAt, notes: input.notes, status: 'Finalizado', updated_at: new Date().toISOString() }).eq('id', id).not('status', 'in', '(Finalizado,Cancelado)').select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  const labels: Record<string, string> = { status: 'Status', result: 'Resultado', executedAt: 'Data de execucao', notes: 'Observacoes' };
  for (const [field, value] of Object.entries({ status: 'Finalizado', result: input.result, executedAt: input.executedAt, notes: input.notes })) {
    const previousValue = String(current[field as keyof Call] ?? '');
    if (previousValue !== value) { const { error: logError } = await getSupabaseAdmin().from('call_logs').insert({ call_id: id, user_id: actor.id, action: `${labels[field]} alterado`, field, previous_value: previousValue, new_value: value }); if (logError) throw new Error(logError.message); }
  }
  return (await listSupabaseCalls()).find((call) => call.id === id);
}

export async function cancelSupabaseCall(id: string, reason: string, actor: { id: string; name: string }) {
  const current = (await listSupabaseCalls()).find((call) => call.id === id);
  if (!current || ['Finalizado', 'Cancelado'].includes(current.status)) return undefined;
  const { data, error } = await getSupabaseAdmin().from('calls').update({ status: 'Cancelado', cancellation_reason: reason, updated_at: new Date().toISOString() }).eq('id', id).not('status', 'in', '(Finalizado,Cancelado)').select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  const { error: logError } = await getSupabaseAdmin().from('call_logs').insert({ call_id: id, user_id: actor.id, action: 'Motivo de cancelamento alterado', field: 'cancellationReason', previous_value: current.cancellationReason || '', new_value: reason });
  if (logError) throw new Error(logError.message);
  return (await listSupabaseCalls()).find((call) => call.id === id);
}

export async function reopenSupabaseCall(id: string, actor: { id: string; name: string }) {
  const current = (await listSupabaseCalls()).find((call) => call.id === id);
  if (!current || !['Finalizado', 'Cancelado'].includes(current.status)) return undefined;
  const { data, error } = await getSupabaseAdmin().from('calls').update({ status: 'Aberto', cancellation_reason: null, result: null, executed_at: null, updated_at: new Date().toISOString() }).eq('id', id).in('status', ['Finalizado', 'Cancelado']).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  const { error: logError } = await getSupabaseAdmin().from('call_logs').insert({ call_id: id, user_id: actor.id, action: 'Status alterado', field: 'status', previous_value: current.status, new_value: 'Aberto' });
  if (logError) throw new Error(logError.message);
  return (await listSupabaseCalls()).find((call) => call.id === id);
}

export async function updateSupabaseCall(id: string, input: { orderNumber?: string; bdesk?: string; officeTrack?: string; client?: string; type?: string; reason?: string; region?: string; city?: string; olt?: string; slotPon?: string; status?: string; technicianId?: string | null; executedAt?: string; result?: string; notes?: string }, actor: { id: string; name: string }) {
  const current = (await listSupabaseCalls()).find((call) => call.id === id);
  if (!current || ['Finalizado', 'Cancelado'].includes(current.status)) return undefined;
  const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const databaseFields: Record<string, string> = { orderNumber: 'order_number', bdesk: 'bdesk', officeTrack: 'office_track', client: 'client', type: 'type', reason: 'reason', region: 'region', city: 'city', olt: 'olt', slotPon: 'slot_pon', status: 'status', executedAt: 'executed_at', result: 'result', notes: 'notes' };
  for (const field of Object.keys(databaseFields)) {
    const value = input[field as keyof typeof input];
    if (value !== undefined) changes[databaseFields[field]] = value;
  }
  if (input.technicianId !== undefined) { changes.technician_id = input.technicianId || null; changes.assigned_at = input.technicianId ? new Date().toISOString() : null; }
  if (input.notes !== undefined) changes.notes = input.notes;
  const { data, error } = await getSupabaseAdmin().from('calls').update(changes).eq('id', id).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  const labels: Record<string, string> = { orderNumber: 'Ordem', bdesk: 'BDESK', officeTrack: 'Office Track', client: 'Tecnico B2C', type: 'Tipo', reason: 'Motivo', region: 'Regiao', city: 'Cidade', olt: 'OLT', slotPon: 'Slot/PON', status: 'Status', technicianId: 'Tecnico', executedAt: 'Data de finalizacao', result: 'Resultado', notes: 'Observacoes' };
  for (const field of Object.keys(input)) {
    const previousValue = String(current[field as keyof Call] ?? '');
    const newValue = String(input[field as keyof typeof input] ?? '');
    if (previousValue !== newValue) { const { error: logError } = await getSupabaseAdmin().from('call_logs').insert({ call_id: id, user_id: actor.id, action: `${labels[field] || field} alterado`, field, previous_value: previousValue, new_value: newValue }); if (logError) throw new Error(logError.message); }
  }
  return (await listSupabaseCalls()).find((call) => call.id === id);
}

export async function getSupabaseRole(roleId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('roles')
    .select('id, name, description, role_permissions(permissions(code))')
    .eq('id', roleId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return null;
  const record = data as any;
  const rows = Array.isArray(record.role_permissions) ? record.role_permissions : [];
  const permissions = rows.flatMap((item: { permissions?: { code?: string } | { code?: string }[] | null }) => {
    const values = Array.isArray(item.permissions) ? item.permissions : item.permissions ? [item.permissions] : [];
    return values.map((permission) => permission.code).filter(Boolean);
  });
  return { id: record.id, name: record.name, description: record.description || '', permissions };
}

export async function listSupabaseRoles() {
  const { data, error } = await getSupabaseAdmin()
    .from('roles')
    .select('id, name, description, role_permissions(permissions(code))')
    .is('deleted_at', null)
    .order('name');
  if (error) throw new Error(error.message);
  return (data || []).map((record) => {
    const rows = Array.isArray(record.role_permissions) ? record.role_permissions : [];
    const permissions = rows.flatMap((item: { permissions?: { code?: string } | { code?: string }[] | null }) => {
      const values = Array.isArray(item.permissions) ? item.permissions : item.permissions ? [item.permissions] : [];
      return values.map((permission) => permission.code).filter(Boolean);
    });
    return { id: record.id, name: record.name, description: record.description || '', permissions };
  });
}

export async function createSupabaseActivation(input: { source: string; originalMessage: string; extractedData: Record<string, string>; analysis?: ActivationAnalysis }): Promise<Activation> {
  const admin = getSupabaseAdmin();
  const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
  const incomingKeys = [input.originalMessage, input.extractedData.bdesk, input.extractedData.officeTrack, input.extractedData.orderNumber].map(normalize).filter(Boolean);
  const { data: pendingRows, error: pendingError } = await admin.from('activations').select('id, source, original_message, received_at, status').eq('source', input.source).in('status', ['Pendente', 'Aceito']).order('received_at', { ascending: false });
  if (pendingError) throw new Error(pendingError.message);
  for (const pending of pendingRows || []) {
    const { data: processing } = await admin.from('activation_processing').select('extracted_data').eq('activation_id', pending.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const stored = (processing?.extracted_data || {}) as Record<string, unknown>;
    const storedKeys = [pending.original_message, stored.bdesk, stored.officeTrack, stored.orderNumber].map(normalize).filter(Boolean);
    if (!incomingKeys.some((key) => storedKeys.includes(key))) continue;
    const { _analysis: analysis, ...extractedData } = stored;
    return { id: pending.id, source: pending.source, originalMessage: pending.original_message, receivedAt: pending.received_at, status: pending.status as ActivationStatus, extractedData: extractedData as Record<string, string>, analysis: analysis as ActivationAnalysis | undefined };
  }
  const { data: activation, error } = await admin.from('activations').insert({ source: input.source, original_message: input.originalMessage, status: 'Pendente' }).select('id, source, original_message, received_at, status').single();
  if (error || !activation) throw new Error(error?.message || 'Nao foi possivel registrar o acionamento.');
  const extractedData = { ...input.extractedData, _analysis: input.analysis };
  const { error: processingError } = await admin.from('activation_processing').insert({ activation_id: activation.id, extracted_data: extractedData, processor: input.analysis ? 'gemini-semantic' : 'local-semantic' });
  if (processingError) throw new Error(processingError.message);
  return { id: activation.id, source: activation.source, originalMessage: activation.original_message, receivedAt: activation.received_at, status: activation.status as ActivationStatus, extractedData: input.extractedData, analysis: input.analysis };
}

export async function listSupabaseActivations(status?: ActivationStatus): Promise<Activation[]> {
  const admin = getSupabaseAdmin();
  let query = admin.from('activations').select('id, source, original_message, received_at, status, decision_by, decision_at, created_call_id, rejection_reason').order('received_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const activations: Activation[] = [];
  for (const row of data || []) {
    const { data: processing } = await admin.from('activation_processing').select('extracted_data').eq('activation_id', row.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const extracted = (processing?.extracted_data || {}) as Record<string, unknown>;
    const { _analysis: analysis, ...extractedData } = extracted;
    activations.push({ id: row.id, source: row.source, originalMessage: row.original_message, receivedAt: row.received_at, status: row.status as ActivationStatus, decisionBy: row.decision_by || undefined, decisionAt: row.decision_at || undefined, createdCallId: row.created_call_id || undefined, rejectionReason: row.rejection_reason || undefined, extractedData: extractedData as Record<string, string>, analysis: analysis as ActivationAnalysis | undefined });
  }
  return activations;
}

export async function decideSupabaseActivation(id: string, decision: 'Aceito' | 'Recusado', actorId: string, rejectionReason?: string): Promise<{ activation?: Activation; call?: Call }> {
  const admin = getSupabaseAdmin();
  const { data: row, error } = await admin.from('activations').select('id, source, original_message, received_at, status, decision_by, decision_at, created_call_id, rejection_reason').eq('id', id).eq('status', 'Pendente').maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return {};
  const { data: processing, error: processingError } = await admin.from('activation_processing').select('extracted_data').eq('activation_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (processingError) throw new Error(processingError.message);
  const stored = (processing?.extracted_data || {}) as Record<string, unknown>;
  const { _analysis: analysis, ...extractedData } = stored;
  let call: Call | undefined;
  if (decision === 'Aceito') {
    const structured = (analysis || {}) as Partial<ActivationAnalysis>;
    const value = (key: string) => typeof extractedData[key] === 'string' ? String(extractedData[key]) : '';
    const orderNumber = structured.office_track || structured.os_ot || value('officeTrack') || value('orderNumber') || value('bdesk') || `PEND-${id.slice(-6)}`;
    const callInput = {
      order_number: orderNumber,
      bdesk: structured.bdesk || value('bdesk') || '',
      office_track: structured.office_track || structured.os_ot || value('officeTrack') || '',
      client: value('client') || 'Cliente nao identificado',
      type: structured.tipo_registro || value('type') || 'Acionamento',
      reason: structured.motivo || structured.tipo_falha || value('reason') || 'Acionamento recebido',
      region: value('region') || 'Nao informada',
      city: value('city') || 'Nao informada',
      olt: structured.olt || value('olt') || '',
      slot_pon: Array.isArray(structured.slot_pon) ? structured.slot_pon.join(', ') : value('slotPon') || '',
      status: 'Aberto',
      opened_at: new Date().toISOString(),
      notes: 'Criado a partir de acionamento aceito.',
    };
    const { data: callRow, error: callError } = await admin.from('calls').insert(callInput).select('id, order_number, bdesk, office_track, client, type, reason, region, city, olt, slot_pon, status, technician_id, opened_at, assigned_at, executed_at, result, cancellation_reason, notes').single();
    if (callError || !callRow) throw new Error(callError?.message || 'Nao foi possivel criar o chamado.');
    call = { id: callRow.id, orderNumber: callRow.order_number, bdesk: callRow.bdesk || '', officeTrack: callRow.office_track || '', client: callRow.client || '', type: callRow.type || '', reason: callRow.reason || '', region: callRow.region || '', city: callRow.city || '', olt: callRow.olt || '', slotPon: callRow.slot_pon || '', status: callRow.status as CallStatus, technicianId: callRow.technician_id || undefined, openedAt: callRow.opened_at, assignedAt: callRow.assigned_at || undefined, executedAt: callRow.executed_at || undefined, result: callRow.result || undefined, cancellationReason: callRow.cancellation_reason || undefined, notes: callRow.notes || '' };
  }
  const { error: updateError } = await admin.from('activations').update({ status: decision, decision_by: actorId, decision_at: new Date().toISOString(), created_call_id: call?.id || null, rejection_reason: decision === 'Recusado' ? rejectionReason || null : null }).eq('id', id).eq('status', 'Pendente');
  if (updateError) throw new Error(updateError.message);
  return { activation: { id: row.id, source: row.source, originalMessage: row.original_message, receivedAt: row.received_at, status: decision, extractedData: extractedData as Record<string, string>, analysis: analysis as ActivationAnalysis | undefined, decisionBy: actorId, decisionAt: new Date().toISOString(), createdCallId: call?.id, rejectionReason }, call };
}

export async function createSupabaseUser(input: { name: string; email: string; roleId: string; password: string }) {
  const admin = getSupabaseAdmin();
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { display_name: input.name, full_name: input.name },
  });
  if (authError || !created.user) throw new Error(authError?.message || 'Nao foi possivel criar o usuario no Supabase.');
  const { data: profile, error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    name: input.name,
    email: input.email,
    role_id: input.roleId,
    active: true,
  }).select('id, name, email, role_id, active, created_at').single();
  if (profileError || !profile) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error(profileError?.message || 'Nao foi possivel criar o perfil no Supabase.');
  }
  const role = await getSupabaseRole(input.roleId);
  return { id: profile.id, name: profile.name, email: profile.email, roleId: profile.role_id, active: profile.active, createdAt: profile.created_at, role: role || undefined };
}

export async function updateSupabaseUser(id: string, input: { name?: string; email?: string; roleId?: string; active?: boolean; password?: string }) {
  const admin = getSupabaseAdmin();
  const authChanges: { email?: string; password?: string } = {};
  if (input.email !== undefined) authChanges.email = input.email;
  if (input.password !== undefined) authChanges.password = input.password;
  if (Object.keys(authChanges).length) {
    const { error: authError } = await admin.auth.admin.updateUserById(id, authChanges);
    if (authError) throw new Error(authError.message);
  }
  const profileChanges: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) profileChanges.name = input.name;
  if (input.email !== undefined) profileChanges.email = input.email;
  if (input.roleId !== undefined) profileChanges.role_id = input.roleId;
  if (input.active !== undefined) profileChanges.active = input.active;
  const { data, error } = await admin.from('profiles').update(profileChanges).eq('id', id).is('deleted_at', null).select('id, name, email, role_id, active, created_at').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  return { id: data.id, name: data.name, email: data.email, roleId: data.role_id, active: data.active, createdAt: data.created_at, role: (await getSupabaseRole(data.role_id)) || undefined };
}

export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured()) return { configured: false, connected: false };
  const { error } = await getSupabaseAdmin().from('roles').select('id').limit(1);
  return { configured: true, connected: !error, error: error?.message };
}