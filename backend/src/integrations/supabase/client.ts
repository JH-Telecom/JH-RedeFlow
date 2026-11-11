import { isCallClosed } from '../../call-status.js';
import { activationKeys, findDuplicateCall } from '../../activation-dedupe.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Activation, ActivationAnalysis, ActivationStatus, Call, CallStatus } from '../../types.js';
import { ATRELADA_OPEN_STATUSES, findAtreladaCallOrder, identifyAtreladas, resolveOltRegion } from '../wuzapi/noc-consolidation.js';
import { addDays, operationalDayStartIso, parseSaoPauloDateTime } from '../../timezone.js';
import { analyzeOperationalMessage } from '../wuzapi/semantic.js';
import { meteredFetch, scaled } from '../../db-usage.js';

// Cards pendentes lidos antes de o leitor reconhecer um rotulo (ex.: "Tarefa OFS") ficam sem O.S. gravada:
// relemos a mensagem original e completamos so o que faltou, sem sobrescrever o que ja foi extraido.
function refreshStoredAnalysis(originalMessage: string, analysis: Partial<ActivationAnalysis>): Partial<ActivationAnalysis> {
  const hasOrder = Boolean(analysis.office_track || analysis.os_ot);
  if ((hasOrder && analysis.data_hora_evento) || !originalMessage) return analysis;
  const fresh = analyzeOperationalMessage(originalMessage);
  return {
    ...analysis,
    office_track: analysis.office_track || fresh.office_track || null,
    os_ot: analysis.os_ot || fresh.os_ot || null,
    data_hora_evento: analysis.data_hora_evento || fresh.data_hora_evento || null,
  };
}

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
  adminClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: meteredFetch } });
  return adminClient;
}

export function getSupabaseAuthClient() {
  if (authClient) return authClient;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('SUPABASE_ANON_KEY nao configurada no backend.');
  authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: meteredFetch } });
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
    .select('id, name, email, role_id, active, password_change_required, created_at, roles(id, name, description, hidden_tabs, role_permissions(permissions(code)))')
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
  return { id: profileRecord.id, name: profileRecord.name, email: profileRecord.email, roleId: profileRecord.role_id, active: profileRecord.active, createdAt: createdAt || profileRecord.created_at, mustChangePassword: profileRecord.password_change_required, role: { id: role?.id || profileRecord.role_id, name: role?.name || 'Sem cargo', description: role?.description || '', permissions, hiddenTabs: Array.isArray(role?.hidden_tabs) ? role.hidden_tabs : [] } };
}

export async function getSupabaseUserAvatar(userId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from('user_avatars').select('data_url').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.data_url || null; // "" = so tem banner, sem foto
}

export async function saveSupabaseUserAvatar(userId: string, dataUrl: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin().from('user_avatars').upsert({ user_id: userId, data_url: dataUrl, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  return true;
}

export async function deleteSupabaseUserAvatar(userId: string): Promise<void> {
  // So limpa a foto (data_url e obrigatorio: '' = sem foto); a linha some quando nao guarda mais nada.
  const { error } = await getSupabaseAdmin().from('user_avatars').update({ data_url: '', updated_at: new Date().toISOString() }).eq('user_id', userId);
  if (error) throw new Error(error.message);
  await pruneSupabaseUserAvatarRow(userId);
}

// A linha de user_avatars guarda foto, banner, apelido e tema: so e apagada quando todos estao vazios.
// select('*') para funcionar tambem antes da migracao das colunas de apelido/tema.
async function pruneSupabaseUserAvatarRow(userId: string) {
  const { data, error } = await getSupabaseAdmin().from('user_avatars').select('*').eq('user_id', userId).maybeSingle();
  if (error || !data) return;
  const row = data as Record<string, unknown>;
  if (row.data_url || row.banner_data_url || row.nickname || row.palette || row.status_text || row.status_emoji) return;
  await getSupabaseAdmin().from('user_avatars').delete().eq('user_id', userId);
}

// Status personalizado (aba Pessoas): texto, emoji e ate quando vale. select('*') para nao quebrar antes da migracao.
export async function getSupabaseUserStatuses(userIds: string[]): Promise<Record<string, { text: string; emoji: string; until: string | null }>> {
  const { data, error } = await getSupabaseAdmin().from('user_avatars').select('*').in('user_id', userIds);
  if (error) throw new Error(error.message);
  const result: Record<string, { text: string; emoji: string; until: string | null }> = {};
  for (const row of (data || []) as Record<string, unknown>[]) {
    if (!row.status_text && !row.status_emoji) continue;
    result[String(row.user_id)] = { text: String(row.status_text || ''), emoji: String(row.status_emoji || ''), until: row.status_until ? String(row.status_until) : null };
  }
  return result;
}

export async function saveSupabaseUserStatus(userId: string, status: { text: string; emoji: string; until: string | null } | null): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: existing, error: readError } = await admin.from('user_avatars').select('user_id').eq('user_id', userId).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!existing && !status) return;
  const fields = { status_text: status?.text || null, status_emoji: status?.emoji || null, status_until: status?.until || null, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await admin.from('user_avatars').update(fields).eq('user_id', userId)
    : await admin.from('user_avatars').insert({ user_id: userId, data_url: '', ...fields });
  if (error) {
    if (/status_/.test(error.message)) throw new Error('O status ainda não pode ser salvo: falta aplicar a migração 202611060003_team_features no banco.');
    throw new Error(error.message);
  }
  if (!status) await pruneSupabaseUserAvatarRow(userId);
}

// Preferencias do perfil: apelido (so aparece para a propria pessoa) e tema de cor.
export async function getSupabaseUserPreferences(userId: string): Promise<{ nickname: string | null; palette: string | null }> {
  const { data, error } = await getSupabaseAdmin().from('user_avatars').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data || {}) as Record<string, unknown>;
  return { nickname: typeof row.nickname === 'string' && row.nickname ? row.nickname : null, palette: typeof row.palette === 'string' && row.palette ? row.palette : null };
}

