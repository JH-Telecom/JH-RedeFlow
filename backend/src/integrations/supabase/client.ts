import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin() {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Supabase nao configurado no backend.');
  adminClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return adminClient;
}

export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured()) return { configured: false, connected: false };
  const { error } = await getSupabaseAdmin().from('roles').select('id').limit(1);
  return { configured: true, connected: !error, error: error?.message };
}