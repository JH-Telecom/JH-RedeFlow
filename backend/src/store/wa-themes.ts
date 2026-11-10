import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '../integrations/supabase/client.js';
import type { ThemeColors } from '../wa-themes.js';

// Galeria de temas do WhatsApp da equipe (tabela wa_shared_themes). A lista vai sem imagem (pouco trafego);
// a imagem so vem ao baixar um tema.
export type SharedTheme = { id: string; name: string; dark: boolean; colors: ThemeColors; hasImage: boolean; authorId: string; authorName: string; downloads: number; createdAt: string };
type StoredTheme = SharedTheme & { image?: string };
const memory: StoredTheme[] = [];
const MAX_THEMES = 200;

export async function listSharedThemes(): Promise<SharedTheme[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('wa_shared_themes').select('id, name, dark, colors, has_image, author_id, author_name, downloads, created_at').order('created_at', { ascending: false }).limit(MAX_THEMES);
    if (error) throw new Error(error.message);
    return (data || []).map((row) => ({ id: row.id, name: row.name, dark: row.dark, colors: row.colors as ThemeColors, hasImage: Boolean(row.has_image), authorId: row.author_id, authorName: row.author_name, downloads: row.downloads, createdAt: row.created_at }));
  }
  return memory.map(({ image, ...theme }) => ({ ...theme, hasImage: Boolean(image) }));
}

export async function getSharedTheme(id: string): Promise<StoredTheme | undefined> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('wa_shared_themes').select('id, name, dark, colors, image, author_id, author_name, downloads, created_at').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return undefined;
    await getSupabaseAdmin().from('wa_shared_themes').update({ downloads: (data.downloads || 0) + 1 }).eq('id', id);
    return { id: data.id, name: data.name, dark: data.dark, colors: data.colors as ThemeColors, image: data.image || undefined, hasImage: Boolean(data.image), authorId: data.author_id, authorName: data.author_name, downloads: (data.downloads || 0) + 1, createdAt: data.created_at };
  }
  const theme = memory.find((item) => item.id === id);
  if (theme) theme.downloads += 1;
  return theme;
}

export async function publishSharedTheme(input: { name: string; colors: ThemeColors; image?: string; author: { id: string; name: string } }): Promise<SharedTheme> {
  const theme: StoredTheme = { id: randomUUID(), name: input.name, dark: Boolean(input.colors.escuro), colors: input.colors, image: input.image, hasImage: Boolean(input.image), authorId: input.author.id, authorName: input.author.name, downloads: 0, createdAt: new Date().toISOString() };
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin().from('wa_shared_themes').insert({ id: theme.id, name: theme.name, dark: theme.dark, colors: theme.colors, image: theme.image || null, author_id: theme.authorId, author_name: theme.authorName });
    if (error) throw new Error(/wa_shared_themes/.test(error.message) ? 'A galeria de temas ainda nao foi criada no banco (falta rodar o SQL wa_shared_themes).' : error.message);
  } else {
    memory.unshift(theme);
    memory.splice(MAX_THEMES);
  }
  const { image, ...rest } = theme;
  return rest;
}

// Quem publicou ou um Administrador remove.
export async function removeSharedTheme(id: string, actor: { id: string; isAdmin: boolean }) {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('wa_shared_themes').select('author_id').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return 'missing' as const;
    if (data.author_id !== actor.id && !actor.isAdmin) return 'forbidden' as const;
    const { error: deleteError } = await getSupabaseAdmin().from('wa_shared_themes').delete().eq('id', id);
    if (deleteError) throw new Error(deleteError.message);
    return 'ok' as const;
  }
  const index = memory.findIndex((item) => item.id === id);
  if (index < 0) return 'missing' as const;
  if (memory[index].authorId !== actor.id && !actor.isAdmin) return 'forbidden' as const;
  memory.splice(index, 1);
  return 'ok' as const;
}
