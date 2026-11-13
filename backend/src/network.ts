import { extractAllSlotPons } from './olt-notice.js';

// Regras puras do mapa da rede: situacao do cliente, normalizacao de OLT/PON, localizacao e CTO mais proxima.
export type Situation = 'problema' | 'atencao' | 'ok' | 'sem';

export const CTO_HIGHLIGHT_METERS = 150;
export const RECENT_READING_MINUTES = 30;
const REPEATED_POINT_LIMIT = 10; // mesma coordenada em 10+ clientes = sem localizacao precisa
const SP_BOX = { minLat: -25, maxLat: -22, minLng: -48, maxLng: -44 };

export function situationOf(status: string | null | undefined): Situation {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return 'sem';
  if (value === 'ok') return 'ok';
  if (value === 'warning') return 'atencao';
  if (['critical', 'power_fail', 'loss_signal', 'down'].includes(value) || value.startsWith('massive')) return 'problema';
  return 'sem'; // desconhecido nunca vira "desconectado"
}

export function normalizeOlt(value: string): string {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').toUpperCase();
}

// '04/10' (slot/pon), '4/10' e '0/4/10' (frame/slot/pon) viram '0/4/10', sem zeros a esquerda.
export function normalizePonlink(value: string): string | null {
  const parts = String(value || '').split('/').map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const numbers = parts.map((part) => String(Number(part)));
  return (numbers.length === 2 ? ['0', ...numbers] : numbers).join('/');
}

export function ponsFromCall(olt: string, slotPonText: string): Array<{ olt: string; ponlink: string }> {
  const normalizedOlt = normalizeOlt(olt);
  const out: Array<{ olt: string; ponlink: string }> = [];
  if (!normalizedOlt) return out;
  for (const slotPon of extractAllSlotPons(slotPonText)) {
    const ponlink = normalizePonlink(slotPon);
    if (ponlink && !out.some((item) => item.ponlink === ponlink)) out.push({ olt: normalizedOlt, ponlink });
  }
  return out;
}

export function validLocation(lat: number | null, lng: number | null): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= SP_BOX.minLat && lat <= SP_BOX.maxLat && lng >= SP_BOX.minLng && lng <= SP_BOX.maxLng;
}

const pointKey = (lat: number, lng: number) => `${lat.toFixed(6)}:${lng.toFixed(6)}`;

export function markImprecise<T extends { lat: number | null; lng: number | null }>(clients: T[]): Array<T & { precise: boolean }> {
  const counts = new Map<string, number>();
  for (const item of clients) {
    if (!validLocation(item.lat, item.lng)) continue;
    const k = pointKey(item.lat as number, item.lng as number);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return clients.map((item) => ({
    ...item,
    precise: validLocation(item.lat, item.lng) && (counts.get(pointKey(item.lat as number, item.lng as number)) || 0) < REPEATED_POINT_LIMIT,
  }));
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestCto(point: { lat: number; lng: number }, ctos: Array<{ code: string | null; lat: number; lng: number }>): { code: string | null; meters: number } | null {
  let best: { code: string | null; meters: number } | null = null;
  for (const cto of ctos) {
    const meters = distanceMeters(point, cto);
    if (!best || meters < best.meters) best = { code: cto.code, meters };
  }
  return best ? { code: best.code, meters: Math.round(best.meters * 10) / 10 } : null;
}
