import XLSX from 'xlsx';

// Planilha "JH (NN).xlsx" da Giga (12/11/2026). Le, sem gravar nada:
// - "ANALITICO REDES": uma linha por ordem de rede (OS, origem BDESK/FIELD/BACKBONE, cluster oficial, abertura e
//   fechamento em horario de Sao Paulo, TME, prazo, outlier);
// - as abas de campo (ALTAS, REPAROS, IRR, IFI, VISITA NA AGENDA, IRT, CANC_VOL, BASE_CLIENTES, EFICIENCIA_*): os
//   numeradores e denominadores de cada indicador do IGP ACESSO, por cluster.
// A aba "IGP ACESSO" da Giga so traz as regras (pesos, metas, faixas); a conta e feita em igp-score.ts.

export type GigaOrder = {
  os: string; osOfs: string; origin: string; cluster: string; regional: string; city: string; element: string; resource: string;
  openedAt: string | null; closedAt: string | null; tmeHours: number | null; onTime: boolean | null; outlier: boolean | null; month: string | null;
};
export type Ratio = { num: number; den: number };
export type IgpIndicatorsRaw = {
  outlier: Ratio; prazo: Ratio; mttr: { hours: number; orders: number };
  efAltas: Ratio | null; efMe: Ratio | null;
  altasAgenda: Ratio; meAgenda: Ratio; reparoAgenda: Ratio; outlierReparo: Ratio;
  ifi: Ratio; ifime: Ratio; irr: Ratio;
  irt: { reparos: number; base: number; workdaysMonth: number; workdaysElapsed: number } | null;
  visita: Ratio; churn: Ratio | null;
};
export type GigaWorkbook = { month: string; mainCluster: string | null; closedUntil: string | null; orders: GigaOrder[]; indicators: Record<string, IgpIndicatorsRaw> };

// "C.8 | Sao Paulo", "C.8 - SAO PAULO", "C.10" -> "C.8" / "C.10". Sem cluster -> "".
export function gigaClusterKey(value: unknown) {
  const match = String(value ?? '').toUpperCase().match(/C\.?\s*0?(\d{1,2})\b/);
  return match ? `C.${Number(match[1])}` : '';
}
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const text = (value: unknown) => String(value ?? '').trim();
const yes = (value: unknown) => value === true || value === 1 || /^(true|1|sim)$/i.test(String(value ?? '').trim());
const num = (value: unknown) => { const parsed = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0; };
// "2026-11-02 23:19:00" (Sao Paulo) -> ISO com -03:00.
export function gigaDateTime(value: unknown): string | null {
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, y, m, d, h, mi, s = '00'] = match;
  return `${y}-${m}-${d}T${h}:${mi}:${s}-03:00`;
}
const ratio = (num: number, den: number): Ratio => ({ num, den });

function sheetRows(workbook: XLSX.WorkBook, matcher: RegExp) {
  const name = workbook.SheetNames.find((sheet) => matcher.test(sheet.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()));
  return name ? XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: '', raw: true }) : [];
}

