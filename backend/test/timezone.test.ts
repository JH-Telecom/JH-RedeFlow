import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, operationalDayStartIso, toOperationalDate } from '../src/timezone.js';
import { calculateIgpMetrics } from '../src/igp.js';
import type { Call } from '../src/types.js';

test('operational date follows America/Sao_Paulo instead of UTC', () => {
  assert.equal(toOperationalDate('2026-10-01T01:30:00.000Z'), '2026-09-30');
  assert.equal(toOperationalDate('2026-10-01T03:00:00.000Z'), '2026-10-01');
  assert.equal(toOperationalDate('2026-10-01T22:30:00-03:00'), '2026-10-01');
});

test('operational day bounds start at midnight in Sao Paulo', () => {
  assert.equal(operationalDayStartIso('2026-10-01'), '2026-10-01T03:00:00.000Z');
  assert.equal(operationalDayStartIso(addDays('2026-12-31', 1)), '2027-01-01T03:00:00.000Z');
});

test('IGP assigns orders finished late at night to the Sao Paulo month', () => {
  const call: Call = { id: 'late-night', orderNumber: 'late-night', bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region: 'SÃO PAULO', city: '', olt: '', slotPon: '', status: 'Finalizado', openedAt: '2026-09-30T20:00:00-03:00', executedAt: '2026-09-30T22:00:00-03:00', notes: '' };
  assert.equal(calculateIgpMetrics([call], '2026-09').total.orders, 1);
  assert.equal(calculateIgpMetrics([call], '2026-10').total.orders, 0);
});