export async function saveSupabaseUserPreferences(userId: string, preferences: { nickname: string | null; palette: string | null }): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: existing, error: readError } = await admin.from('user_avatars').select('user_id').eq('user_id', userId).maybeSingle();
  if (readError) throw new Error(readError.message);
  const now = new Date().toISOString();
  if (!existing && !preferences.nickname && !preferences.palette) return;
  const { error } = existing
    ? await admin.from('user_avatars').update({ nickname: preferences.nickname, palette: preferences.palette, updated_at: now }).eq('user_id', userId)
    : await admin.from('user_avatars').insert({ user_id: userId, data_url: '', nickname: preferences.nickname, palette: preferences.palette, updated_at: now });
  if (error) {
    if (/nickname|palette/.test(error.message)) throw new Error('O apelido e o tema ainda não podem ser salvos: falta aplicar a migração 202611060001_user_preferences no banco.');
    throw new Error(error.message);
  }
  await pruneSupabaseUserAvatarRow(userId);
}

// Fotos de varias pessoas de uma vez (aba Pessoas). "" = so tem banner, sem foto.
export async function getSupabaseUserAvatars(userIds: string[]): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  const { data, error } = await getSupabaseAdmin().from('user_avatars').select('user_id, data_url').in('user_id', userIds);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data || []).filter((row) => row.data_url).map((row) => [row.user_id, row.data_url as string]));
}

// Banner do perfil (fundo das observacoes do usuario nos chamados).
export async function getSupabaseUserBanners(userIds: string[]): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  const { data, error } = await getSupabaseAdmin().from('user_avatars').select('user_id, banner_data_url').in('user_id', userIds).not('banner_data_url', 'is', null);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data || []).filter((row) => row.banner_data_url).map((row) => [row.user_id, row.banner_data_url as string]));
}

export async function saveSupabaseUserBanner(userId: string, bannerDataUrl: string | null): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: existing, error: readError } = await admin.from('user_avatars').select('user_id, data_url').eq('user_id', userId).maybeSingle();
  if (readError) throw new Error(readError.message);
  const now = new Date().toISOString();
  if (!existing) {
    if (!bannerDataUrl) return;
    const { error } = await admin.from('user_avatars').insert({ user_id: userId, data_url: '', banner_data_url: bannerDataUrl, updated_at: now });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await admin.from('user_avatars').update({ banner_data_url: bannerDataUrl, updated_at: now }).eq('user_id', userId);
  if (error) throw new Error(error.message);
  // Sem foto, banner, apelido e tema: a linha nao tem mais o que guardar.
  if (!bannerDataUrl) await pruneSupabaseUserAvatarRow(userId);
}

export async function listSupabaseUsers() {
  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('id, name, email, role_id, active, password_change_required, created_at, roles(id, name, description, hidden_tabs, role_permissions(permissions(code)))')
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
      mustChangePassword: record.password_change_required,
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
  invalidateCallsSnapshot(true);
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
  const { data, error } = await getSupabaseAdmin().from('technicians').select('id, supervisor_id, lead_technician_id, name, registration, region, shift, current_status, active, active_override, employment_status, team_role, supervisors(name), lead_technician:lead_technician_id(name)').is('deleted_at', null).order('name');
  if (error) throw new Error(error.message);
  return (data || []).map((row) => {
    const supervisor = Array.isArray(row.supervisors) ? row.supervisors[0] : row.supervisors;
    const lead = Array.isArray((row as any).lead_technician) ? (row as any).lead_technician[0] : (row as any).lead_technician;
    return { id: row.id, supervisorId: row.supervisor_id || undefined, leadTechnicianId: row.lead_technician_id ?? undefined, leadTechnicianName: lead?.name || undefined, name: row.name, registration: row.registration, supervisorName: supervisor?.name || undefined, region: row.region || '', shift: row.shift || '', currentStatus: row.current_status as 'Disponivel' | 'Em campo' | 'Indisponivel', active: row.active, activeOverride: row.active_override ?? false, employmentStatus: (row.employment_status || 'Trabalhando') as 'Trabalhando' | 'Demitido', teamRole: row.team_role as 'Tecnico' | 'Auxiliar' };
  });
}

export async function createSupabaseTechnician(input: { supervisorId?: string; leadTechnicianId?: string | null; teamRole: string; name: string; registration: string; region: string; shift: string; currentStatus: string; active: boolean; employmentStatus?: 'Trabalhando' | 'Demitido' }) {
  const { data, error } = await getSupabaseAdmin().from('technicians').insert({ supervisor_id: input.supervisorId || null, lead_technician_id: input.leadTechnicianId || null, team_role: input.teamRole, name: input.name, registration: input.registration, region: input.region, shift: input.shift, current_status: input.currentStatus, active: input.active, active_override: false, employment_status: input.employmentStatus || 'Trabalhando' }).select('id, supervisor_id, lead_technician_id, name, registration, region, shift, current_status, active, active_override, employment_status, team_role, supervisors(name)').single();
  if (error || !data) throw new Error(error?.message || 'Nao foi possivel cadastrar o tecnico.');
  const supervisor = Array.isArray(data.supervisors) ? data.supervisors[0] : data.supervisors;
  return { id: data.id, supervisorId: data.supervisor_id || undefined, leadTechnicianId: data.lead_technician_id ?? undefined, name: data.name, registration: data.registration, supervisorName: supervisor?.name || undefined, region: data.region || '', shift: data.shift || '', currentStatus: data.current_status as 'Disponivel' | 'Em campo' | 'Indisponivel', active: data.active, activeOverride: data.active_override ?? false, employmentStatus: (data.employment_status || 'Trabalhando') as 'Trabalhando' | 'Demitido', teamRole: data.team_role as 'Tecnico' | 'Auxiliar' };
}

