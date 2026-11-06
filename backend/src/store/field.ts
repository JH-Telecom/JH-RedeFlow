import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '../integrations/supabase/client.js';
import type { ChecklistTemplate } from '../field.js';

// Lote E: vinculo tecnico <-> usuario (tabela technician_users) e modelos de checklist (checklist_templates).
// Tabelas separadas: antes da migracao, as leituras devolvem vazio e nada do resto quebra.

const missingTable = (message: string) => /technician_users|checklist_templates|does not exist|schema cache/i.test(message);
const demoLinks = new Map<string, string>(); // technicianId -> userId
let demoTemplates: ChecklistTemplate[] = [];

export async function listTechnicianLinks(): Promise<Record<string, string>> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('technician_users').select('technician_id, user_id');
    if (error) { if (missingTable(error.message)) return {}; throw new Error(error.message); }
    return Object.fromEntries((data || []).map((row) => [row.technician_id, row.user_id]));
  }
  return Object.fromEntries(demoLinks);
}

export async function technicianIdForUser(userId: string): Promise<string | null> {
  const links = await listTechnicianLinks();
  return Object.entries(links).find(([, user]) => user === userId)?.[0] ?? null;
}

// Um usuario so pode estar ligado a um tecnico (o vinculo anterior do usuario e desfeito).
export async function setTechnicianUser(technicianId: string, userId: string | null): Promise<void> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { error: clearError } = await admin.from('technician_users').delete().eq('technician_id', technicianId);
    if (clearError) throw new Error(missingTable(clearError.message) ? 'Falta aplicar a migração 202611060004_field_and_checklists no banco.' : clearError.message);
    if (!userId) return;
    const { error: userError } = await admin.from('technician_users').delete().eq('user_id', userId);
    if (userError) throw new Error(userError.message);
    const { error } = await admin.from('technician_users').insert({ technician_id: technicianId, user_id: userId });
    if (error) throw new Error(error.message);
    return;
  }
  demoLinks.delete(technicianId);
  if (!userId) return;
  for (const [tech, user] of demoLinks) if (user === userId) demoLinks.delete(tech);
  demoLinks.set(technicianId, userId);
}

export async function listChecklistTemplates(): Promise<ChecklistTemplate[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('checklist_templates').select('id, name, call_types, items, active').order('name');
    if (error) { if (missingTable(error.message)) return []; throw new Error(error.message); }
    return (data || []).map((row) => ({ id: row.id, name: row.name, callTypes: row.call_types || [], items: Array.isArray(row.items) ? row.items : [], active: row.active }));
  }
  return demoTemplates.map((template) => ({ ...template }));
}

// Substitui a lista inteira (a tela de Configuracoes salva todos de uma vez).
export async function saveChecklistTemplates(templates: (Omit<ChecklistTemplate, 'id'> & { id?: string })[]): Promise<ChecklistTemplate[]> {
  const rows = templates.map((template) => ({ ...template, id: template.id && /^[0-9a-f-]{36}$/i.test(template.id) ? template.id : randomUUID() }));
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const keep = rows.map((row) => row.id);
    const del = keep.length ? admin.from('checklist_templates').delete().not('id', 'in', `(${keep.join(',')})`) : admin.from('checklist_templates').delete().not('id', 'is', null);
    const { error: deleteError } = await del;
    if (deleteError) throw new Error(missingTable(deleteError.message) ? 'Falta aplicar a migração 202611060004_field_and_checklists no banco.' : deleteError.message);
    if (rows.length) {
      const { error } = await admin.from('checklist_templates').upsert(rows.map((row) => ({ id: row.id, name: row.name, call_types: row.callTypes, items: row.items, active: row.active, updated_at: new Date().toISOString() })));
      if (error) throw new Error(error.message);
    }
    return await listChecklistTemplates();
  }
  demoTemplates = rows.map((row) => ({ id: row.id, name: row.name, callTypes: row.callTypes, items: row.items, active: row.active }));
  return listChecklistTemplates();
}