export function parseGigaWorkbook(buffer: Buffer): GigaWorkbook {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const analytic = sheetRows(workbook, /^ANALITICO REDES$/);
  if (!analytic.length) throw new Error('Nao achei a aba "ANALITICO REDES" na planilha. Use a planilha "JH (NN).xlsx" que a Giga manda.');

  const orders: GigaOrder[] = analytic.map((row) => {
    const closedAt = gigaDateTime(row.DATA_FECHAMENTO);
    return {
      os: digits(row.OS), osOfs: digits(row.OS_OFS), origin: text(row.ORIGEM).toUpperCase(), cluster: gigaClusterKey(row.CLUSTER), regional: text(row.REGIONAL), city: text(row.CIDADE),
      element: text(row.ELEMENTO), resource: text(row.RECURSO), openedAt: gigaDateTime(row.DATA_ABERTURA), closedAt,
      tmeHours: row.TME === '' ? null : num(row.TME), onTime: row.PRAZO === '' ? null : num(row.PRAZO) === 1, outlier: row.OUTLIER === '' ? null : num(row.OUTLIER) === 1,
      month: closedAt ? closedAt.slice(0, 7) : null,
    };
  }).filter((order) => order.os);

  const months = new Map<string, number>();
  orders.forEach((order) => { if (order.month) months.set(order.month, (months.get(order.month) ?? 0) + 1); });
  const month = [...months].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (!month) throw new Error('A aba "ANALITICO REDES" nao tem datas de fechamento.');
  const closedUntil = orders.map((order) => order.closedAt).filter(Boolean).sort().pop() ?? null;

  // Cluster "dono" da planilha (aba IGP ACESSO, "JH - C.8 - SAO PAULO"): IRT e base de clientes vem sem cluster.
  const igpSheet = workbook.SheetNames.find((name) => /IGP ACESSO/i.test(name));
  const header = igpSheet ? XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[igpSheet], { header: 1, defval: '' }).slice(0, 4).flat().map(String).find((cell) => /JH\s*-\s*C\./i.test(cell)) : undefined;
  const mainCluster = header ? gigaClusterKey(header) || null : null;

  const altas = sheetRows(workbook, /^ALTAS$/), reparos = sheetRows(workbook, /^REPAROS$/), irrRows = sheetRows(workbook, /^IRR$/), ifiRows = sheetRows(workbook, /^IFI$/);
  const visita = sheetRows(workbook, /^VISITA NA AGENDA$/), irtRows = sheetRows(workbook, /^IRT$/), canc = sheetRows(workbook, /^CANC_VOL$/), base = sheetRows(workbook, /^BASE_CLIENTES$/);
  const efVendas = sheetRows(workbook, /^EFICIENCIA_VENDAS$/), efMe = sheetRows(workbook, /^EFICIENCIA_ME$/);
  const clusterOf = (row: Record<string, unknown>) => gigaClusterKey(row.cluster_campo ?? row.cluster ?? row.CLUSTER ?? row.Cluster);

  const clusters = new Set<string>([...orders.map((order) => order.cluster), ...altas.map(clusterOf), ...reparos.map(clusterOf)].filter(Boolean));
  if (mainCluster) clusters.add(mainCluster);
  const indicators: Record<string, IgpIndicatorsRaw> = {};
  for (const cluster of clusters) {
    const mine = <T extends Record<string, unknown>>(rows: T[]) => rows.filter((row) => clusterOf(row) === cluster);
    // Redes do IGP ACESSO: BDESK e FIELD do cluster, sem BACKBONE (NOC TX nao entra no IGP).
    const redes = orders.filter((order) => order.cluster === cluster && order.origin !== 'BACKBONE' && order.month === month);
    const alta = mine(altas).filter((row) => text(row.tipo).toUpperCase() === 'ALTA');
    const me = mine(altas).filter((row) => text(row.tipo).toUpperCase() === 'ME');
    const rep = mine(reparos);
    const fulfilled = (rows: Record<string, unknown>[]) => ratio(rows.filter((row) => /^sim$/i.test(text(row.Cumprimento))).length, rows.length);
    const ifi = mine(ifiRows);
    const sales = efVendas.find((row) => gigaClusterKey(row.CLUSTER) === cluster);
    const meEff = efMe.find((row) => gigaClusterKey(row.cluster) === cluster);
    const visits = mine(visita);
    const isMain = cluster === mainCluster;
    const plant = isMain ? mine(base).reduce((sum, row) => sum + num(row.QTD), 0) : 0;
    const irtBase = irtRows.length ? num(irtRows[0].volume_base) : 0;
    indicators[cluster] = {
      outlier: ratio(redes.filter((order) => order.outlier).length, redes.length),
      prazo: ratio(redes.filter((order) => order.onTime).length, redes.length),
      mttr: { hours: redes.reduce((sum, order) => sum + (order.tmeHours ?? 0), 0), orders: redes.length },
      efAltas: sales ? ratio(num(sales.qtd_altas), num(sales.qtd_vendas)) : null,
      efMe: meEff ? ratio(num(meEff.qtd_realizada), num(meEff.qtd_fila)) : null,
      altasAgenda: fulfilled(alta), meAgenda: fulfilled(me), reparoAgenda: fulfilled(rep),
      outlierReparo: ratio(rep.filter((row) => yes(row.Outlier_48h)).length, rep.length),
      ifi: ratio(ifi.filter((row) => yes(row.IFI)).length, alta.length),
      ifime: ratio(ifi.filter((row) => yes(row.IFME)).length, me.length),
      irr: ratio(mine(irrRows).length, rep.length),
      irt: isMain && irtBase ? { reparos: irtRows.reduce((sum, row) => sum + num(row.volume_reparos), 0), base: irtBase, workdaysMonth: num(irtRows[0].dia_util_mes), workdaysElapsed: num(irtRows[0].dia_util_corrido) } : null,
      visita: ratio(visits.reduce((sum, row) => sum + num(row.numerador), 0), visits.reduce((sum, row) => sum + num(row.denominador), 0)),
      churn: isMain && plant ? ratio(mine(canc).reduce((sum, row) => sum + num(row.qtd), 0), plant) : null,
    };
  }
  return { month, mainCluster, closedUntil, orders, indicators };
}
