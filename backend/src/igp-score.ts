import type { IgpIndicatorsRaw, Ratio } from './giga-workbook.js';

// Pontuacao do IGP ACESSO (12/11/2026), com as regras da aba "IGP ACESSO" da Giga ("a partir de 01/11/2026").
// Cada indicador (ou grupo) pontua o peso 100% se bate a meta 100%, o peso minimo se bate a meta minima, senao 0.
// Condicoes dos grupos (premissas gerais da Giga):
// - Eficiencia: cada eficiencia (Altas, ME) precisa >= 75%; o resultado e a media das duas.
// - Capex (resolutividade na minima agenda de Altas e ME): cada uma >= 70%; resultado = media.
// - Opex (resolutividade na minima agenda de Reparo): so pontua com o outlier de reparo (48h) abaixo de 6%.
// - Qualidade Capex (IFI e IFIME): cada um <= 5%; resultado = media.
// - Redes: "o realizado do grupo deve ser >= 75%". A planilha nao diz como medir esse realizado, entao a condicao
//   aparece na tela mas so trava a pontuacao com applyRedesGate ligado (ver regras).
// Acelerador: Churn soma pontos por fora. Faixa e bonificacao pela regua (A..Z) sobre o total.

export type Direction = 'lower' | 'higher';
export type IndicatorKey = 'outlier' | 'prazo' | 'mttr' | 'eficiencia' | 'capexAgenda' | 'reparoAgenda' | 'qualidadeCapex' | 'irr' | 'irt' | 'visita' | 'churn';
export type IndicatorRule = { key: IndicatorKey; label: string; group: string; weight: number; minWeight: number; target: number; minimum: number; direction: Direction; unit: 'pct' | 'h'; floor?: number | null; floorLabel?: string };
export type Band = { band: string; minPoints: number; bonus: number };
export type IgpRules = { indicators: IndicatorRule[]; bands: Band[]; outlierReparoMax: number; redesGate: number; applyRedesGate: boolean };

export const DEFAULT_IGP_RULES: IgpRules = {
  indicators: [
    { key: 'outlier', label: 'Outlier', group: 'Redes', weight: 5, minWeight: 4, target: 0.049, minimum: 0.052, direction: 'lower', unit: 'pct' },
    { key: 'prazo', label: 'Prazo', group: 'Redes', weight: 10, minWeight: 8, target: 0.89, minimum: 0.85, direction: 'higher', unit: 'pct' },
    { key: 'mttr', label: 'MTTR', group: 'Redes', weight: 15, minWeight: 12, target: 5, minimum: 6, direction: 'lower', unit: 'h' },
    { key: 'eficiencia', label: 'Eficiência (Altas e ME)', group: 'Eficiência', weight: 10, minWeight: 8, target: 0.85, minimum: 0.81, direction: 'higher', unit: 'pct', floor: 0.75, floorLabel: 'cada eficiência ≥ 75%' },
    { key: 'capexAgenda', label: 'Altas e ME na mínima agenda', group: 'Capex', weight: 10, minWeight: 8, target: 0.85, minimum: 0.8, direction: 'higher', unit: 'pct', floor: 0.7, floorLabel: 'cada uma ≥ 70%' },
    { key: 'reparoAgenda', label: 'Reparo na mínima agenda', group: 'Opex', weight: 15, minWeight: 12, target: 0.85, minimum: 0.8, direction: 'higher', unit: 'pct', floorLabel: 'outlier de reparo < 6%' },
    { key: 'qualidadeCapex', label: 'IFI e IFIME', group: 'Qualidade Capex', weight: 5, minWeight: 4, target: 0.03, minimum: 0.035, direction: 'lower', unit: 'pct', floor: 0.05, floorLabel: 'cada um ≤ 5%' },
    { key: 'irr', label: 'IRR', group: 'IRR', weight: 15, minWeight: 12, target: 0.067, minimum: 0.075, direction: 'lower', unit: 'pct' },
    { key: 'irt', label: 'IRT (projetado no mês)', group: 'IRT', weight: 10, minWeight: 8, target: 0.0397, minimum: 0.045, direction: 'lower', unit: 'pct' },
    { key: 'visita', label: 'Visita na agenda', group: 'Visita', weight: 5, minWeight: 4, target: 0.95, minimum: 0.9, direction: 'higher', unit: 'pct' },
    { key: 'churn', label: 'Churn voluntário (acelerador)', group: 'Acelerador', weight: 10, minWeight: 5, target: 0.0077, minimum: 0.009, direction: 'lower', unit: 'pct' },
  ],
  bands: [
    { band: 'A', minPoints: 90, bonus: 0.1 }, { band: 'B', minPoints: 85, bonus: 0.05 }, { band: 'C', minPoints: 80, bonus: 0 }, { band: 'D', minPoints: 78, bonus: -0.01 },
    { band: 'E', minPoints: 76, bonus: -0.02 }, { band: 'F', minPoints: 74, bonus: -0.03 }, { band: 'G', minPoints: 72, bonus: -0.04 }, { band: 'Z', minPoints: 0, bonus: -0.05 },
  ],
  outlierReparoMax: 0.06,
  redesGate: 0.75,
  applyRedesGate: false,
};

