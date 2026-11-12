import { dutyStatusChanges, type DutyStatus } from '../duty-status.js';
import { createSupabaseSupervisor, createSupabaseTechnician, deleteSupabaseTechnician, getSupabaseAdmin, isSupabaseConfigured, listSupabaseSupervisors, listSupabaseTechnicians, updateSupabaseSupervisor, updateSupabaseTechnician } from "../integrations/supabase/client.js";
import type { Supervisor, Technician } from "../types.js";
import { ensureDemoData, now, supervisors, technicians } from "./demo-data.js";

export async function listSupervisors(): Promise<Supervisor[]> {
  ensureDemoData();
  if (isSupabaseConfigured()) {
    const supervisors = await listSupabaseSupervisors();
    const technicians = await listSupabaseTechnicians();
    return supervisors.map((supervisor) => ({ ...supervisor, technicianCount: technicians.filter((technician) => technician.supervisorId === supervisor.id).length }));
  }
  return [...supervisors.values()].map((supervisor) => ({ ...supervisor, technicianCount: [...technicians.values()].filter((technician) => technician.supervisorId === supervisor.id).length }));
}

export function isWithinTechnicianShift(shift: string) {
  const match = shift.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

export function resolveTechnicianActive(technician: Technician) {
  if (technician.activeOverride) return technician.active;
  if (!technician.active) return false;
  return isWithinTechnicianShift(technician.shift) ?? true;
}

export async function listTechnicians(): Promise<Technician[]> {
  ensureDemoData();
  if (isSupabaseConfigured()) return (await listSupabaseTechnicians()).map((technician) => ({ ...technician, active: resolveTechnicianActive(technician), employmentStatus: technician.employmentStatus ?? 'Trabalhando' }));
  return [...technicians.values()].map((technician) => ({ ...technician, active: resolveTechnicianActive(technician), employmentStatus: technician.employmentStatus ?? 'Trabalhando', supervisorName: technician.supervisorId ? supervisors.get(technician.supervisorId)?.name : undefined }));
}

export async function addTechnician(input: Omit<Technician, 'id' | 'supervisorName'>): Promise<Technician> {
  if (isSupabaseConfigured()) return await createSupabaseTechnician(input);
  const technician = { ...input, employmentStatus: input.employmentStatus ?? 'Trabalhando', id: `tech-${crypto.randomUUID()}` };
  technicians.set(technician.id, technician);
  return { ...technician, supervisorName: technician.supervisorId ? supervisors.get(technician.supervisorId)?.name : undefined };
}

export async function updateTechnician(id: string, input: { name?: string; registration?: string; region?: string; shift?: string; supervisorId?: string; currentStatus?: Technician['currentStatus']; active?: boolean; employmentStatus?: Technician['employmentStatus']; teamRole?: Technician['teamRole']; leadTechnicianId?: string | null; dutyStatus?: DutyStatus | null; statusNote?: string | null }): Promise<Technician | undefined> {
  ensureDemoData();
  // Status do dia: tambem acerta ativo/inativo e a situacao antiga (o resto do sistema ainda usa os dois).
  if (input.dutyStatus) {
    const before = (await listTechnicians()).find((technician) => technician.id === id);
    if (before) input = { ...input, ...dutyStatusChanges(input.dutyStatus, before.currentStatus) };
  }
  if (input.registration !== undefined) {
    const registration = input.registration.trim().toLocaleUpperCase();
    const duplicate = (await listTechnicians()).find((technician) => technician.id !== id && technician.registration.trim().toLocaleUpperCase() === registration);
    if (duplicate) throw new Error('Esta matricula ja esta cadastrada.');
  }
  if (isSupabaseConfigured()) return await updateSupabaseTechnician(id, input);
  const current = technicians.get(id);
  if (!current) return undefined;
  const nextActive = input.active !== undefined ? input.active : input.currentStatus === 'Indisponivel' ? false : current.active;
  const statusStamp = input.dutyStatus !== undefined || input.statusNote !== undefined ? { statusUpdatedAt: new Date().toISOString() } : {};
  const updated = { ...current, ...input, ...statusStamp, employmentStatus: input.employmentStatus ?? current.employmentStatus ?? 'Trabalhando', active: nextActive, activeOverride: input.active !== undefined || input.currentStatus !== undefined ? true : current.activeOverride };
  technicians.set(id, updated);
  return { ...updated, active: resolveTechnicianActive(updated), supervisorName: updated.supervisorId ? supervisors.get(updated.supervisorId)?.name : undefined };
}

export async function deleteTechnician(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) return await deleteSupabaseTechnician(id);
  if (!technicians.has(id)) return false;
  for (const technician of technicians.values()) if (technician.leadTechnicianId === id) technician.leadTechnicianId = undefined;
  technicians.delete(id);
  return true;
}

export async function addSupervisor(input: Omit<Supervisor, 'id' | 'technicianCount'>): Promise<Supervisor> {
  if (isSupabaseConfigured()) return await createSupabaseSupervisor(input);
  const supervisor = { ...input, id: `supervisor-${crypto.randomUUID()}`, technicianCount: 0 };
  supervisors.set(supervisor.id, supervisor);
  return supervisor;
}

export async function updateSupervisor(id: string, input: { userId?: string | null; name?: string; region?: string; active?: boolean }): Promise<Supervisor | undefined> {
  if (isSupabaseConfigured()) return await updateSupabaseSupervisor(id, input);
  const current = supervisors.get(id);
  if (!current) return undefined;
  const updated = { ...current, ...input, userId: input.userId === null ? undefined : input.userId ?? current.userId };
  supervisors.set(id, updated);
  return updated;
}

export async function deleteSupervisor(id: string): Promise<{ deleted: boolean; technicianCount: number }> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { count, error: countError } = await admin.from('technicians').select('id', { count: 'exact', head: true }).eq('supervisor_id', id).is('deleted_at', null);
    if (countError) throw new Error(countError.message);
    if (count) return { deleted: false, technicianCount: count };
    const { data, error } = await admin.from('supervisors').update({ active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null).select('id').maybeSingle();
    if (error) throw new Error(error.message);
    return { deleted: Boolean(data), technicianCount: 0 };
  }
  const supervisor = supervisors.get(id);
  if (!supervisor) return { deleted: false, technicianCount: 0 };
  const technicianCount = [...technicians.values()].filter((technician) => technician.supervisorId === id).length;
  if (technicianCount) return { deleted: false, technicianCount };
  supervisors.delete(id);
  return { deleted: true, technicianCount: 0 };
}

export async function getSupervisorIdForUser(userId: string): Promise<string | undefined> {
  ensureDemoData();
  if (isSupabaseConfigured()) return (await listSupabaseSupervisors()).find((item) => item.userId === userId)?.id;
  return [...supervisors.values()].find((item) => item.userId === userId)?.id;
}
