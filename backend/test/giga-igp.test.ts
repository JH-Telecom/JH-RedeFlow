import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx';
import { gigaClusterKey, gigaDateTime, parseGigaWorkbook } from '../src/giga-workbook.js';
import { DEFAULT_IGP_RULES, scoreIgp } from '../src/igp-score.js';
import { matchGigaOrders, reconcile } from '../src/store/giga.js';
import { calculateIgpMetrics, classifyCallArea } from '../src/igp.js';
import type { Call } from '../src/types.js';

// Planilha sintetica no formato da Giga (mesmas abas e colunas), sem dados reais.
function workbook() {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Record<string, unknown>[] | unknown[][], aoa = false) => XLSX.utils.book_append_sheet(wb, aoa ? XLSX.utils.aoa_to_sheet(rows as unknown[][]) : XLSX.utils.json_to_sheet(rows as Record<string, unknown>[]), name);
  add('IGP ACESSO', [['', 'IGP ACESSO - A PARTIR DE 01/11/2026'], ['', 'JH - C.8 - SÃO PAULO']], true);
  add('ANALÍTICO REDES', [
    { OS: 671001, ORIGEM: 'BDESK', TME: 2, DATA_ABERTURA: '2026-11-02 10:00:00', DATA_FECHAMENTO: '2026-11-02 12:00:00', PRAZO: 1, OUTLIER: 0, CLUSTER: 'C.8 | Sao Paulo', OS_OFS: 'BDESK-610000000000102', CIDADE: 'Sao Paulo/itaim' },
    { OS: 12600001, ORIGEM: 'FIELD', TME: 10, DATA_ABERTURA: '2026-11-03 08:00:00', DATA_FECHAMENTO: '2026-11-03 18:00:00', PRAZO: 0, OUTLIER: 1, CLUSTER: 'C.8 | Sao Paulo', OS_OFS: 12600001, CIDADE: 'SAO PAULO' },
    { OS: 671002, ORIGEM: 'BACKBONE', TME: 9, DATA_ABERTURA: '2026-11-04 08:00:00', DATA_FECHAMENTO: '2026-11-04 17:00:00', PRAZO: 0, OUTLIER: 0, CLUSTER: 'C.8 | Sao Paulo', OS_OFS: 'BDESK-610000000000202' },
    { OS: 671003, ORIGEM: 'BDESK', TME: 1, DATA_ABERTURA: '2026-11-05 08:00:00', DATA_FECHAMENTO: '2026-11-05 09:00:00', PRAZO: 1, OUTLIER: 0, CLUSTER: 'C.12 | Guarulhos', OS_OFS: 'BDESK-610000000000302' },
    { OS: 671004, ORIGEM: 'BDESK', TME: 3, DATA_ABERTURA: '2026-11-06 08:00:00', DATA_FECHAMENTO: '2026-11-06 11:00:00', PRAZO: 1, OUTLIER: 0, CLUSTER: 'C.8 | Sao Paulo', OS_OFS: 'BDESK-610000000000402' },
  ]);
  add('ALTAS', [...Array.from({ length: 9 }, () => ({ tipo: 'ALTA', cluster_campo: 'C.8', Cumprimento: 'Sim' })), { tipo: 'ALTA', cluster_campo: 'C.8', Cumprimento: 'Não' }, ...Array.from({ length: 4 }, (_, i) => ({ tipo: 'ME', cluster_campo: 'C.8', Cumprimento: i < 3 ? 'Sim' : 'Não' }))]);
  add('REPAROS', Array.from({ length: 20 }, (_, i) => ({ tipo: 'REPARO', cluster_campo: 'C.8', Cumprimento: i < 18 ? 'Sim' : 'Não', Outlier_48h: i === 0 })));
  add('IRR', [{ tipo: 'REPARO', IRR: true, cluster_campo: 'C.8' }]);
  add('IFI', [{ tipo: 'REPARO', IFI: false, IFME: true, cluster_campo: 'C.8' }]);
  add('VISITA NA AGENDA', [{ cluster: 'C.8', numerador: 19, denominador: 20 }]);
  add('IRT', [{ bairro: 'X', volume_base: 1000, volume_reparos: 10, dia_util_mes: 20, dia_util_corrido: 10 }]);
  add('CANC_VOL', [{ Cluster: 'C.8', qtd: 5 }]);
  add('BASE_CLIENTES', [{ cluster: 'C.8', QTD: 1000 }]);
  add('EFICIENCIA_VENDAS', [{ CLUSTER: 'C.8', qtd_vendas: 100, qtd_altas: 90 }]);
  add('EFICIENCIA_ME', [{ cluster: 'C.8', qtd_fila: 100, qtd_realizada: 80 }]);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

