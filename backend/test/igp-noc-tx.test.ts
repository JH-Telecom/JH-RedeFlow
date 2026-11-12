import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateIgpMetrics, isNocTx } from '../src/igp.js';
import type { Call } from '../src/types.js';

const call = (id: string, type: string, hours: number): Call => ({ id, orderNumber: id, bdesk: '', officeTrack: '', client: '', type, reason: '', region: 'GUARULHOS 1', city: '', olt: '', slotPon: '', status: 'Finalizado', openedAt: '2026-11-10T10:00:00-03:00', executedAt: new Date(Date.parse('2026-11-10T10:00:00-03:00') + hours * 3_600_000).toISOString(), notes: '' });

// 12/11/2026: a Giga conta o Backbone (NOC TX/Links) no IGP com a regra de 6h/9h (JH 58: 143 OS no C.8 = 127 + 16).
test('NOC TX counts in the IGP as Backbone, with the 6h/9h rule like Giga', () => {
  assert.equal(isNocTx('NOC TX'), true);
  assert.equal(isNocTx('NOC ACESSO'), false);
  const metrics = calculateIgpMetrics([call('a', 'NOC ACESSO', 2), call('b', 'ACIONAMENTO FIELD', 10), call('c', 'NOC TX', 20), call('d', 'NOC TX', 1)], '2026-11');
  assert.equal(metrics.total.orders, 4);
  assert.equal(metrics.access.orders, 2);
  assert.equal(metrics.backbone.orders, 2);
  assert.equal(metrics.nocTxOrders, 0);
  assert.equal(metrics.total.outlierPercent, 50);
  assert.equal(metrics.total.onTimePercent, 50);
});
