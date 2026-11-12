import { slaLimits } from "../lib/sla";
export function getElapsedMinutes(openedAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000));
}

export function formatCallTimestamp(value?: string | null) {
  if (!value) return <span className="muted-cell">-</span>;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatElapsed(openedAt: string) {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

// Regra operacional: ate 6h = PRAZO; acima de 6h ate 9h = FORA DO PRAZO; acima de 9h = OUTLIER.
export const SLA_ON_TIME_MAX_MINUTES = 6 * 60;

export const SLA_OUTLIER_AFTER_MINUTES = 9 * 60;

export const SLA_LIMIT_LABEL = "Limite 06:00";

// Com o tipo do chamado usa o prazo dele (Links/NOC TX: 15 dias; lib/sla.ts).
export function getSlaState(elapsedMinutes: number, type?: string) {
  const limits = slaLimits(type);
  return elapsedMinutes > limits.outlierMinutes ? "outlier" : elapsedMinutes > limits.onTimeMinutes ? "late" : "on-time";
}

export function SlaCell({ openedAt, type }: { openedAt: string; type?: string }) {
  const state = getSlaState(getElapsedMinutes(openedAt), type);
  const label = state === "outlier" ? "Outlier" : state === "late" ? "Fora do prazo" : "No prazo";
  // No tema escuro as variaveis --sla-* (theme-dark-manual.css) clareiam as cores; no claro vale o fallback.
  const color = `var(--sla-${state}, ${state === "outlier" ? "#bd3f45" : state === "late" ? "#a86b00" : "#138a5e"})`;
  return <span className={`sla-cell ${state}`} data-prazo={`${label} - ${SLA_LIMIT_LABEL}`} style={{ color }}><strong style={{ color }}>{label}</strong><small style={{ color }}>{SLA_LIMIT_LABEL}</small></span>;
}

export function SlaDurationCell({ openedAt, type }: { openedAt: string; type?: string }) {
  const state = getSlaState(getElapsedMinutes(openedAt), type);
  return <span className={`sla-duration ${state}`}>{formatElapsed(openedAt)}</span>;
}

export function TimerCell({ lastObservationAt }: { lastObservationAt?: string }) {
  if (!lastObservationAt) return <span className="timer-cell empty">Sem observacao</span>;
  const state = getSlaState(getElapsedMinutes(lastObservationAt));
  return <span className={`timer-cell ${state}`}>{formatElapsed(lastObservationAt)}</span>;
}

export function formatWaiting(openedAt: string) {
  const minutes = Math.max(
    1,
    Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000),
  );
  return minutes > 59
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}min`
    : `${minutes}min`;
}

export function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