test('reads clusters, dates and the Giga orders', () => {
  assert.equal(gigaClusterKey('C.8 | Sao Paulo'), 'C.8');
  assert.equal(gigaClusterKey('C.10 - Litoral Sul'), 'C.10');
  assert.equal(gigaDateTime('2026-11-02 23:19:00'), '2026-11-02T23:19:00-03:00');
  const wb = parseGigaWorkbook(workbook());
  assert.equal(wb.month, '2026-11');
  assert.equal(wb.mainCluster, 'C.8');
  assert.equal(wb.orders.length, 5);
  assert.equal(wb.orders[0].osOfs, '610000000000102');
  const c8 = wb.indicators['C.8'];
  // Redes com BACKBONE, como a Giga conta: 4 ordens do C.8 (2 BDESK + 1 FIELD + 1 BACKBONE).
  assert.deepEqual(c8.prazo, { num: 2, den: 4 });
  assert.deepEqual(c8.outlier, { num: 1, den: 4 });
  assert.equal(c8.mttr.hours / c8.mttr.orders, 6);
  assert.deepEqual(c8.altasAgenda, { num: 9, den: 10 });
  assert.deepEqual(c8.meAgenda, { num: 3, den: 4 });
  assert.deepEqual(c8.irr, { num: 1, den: 20 });
  assert.deepEqual(c8.churn, { num: 5, den: 1000 });
  assert.throws(() => parseGigaWorkbook(XLSX.write(XLSX.utils.book_new(), { type: 'buffer', bookType: 'xlsx' }) as Buffer));
});

test('scores the IGP ACESSO with the group conditions', () => {
  const score = scoreIgp(parseGigaWorkbook(workbook()).indicators['C.8']);
  const by = Object.fromEntries(score.indicators.map((item) => [item.key, item]));
  assert.equal(by.mttr.points, 12); // 6h = meta minima
  assert.equal(by.prazo.status, 'abaixo');
  assert.equal(by.eficiencia.points, 10); // (90% + 80%) / 2 = 85% = meta, e as duas >= 75%
  assert.equal(by.capexAgenda.value, 0.825); // (90% + 75%) / 2
  assert.equal(by.capexAgenda.points, 8);
  assert.equal(by.reparoAgenda.status, 'meta'); // 90%, outlier de reparo 5% < 6%
  assert.equal(by.irt.value, 0.02); // 10/1000 * 20/10
  assert.equal(by.churn.points, 10);
  assert.equal(score.accelerator, 10);
  assert.equal(score.total, score.basePoints + 10);
  // Outlier de reparo acima de 6% trava o Opex.
  const raw = parseGigaWorkbook(workbook()).indicators['C.8'];
  const locked = scoreIgp({ ...raw, outlierReparo: { num: 2, den: 20 } }).indicators.find((item) => item.key === 'reparoAgenda')!;
  assert.equal(locked.status, 'travado');
  assert.equal(locked.points, 0);
  // Faixa pela regua.
  assert.equal(scoreIgp(raw, { ...DEFAULT_IGP_RULES, bands: [{ band: 'X', minPoints: 0, bonus: 0 }] }).band.band, 'X');
});

