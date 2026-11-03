import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeOperationalTrends } from '../src/store/dashboard.js';
import type { Call } from '../src/types.js';

const now = Date.parse('2026-11-03T15:00:00.000Z'); // 12:00 em Sao Paulo
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
const call = (id: string, overrides: Partial<Call>): Call => ({ id, orderNumber: id, bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region: 'SUZANO', city: '', olt: '', slotPon: '', status: 'Aberto', openedAt: hoursAgo(1), notes: '', ...overrides });

test('active queue is classified with the 6h/9h rule and lists the oldest calls first', () => {
  const calls = [
    call('a', { openedAt: hoursAgo(6) }),
    call('b', { openedAt: hoursAgo(6.5), status: 'Em campo', technicianName: 'Carlos' }),
    call('c', { openedAt: hoursAgo(9.5), status: 'Atribuido', technicianName: 'Carlos' }),
    call('d', { openedAt: hoursAgo(30), status: 'Finalizado', executedAt: hoursAgo(28) }),
  ];
  const result = summarizeOperationalTrends(calls, calls, {}, '2026-11-03', now);
  assert.deepEqual(result.activeSla, { onTime: 1, late: 1, outlier: 1 });
  assert.equal(result.activeTotal, 3);
  assert.equal(result.activeUnassigned, 3);
  assert.equal(result.openedInPeriod, 4);
  assert.deepEqual(result.oldestActive.map((item) => item.id), ['c', 'b', 'a']);
  assert.deepEqual(result.activeByTechnician, [{ label: 'Carlos', value: 2 }]);
});

test('closed SLA and MTTR use opening to finish time of finalized calls in the period', () => {
  const calls = [
    call('on-time', { status: 'Finalizado', openedAt: hoursAgo(20), executedAt: hoursAgo(14) }),
    call('late', { status: 'Finalizado', openedAt: hoursAgo(20), executedAt: hoursAgo(12) }),
    call('outlier', { status: 'Finalizado', openedAt: hoursAgo(20), executedAt: hoursAgo(10) }),
    call('cancelled', { status: 'Cancelado', openedAt: hoursAgo(20), executedAt: hoursAgo(1) }),
  ];
  const { closedSla } = summarizeOperationalTrends(calls, calls, {}, '2026-11-03', now);
  assert.deepEqual({ ...closedSla, mttrHours: undefined }, { onTime: 1, late: 1, outlier: 1, mttrHours: undefined });
  assert.equal(closedSla.mttrHours, 8);
});

test('daily series covers the last 14 days by default and buckets by Sao Paulo date', () => {
  const calls = [
    call('late-night', { openedAt: '2026-11-03T01:30:00.000Z', status: 'Finalizado', executedAt: '2026-11-03T13:00:00.000Z' }),
    call('outside', { openedAt: '2026-10-01T12:00:00.000Z' }),
  ];
  const { daily } = summarizeOperationalTrends(calls, calls, {}, '2026-11-03', now);
  assert.equal(daily.length, 14);
  assert.equal(daily[0].date, '2026-10-21');
  assert.deepEqual(daily.find((day) => day.date === '2026-11-02'), { date: '2026-11-02', opened: 1, finished: 0 });
  assert.deepEqual(daily.find((day) => day.date === '2026-11-03'), { date: '2026-11-03', opened: 0, finished: 1 });
});

test('long periods are capped at the last 31 days of the range', () => {
  const { daily } = summarizeOperationalTrends([], [], { from: '2026-08-01', to: '2026-10-31' }, '2026-11-03', now);
  assert.equal(daily.length, 31);
  assert.equal(daily[0].date, '2026-10-01');
  assert.equal(daily.at(-1)?.date, '2026-10-31');
});
