import assert from 'node:assert/strict';
import test from 'node:test';
import { bottleneckReport, heatmapReport } from '../src/reports.js';
import type { Call } from '../src/types.js';

const base: Call = { id: 'x', orderNumber: '1', bdesk: '', officeTrack: '', client: '', type: 'NOC', reason: '', region: 'GUARULHOS 1', city: '', olt: '', slotPon: '', status: 'Finalizado', openedAt: '2026-11-03T08:00:00-03:00', notes: '' };
const call = (id: string, waitMin: number, execMin: number, extra: Partial<Call> = {}): Call => {
  const opened = Date.parse(extra.openedAt ?? base.openedAt);
  return { ...base, id, openedAt: new Date(opened).toISOString(), assignedAt: new Date(opened + waitMin * 60_000).toISOString(), executedAt: new Date(opened + (waitMin + execMin) * 60_000).toISOString(), technicianId: 't1', technicianName: 'Ana', ...extra };
};

test('bottlenecks: waiting for a technician versus service time', () => {
  const calls = [
    call('a', 10, 120),
    call('b', 30, 180),
    call('c', 300, 120), // 7h total, 5h esperando tecnico
    call('d', 20, 500, { region: 'SAO PAULO', technicianName: 'Bia', technicianId: 't2' }),
    { ...base, id: 'no-assign', executedAt: '2026-11-03T10:00:00-03:00' },
    call('bad', 10, 10, { assignedAt: '2026-11-04T08:00:00-03:00' }), // atribuicao depois do fim: fora
  ];
  const report = bottleneckReport(calls, '2026-11-01', '2026-11-05');
  assert.equal(report.total.calls, 4);
  assert.equal(report.total.waitMedian, 25);
  assert.equal(report.total.late, 2);
  assert.equal(report.total.lateByWait, 1);
  assert.deepEqual(report.byRegion.map((row) => row.name), ['GUARULHOS 1'], 'grupo com menos de 3 fica de fora');
  assert.equal(report.byRegion[0].waitMedian, 30);
});

test('heatmap by weekday and hour, averaged per day of the period', () => {
  // 03/11/2026 e terca (2). Periodo 02 a 08/11 tem uma terca.
  const calls = [
    call('a', 10, 50, { openedAt: '2026-11-03T08:10:00-03:00' }),
    call('b', 10, 50, { openedAt: '2026-11-03T08:40:00-03:00', technicianId: 't2' }),
    call('c', 10, 400, { openedAt: '2026-11-03T08:50:00-03:00' }),
    { ...base, id: 'cancel', status: 'Cancelado' as const, openedAt: '2026-11-03T08:30:00-03:00' },
  ];
  const map = heatmapReport(calls, '2026-11-02', '2026-11-08');
  assert.equal(map.incoming[2][8], 3, 'cancelado nao entra');
  assert.equal(map.totalIncoming, 3);
  assert.equal(map.technicians[2][9], 2, 'dois tecnicos finalizaram as 9h');
  assert.equal(map.latePercent[2][8], 33.3);
  assert.equal(map.latePercent[2][9], null, 'menos de 3: sem %');
  assert.equal(map.weekdayCount.reduce((a: number, b: number) => a + b, 0), 7);
});

test('repeat ranking: the fix did not hold when the same point opens again within 30 days of the end', async () => {
  const { repeatRanking } = await import('../src/reports.js');
  const point = { address: 'RUA A, 1', olt: 'OLT-1', slotPon: '1/1' };
  const calls: Call[] = [
    { ...base, ...point, id: 'f1', technicianName: 'Ana', openedAt: '2026-11-01T08:00:00-03:00', executedAt: '2026-11-01T10:00:00-03:00' },
    { ...base, ...point, id: 'back', status: 'Aberto', openedAt: '2026-11-10T08:00:00-03:00' }, // voltou em 9 dias
    { ...base, address: 'RUA B, 2', olt: 'OLT-1', slotPon: '1/2', id: 'f2', technicianName: 'Ana', openedAt: '2026-11-02T08:00:00-03:00', executedAt: '2026-11-02T10:00:00-03:00' },
    { ...base, address: 'S/N', olt: 'OLT-1', slotPon: '1/3', id: 'f3', technicianName: 'Ana', openedAt: '2026-11-02T08:00:00-03:00', executedAt: '2026-11-02T10:00:00-03:00' },
    { ...base, address: 'RUA C, 3', olt: 'OLT-2', slotPon: '2/1', id: 'f4', technicianName: 'Bia', openedAt: '2026-11-03T08:00:00-03:00', executedAt: '2026-11-03T10:00:00-03:00' },
    { ...base, address: 'RUA C, 3', olt: 'OLT-2', slotPon: '2/1', id: 'late-back', status: 'Aberto', openedAt: '2026-12-20T08:00:00-03:00' }, // 47 dias depois: nao conta
  ];
  const report = repeatRanking(calls, '2026-11-01', '2026-11-05');
  const ana = report.technicians.find((row) => row.name === 'Ana')!;
  assert.deepEqual({ finished: ana.finished, eligible: ana.eligible, repeated: ana.repeated, percent: ana.percent }, { finished: 3, eligible: 2, repeated: 1, percent: 50 });
  assert.deepEqual(ana.items[0], { orderNumber: '1', id: 'f1', nextOrder: '1', nextId: 'back', days: 8.9 });
  assert.equal(report.technicians.find((row) => row.name === 'Bia')!.repeated, 0);
});
