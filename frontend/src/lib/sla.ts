// Prazo por tipo de chamado (igual ao backend, backend/src/sla.ts). Regra JH: ate 6h no prazo, acima de 6h fora,
// acima de 9h outlier. Links (NOC TX): 15 dias da abertura, sem faixa de outlier separada.
export const LINK_SLA_DAYS = 15;
const norm = (value: string | undefined) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
export const isLinkCall = (type: string | undefined) => /NOC\s*TX/.test(norm(type));

export type SlaLimits = { onTimeMinutes: number; outlierMinutes: number; soonMinutes: number; label: string };
const STANDARD: SlaLimits = { onTimeMinutes: 6 * 60, outlierMinutes: 9 * 60, soonMinutes: 120, label: "6h" };
const LINK: SlaLimits = { onTimeMinutes: LINK_SLA_DAYS * 24 * 60, outlierMinutes: LINK_SLA_DAYS * 24 * 60, soonMinutes: 24 * 60, label: `${LINK_SLA_DAYS} dias` };
export const slaLimits = (type?: string): SlaLimits => (isLinkCall(type) ? LINK : STANDARD);
