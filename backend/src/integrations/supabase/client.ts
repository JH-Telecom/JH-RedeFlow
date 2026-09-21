import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured()) return { configured: false, connected: false };
  const { error } = await getSupabaseAdmin().from('roles').select('id').limit(1);
  return { configured: true, connected: !error, error: error?.message };
}