export async function updateSupabaseTechnician(id: string, input: { name?: string; registration?: string; region?: string; shift?: string; supervisorId?: string; currentStatus?: string; active?: boolean; employmentStatus?: 'Trabalhando' | 'Demitido'; teamRole?: string; leadTechnicianId?: string | null }) {
  invalidateCallsSnapshot(true);
  const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) changes.name = input.name;
  if (input.registration !== undefined) changes.registration = input.registration;
  if (input.region !== undefined) changes.region = input.region;
  if (input.shift !== undefined) changes.shift = input.shift;
  if (input.supervisorId !== undefined) changes.supervisor_id = input.supervisorId || null;
  if (input.currentStatus !== undefined) changes.current_status = input.currentStatus;
  if (input.active !== undefined) { changes.active = input.active; changes.active_override = true; }
  if (input.employmentStatus !== undefined) changes.employment_status = input.employmentStatus;
  if (input.teamRole !== undefined) changes.team_role = input.teamRole;
  if (input.leadTechnicianId !== undefined) changes.lead_technician_id = input.leadTechnicianId || null;
  const { data, error } = await getSupabaseAdmin().from('technicians').update(changes).eq('id', id).is('deleted_at', null).select('id, supervisor_id, lead_technician_id, name, registration, region, shift, current_status, active, active_override, employment_status, team_role, supervisors(name), lead_technician:lead_technician_id(name)').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  const supervisor = Array.isArray(data.supervisors) ? data.supervisors[0] : data.supervisors;
  const lead = Array.isArray((data as any).lead_technician) ? (data as any).lead_technician[0] : (data as any).lead_technician;
  return { id: data.id, supervisorId: data.supervisor_id || undefined, leadTechnicianId: data.lead_technician_id ?? undefined, leadTechnicianName: lead?.name || undefined, name: data.name, registration: data.registration, supervisorName: supervisor?.name || undefined, region: data.region || '', shift: data.shift || '', currentStatus: data.current_status as 'Disponivel' | 'Em campo' | 'Indisponivel', active: data.active, activeOverride: data.active_override ?? false, employmentStatus: (data.employment_status || 'Trabalhando') as 'Trabalhando' | 'Demitido', teamRole: data.team_role as 'Tecnico' | 'Auxiliar' };
}

