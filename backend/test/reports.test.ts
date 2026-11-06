import assert from 'node:assert/strict';
import test from 'node:test';
import { lateFinishedCalls } from '../src/sla-analysis.js';
import type { Call } from '../src/types.js';

const base: Call = { id: 'x', orderNumber: '1', bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region: 'GUARULHOS 1', city: '', olt: '', slotPon: '', status: 'Finalizado', openedAt: '2026-11-03T10:00:00-03:00', executedAt: '2026-11-03T15:00:00-03:00', notes: '' };

test('late report: finished in the range by Data Fim, above 6h, worst first', () => {
  const calls: Call[] = [
    { ...base, id: 'on-time' }, // 5h
    { ...base, id: 'late', executedAt: '2026-11-03T17:30:00-03:00' }, // 7h30
    { ...base, id: 'outlier', executedAt: '2026-11-04T01:00:00-03:00' }, // 15h
    { ...base, id: 'exact-6h', executedAt: '2026-11-03T16:00:00-03:00' }, // 6h = no prazo
    { ...base, id: 'open', status: 'Atribuido', executedAt: '2026-11-04T01:00:00-03:00' },
    { ...base, id: 'outside', openedAt: '2026-10-01T00:00:00-03:00', executedAt: '2026-10-02T00:00:00-03:00' },
  ];
  const rows = lateFinishedCalls(calls, '2026-11-01', '2026-11-05');
  assert.deepEqual(rows.map((row) => [row.id, row.state, row.hours]), [['outlier', 'outlier', 15], ['late', 'late', 7.5]]);
});
