import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSupabaseAdmin, isSupabaseConfigured } from '../integrations/supabase/client.js';

// Temas criados pela equipe (27/11/2026): criar ja deixa o tema na galeria de todos, sem etapa de publicar. Usar um
// tema copia as cores para o perfil de quem usa (preferencias), entao ele continua valendo se o autor apagar.
export const themeSpecSchema = z.object({
  name: z.string().trim().min(2).max(40),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).transform((value) => value.toLowerCase()),
  side: z.string().regex(/^#[0-9a-f]{6}$/i).transform((value) => value.toLowerCase()),
  background: z.enum(['colorido', 'neutro']),
});
export type ThemeSpec = z.infer<typeof themeSpecSchema>;
export type TeamTheme = ThemeSpec & { id: string; authorId: string | null; authorName: string; uses: number; createdAt: string };
export const MAX_THEMES_PER_PERSON = 20;

const memory: TeamTheme[] = [];
const missing = (message: string) => (/team_themes/.test(message) ? 'Falta a migração dos temas da equipe no banco (team_themes).' : message);
type Row = { id: string; name: string; accent: string; side: string; background: 'colorido' | 'neutro'; author_id: string | null; author_name: string | null; uses: number; created_at: string };
const toTheme = (row: Row): TeamTheme => ({ id: row.id, name: row.name, accent: row.accent, side: row.side, background: row.background, authorId: row.author_id, authorName: row.author_name || '', uses: row.uses, createdAt: row.created_at });

export async function listTeamThemes(): Promise<TeamTheme[]> {
  if (!isSupabaseConfigured()) return [...memory];
  const { data, error } = await getSupabaseAdmin().from('team_themes').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(missing(error.message));
  return (data as Row[]).map(toTheme);
}

export async function getTeamTheme(id: string): Promise<TeamTheme | null> {
  if (!isSupabaseConfigured()) return memory.find((theme) => theme.id === id) ?? null;
  const { data, error } = await getSupabaseAdmin().from('team_themes').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(missing(error.message));
  return data ? toTheme(data as Row) : null;
}

export async function createTeamTheme(spec: ThemeSpec, author: { id: string; name: string }): Promise<TeamTheme> {
  if (!isSupabaseConfigured()) {
    const theme: TeamTheme = { ...spec, id: randomUUID(), authorId: author.id, authorName: author.name, uses: 1, createdAt: new Date().toISOString() };
    memory.unshift(theme);
    return theme;
  }
  const { data, error } = await getSupabaseAdmin().from('team_themes').insert({ name: spec.name, accent: spec.accent, side: spec.side, background: spec.background, author_id: author.id, author_name: author.name, uses: 1 }).select('*').single();
  if (error) throw new Error(missing(error.message));
  return toTheme(data as Row);
}

export async function countThemesBy(authorId: string): Promise<number> {
  return (await listTeamThemes()).filter((theme) => theme.authorId === authorId).length;
}

export async function addThemeUse(theme: TeamTheme): Promise<void> {
  if (!isSupabaseConfigured()) { const item = memory.find((entry) => entry.id === theme.id); if (item) item.uses += 1; return; }
  const { error } = await getSupabaseAdmin().from('team_themes').update({ uses: theme.uses + 1 }).eq('id', theme.id);
  if (error) throw new Error(missing(error.message));
}

export async function deleteTeamTheme(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) { const index = memory.findIndex((theme) => theme.id === id); if (index >= 0) memory.splice(index, 1); return index >= 0; }
  const { data, error } = await getSupabaseAdmin().from('team_themes').delete().eq('id', id).select('id');
  if (error) throw new Error(missing(error.message));
  return Boolean(data?.length);
}
