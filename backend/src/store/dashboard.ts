import { countSupabasePendingActivations, countSupabaseUnassignedOpenCalls, isSupabaseConfigured, listSupabaseCalls } from "../integrations/supabase/client.js";
import { classifySlaHours } from "../igp.js";
import { addDays, toOperationalDate } from "../timezone.js";
import type { Call, DashboardActiveCall, DashboardMetrics, SlaBreakdown } from "../types.js";
import { type CallQuery, isCallInDateRange, listCalls } from "./calls.js";
import { activations, calls } from "./demo-data.js";

export async function countUnassignedOpenCalls(): Promise<number> {
  if (isSupabaseConfigured()) return await countSupabaseUnassignedOpenCalls();
  return [...calls.values()].filter((call) => !call.technicianId && !['Finalizado', 'Cancelado', 'Baixar', 'GIGA+'].includes(call.status)).length;
}

export async function countPendingActivations(): Promise<number> {
  if (isSupabaseConfigured()) return await countSupabasePendingActivations();
  return [...activations.values()].filter((activation) => activation.status === 'Pendente').length;
}

export async function listNotifications(includeOperational = true) {
  const notifications = [] as { id: string; type: 'warning' | 'info'; title: string; detail: string; href: string; count: number }[];
  if (includeOperational) {
    const unassigned = await countUnassignedOpenCalls();
    if (unassigned) notifications.push({ id: 'unassigned-calls', type: 'warning', title: `${unassigned} chamados sem tecnico`, detail: 'Existem chamados aguardando atribuicao.', href: '/chamados/abertos', count: unassigned });
  }
  const pending = await countPendingActivations();
  if (pending) notifications.push({ id: 'pending-activations', type: 'info', title: `${pending} acionamentos pendentes`, detail: 'Revise os dados recebidos para decidir.', href: '/acionamentos', count: pending });
  return notifications;
}

export function countByMap(counts: Map<string, number>) {
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

const terminalStatuses = ['Finalizado', 'Cancelado', 'Baixar', 'GIGA+'];
const maxDailyBars = 31;

function emptySla(): SlaBreakdown {
  return { onTime: 0, late: 0, outlier: 0 };
}

// Indicadores da fila ativa, dos finalizados e da serie diaria. `scopeCalls` sao todos os chamados do escopo
// (sem filtro de periodo); `periodCalls` sao os do periodo pela data de referencia.
export function summarizeOperationalTrends(scopeCalls: Call[], periodCalls: Call[], query: CallQuery, today: string, now = Date.now()) {
  const activeCalls = scopeCalls.filter((call) => !terminalStatuses.includes(call.status));
  const activeSla = emptySla();
  const workload = new Map<string, number>();
  for (const call of activeCalls) {
    const openedAt = Date.parse(call.openedAt);
    if (Number.isFinite(openedAt)) activeSla[classifySlaHours((now - openedAt) / 3_600_000)] += 1;
    if (call.technicianName) workload.set(call.technicianName, (workload.get(call.technicianName) || 0) + 1);
  }
  const oldestActive: DashboardActiveCall[] = activeCalls
    .filter((call) => Number.isFinite(Date.parse(call.openedAt)))
    .sort((left, right) => Date.parse(left.openedAt) - Date.parse(right.openedAt))
    .slice(0, 8)
    .map((call) => ({ id: call.id, orderNumber: call.orderNumber, type: call.type, region: call.region, status: call.status, technicianName: call.technicianName, openedAt: call.openedAt }));

  const closedSla = { ...emptySla(), mttrHours: null as number | null };
  let repairHoursTotal = 0;
  let measured = 0;
  for (const call of periodCalls) {
    if (call.status !== 'Finalizado' || !call.executedAt) continue;
    const hours = (Date.parse(call.executedAt) - Date.parse(call.openedAt)) / 3_600_000;
    if (!Number.isFinite(hours) || hours < 0) continue;
    closedSla[classifySlaHours(hours)] += 1;
    repairHoursTotal += hours;
    measured += 1;
  }
  closedSla.mttrHours = measured ? repairHoursTotal / measured : null;

  const end = query.to || today;
  const rangeStart = query.from || addDays(end, -13);
  const start = rangeStart < addDays(end, -(maxDailyBars - 1)) ? addDays(end, -(maxDailyBars - 1)) : rangeStart;
  const daily = new Map<string, { date: string; opened: number; finished: number }>();
  for (let date = start; date <= end; date = addDays(date, 1)) daily.set(date, { date, opened: 0, finished: 0 });
  for (const call of scopeCalls) {
    const openedDay = daily.get(toOperationalDate(call.openedAt));
    if (openedDay) openedDay.opened += 1;
    if (call.status === 'Finalizado' && call.executedAt) {
      const finishedDay = daily.get(toOperationalDate(call.executedAt));
      if (finishedDay) finishedDay.finished += 1;
    }
  }

  const openedInPeriod = scopeCalls.filter((call) => {
    const openedDate = toOperationalDate(call.openedAt);
    return (!query.from || openedDate >= query.from) && (!query.to || openedDate <= query.to);
  }).length;

  return { activeTotal: activeCalls.length, activeUnassigned: activeCalls.filter((call) => !call.technicianId).length, activeSla, oldestActive, activeByTechnician: countByMap(workload), openedInPeriod, closedSla, daily: [...daily.values()] };
}

export function summarizeDashboardMetrics(calls: Call[], pendingActivations: number, today: string): Omit<DashboardMetrics, keyof ReturnType<typeof summarizeOperationalTrends>> {
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
    if (['Atribuido', 'Atrelado', 'Deslocamento', 'Em campo'].includes(call.status)) inProgress += 1;
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
  // Todos os chamados do escopo (colunas resumidas no Supabase); o periodo e aplicado em memoria
  // para que fila ativa e serie diaria nao dependam da data de referencia dos encerrados.
  const scopeCalls = isSupabaseConfigured()
    ? await listSupabaseCalls(undefined, { supervisorId: query.supervisorId }, { summary: true })
    : query.supervisorId ? await listCalls(undefined, { supervisorId: query.supervisorId }) : [...calls.values()];
  // GIGA+ e do outro escritorio: nao entra na Visao geral.
  const ourCalls = scopeCalls.filter((call) => call.status !== 'GIGA+');
  const periodCalls = query.from || query.to ? ourCalls.filter((call) => isCallInDateRange(call, query)) : ourCalls;
  return { ...summarizeDashboardMetrics(periodCalls, pendingActivations, today), ...summarizeOperationalTrends(ourCalls, periodCalls, query, today) };
}
