import { classifySlaHours } from './igp.js';
import { toOperationalDate } from './timezone.js';
import type { Call, Supervisor, Technician, User } from './types.js';

// Lote 4 (equipe): status personalizado, mencoes nas observacoes e destaques do mes.

// ---------- (11) Status ----------
export type UserStatus = { text: string; emoji: string; until: string | null };
// Status vencido (until no passado) nao aparece.
export function activeStatus(status: Partial<UserStatus> | null | undefined, now = Date.now()): UserStatus | null {
  if (!status || (!status.text?.trim() && !status.emoji?.trim())) return null;
  if (status.until && Date.parse(status.until) <= now) return null;
  return { text: status.text?.trim() || '', emoji: status.emoji?.trim() || '', until: status.until || null };
}

// ---------- (12) Mencoes ----------
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
// "@Nome Completo" no texto (sem diferenca de acento/maiuscula). Nomes mais longos primeiro, para "@Ana Paula Souza"
// nao virar mencao da "Ana Paula". Quem escreveu nao e mencionado.
export function findMentions(text: string, users: Pick<User, 'id' | 'name' | 'active'>[], authorId?: string): string[] {
  const folded = fold(text);
  if (!folded.includes('@')) return [];
  const candidates = users.filter((user) => user.active && user.id !== authorId && user.name.trim().length >= 2).sort((a, b) => b.name.length - a.name.length);
  const found: string[] = [];
  let remaining = folded;
  for (const user of candidates) {
    const name = fold(user.name.trim());
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`@${escaped}(?![\\p{L}\\p{N}])`, 'gu');
    if (pattern.test(remaining)) {
      found.push(user.id);
      remaining = remaining.replace(pattern, ' ');
    }
  }
  return found;
}

// ---------- (13) Destaques do mes ----------
export type Highlight = { kind: 'most-finished' | 'best-on-time' | 'best-supervisor'; title: string; name: string; detail: string; userId?: string };
const MIN_FOR_PERCENT = 10;

export function monthHighlights(calls: Call[], technicians: Technician[], supervisors: Supervisor[], month: string): Highlight[] {
  const finished = calls.filter((call) => call.status === 'Finalizado' && call.executedAt && toOperationalDate(call.executedAt).startsWith(month));
  const onTime = (call: Call) => classifySlaHours((Date.parse(call.executedAt!) - Date.parse(call.openedAt)) / 3_600_000, call.type) === 'onTime';
  const group = (keyOf: (call: Call) => string | undefined) => {
    const map = new Map<string, { total: number; onTime: number }>();
    for (const call of finished) {
      const key = keyOf(call)?.trim();
      if (!key) continue;
      const entry = map.get(key) || { total: 0, onTime: 0 };
      entry.total += 1;
      if (onTime(call)) entry.onTime += 1;
      map.set(key, entry);
    }
    return [...map.entries()].map(([name, value]) => ({ name, ...value, percent: value.total ? (value.onTime / value.total) * 100 : 0 }));
  };
  const pct = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const highlights: Highlight[] = [];
  const techNames = new Set(technicians.filter((tech) => tech.teamRole === 'Tecnico').map((tech) => tech.name.trim()));
  const byTech = group((call) => call.technicianName).filter((row) => !techNames.size || techNames.has(row.name));
  const most = [...byTech].sort((a, b) => b.onTime - a.onTime || b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))[0];
  if (most?.onTime) highlights.push({ kind: 'most-finished', title: 'Mais finalizados no prazo', name: most.name, detail: `${most.onTime} de ${most.total} no prazo` });
  const bestTech = byTech.filter((row) => row.total >= MIN_FOR_PERCENT).sort((a, b) => b.percent - a.percent || b.total - a.total)[0];
  if (bestTech) highlights.push({ kind: 'best-on-time', title: 'Melhor % no prazo', name: bestTech.name, detail: `${pct(bestTech.percent)} de ${bestTech.total} chamados` });
  const bestSup = group((call) => call.supervisorName).filter((row) => row.total >= MIN_FOR_PERCENT).sort((a, b) => b.percent - a.percent || b.total - a.total)[0];
  if (bestSup) {
    const supervisor = supervisors.find((item) => item.name.trim() === bestSup.name);
    highlights.push({ kind: 'best-supervisor', title: 'Supervisor com melhor prazo', name: bestSup.name, detail: `${pct(bestSup.percent)} no prazo em ${bestSup.total} chamados`, userId: supervisor?.userId });
  }
  return highlights;
}
