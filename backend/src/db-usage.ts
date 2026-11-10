// Controle do trafego do Supabase (egress). O plano gratuito da 5 GB por mes; o projeto antigo estourou (9,2 GB)
// e foi bloqueado. Toda resposta do Supabase passa por meteredFetch e e somada por dia e por destino
// (tabela, funcao ou login). A soma usa o tamanho sem compressao, entao e uma estimativa PARA MAIS (o painel
// do Supabase costuma mostrar menos). Perto do limite, o sistema entra sozinho em modo economia: os dados
// guardados em memoria passam a valer por mais tempo e o banco e consultado menos vezes.

export const DAY_MS = 86_400_000;
export type UsageMode = 'normal' | 'economia' | 'economia_forte';
export type DayUsage = { bytes: number; requests: number; targets: Record<string, { bytes: number; requests: number }> };
export type UsageState = { days: Record<string, DayUsage> };

const HEADER_OVERHEAD = 400; // cabecalhos HTTP de cada resposta, que tambem contam como trafego
const MAX_TARGETS_PER_DAY = 60;
const KEEP_DAYS = 35;

const spDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
export const usageDay = (at = new Date()) => spDate.format(at);

let state: UsageState = { days: {} };
let dirty = false;

export function limitBytes() {
  const gb = Number(process.env.SUPABASE_EGRESS_LIMIT_GB || 5);
  return (Number.isFinite(gb) && gb > 0 ? gb : 5) * 1024 ** 3;
}

// Destino legivel: /rest/v1/calls -> "calls", /rest/v1/rpc/x -> "rpc x", /auth/v1/token -> "login (auth)".
export function usageTarget(url: string) {
  let path = url;
  try { path = new URL(url).pathname; } catch { /* url relativa */ }
  const rest = path.match(/\/rest\/v1\/rpc\/([^/?]+)/);
  if (rest) return `rpc ${rest[1]}`;
  const table = path.match(/\/rest\/v1\/([^/?]+)/);
  if (table) return table[1];
  if (path.includes('/auth/v1/')) return 'login (auth)';
  if (path.includes('/storage/v1/')) return 'arquivos (storage)';
  return 'outros';
}

export function addUsage(target: string, bytes: number, at = new Date()) {
  const day = usageDay(at);
  const entry = (state.days[day] ||= { bytes: 0, requests: 0, targets: {} });
  const total = bytes + HEADER_OVERHEAD;
  entry.bytes += total;
  entry.requests += 1;
  const slot = entry.targets[target] || (Object.keys(entry.targets).length < MAX_TARGETS_PER_DAY ? (entry.targets[target] = { bytes: 0, requests: 0 }) : (entry.targets.outros ||= { bytes: 0, requests: 0 }));
  slot.bytes += total;
  slot.requests += 1;
  dirty = true;
}

// fetch usado pelos clientes do Supabase: mede o tamanho de cada resposta sem atrasar quem pediu.
export const meteredFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const target = usageTarget(url);
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length >= 0 && response.headers.get('content-length') !== null) addUsage(target, length);
  else response.clone().arrayBuffer().then((body) => addUsage(target, body.byteLength), () => addUsage(target, 0));
  return response;
};

function sortedDays(now = new Date()) {
  const days: string[] = [];
  for (let i = 29; i >= 0; i -= 1) days.push(usageDay(new Date(now.getTime() - i * DAY_MS)));
  return days;
}

export function last30DaysBytes(now = new Date()) {
  return sortedDays(now).reduce((sum, day) => sum + (state.days[day]?.bytes || 0), 0);
}

// Modo pelo total dos ultimos 30 dias (janela parecida com o ciclo do Supabase).
export function modeFor(bytes: number, limit = limitBytes()): UsageMode {
  const ratio = bytes / limit;
  if (ratio >= 0.85) return 'economia_forte';
  if (ratio >= 0.6) return 'economia';
  return 'normal';
}
export function currentMode(now = new Date()): UsageMode {
  return modeFor(last30DaysBytes(now));
}

// Quanto tempo os dados em memoria valem, conforme o modo.
export function scaled(baseMs: number, mode = currentMode()) {
  return mode === 'economia_forte' ? baseMs * 10 : mode === 'economia' ? baseMs * 3 : baseMs;
}

export function usageReport(now = new Date()) {
  const days = sortedDays(now);
  const total = last30DaysBytes(now);
  const today = state.days[usageDay(now)] || { bytes: 0, requests: 0, targets: {} };
  // Media dos ultimos 7 dias com dados: quanto deve gastar em 30 dias neste ritmo.
  const recent = days.slice(-7).map((day) => state.days[day]?.bytes || 0);
  const tracked = days.filter((day) => state.days[day]).length;
  const dailyAverage = recent.reduce((a, b) => a + b, 0) / Math.max(1, Math.min(7, tracked));
  const targets: Record<string, { bytes: number; requests: number }> = {};
  for (const day of days) for (const [name, value] of Object.entries(state.days[day]?.targets || {})) {
    const slot = (targets[name] ||= { bytes: 0, requests: 0 });
    slot.bytes += value.bytes;
    slot.requests += value.requests;
  }
  return {
    limitBytes: limitBytes(),
    last30DaysBytes: total,
    percent: Math.round((total / limitBytes()) * 1000) / 10,
    projected30DaysBytes: Math.round(dailyAverage * 30),
    mode: modeFor(total),
    trackedDays: tracked,
    today: { bytes: today.bytes, requests: today.requests },
    daily: days.map((day) => ({ day, bytes: state.days[day]?.bytes || 0, requests: state.days[day]?.requests || 0 })),
    topTargets: Object.entries(targets).map(([name, value]) => ({ name, ...value })).sort((a, b) => b.bytes - a.bytes).slice(0, 12),
  };
}

// Persistencia (feita por db-usage-job): estado completo, so dias recentes.
export function exportUsage(now = new Date()): UsageState {
  const keep = new Set<string>();
  for (let i = 0; i < KEEP_DAYS; i += 1) keep.add(usageDay(new Date(now.getTime() - i * DAY_MS)));
  return { days: Object.fromEntries(Object.entries(state.days).filter(([day]) => keep.has(day))) };
}
// Ao ligar: junta o que estava salvo com o que ja foi medido desde a partida (fica o maior de cada dia).
export function importUsage(saved: UsageState | null | undefined) {
  for (const [day, value] of Object.entries(saved?.days || {})) {
    const current = state.days[day];
    if (!current) { state.days[day] = value; continue; }
    state.days[day] = { bytes: current.bytes + value.bytes, requests: current.requests + value.requests, targets: { ...value.targets } };
    for (const [name, slot] of Object.entries(current.targets)) {
      const merged = (state.days[day].targets[name] ||= { bytes: 0, requests: 0 });
      merged.bytes += slot.bytes;
      merged.requests += slot.requests;
    }
  }
}
export function takeDirty() { const was = dirty; dirty = false; return was; }

// So para os testes.
export function resetUsageForTests() { state = { days: {} }; dirty = false; }
