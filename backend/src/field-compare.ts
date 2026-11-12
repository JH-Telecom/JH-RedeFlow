// Campo do chamado mudou de verdade? Datas comparadas pelo instante: "2026-11-11T18:42:00+00:00" e
// "2026-11-11T15:42:00-03:00" sao o mesmo horario (antes viravam um log "Data Fim alterada" a cada coleta do OFS).
const DATE_FIELDS = new Set(['executedAt', 'openedAt', 'eventAt', 'assignedAt']);
export function sameFieldValue(field: string, left: unknown, right: unknown) {
  const a = left ?? '';
  const b = right ?? '';
  if (DATE_FIELDS.has(field) && a !== '' && b !== '') {
    const at = Date.parse(String(a));
    const bt = Date.parse(String(b));
    if (Number.isFinite(at) && Number.isFinite(bt)) return at === bt;
  }
  return String(a) === String(b);
}
