const operationalDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

// Data AAAA-MM-DD no fuso operacional (America/Sao_Paulo), independente do fuso do navegador.
export function toOperationalDate(value: string | number | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return typeof value === "string" ? value.slice(0, 10) : "";
  return operationalDateFormatter.format(date);
}
