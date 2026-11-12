import assert from 'node:assert/strict';
import test from 'node:test';
import { isLinkCall, slaLimits } from '../src/sla.js';
import { classifySlaHours } from '../src/igp.js';
import { queueState } from '../src/operations.js';
import { dueSoonCalls } from '../src/due-soon.js';
import { nearDeadlineCalls } from '../src/sla-alerts.js';
import type { Call } from '../src/types.js';

const now = Date.parse('2026-11-12T12:00:00-03:00');
const call = (type: string, hoursAgo: number): Call => ({ id: `${type}-${hoursAgo}`, orderNumber: '1', bdesk: '', officeTrack: '', client: '', type, reason: '', region: 'SP', city: '', olt: '', slotPon: '', status: 'Atribuido', openedAt: new Date(now - hoursAgo * 3_600_000).toISOString(), notes: '' });

test('links (NOC TX) have a 15-day deadline, the others 6h/9h', () => {
  assert.equal(isLinkCall('NOC TX'), true);
  assert.equal(isLinkCall('NOC ACESSO'), false);
  assert.equal(slaLimits('NOC TX').onTimeHours, 360);
  assert.equal(classifySlaHours(20, 'NOC TX'), 'onTime');
  assert.equal(classifySlaHours(20, 'NOC ACESSO'), 'outlier');
  assert.equal(classifySlaHours(7), 'late');
  assert.equal(classifySlaHours(400, 'NOC TX'), 'outlier');
  assert.equal(queueState(call('NOC TX', 48), now), 'ok');
  assert.equal(queueState(call('NOC TX', 14 * 24 + 1), now), 'soon');
  assert.equal(queueState(call('NOC TX', 16 * 24), now), 'outlier');
  assert.equal(queueState(call('NOC ACESSO', 7), now), 'late');
  // "vencendo" e avisos: um NOC TX de 5h50 nao esta perto do prazo; um NOC ACESSO de 5h50 esta.
  const due = dueSoonCalls([call('NOC TX', 5.85), call('NOC ACESSO', 5.85)], now);
  assert.deepEqual(due.dueSoon.map((item) => item.type), ['NOC ACESSO']);
  assert.deepEqual(nearDeadlineCalls([call('NOC TX', 5.5), call('NOC ACESSO', 5.5)], 60, now).map((item) => item.type), ['NOC ACESSO']);
});
