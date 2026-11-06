import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, getSupabaseUserStatuses, isSupabaseConfigured, saveSupabaseUserStatus } from '../integrations/supabase/client.js';
import type { UserStatus } from '../team.js';

// Lote 4: status personalizado (na linha de user_avatars) e notificacoes por pessoa (tabela user_notifications).

const demoStatuses = new Map<string, UserStatus>();

export async function getUserStatuses(userIds: string[]): Promise<Record<string, UserStatus>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  if (isSupabaseConfigured()) return await getSupabaseUserStatuses(ids);
  return Object.fromEntries(ids.filter((id) => demoStatuses.has(id)).map((id) => [id, demoStatuses.get(id)!]));
}

export async function saveUserStatus(userId: string, status: UserStatus | null): Promise<void> {
  if (isSupabaseConfigured()) return await saveSupabaseUserStatus(userId, status);
  if (status) demoStatuses.set(userId, status); else demoStatuses.delete(userId);
}

export type UserNotification = { id: string; userId: string; kind: string; title: string; detail: string; href: string; createdAt: string; readAt: string | null };
const demoNotifications: UserNotification[] = [];

export async function createUserNotifications(items: Omit<UserNotification, 'id' | 'createdAt' | 'readAt'>[]): Promise<void> {
  if (!items.length) return;
  const rows = items.map((item) => ({ ...item, id: randomUUID(), createdAt: new Date().toISOString(), readAt: null }));
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin().from('user_notifications').insert(rows.map((row) => ({ id: row.id, user_id: row.userId, kind: row.kind, title: row.title.slice(0, 200), detail: row.detail.slice(0, 500), href: row.href, created_at: row.createdAt })));
    if (error) throw new Error(error.message);
    return;
  }
  demoNotifications.unshift(...rows);
  demoNotifications.splice(1000);
}

export async function listUnreadNotifications(userId: string, limit = 20): Promise<UserNotification[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('user_notifications').select('id, user_id, kind, title, detail, href, created_at, read_at').eq('user_id', userId).is('read_at', null).order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data || []).map((row) => ({ id: row.id, userId: row.user_id, kind: row.kind, title: row.title, detail: row.detail, href: row.href, createdAt: row.created_at, readAt: row.read_at }));
  }
  return demoNotifications.filter((item) => item.userId === userId && !item.readAt).slice(0, limit);
}

// Marca como lidas (todas, sem ids). So as da propria pessoa.
export async function markNotificationsRead(userId: string, ids?: string[]): Promise<number> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured()) {
    let query = getSupabaseAdmin().from('user_notifications').update({ read_at: now }).eq('user_id', userId).is('read_at', null);
    if (ids?.length) query = query.in('id', ids);
    const { data, error } = await query.select('id');
    if (error) throw new Error(error.message);
    return data?.length || 0;
  }
  let count = 0;
  for (const item of demoNotifications) if (item.userId === userId && !item.readAt && (!ids?.length || ids.includes(item.id))) { item.readAt = now; count += 1; }
  return count;
}
