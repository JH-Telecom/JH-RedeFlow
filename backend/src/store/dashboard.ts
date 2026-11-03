import { countSupabasePendingActivations, countSupabaseUnassignedOpenCalls, isSupabaseConfigured, listSupabaseCalls } from "../integrations/supabase/client.js";
import { toOperationalDate } from "../timezone.js";
import type { Call, DashboardMetrics } from "../types.js";
import { type CallQuery, isCallInDateRange, listCalls } from "./calls.js";
import { activations, calls } from "./demo-data.js";

export async function countUnassignedOpenCalls(): Promise<number> {
  if (isSupabaseConfigured()) return await countSupabaseUnassignedOpenCalls();
  return [...calls.values()].filter((call) => !call.technicianId && !['Finalizado', 'Cancelado', 'Baixar'].includes(call.status)).length;
}

export async function countPendingActivations(): Promise<number> {
  if (isSupabaseConfigured()) return await countSupabasePendingActivations();
  return [...activations.values()].filter((activation) => activation.status === 'Pendente').length;
}

export async function listNotifications(includeOperational = true) {
  const notifications = [] as { id: string; type: 'warning' | 'info'; title: string; detail: string; href: string }[];
  if (includeOperational) {
    const unassigned = await countUnassignedOpenCalls();
    if (unassigned) notifications.push({ id: 'unassigned-calls', type: 'warning', title: `${unassigned} chamados sem tecnico`, detail: 'Existem chamados aguardando atribuicao.', href: '/chamados/abertos' });
  }
  const pending = await countPendingActivations();
  if (pending) notifications.push({ id: 'pending-activations', type: 'info', title: `${pending} acionamentos pendentes`, detail: 'Revise os dados recebidos para decidir.', href: '/acionamentos' });
  return notifications;
}

export function countByMap(counts: Map<string, number>) {
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function summarizeDashboardMetrics(calls: Call[], pendingActivations: number, today: string): DashboardMetrics {
  const statusCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const neighborhoodCounts = new Map<string, number>();
  const technicianCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();

  let receivedToday = 0;
  let open = 0;
  let unassigned = 0;
  let inProgress = 0;
  let finished = 0;
  let cancelled = 0;

  for (const call of calls) {
    if (toOperationalDate(call.openedAt) === today) receivedToday += 1;
    if (call.status === 'Aberto') open += 1;
    if (!call.technicianId && !['Finalizado', 'Cancelado'].includes(call.status)) unassigned += 1;
    if (['Atribuido', 'Deslocamento', 'Em campo'].includes(call.status)) inProgress += 1;
    if (call.status === 'Finalizado') finished += 1;
    if (call.status === 'Cancelado') cancelled += 1;

    statusCounts.set(call.status, (statusCounts.get(call.status) || 0) + 1);
    regionCounts.set(call.region, (regionCounts.get(call.region) || 0) + 1);
    if (call.bairro) neighborhoodCounts.set(call.bairro, (neighborhoodCounts.get(call.bairro) || 0) + 1);
    if (call.technicianName) technicianCounts.set(call.technicianName, (technicianCounts.get(call.technicianName) || 0) + 1);
    typeCounts.set(call.type, (typeCounts.get(call.type) || 0) + 1);
  }

  return {
    receivedToday,
    open,
    unassigned,
    inProgress,
    finished,
    cancelled,
    pendingActivations,
    byStatus: countByMap(statusCounts),
    byRegion: countByMap(regionCounts),
    byNeighborhood: countByMap(neighborhoodCounts),
    byTechnician: countByMap(technicianCounts),
    byType: countByMap(typeCounts),
  };
}

export async function getDashboardMetrics(query: CallQuery = {}): Promise<DashboardMetrics> {
  const today = toOperationalDate();
  const pendingActivations = await countPendingActivations();

  if (isSupabaseConfigured()) {
    const summaryCalls = await listSupabaseCalls(undefined, { from: query.from, to: query.to, supervisorId: query.supervisorId }, { summary: true });
    return summarizeDashboardMetrics(summaryCalls.filter((call) => isCallInDateRange(call, query)), pendingActivations, today);
  }

  if (query.from || query.to || query.supervisorId) {
    return summarizeDashboardMetrics(await listCalls(undefined, query), pendingActivations, today);
  }

  return summarizeDashboardMetrics([...calls.values()], pendingActivations, today);
}