export type ScoreStatus = 'meta' | 'minimo' | 'abaixo' | 'travado' | 'sem-dado';
export type ScoredIndicator = {
  key: IndicatorKey; label: string; group: string; value: number | null; detail: string; parts?: { label: string; value: number | null; detail: string }[];
  target: number; minimum: number; direction: Direction; unit: 'pct' | 'h'; weight: number; minWeight: number; points: number; status: ScoreStatus; gate?: { label: string; ok: boolean } ; gap: number | null;
};
export type IgpScore = { indicators: ScoredIndicator[]; basePoints: number; accelerator: number; total: number; maxPoints: number; band: Band; scoring: number };

const rate = (value: Ratio | null | undefined) => (value && value.den > 0 ? value.num / value.den : null);
const detail = (value: Ratio | null | undefined) => (value ? `${value.num.toLocaleString('pt-BR')} de ${value.den.toLocaleString('pt-BR')}` : 'sem dado');
const reaches = (value: number, target: number, direction: Direction) => (direction === 'lower' ? value <= target + 1e-12 : value >= target - 1e-12);

export function scoreIgp(raw: IgpIndicatorsRaw, rules: IgpRules = DEFAULT_IGP_RULES): IgpScore {
  const efAltas = rate(raw.efAltas), efMe = rate(raw.efMe);
  const altas = rate(raw.altasAgenda), me = rate(raw.meAgenda);
  const ifi = rate(raw.ifi), ifime = rate(raw.ifime);
  const avg = (values: (number | null)[]) => { const valid = values.filter((value): value is number => value !== null); return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null; };
  const irt = raw.irt && raw.irt.base > 0 && raw.irt.workdaysElapsed > 0 ? (raw.irt.reparos / raw.irt.base) * (raw.irt.workdaysMonth / raw.irt.workdaysElapsed) : null;
  const outlierReparo = rate(raw.outlierReparo);

  const values: Record<IndicatorKey, { value: number | null; detail: string; parts?: ScoredIndicator['parts']; gate?: { label: string; ok: boolean } }> = {
    outlier: { value: rate(raw.outlier), detail: `${detail(raw.outlier)} OS` },
    prazo: { value: rate(raw.prazo), detail: `${detail(raw.prazo)} OS` },
    mttr: { value: raw.mttr.orders ? raw.mttr.hours / raw.mttr.orders : null, detail: `${raw.mttr.orders} OS` },
    eficiencia: { value: avg([efAltas, efMe]), detail: 'média das duas', parts: [{ label: 'Altas', value: efAltas, detail: detail(raw.efAltas) }, { label: 'ME', value: efMe, detail: detail(raw.efMe) }] },
    capexAgenda: { value: avg([altas, me]), detail: 'média das duas', parts: [{ label: 'Altas', value: altas, detail: detail(raw.altasAgenda) }, { label: 'ME', value: me, detail: detail(raw.meAgenda) }] },
    reparoAgenda: { value: rate(raw.reparoAgenda), detail: detail(raw.reparoAgenda), parts: [{ label: 'Outlier de reparo (48h)', value: outlierReparo, detail: detail(raw.outlierReparo) }] },
    qualidadeCapex: { value: avg([ifi, ifime]), detail: 'média dos dois', parts: [{ label: 'IFI', value: ifi, detail: detail(raw.ifi) }, { label: 'IFIME', value: ifime, detail: detail(raw.ifime) }] },
    irr: { value: rate(raw.irr), detail: detail(raw.irr) },
    irt: { value: irt, detail: raw.irt ? `${raw.irt.reparos.toLocaleString('pt-BR')} reparos em ${raw.irt.base.toLocaleString('pt-BR')} clientes, ${raw.irt.workdaysElapsed} de ${raw.irt.workdaysMonth} dias úteis` : 'sem dado' },
    visita: { value: rate(raw.visita), detail: detail(raw.visita) },
    churn: { value: rate(raw.churn), detail: raw.churn ? `${raw.churn.num.toLocaleString('pt-BR')} cancelamentos em ${raw.churn.den.toLocaleString('pt-BR')} clientes` : 'sem dado' },
  };

  // Condicoes dos grupos.
  const efRule = rules.indicators.find((rule) => rule.key === 'eficiencia');
  const capexRule = rules.indicators.find((rule) => rule.key === 'capexAgenda');
  const qcRule = rules.indicators.find((rule) => rule.key === 'qualidadeCapex');
  if (efRule?.floor != null) values.eficiencia.gate = { label: efRule.floorLabel || '', ok: [efAltas, efMe].every((value) => value !== null && value >= efRule.floor!) };
  if (capexRule?.floor != null) values.capexAgenda.gate = { label: capexRule.floorLabel || '', ok: [altas, me].every((value) => value !== null && value >= capexRule.floor!) };
  if (qcRule?.floor != null) values.qualidadeCapex.gate = { label: qcRule.floorLabel || '', ok: [ifi, ifime].every((value) => value !== null && value <= qcRule.floor!) };
  values.reparoAgenda.gate = { label: `outlier de reparo < ${(rules.outlierReparoMax * 100).toLocaleString('pt-BR')}%`, ok: outlierReparo !== null && outlierReparo < rules.outlierReparoMax };

  const scored: ScoredIndicator[] = rules.indicators.map((rule) => {
    const item = values[rule.key];
    let status: ScoreStatus = 'sem-dado';
    let points = 0;
    if (item.value !== null) {
      status = reaches(item.value, rule.target, rule.direction) ? 'meta' : reaches(item.value, rule.minimum, rule.direction) ? 'minimo' : 'abaixo';
      points = status === 'meta' ? rule.weight : status === 'minimo' ? rule.minWeight : 0;
      if (item.gate && !item.gate.ok) { status = 'travado'; points = 0; }
    }
    const gap = item.value === null ? null : rule.direction === 'lower' ? item.value - rule.target : rule.target - item.value;
    return { key: rule.key, label: rule.label, group: rule.group, value: item.value, detail: item.detail, parts: item.parts, target: rule.target, minimum: rule.minimum, direction: rule.direction, unit: rule.unit, weight: rule.weight, minWeight: rule.minWeight, points, status, gate: item.gate, gap: gap !== null && gap > 0 ? gap : null };
  });

  // Redes: "realizado do grupo >= 75%", medido como pontos do grupo / peso do grupo (so trava com applyRedesGate).
  const redes = scored.filter((item) => item.group === 'Redes');
  const redesMax = redes.reduce((sum, item) => sum + item.weight, 0);
  const redesShare = redesMax ? redes.reduce((sum, item) => sum + item.points, 0) / redesMax : 1;
  const redesOk = redesShare >= rules.redesGate;
  redes.forEach((item) => {
    item.gate = { label: `grupo Redes ≥ ${Math.round(rules.redesGate * 100)}% (a confirmar com a Giga)`, ok: redesOk };
    if (!redesOk && rules.applyRedesGate) { item.points = 0; item.status = item.value === null ? 'sem-dado' : 'travado'; }
  });

  const basePoints = scored.filter((item) => item.group !== 'Acelerador').reduce((sum, item) => sum + item.points, 0);
  const maxPoints = rules.indicators.filter((rule) => rule.group !== 'Acelerador').reduce((sum, rule) => sum + rule.weight, 0);
  const accelerator = scored.filter((item) => item.group === 'Acelerador').reduce((sum, item) => sum + item.points, 0);
  const total = basePoints + accelerator;
  const bands = [...rules.bands].sort((left, right) => right.minPoints - left.minPoints);
  const band = bands.find((item) => total >= item.minPoints) ?? bands[bands.length - 1];
  return { indicators: scored, basePoints, accelerator, total, maxPoints, band, scoring: scored.filter((item) => item.points > 0 && item.group !== 'Acelerador').length };
}
