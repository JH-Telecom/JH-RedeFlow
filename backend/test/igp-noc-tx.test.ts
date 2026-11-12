import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateIgpMetrics, isNocTx } from '../src/igp.js';
import type { Call } from '../src/types.js';

const call = (id: string, type: string, hours: number): Call => ({ id, orderNumber: id, bdesk: '', officeTrack: '', client: '', type, reason: '', region: 'GUARULHOS 1', city: '', olt: '', slotPon: '', status: 'Finalizado', openedAt: '2026-11-10T10:00:00-03:00', executedAt: new Date(Date.parse('2026-11-10T10:00:00-03:00') + hours * 3_600_000).toISOString(), notes: '' });

test('NOC TX stays out of the IGP and is counted apart', () => {
  assert.equal(isNocTx('NOC TX'), true);
  assert.equal(isNocTx('noc  tx'), true);
  assert.equal(isNocTx('NOC ACESSO'), false);
  const metrics = calculateIgpMetrics([call('a', 'NOC ACESSO', 2), call('b', 'ACIONAMENTO FIELD', 10), call('c', 'NOC TX', 20), call('d', 'NOC TX', 1)], '2026-11');
  assert.equal(metrics.total.orders, 2);
  assert.equal(metrics.access.orders, 2);
  assert.equal(metrics.backbone.orders, 0);
  assert.equal(metrics.nocTxOrders, 2);
  assert.equal(metrics.excludedOrders, 0);
  assert.equal(metrics.total.outlierPercent, 50);
});
