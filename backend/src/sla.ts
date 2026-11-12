// Prazo por tipo de chamado (12/11/2026). Regra JH: ate 6h no prazo, acima de 6h fora do prazo, acima de 9h outlier.
// Links (NOC TX) tem outro prazo: 15 dias da abertura (sem faixa de outlier separada: passou de 15 dias, esta fora).
// Por isso NOC TX tambem nao entra no IGP de redes.
export const LINK_SLA_DAYS = 15;
const norm = (value: string | undefined) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export const isLinkCall = (type: string | undefined) => /NOC\s*TX/.test(norm(type));

export type SlaLimits = { onTimeHours: number; outlierHours: number; soonMinutes: number; label: string };
const STANDARD: SlaLimits = { onTimeHours: 6, outlierHours: 9, soonMinutes: 120, label: '6h' };
const LINK: SlaLimits = { onTimeHours: LINK_SLA_DAYS * 24, outlierHours: LINK_SLA_DAYS * 24, soonMinutes: 24 * 60, label: `${LINK_SLA_DAYS} dias` };
export function slaLimits(type?: string): SlaLimits {
  return isLinkCall(type) ? LINK : STANDARD;
}