test('matches orders to calls, uses the Giga cluster/times in the IGP and reconciles', () => {
  const wb = parseGigaWorkbook(workbook());
  const call = (id: string, extra: Partial<Call>): Call => ({ id, orderNumber: id, bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region: 'ITAIM PAULISTA', city: '', olt: '', slotPon: '', status: 'Finalizado', openedAt: '2026-11-02T10:00:00-03:00', executedAt: '2026-11-02T12:30:00-03:00', notes: '', ...extra });
  const calls = [call('a', { bdesk: '671001' }), call('b', { orderNumber: '12600001', type: 'ACIONAMENTO FIELD' }), call('c', { orderNumber: '610000000000302', region: 'SUZANO' }), call('d', { orderNumber: '999', region: 'GUAIANASES 1', executedAt: '2026-11-04T10:00:00-03:00' })];
  const matched = matchGigaOrders(wb.orders, calls);
  assert.deepEqual(matched.map((item) => item.call?.id ?? null), ['a', 'b', null, 'c', null]);
  // Cluster da Giga manda: 'c' e de SUZANO mas a Giga pos em C.12.
  assert.equal(classifyCallArea({ region: 'SUZANO', gigaCluster: 'C12' }), 'GRU');
  assert.equal(classifyCallArea({ region: 'FERRAZ DE VASCONCELOS 2' }), 'ALTO_TIETE');
  assert.equal(classifyCallArea({ region: 'CONQUISTA' }), 'ABC');
  assert.equal(classifyCallArea({ region: 'GUARULHOS 1', cluster: 'C08' }), 'GRU'); // balde do OFS nao manda mais
  // Fechamento da Giga no IGP: 2h (Giga) em vez de 2h30 (sistema).
  const metrics = calculateIgpMetrics([{ ...calls[0], gigaCluster: 'C08', gigaOpenedAt: '2026-11-02T10:00:00-03:00', gigaClosedAt: '2026-11-02T12:00:00-03:00' }], '2026-11', 'SP');
  assert.equal(metrics.total.mttrHours, 2);
  const stored = matched.map(({ order, call: found }) => ({ ...order, callId: found?.id ?? null }));
  const result = reconcile(stored, calls, 'C.8', '2026-11-06T11:00:00-03:00');
  assert.equal(result.both, 2);
  assert.deepEqual(result.onlyGiga.map((order) => order.os), ['671002', '671004']);
  assert.deepEqual(result.onlySystem.map((item) => item.id), ['d']);
  assert.deepEqual(result.timeDiffs.map((item) => [item.os, item.minutes]), [['12600001', -1770], ['671001', 30]]);
});

test('IGP uses the Giga orders up to the cut and the system after it', async () => {
  const { calculateIgpWithGiga } = await import('../src/igp.js');
  const order = (cluster: string, origin: string, closedAt: string, tme: number, onTime: boolean, outlier: boolean, callId: string | null = null) => ({ origin, cluster, closedAt, tmeHours: tme, onTime, outlier, month: '2026-11', callId });
  const giga = { closedUntil: '2026-11-10T22:00:00-03:00', fileName: 'JH (58).xlsx', orders: [
    order('C.8', 'BDESK', '2026-11-02T12:00:00-03:00', 2, true, false, 'a'),
    order('C.8', 'FIELD', '2026-11-03T18:00:00-03:00', 10, false, true),
    order('C.8', 'BACKBONE', '2026-11-04T17:00:00-03:00', 9, false, false),
    order('C.12', 'BDESK', '2026-11-05T09:00:00-03:00', 1, true, false),
  ] };
  const call = (id: string, executedAt: string, region = 'ITAIM PAULISTA'): Call => ({ id, orderNumber: id, bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region, city: '', olt: '', slotPon: '', status: 'Finalizado', openedAt: new Date(Date.parse(executedAt) - 3 * 3_600_000).toISOString(), executedAt, notes: '' });
  // 'a' ja esta na Giga; 'b' foi antes do corte mas a Giga nao contou (fica de fora); 'c' e depois do corte (entra).
  const calls = [call('a', '2026-11-02T12:30:00-03:00'), call('b', '2026-11-05T10:00:00-03:00'), call('c', '2026-11-11T10:00:00-03:00')];
  const sp = calculateIgpWithGiga(calls, '2026-11', 'SP', giga);
  assert.equal(sp.total.orders, 4); // 3 da Giga (com o backbone, como ela conta) + 1 do sistema depois do corte
  assert.equal(sp.source.gigaOrders, 3);
  assert.equal(sp.backbone.orders, 1);
  assert.equal(sp.source.systemOrders, 1);
  assert.equal(sp.nocTxOrders, 0);
  assert.equal(sp.total.outliers, 1);
  assert.equal(sp.total.mttrHours, (2 + 10 + 9 + 3) / 4);
  assert.equal(calculateIgpWithGiga(calls, '2026-11', 'GRU', giga).total.orders, 1);
  assert.equal(calculateIgpWithGiga(calls, '2026-11', 'ALL', giga).total.orders, 5);
  // Sem planilha: so o sistema.
  assert.equal(calculateIgpWithGiga(calls, '2026-11', 'SP', null).total.orders, 3);
});
