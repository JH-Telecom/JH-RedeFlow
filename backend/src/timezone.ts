export const OPERATIONAL_TIME_ZONE = 'America/Sao_Paulo';

const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: OPERATIONAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const partsFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: OPERATIONAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

// Data AAAA-MM-DD do instante no fuso operacional (um chamado aberto as 22h de Sao Paulo pertence a esse dia, nao ao dia seguinte em UTC).
export function toOperationalDate(value: string | number | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return typeof value === 'string' ? value.slice(0, 10) : '';
  return dateFormatter.format(date);
}

function timeZoneOffsetMs(instant: number) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - instant;
}

// Instante ISO (UTC) da meia-noite de uma data AAAA-MM-DD no fuso operacional.
export function operationalDayStartIso(date: string): string {
  const guess = Date.parse(`${date}T00:00:00.000Z`);
  return new Date(guess - timeZoneOffsetMs(guess)).toISOString();
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