export async function deleteSupabaseTechnician(id: string) {
  invalidateCallsSnapshot(true);
  const admin = getSupabaseAdmin();
  const { error } = await admin.from('technicians').update({ active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null);
  if (error) throw new Error(error.message || 'Nao foi possivel remover o tecnico.');
  const { error: detachError } = await admin.from('technicians').update({ lead_technician_id: null, updated_at: new Date().toISOString() }).eq('lead_technician_id', id).is('deleted_at', null);
  if (detachError) throw new Error(detachError.message || 'Nao foi possivel desvincular os auxiliares.');
  return true;
}

// summary: somente as colunas usadas pelos indicadores, sem observacoes nem textos longos.
// ---------- Copia dos chamados em memoria (economia de trafego do Supabase) ----------
// Antes, cada tela, atualizacao automatica e rotina de fundo baixava a tabela INTEIRA de chamados (5 mil linhas,
// ~14 MB), dezenas de milhares de vezes por mes, e o plano gratuito estourou o limite de trafego (egress).
// Agora o servidor guarda os chamados na memoria: carga completa a cada 6 h (pega exclusoes feitas fora da API; as feitas pela API ja recarregam na hora) e, no meio,
// so busca o que mudou (updated_at), quando algo foi gravado ou no maximo 1x por minuto. Filtros em memoria.
type SnapshotEntry = { call: Call; supervisorId?: string; updatedAt: string };
// Era 30 min: cada carga baixa ~14 MB (5 mil chamados) e o medidor mostrou 169 MB so de chamados em 10/11.
const SNAPSHOT_FULL_MS = 6 * 60 * 60_000;
const SNAPSHOT_DELTA_MS = 60_000;
let snapshot: { entries: Map<string, SnapshotEntry>; fullAt: number; deltaAt: number; lastUpdatedAt: string } | null = null;
let snapshotDirty = false;
let snapshotLoading: Promise<void> | null = null;
const CLOSED_FOR_DATES = ['Finalizado', 'Cancelado', 'Baixar'];

export function invalidateCallsSnapshot(full = false) {
  if (full) snapshot = null;
  else snapshotDirty = true;
}
// Observacao nova nao mexe em calls.updated_at: atualiza a "ultima observacao" direto na copia.
export function noteCallObservation(callId: string, createdAt: string) {
  const entry = snapshot?.entries.get(callId);
  if (entry && (!entry.call.lastObservationAt || createdAt > entry.call.lastObservationAt)) entry.call = { ...entry.call, lastObservationAt: createdAt };
}

async function fetchSnapshotRows(updatedSince?: string): Promise<SnapshotEntry[]> {
  const rows = await fetchSupabaseCalls(undefined, updatedSince ? { updatedSince } : {});
  return rows.map((call) => {
    const extra = call as Call & { __supervisorId?: string; __updatedAt?: string };
    const { __supervisorId, __updatedAt, ...clean } = extra;
    return { call: clean as Call, supervisorId: __supervisorId, updatedAt: __updatedAt || '' };
  });
}

async function ensureSnapshot() {
  const now = Date.now();
  // Em modo economia (perto do limite de trafego) a copia vale mais tempo: 3x ou 10x.
  const needsFull = !snapshot || now - snapshot.fullAt > scaled(SNAPSHOT_FULL_MS);
  const needsDelta = !needsFull && (snapshotDirty || now - snapshot!.deltaAt > scaled(SNAPSHOT_DELTA_MS));
  if (!needsFull && !needsDelta) return;
  if (snapshotLoading) return snapshotLoading;
  snapshotLoading = (async () => {
    try {
      if (needsFull) {
        snapshotDirty = false;
        const rows = await fetchSnapshotRows();
        const entries = new Map(rows.map((row) => [row.call.id, row]));
        const lastUpdatedAt = rows.reduce((max, row) => (row.updatedAt > max ? row.updatedAt : max), '');
        snapshot = { entries, fullAt: Date.now(), deltaAt: Date.now(), lastUpdatedAt };
      } else if (snapshot) {
        snapshotDirty = false;
        // 5 s de folga para gravacoes no mesmo instante.
        const since = snapshot.lastUpdatedAt ? new Date(Date.parse(snapshot.lastUpdatedAt) - 5000).toISOString() : undefined;
        const rows = since ? await fetchSnapshotRows(since) : await fetchSnapshotRows();
        for (const row of rows) {
          const previous = snapshot.entries.get(row.call.id);
          // A busca parcial nao traz as observacoes antigas: mantem a ultima observacao que ja estava na copia.
          const lastObservationAt = [row.call.lastObservationAt, previous?.call.lastObservationAt].filter(Boolean).sort().pop();
          snapshot.entries.set(row.call.id, { ...row, call: { ...row.call, lastObservationAt } });
          if (row.updatedAt > snapshot.lastUpdatedAt) snapshot.lastUpdatedAt = row.updatedAt;
        }
        snapshot.deltaAt = Date.now();
      }
    } finally {
      snapshotLoading = null;
    }
  })();
  return snapshotLoading;
}

function inDateWindow(call: Call, from?: string, to?: string) {
  const lower = from ? operationalDayStartIso(from) : undefined;
  const upper = to ? operationalDayStartIso(addDays(to, 1)) : undefined;
  const within = (iso?: string | null) => Boolean(iso) && (!lower || iso! >= lower) && (!upper || iso! < upper);
  if (CLOSED_FOR_DATES.includes(call.status)) return call.executedAt ? within(call.executedAt) : within(call.openedAt);
  return within(call.openedAt);
}
const toTime = (iso?: string | null) => (iso ? Date.parse(iso) : 0);

export async function listSupabaseCalls(status?: CallStatus | CallStatus[], filters: { from?: string; to?: string; supervisorId?: string; id?: string } = {}, options: { summary?: boolean } = {}): Promise<Call[]> {
  // Um chamado so (detalhe, antes de gravar): leitura direta e fresca, e atualiza a copia.
  if (filters.id) {
    const rows = (await fetchSupabaseCalls(undefined, { id: filters.id, supervisorId: filters.supervisorId })).map((call) => {
      const { __supervisorId, __updatedAt, ...clean } = call as Call & { __supervisorId?: string; __updatedAt?: string };
      const entry: SnapshotEntry = { call: clean as Call, supervisorId: __supervisorId, updatedAt: __updatedAt || '' };
      const previous = snapshot?.entries.get(entry.call.id);
      if (snapshot && (!previous || entry.updatedAt >= previous.updatedAt)) snapshot.entries.set(entry.call.id, entry);
      return entry.call;
    });
    return rows;
  }
  void options;
  await ensureSnapshot();
  const wanted = status ? new Set(Array.isArray(status) ? status : [status]) : null;
  const result: Call[] = [];
  for (const entry of snapshot!.entries.values()) {
    const call = entry.call;
    if (wanted && !wanted.has(call.status)) continue;
    if (filters.supervisorId && entry.supervisorId !== filters.supervisorId) continue;
    if ((filters.from || filters.to) && !inDateWindow(call, filters.from, filters.to)) continue;
    result.push(call);
  }
  return result.sort((a, b) => toTime(b.openedAt) - toTime(a.openedAt) || a.id.localeCompare(b.id));
}

async function fetchSupabaseCalls(status?: CallStatus | CallStatus[], filters: { from?: string; to?: string; supervisorId?: string; id?: string; updatedSince?: string } = {}, options: { summary?: boolean } = {}): Promise<Call[]> {
  const technicianJoin = filters.supervisorId ? 'technicians!inner(name, supervisor_id, supervisors(name))' : 'technicians(name, supervisor_id, supervisors(name))';
  const columns = options.summary
    ? 'id, order_number, type, region, bairro, status, technician_id, opened_at, executed_at'
    : 'id, order_number, bdesk, office_track, client, type, reason, region, city, address, bairro, ofs_status, olt, slot_pon, status, atrelada_order, technician_id, support_technician_id, opened_at, event_at, assigned_at, executed_at, result, cancellation_reason, cluster, closing_reason, closing_subreason, cable_type, notes, source, source_identity, source_identifiers, source_file_id, source_file_name, source_reference_date, source_fingerprint, source_processed_at, updated_at, call_observations(created_at)';
  const pageSize = 500;
  const calls: Call[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = getSupabaseAdmin().from('calls').select(`${columns}, ${technicianJoin}`).order('opened_at', { ascending: false }).order('id', { ascending: true });
    if (status) query = query.in('status', Array.isArray(status) ? status : [status]);
    if (filters.id) query = query.eq('id', filters.id);
    if (filters.updatedSince) query = query.gt('updated_at', filters.updatedSince);
  if (filters.from || filters.to) {
    const from = filters.from ? operationalDayStartIso(filters.from) : undefined;
    const upperBound = filters.to ? operationalDayStartIso(addDays(filters.to, 1)) : undefined;
    const bounds = (column: string) => [from ? `${column}.gte.${from}` : '', upperBound ? `${column}.lt.${upperBound}` : ''].filter(Boolean);
    const closedExecution = ['status.in.(Finalizado,Cancelado,Baixar)', ...bounds('executed_at')];
    const closedOpeningFallback = ['status.in.(Finalizado,Cancelado,Baixar)', 'executed_at.is.null', ...bounds('opened_at')];
    const activeOpening = ['status.not.in.(Finalizado,Cancelado,Baixar)', ...bounds('opened_at')];
    query = query.or([closedExecution, closedOpeningFallback, activeOpening].map((terms) => `and(${terms.join(',')})`).join(','));
  }
  if (filters.supervisorId) query = query.eq('technicians.supervisor_id', filters.supervisorId);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = ((data || []) as unknown as any[]).map((row) => {
      const technician = Array.isArray(row.technicians) ? row.technicians[0] : row.technicians;
      const supervisor = Array.isArray(technician?.supervisors) ? technician.supervisors[0] : technician?.supervisors;
      const observationRows = Array.isArray((row as any).call_observations) ? (row as any).call_observations : [];
      const lastObservationAt = observationRows.map((observation: { created_at?: string }) => observation.created_at).filter(Boolean).sort().pop();
      return { id: row.id, orderNumber: row.order_number, bdesk: row.bdesk || '', officeTrack: row.office_track || '', client: row.client || '', type: row.type || '', reason: row.reason || '', region: row.region || '', city: row.city || '', address: row.address || '', bairro: row.bairro || '', ofsStatus: row.ofs_status || undefined, olt: row.olt || '', slotPon: row.slot_pon || '', status: row.status as CallStatus, atrelada: row.atrelada_order || undefined, technicianId: row.technician_id || undefined, technicianName: technician?.name || undefined, supervisorName: supervisor?.name || undefined, supportTechnicianId: row.support_technician_id || undefined, openedAt: row.opened_at, eventAt: row.event_at || undefined, assignedAt: row.assigned_at || undefined, executedAt: row.executed_at || undefined, result: row.result || undefined, cancellationReason: row.cancellation_reason || undefined, cluster: row.cluster || undefined, closingReason: row.closing_reason || undefined, closingSubreason: row.closing_subreason || undefined, cableType: row.cable_type || undefined, notes: row.notes || '', lastObservationAt, source: row.source || undefined, sourceIdentity: row.source_identity || undefined, sourceIdentifiers: Array.isArray(row.source_identifiers) ? row.source_identifiers : [], sourceFileId: row.source_file_id || undefined, sourceFileName: row.source_file_name || undefined, sourceReferenceDate: row.source_reference_date || undefined, sourceFingerprint: row.source_fingerprint || undefined, sourceProcessedAt: row.source_processed_at || undefined, __supervisorId: technician?.supervisor_id || undefined, __updatedAt: row.updated_at || '' };
    });
    calls.push(...page);
    if (page.length < pageSize) return calls;
  }
}

export async function finishSupabaseCall(id: string, input: { result: string; executedAt: string; notes: string }, actor: { id: string; name: string }) {
  const current = (await listSupabaseCalls(undefined, { id }))[0];
  if (!current || isCallClosed(current)) return undefined;
  const { data, error } = await getSupabaseAdmin().from('calls').update({ result: input.result, executed_at: input.executedAt, notes: input.notes, status: 'Finalizado', updated_at: new Date().toISOString() }).eq('id', id).not('status', 'in', '(Finalizado,Cancelado,Baixar)').select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  const labels: Record<string, string> = { status: 'Status', result: 'Resultado', executedAt: 'Data de execucao', notes: 'Observacoes' };
  for (const [field, value] of Object.entries({ status: 'Finalizado', result: input.result, executedAt: input.executedAt, notes: input.notes })) {
    const previousValue = String(current[field as keyof Call] ?? '');
    if (previousValue !== value) { const { error: logError } = await getSupabaseAdmin().from('call_logs').insert({ call_id: id, user_id: actor.id, action: `${labels[field]} alterado`, field, previous_value: previousValue, new_value: value }); if (logError) throw new Error(logError.message); }
  }
  return (await listSupabaseCalls(undefined, { id }))[0];
}

export async function cancelSupabaseCall(id: string, reason: string, actor: { id: string; name: string }) {
  const current = (await listSupabaseCalls(undefined, { id }))[0];
  if (!current || isCallClosed(current)) return undefined;
  const { data, error } = await getSupabaseAdmin().from('calls').update({ status: 'Cancelado', cancellation_reason: reason, updated_at: new Date().toISOString() }).eq('id', id).not('status', 'in', '(Finalizado,Cancelado,Baixar)').select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  const { error: logError } = await getSupabaseAdmin().from('call_logs').insert({ call_id: id, user_id: actor.id, action: 'Motivo de cancelamento alterado', field: 'cancellationReason', previous_value: current.cancellationReason || '', new_value: reason });
  if (logError) throw new Error(logError.message);
  return (await listSupabaseCalls(undefined, { id }))[0];
}

export async function reopenSupabaseCall(id: string, actor: { id: string; name: string }) {
  const current = (await listSupabaseCalls(undefined, { id }))[0];
  if (!current || !isCallClosed(current)) return undefined;
  const { data, error } = await getSupabaseAdmin().from('calls').update({ status: 'Aberto', cancellation_reason: null, result: null, executed_at: null, updated_at: new Date().toISOString() }).eq('id', id).in('status', ['Finalizado', 'Cancelado', 'Baixar', 'GIGA+']).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  const { error: logError } = await getSupabaseAdmin().from('call_logs').insert({ call_id: id, user_id: actor.id, action: 'Status alterado', field: 'status', previous_value: current.status, new_value: 'Aberto' });
  if (logError) throw new Error(logError.message);
  return (await listSupabaseCalls(undefined, { id }))[0];
}

export async function updateSupabaseCall(id: string, input: { orderNumber?: string; bdesk?: string; officeTrack?: string; client?: string; type?: string; reason?: string; region?: string; city?: string; address?: string; bairro?: string; ofsStatus?: string; olt?: string; slotPon?: string; status?: string; technicianId?: string | null; supportTechnicianId?: string | null; openedAt?: string; executedAt?: string | null; result?: string; cancellationReason?: string | null; closingReason?: string; closingSubreason?: string; cableType?: string; notes?: string }, actor: { id: string; name: string; roleId?: string }) {
  const current = (await listSupabaseCalls(undefined, { id }))[0];
  // Chamado encerrado: so aceita troca de status (ex.: Baixar -> Finalizado, ou reabrir); o resto fica travado.
  const changesStatus = input.status !== undefined && input.status !== current.status;
  if (!current || (isCallClosed(current) && actor.roleId !== 'system' && !changesStatus)) return undefined;
  const nextStatus = input.status ?? current.status;
  const terminalStatuses = ['Finalizado', 'Cancelado', 'Baixar'] as const;
  if (terminalStatuses.includes(nextStatus as typeof terminalStatuses[number]) && input.executedAt === undefined) {
    input = { ...input, executedAt: current.executedAt ?? new Date().toISOString() };
  }
  // Mesma regra do PostgreSQL local e do modo demo: preserva a primeira atribuicao e limpa ao remover o tecnico.
  const assignedAt = input.technicianId ? current.assignedAt ?? new Date().toISOString() : undefined;
  const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const databaseFields: Record<string, string> = { orderNumber: 'order_number', bdesk: 'bdesk', officeTrack: 'office_track', client: 'client', type: 'type', reason: 'reason', region: 'region', city: 'city', address: 'address', bairro: 'bairro', ofsStatus: 'ofs_status', olt: 'olt', slotPon: 'slot_pon', status: 'status', openedAt: 'opened_at', executedAt: 'executed_at', result: 'result', cancellationReason: 'cancellation_reason', closingReason: 'closing_reason', closingSubreason: 'closing_subreason', cableType: 'cable_type', notes: 'notes' };
  for (const field of Object.keys(databaseFields)) {
    const value = input[field as keyof typeof input];
    if (value !== undefined) changes[databaseFields[field]] = value;
  }
  if (input.technicianId !== undefined) { changes.technician_id = input.technicianId || null; changes.assigned_at = assignedAt || null; }
  if (input.supportTechnicianId !== undefined) changes.support_technician_id = input.supportTechnicianId || null;
  if (input.notes !== undefined) changes.notes = input.notes;
  const { data, error } = await getSupabaseAdmin().from('calls').update(changes).eq('id', id).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  const labels: Record<string, string> = { orderNumber: 'Ordem', bdesk: 'BDESK', officeTrack: 'Office Track', client: 'Tecnico B2C', type: 'Tipo', reason: 'Motivo', region: 'Regiao', city: 'Cidade', address: 'Endereco', bairro: 'Bairro', ofsStatus: 'Status OFS', olt: 'OLT', slotPon: 'Slot/PON', status: 'Status', technicianId: 'Tecnico', supportTechnicianId: 'Tecnico de apoio', openedAt: 'Data de abertura', executedAt: 'Data de finalizacao', result: 'Resultado', cancellationReason: 'Motivo de cancelamento', closingReason: 'Motivo de fechamento', closingSubreason: 'Submotivo de fechamento', cableType: 'Tipo do cabo', notes: 'Observacoes' };
  const auditRows = [] as Array<{ call_id: string; user_id: string | null; action: string; field: string; previous_value: string; new_value: string }>;
  for (const field of Object.keys(input)) {
    const previousValue = String(current[field as keyof Call] ?? '');
    const newValue = String(input[field as keyof typeof input] ?? '');
    if (previousValue !== newValue) auditRows.push({ call_id: id, user_id: actor.roleId === 'system' ? null : actor.id, action: `${labels[field] || field} alterado`, field, previous_value: previousValue, new_value: newValue });
  }
  if (auditRows.length) {
    const { error: logError } = await getSupabaseAdmin().from('call_logs').insert(auditRows);
    if (logError) throw new Error(logError.message);
  }
  let technicianName = current.technicianName;
  let supervisorName = current.supervisorName;
  if (input.technicianId !== undefined) {
    technicianName = undefined;
    supervisorName = undefined;
    if (input.technicianId) {
      const { data: technician, error: technicianError } = await getSupabaseAdmin().from('technicians').select('name, supervisors(name)').eq('id', input.technicianId).maybeSingle();
      if (technicianError) throw new Error(technicianError.message);
      technicianName = technician?.name || undefined;
      const supervisor = Array.isArray(technician?.supervisors) ? technician.supervisors[0] : technician?.supervisors;
      supervisorName = supervisor?.name || undefined;
    }
  }
  return { ...current, ...input, status: (input.status ?? current.status) as CallStatus, technicianId: input.technicianId === undefined ? current.technicianId : input.technicianId || undefined, cancellationReason: input.cancellationReason === undefined ? current.cancellationReason : input.cancellationReason || undefined, technicianName, supervisorName, assignedAt: input.technicianId === undefined ? current.assignedAt : assignedAt };
}

export async function getSupabaseRole(roleId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('roles')
    .select('id, name, description, hidden_tabs, role_permissions(permissions(code))')
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
  return { id: record.id, name: record.name, description: record.description || '', permissions, hiddenTabs: Array.isArray(record.hidden_tabs) ? record.hidden_tabs : [] };
}

export async function listSupabaseRoles() {
  const { data, error } = await getSupabaseAdmin()
    .from('roles')
    .select('id, name, description, hidden_tabs, role_permissions(permissions(code))')
    .is('deleted_at', null)
    .order('name');
  if (error) throw new Error(error.message);
  return (data || []).map((record) => {
    const rows = Array.isArray(record.role_permissions) ? record.role_permissions : [];
    const permissions = rows.flatMap((item: { permissions?: { code?: string } | { code?: string }[] | null }) => {
      const values = Array.isArray(item.permissions) ? item.permissions : item.permissions ? [item.permissions] : [];
      return values.map((permission) => permission.code).filter(Boolean);
    });
    return { id: record.id, name: record.name, description: record.description || '', permissions, hiddenTabs: Array.isArray(record.hidden_tabs) ? record.hidden_tabs : [] };
  });
}

// Ultimo processamento de cada acionamento em poucas consultas (antes era uma consulta por acionamento).
async function latestProcessingByActivation(ids: string[]) {
  const latest = new Map<string, Record<string, unknown>>();
  for (let index = 0; index < ids.length; index += 150) {
    const chunk = ids.slice(index, index + 150);
    const { data, error } = await getSupabaseAdmin().from('activation_processing').select('activation_id, extracted_data, created_at').in('activation_id', chunk).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    for (const row of data || []) if (!latest.has(row.activation_id)) latest.set(row.activation_id, (row.extracted_data || {}) as Record<string, unknown>);
  }
  return latest;
}

// SN dos chamados: o acionamento que criou o chamado guarda o que foi lido do card (FIELD traz o S/N) e o SN que a
// extensao achou no AutoISP. Busca so os acionamentos dos chamados pedidos (pouco trafego).
export async function supabaseActivationDataForCalls(callIds: string[]) {
  const result = new Map<string, { activationId: string; extracted: Record<string, unknown> }>();
  for (let index = 0; index < callIds.length; index += 150) {
    const chunk = callIds.slice(index, index + 150);
    const { data, error } = await getSupabaseAdmin().from('activations').select('id, created_call_id, decision_at').in('created_call_id', chunk).order('decision_at', { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data || []).filter((row) => row.created_call_id && !result.has(row.created_call_id));
    const latest = await latestProcessingByActivation(rows.map((row) => row.id));
    for (const row of rows) if (!result.has(row.created_call_id)) result.set(row.created_call_id, { activationId: row.id, extracted: latest.get(row.id) || {} });
  }
  return result;
}
// Nova versao dos dados do acionamento (activation_processing so recebe linhas novas; vale a mais recente).
export async function appendSupabaseActivationData(activationId: string, extracted: Record<string, unknown>, processor: string) {
  const { error } = await getSupabaseAdmin().from('activation_processing').insert({ activation_id: activationId, extracted_data: extracted, processor });
  if (error) throw new Error(error.message);
}

// Candidatos ao atrelado: chamados em aberto (findAtreladaCallOrder decide o "pendente" e a OLT/PON).
// Vem da copia dos chamados em memoria, sem nova consulta ao banco.
async function listAtreladaCandidates(olt: string | null | undefined): Promise<Call[]> {
  if (!olt) return [];
  return listSupabaseCalls([...ATRELADA_OPEN_STATUSES]);
}

const ACTIVATION_DEDUPE_DAYS = 14;

export async function createSupabaseActivation(input: { source: string; originalMessage: string; extractedData: Record<string, string>; analysis?: ActivationAnalysis }): Promise<Activation> {
  const admin = getSupabaseAdmin();
  const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
  // Mesmo card (mesma mensagem ou mesma OS) ja recebido: devolve o mesmo acionamento. BDESK nao conta (chamados diferentes).
  const incomingKeys = [input.originalMessage, input.extractedData.officeTrack, input.extractedData.orderNumber].map(normalize).filter(Boolean);
  const { data: pendingRows, error: pendingError } = await admin.from('activations').select('id, source, original_message, received_at, status').eq('source', input.source).in('status', ['Pendente', 'Aceito']).gte('received_at', new Date(Date.now() - ACTIVATION_DEDUPE_DAYS * 86_400_000).toISOString()).order('received_at', { ascending: false });
  if (pendingError) throw new Error(pendingError.message);
  const processingById = await latestProcessingByActivation((pendingRows || []).map((row) => row.id));
  const existingAnalyses: Array<{ id: string; analysis?: ActivationAnalysis }> = [];
  for (const pending of pendingRows || []) {
    const stored = processingById.get(pending.id) || {};
    const { _analysis: storedAnalysis } = stored;
    existingAnalyses.push({ id: pending.id, analysis: storedAnalysis as ActivationAnalysis | undefined });
    const storedKeys = [pending.original_message, stored.officeTrack, stored.orderNumber].map(normalize).filter(Boolean);
    if (!incomingKeys.some((key) => storedKeys.includes(key))) continue;
    const { _analysis: analysis, ...extractedData } = stored;
    return { id: pending.id, source: pending.source, originalMessage: pending.original_message, receivedAt: pending.received_at, status: pending.status as ActivationStatus, extractedData: extractedData as Record<string, string>, analysis: analysis as ActivationAnalysis | undefined };
  }
  const atreladaOrder = input.analysis ? findAtreladaCallOrder(input.analysis, await listAtreladaCandidates(input.analysis.olt)) : undefined;
  const enrichedAnalysis = input.analysis ? { ...input.analysis, atrelada: atreladaOrder || null, atreladas: identifyAtreladas(input.analysis, existingAnalyses) } : input.analysis;
  const { data: activation, error } = await admin.from('activations').insert({ source: input.source, original_message: input.originalMessage, status: 'Pendente' }).select('id, source, original_message, received_at, status').single();
  if (error || !activation) throw new Error(error?.message || 'Nao foi possivel registrar o acionamento.');
  const extractedData = { ...input.extractedData, _analysis: enrichedAnalysis };
  const { error: processingError } = await admin.from('activation_processing').insert({ activation_id: activation.id, extracted_data: extractedData, processor: input.analysis ? 'gemini-semantic' : 'local-semantic' });
  if (processingError) throw new Error(processingError.message);
  return { id: activation.id, source: activation.source, originalMessage: activation.original_message, receivedAt: activation.received_at, status: activation.status as ActivationStatus, extractedData: input.extractedData, analysis: enrichedAnalysis };
}

export async function countSupabasePendingActivations(): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from('activations').select('id', { count: 'exact', head: true }).eq('status', 'Pendente');
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function countSupabaseUnassignedOpenCalls(): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from('calls').select('id', { count: 'exact', head: true }).is('technician_id', null).not('status', 'in', '(Finalizado,Cancelado,Baixar)');
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function listSupabaseActivations(status?: ActivationStatus, limit?: number): Promise<Activation[]> {
  const admin = getSupabaseAdmin();
  let query = admin.from('activations').select('id, source, original_message, received_at, status, decision_by, decision_at, created_call_id, rejection_reason').order('received_at', { ascending: false });
  if (status) query = query.eq('status', status);
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const activations: Activation[] = [];
  const processingById = await latestProcessingByActivation((data || []).map((row) => row.id));
  for (const row of data || []) {
    const extracted = processingById.get(row.id) || {};
    const { _analysis: storedAnalysis, ...extractedData } = extracted;
    const analysis = row.status === 'Pendente' ? refreshStoredAnalysis(row.original_message || '', (storedAnalysis || {}) as Partial<ActivationAnalysis>) : storedAnalysis;
    if (row.status === 'Pendente' && !extractedData.orderNumber) {
      const order = (analysis as Partial<ActivationAnalysis>).office_track || (analysis as Partial<ActivationAnalysis>).os_ot;
      if (order) Object.assign(extractedData, { orderNumber: order, officeTrack: order });
    }
    activations.push({ id: row.id, source: row.source, originalMessage: row.original_message, receivedAt: row.received_at, status: row.status as ActivationStatus, decisionBy: row.decision_by || undefined, decisionAt: row.decision_at || undefined, createdCallId: row.created_call_id || undefined, rejectionReason: row.rejection_reason || undefined, extractedData: extractedData as Record<string, string>, analysis: analysis as ActivationAnalysis | undefined });
  }
  return activations;
}

// Um acionamento so (consulta publica do informativo). Mesmo formato de listSupabaseActivations.
export async function getSupabaseActivation(id: string): Promise<Activation | undefined> {
  const { data: row, error } = await getSupabaseAdmin().from('activations').select('id, source, original_message, received_at, status, decision_by, decision_at, created_call_id, rejection_reason').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return undefined;
  const extracted = (await latestProcessingByActivation([row.id])).get(row.id) || {};
  const { _analysis: analysis, ...extractedData } = extracted;
  return { id: row.id, source: row.source, originalMessage: row.original_message, receivedAt: row.received_at, status: row.status as ActivationStatus, decisionBy: row.decision_by || undefined, decisionAt: row.decision_at || undefined, createdCallId: row.created_call_id || undefined, rejectionReason: row.rejection_reason || undefined, extractedData: extractedData as Record<string, string>, analysis: analysis as ActivationAnalysis | undefined };
}

// Acionamento recusado por engano volta a Pendente (para ser aceito pelo caminho normal). So mexe se ainda estiver Recusado.
export async function reopenSupabaseRejectedActivation(id: string) {
  const { data, error } = await getSupabaseAdmin().from('activations').update({ status: 'Pendente', decision_by: null, decision_at: null }).eq('id', id).eq('status', 'Recusado').select('id').maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
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
    const structured = refreshStoredAnalysis(row.original_message || '', (analysis || {}) as Partial<ActivationAnalysis>);
    const value = (key: string) => typeof extractedData[key] === 'string' ? String(extractedData[key]) : '';
    const orderNumber = structured.office_track || structured.os_ot || value('officeTrack') || value('orderNumber') || value('bdesk') || `PEND-${id.slice(-6)}`;
    const olt = structured.olt || value('olt');
    const callInput = {
      order_number: orderNumber,
      bdesk: structured.bdesk || value('bdesk') || '',
      office_track: structured.office_track || structured.os_ot || value('officeTrack') || '',
      client: value('client') || 'Cliente nao identificado',
      type: structured.tipo_registro || value('type') || 'Acionamento',
      reason: structured.motivo || structured.tipo_falha || value('reason') || 'Acionamento recebido',
      region: resolveOltRegion(olt).region || value('region') || 'Nao informada',
      city: value('city') || 'Nao informada',
      address: structured.endereco_principal || '',
      bairro: structured.bairro_principal || '',
      olt,
      slot_pon: Array.isArray(structured.slot_pon) ? structured.slot_pon.join(', ') : value('slotPon') || '',
      atrelada_order: structured.atrelada || null,
      status: 'Aberto',
      // Abertura = horario em que o card foi enviado no grupo (timestamp do WhatsApp), nao o clique em Aceitar.
      opened_at: row.received_at || new Date().toISOString(),
      event_at: parseSaoPauloDateTime(structured.data_hora_evento) || null,
      // Atrelada a outra ordem: fica escrito nas observacoes para quem abrir o chamado.
      notes: structured.atrelada ? `Criado a partir de acionamento aceito.\nAtrelada > ${structured.atrelada}` : 'Criado a partir de acionamento aceito.',
    };
    // Tamanho maximo de cada coluna em calls: um card fora do padrao nao pode mais travar o aceite
    // ("value too long for type character varying"). O texto completo continua na mensagem original.
    const columnLimits: Partial<Record<keyof typeof callInput, number>> = { order_number: 100, bdesk: 100, office_track: 100, client: 180, type: 100, region: 100, city: 100, bairro: 160, olt: 120, atrelada_order: 100 };
    for (const [column, max] of Object.entries(columnLimits) as [keyof typeof callInput, number][]) {
      const current = callInput[column];
      if (typeof current === 'string' && current.length > max) (callInput as Record<string, unknown>)[column] = current.slice(0, max).trim();
    }
    const callColumns = 'id, order_number, bdesk, office_track, client, type, reason, region, city, address, bairro, olt, slot_pon, status, atrelada_order, technician_id, opened_at, event_at, assigned_at, executed_at, result, cancellation_reason, notes';
    // O mesmo card chega por mais de um grupo do WhatsApp: se a ordem ja tem chamado (nao cancelado), o aceite liga o
    // acionamento a esse chamado em vez de criar outro. Dois chamados ativos da mesma ordem travam o status do OFS.
    // So pela OS: mesmo BDESK pode ser outro chamado.
    let existingRow = null as Record<string, any> | null;
    const safe = (value: string) => /^[A-Za-z0-9-]+$/.test(value);
    const lookups = !orderNumber.startsWith('PEND-') && safe(orderNumber) ? [`order_number.eq.${orderNumber}`, `office_track.eq.${orderNumber}`] : [];
    if (lookups.length) {
      const { data: found, error: findError } = await admin.from('calls').select(callColumns).neq('status', 'Cancelado').or(lookups.join(',')).order('created_at', { ascending: true }).limit(20);
      if (findError) throw new Error(findError.message);
      const candidates = (found || []).map((item) => ({ row: item, id: String(item.id), status: item.status as CallStatus, orderNumber: item.order_number || '', officeTrack: item.office_track || '' }));
      existingRow = findDuplicateCall(activationKeys({ orders: [orderNumber, callInput.office_track] }), candidates)?.row || null;
    }
    const { data: callRow, error: callError } = existingRow ? { data: existingRow, error: null } : await admin.from('calls').insert(callInput).select(callColumns).single();
    if (callError || !callRow) throw new Error(callError?.message || 'Nao foi possivel criar o chamado.');
    call = { id: callRow.id, orderNumber: callRow.order_number, bdesk: callRow.bdesk || '', officeTrack: callRow.office_track || '', client: callRow.client || '', type: callRow.type || '', reason: callRow.reason || '', region: callRow.region || '', city: callRow.city || '', address: callRow.address || '', bairro: callRow.bairro || '', olt: callRow.olt || '', slotPon: callRow.slot_pon || '', status: callRow.status as CallStatus, atrelada: callRow.atrelada_order || undefined, technicianId: callRow.technician_id || undefined, openedAt: callRow.opened_at, eventAt: callRow.event_at || undefined, assignedAt: callRow.assigned_at || undefined, executedAt: callRow.executed_at || undefined, result: callRow.result || undefined, cancellationReason: callRow.cancellation_reason || undefined, notes: callRow.notes || '' };
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
    password_change_required: true,
  }).select('id, name, email, role_id, active, created_at').single();
  if (profileError || !profile) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error(profileError?.message || 'Nao foi possivel criar o perfil no Supabase.');
  }
  const role = await getSupabaseRole(input.roleId);
  return { id: profile.id, name: profile.name, email: profile.email, roleId: profile.role_id, active: profile.active, createdAt: profile.created_at, mustChangePassword: true, role: role || undefined };
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
  if (input.password !== undefined) profileChanges.password_change_required = true;
  const { data, error } = await admin.from('profiles').update(profileChanges).eq('id', id).is('deleted_at', null).select('id, name, email, role_id, active, password_change_required, created_at').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  return { id: data.id, name: data.name, email: data.email, roleId: data.role_id, active: data.active, createdAt: data.created_at, mustChangePassword: data.password_change_required, role: (await getSupabaseRole(data.role_id)) || undefined };
}

export async function changeSupabaseUserPassword(id: string, currentPassword: string, newPassword: string) {
  const admin = getSupabaseAdmin();
  const profile = await getSupabaseProfile(id);
  if (!profile) return {};
  const { data: authData, error: authError } = await getSupabaseAuthClient().auth.signInWithPassword({ email: profile.email, password: currentPassword });
  if (authError || authData.user?.id !== id) return { error: 'invalid-current-password' as const };
  if (currentPassword === newPassword) return { error: 'same-password' as const };
  const { error: passwordError } = await admin.auth.admin.updateUserById(id, { password: newPassword });
  if (passwordError) throw new Error(passwordError.message);
  const { error: profileError } = await admin.from('profiles').update({ password_change_required: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (profileError) throw new Error(profileError.message);
  return { user: await getSupabaseProfile(id) || undefined };
}

export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured()) return { configured: false, connected: false };
  const { error } = await getSupabaseAdmin().from('roles').select('id').limit(1);
  return { configured: true, connected: !error, error: error?.message };
}