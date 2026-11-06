import { isOfsConcluded, looksLikeOfsCode, orderDigits } from './imports/ofs-closing.js';
import type { Call } from './types.js';

// Saude da integracao com o OFS (aba Integracao OFS): fila dos chamados concluidos no OFS que nao finalizaram aqui,
// com o motivo, e o semaforo de cada parte da coleta (export, fechamentos, clusters, erros).

const ACTIVE = new Set(['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo']);

export type StuckReason = 'sem-tecnico' | 'sem-data-fim' | 'sem-fechamento' | 'fechamento-codigo' | 'ordem-duplicada' | 'pronto';
export const STUCK_REASON_LABEL: Record<StuckReason, string> = {
  'sem-tecnico': 'Sem técnico',
  'sem-data-fim': 'Sem Data Fim do OFS',
  'sem-fechamento': 'Fechamento ainda não lido',
  'fechamento-codigo': 'Fechamento lido como código',
  'ordem-duplicada': 'Ordem em mais de um chamado',
  'pronto': 'Pronto: finaliza no próximo ciclo',
};

export type StuckCall = Pick<Call, 'id' | 'orderNumber' | 'status' | 'ofsStatus' | 'technicianName' | 'openedAt' | 'executedAt' | 'region'> & { reasons: StuckReason[]; waitingMinutes: number | null };

// Concluido no OFS e ainda ativo aqui. Cada um vem com o que falta para o RedeFlow finalizar sozinho
// (mesmas regras de callsReadyToFinish). Mais antigos primeiro (pela Data Fim, ou pela abertura).
export function stuckOfsCalls(calls: Call[], now = Date.now()): StuckCall[] {
  const activeByOrder = new Map<string, number>();
  for (const call of calls) {
    if (call.status === 'Cancelado') continue;
    const order = orderDigits(call.orderNumber);
    if (order.length >= 6) activeByOrder.set(order, (activeByOrder.get(order) || 0) + 1);
  }
  return calls
    .filter((call) => ACTIVE.has(call.status) && isOfsConcluded(call.ofsStatus))
    .map((call) => {
      const reasons: StuckReason[] = [];
      const order = orderDigits(call.orderNumber);
      if (order.length >= 6 && (activeByOrder.get(order) || 0) > 1) reasons.push('ordem-duplicada');
      if (!call.technicianId) reasons.push('sem-tecnico');
      if (!call.executedAt) reasons.push('sem-data-fim');
      const hasClosing = Boolean(call.closingReason?.trim() || call.closingSubreason?.trim());
      if (!hasClosing) reasons.push('sem-fechamento');
      else if (looksLikeOfsCode(call.closingReason) || looksLikeOfsCode(call.closingSubreason)) reasons.push('fechamento-codigo');
      if (!reasons.length) reasons.push('pronto');
      const since = Date.parse(call.executedAt || call.openedAt);
      return {
        id: call.id, orderNumber: call.orderNumber, status: call.status, ofsStatus: call.ofsStatus, technicianName: call.technicianName,
        openedAt: call.openedAt, executedAt: call.executedAt, region: call.region, reasons,
        waitingMinutes: Number.isFinite(since) ? Math.max(0, Math.round((now - since) / 60_000)) : null,
      };
    })
    .sort((left, right) => (right.waitingMinutes ?? -1) - (left.waitingMinutes ?? -1));
}

export type IntegrationEventKind = 'export' | 'cluster' | 'closing' | 'extension' | 'sla_alert' | 'daily_report' | 'integration_alert' | 'escalation';
export type IntegrationEvent = { id: string; kind: IntegrationEventKind; ok: boolean; summary: string; details: Record<string, unknown>; createdAt: string };
export type HealthStatus = 'ok' | 'warn' | 'critical' | 'unknown';
export type HealthCheck = { key: string; label: string; status: HealthStatus; lastAt: string | null; detail: string };

const minutesSince = (iso: string | null | undefined, now: number) => (iso ? (now - Date.parse(iso)) / 60_000 : Infinity);
const ago = (minutes: number) => (minutes < 1 ? 'agora' : minutes < 60 ? `há ${Math.round(minutes)} min` : minutes < 1440 ? `há ${Math.round(minutes / 60)} h` : `há ${Math.round(minutes / 1440)} dia(s)`);

function freshness(key: string, label: string, events: IntegrationEvent[], kinds: IntegrationEventKind[], warnAfter: number, criticalAfter: number, now: number, what: string): HealthCheck {
  const ofKind = events.filter((event) => kinds.includes(event.kind) && event.details?.stage !== 'alert');
  const lastOk = ofKind.find((event) => event.ok);
  const last = ofKind[0];
  if (!last) return { key, label, status: 'unknown', lastAt: null, detail: `Nenhum ${what} registrado ainda.` };
  const age = minutesSince(lastOk?.createdAt, now);
  let status: HealthStatus = age <= warnAfter ? 'ok' : age <= criticalAfter ? 'warn' : 'critical';
  // Ciclo certo, mas com ordens que nao foram lidas: Atencao.
  if (status === 'ok' && last.ok && Number(last.details?.orderErrors) > 0) status = 'warn';
  const lastText = lastOk ? `Último ${what} certo ${ago(age)}: ${lastOk.summary}` : `Nenhum ${what} certo recente.`;
  const failText = !last.ok ? ` Última tentativa falhou ${ago(minutesSince(last.createdAt, now))}: ${last.summary}` : '';
  return { key, label, status: !last.ok && status === 'ok' ? 'warn' : status, lastAt: lastOk?.createdAt ?? null, detail: lastText + failText };
}

// Eventos mais recentes primeiro. Coleta automatica roda de hora em hora (export e fechamentos) e os clusters a cada ciclo.
export function healthChecks(events: IntegrationEvent[], stuck: StuckCall[], now = Date.now()): HealthCheck[] {
  const sorted = [...events].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const recentFailures = sorted.filter((event) => !event.ok && ['export', 'cluster', 'closing', 'extension'].includes(event.kind) && minutesSince(event.createdAt, now) <= 360);
  const longStuck = stuck.filter((call) => !call.reasons.includes('pronto') && (call.waitingMinutes ?? 0) >= 120);
  return [
    freshness('export', 'Export do OFS (painel e Status OFS)', sorted, ['export'], 90, 180, now, 'envio'),
    freshness('closing', 'Leitura de fechamentos', sorted, ['closing'], 90, 180, now, 'ciclo'),
    freshness('cluster', 'Clusters', sorted, ['cluster'], 180, 720, now, 'envio de cluster'),
    {
      key: 'errors', label: 'Falhas nas últimas 6 h',
      status: recentFailures.length === 0 ? 'ok' : recentFailures.length <= 3 ? 'warn' : 'critical',
      lastAt: null,
      detail: recentFailures.length ? `${recentFailures.length} falha(s). Última: ${recentFailures[0].summary}` : 'Nenhuma falha registrada.',
    },
    {
      key: 'stuck', label: 'Concluídos no OFS e abertos aqui',
      status: longStuck.length === 0 ? 'ok' : longStuck.length <= 10 ? 'warn' : 'critical',
      lastAt: null,
      detail: stuck.length ? `${stuck.length} chamado(s) na fila; ${longStuck.length} há mais de 2 h esperando algo além do próximo ciclo.` : 'Nenhum chamado parado.',
    },
  ];
}
