import { classifySlaHours } from './igp.js';
import type { Call, Technician } from './types.js';

// Lote B: sugestao de tecnico (1), risco de estourar o prazo (2) e incidentes em massa por OLT (4).

const ACTIVE = new Set(['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo']);
const HISTORY_DAYS = 90;
const norm = (value?: string) => (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
const hoursOf = (call: Call) => (Date.parse(call.executedAt!) - Date.parse(call.openedAt)) / 3_600_000;
function recentFinished(calls: Call[], now: number) {
  const since = now - HISTORY_DAYS * 86_400_000;
  return calls.filter((call) => call.status === 'Finalizado' && call.executedAt && Date.parse(call.executedAt) >= since && Number.isFinite(hoursOf(call)) && hoursOf(call) >= 0);
}

// ---------- (1) Sugestao de tecnico ----------
export type TechnicianSuggestion = { technicianId: string; name: string; score: number; reasons: string[]; active: number };

export function suggestTechnicians(call: Call, technicians: Technician[], calls: Call[], now = Date.now(), limit = 3): TechnicianSuggestion[] {
  const history = recentFinished(calls, now);
  const region = norm(call.region);
  const bairro = norm(call.bairro);
  const olt = norm(call.olt);
  const working = technicians.filter((tech) => tech.teamRole === 'Tecnico' && tech.active && tech.employmentStatus !== 'Demitido');
  return working.map((tech) => {
    const mine = history.filter((item) => item.technicianId === tech.id);
    const active = calls.filter((item) => item.technicianId === tech.id && ACTIVE.has(item.status) && item.id !== call.id).length;
    const inRegion = region ? mine.filter((item) => norm(item.region) === region).length : 0;
    const inBairro = bairro ? mine.filter((item) => norm(item.bairro) === bairro).length : 0;
    const inOlt = olt ? mine.filter((item) => norm(item.olt) === olt).length : 0;
    const onTime = mine.filter((item) => classifySlaHours(hoursOf(item)) === 'onTime').length;
    const onTimePct = mine.length >= 5 ? (onTime / mine.length) * 100 : null;
    const reasons: string[] = [];
    let score = active === 0 ? 3 : active === 1 ? 1.5 : active === 2 ? 0 : -1.5 * (active - 2);
    reasons.push(active === 0 ? 'Livre agora' : `${active} chamado(s) ativo(s)`);
    if (inRegion) { score += Math.min(2, Math.log2(1 + inRegion) / 2); reasons.push(`${inRegion} finalizado(s) em ${call.region} (90 dias)`); }
    if (inBairro) { score += Math.min(1, inBairro / 3); reasons.push(`já atendeu ${call.bairro}`); }
    if (inOlt) { score += 1.5; reasons.push(`já atendeu a OLT ${call.olt}`); }
    if (onTimePct !== null) { score += Math.max(-1, Math.min(2, (onTimePct - 70) / 15)); reasons.push(`${Math.round(onTimePct)}% no prazo`); }
    return { technicianId: tech.id, name: tech.name, score: Math.round(score * 100) / 100, reasons, active };
  }).sort((a, b) => b.score - a.score || a.active - b.active || a.name.localeCompare(b.name, 'pt-BR')).slice(0, limit);
}

// ---------- (2) Risco de estourar o prazo ----------
// Modelo simples a partir dos finalizados dos ultimos 90 dias: taxa de "fora do prazo" (>6h) geral, ajustada pela
// regiao, tipo, faixa de horario da abertura e tecnico (com suavizacao para grupos pequenos). Depois, quanto mais
// tempo o chamado ja esta aberto, maior o risco. Sem historico suficiente (menos de 30), nao estima.
type Rates = Map<string, { late: number; total: number }>;
export type RiskModel = { global: number; samples: number; region: Rates; type: Rates; hour: Rates; technician: Rates };
const spHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' });
const hourBucket = (iso: string) => { const hour = Number(spHour.format(new Date(iso))); return hour < 6 ? 'madrugada' : hour < 12 ? 'manha' : hour < 18 ? 'tarde' : 'noite'; };
const SMOOTHING = 10;

export function buildRiskModel(calls: Call[], now = Date.now()): RiskModel {
  const history = recentFinished(calls, now);
  const model: RiskModel = { global: 0, samples: history.length, region: new Map(), type: new Map(), hour: new Map(), technician: new Map() };
  const bump = (rates: Rates, key: string, late: boolean) => { if (!key) return; const entry = rates.get(key) || { late: 0, total: 0 }; entry.total += 1; if (late) entry.late += 1; rates.set(key, entry); };
  let late = 0;
  for (const call of history) {
    const isLate = hoursOf(call) > 6;
    if (isLate) late += 1;
    bump(model.region, norm(call.region), isLate);
    bump(model.type, norm(call.type), isLate);
    bump(model.hour, hourBucket(call.openedAt), isLate);
    bump(model.technician, call.technicianId || '', isLate);
  }
  model.global = history.length ? late / history.length : 0;
  return model;
}

const logit = (p: number) => Math.log(p / (1 - p));
const clampP = (p: number) => Math.min(0.97, Math.max(0.03, p));
export type CallRisk = { level: 'baixo' | 'medio' | 'alto'; percent: number; reasons: string[] };

export function callRisk(call: Call, model: RiskModel, now = Date.now()): CallRisk | null {
  if (!ACTIVE.has(call.status) || model.samples < 30) return null;
  const elapsed = (now - Date.parse(call.openedAt)) / 60_000;
  if (!Number.isFinite(elapsed) || elapsed >= 360) return null; // ja estourou: nao e mais risco
  const base = clampP(model.global);
  let score = logit(base);
  const reasons: string[] = [];
  const factor = (rates: Rates, key: string, label: string) => {
    const entry = rates.get(key);
    if (!entry || !key) return;
    const rate = clampP((entry.late + SMOOTHING * base) / (entry.total + SMOOTHING));
    const delta = logit(rate) - logit(base);
    score += delta;
    if (delta > 0.35) reasons.push(`${label}: ${Math.round(rate * 100)}% fora do prazo`);
  };
  factor(model.region, norm(call.region), call.region || 'Região');
  factor(model.type, norm(call.type), call.type || 'Tipo');
  factor(model.hour, hourBucket(call.openedAt), `Aberto de ${hourBucket(call.openedAt)}`);
  if (call.technicianId) factor(model.technician, call.technicianId, call.technicianName || 'Técnico');
  let p = 1 / (1 + Math.exp(-score));
  // Tempo ja corrido: com 4h sem fechar, boa parte do prazo foi embora.
  const used = elapsed / 360;
  p = p + (1 - p) * used * used * 0.8;
  if (!call.technicianId && elapsed > 180) { p = Math.max(p, 0.6); reasons.push('Sem técnico há mais de 3h'); }
  if (used > 0.5) reasons.push(`${Math.floor(elapsed / 60)}h${String(Math.round(elapsed % 60)).padStart(2, '0')} já corridas`);
  const percent = Math.round(p * 100);
  return { level: percent >= 50 ? 'alto' : percent >= 25 ? 'medio' : 'baixo', percent, reasons };
}

// ---------- (4) Incidentes em massa por OLT ----------
export type Incident = { key: string; olt: string; region: string; slotPons: string[]; firstAt: string; lastAt: string; calls: Pick<Call, 'id' | 'orderNumber' | 'status' | 'technicianId' | 'technicianName' | 'openedAt' | 'slotPon' | 'bairro'>[] };
const INCIDENT_MIN = 3;
const INCIDENT_WINDOW_MS = 3 * 3_600_000;

// 3 ou mais chamados ativos na mesma OLT abertos com ate 3h entre um e outro: provavel incidente em massa.
export function massIncidents(calls: Call[]): Incident[] {
  const byOlt = new Map<string, Call[]>();
  for (const call of calls) {
    if (!ACTIVE.has(call.status)) continue;
    const olt = norm(call.olt);
    if (!olt || !Number.isFinite(Date.parse(call.openedAt))) continue;
    byOlt.set(olt, [...(byOlt.get(olt) || []), call]);
  }
  const incidents: Incident[] = [];
  for (const [olt, list] of byOlt) {
    const sorted = [...list].sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));
    let group: Call[] = [];
    const flush = () => {
      if (group.length >= INCIDENT_MIN) incidents.push({
        key: `${olt}|${group[0].openedAt}`, olt: group[0].olt, region: group[0].region,
        slotPons: [...new Set(group.map((call) => call.slotPon).filter(Boolean))],
        firstAt: group[0].openedAt, lastAt: group[group.length - 1].openedAt,
        calls: group.map(({ id, orderNumber, status, technicianId, technicianName, openedAt, slotPon, bairro }) => ({ id, orderNumber, status, technicianId, technicianName, openedAt, slotPon, bairro })),
      });
      group = [];
    };
    for (const call of sorted) {
      if (group.length && Date.parse(call.openedAt) - Date.parse(group[group.length - 1].openedAt) > INCIDENT_WINDOW_MS) flush();
      group.push(call);
    }
    flush();
  }
  return incidents.sort((a, b) => b.calls.length - a.calls.length || Date.parse(b.lastAt) - Date.parse(a.lastAt));
}
