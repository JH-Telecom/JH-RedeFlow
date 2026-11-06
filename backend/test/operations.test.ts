import assert from 'node:assert/strict';
import test from 'node:test';
import { queueMap, queueState, repeatFlags, repeatHistory, technicianLoad } from '../src/operations.js';
import type { Call, Technician } from '../src/types.js';

const now = Date.parse('2026-11-06T15:00:00-03:00');
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const base: Call = { id: 'x', orderNumber: '1', bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region: 'GUARULHOS 1', bairro: 'Centro', city: '', olt: 'OLT-1', slotPon: '1/2', address: 'RUA A, 10', status: 'Em campo', openedAt: ago(60), notes: '' };

test('queue state by time left in the 6h deadline', () => {
  assert.equal(queueState({ ...base, openedAt: ago(60) }, now), 'ok');
  assert.equal(queueState({ ...base, openedAt: ago(250) }, now), 'soon');
  assert.equal(queueState({ ...base, openedAt: ago(400) }, now), 'late');
  assert.equal(queueState({ ...base, openedAt: ago(600) }, now), 'outlier');
});

test('repeat calls: same address + OLT + slot/PON within 30 days', () => {
  const calls: Call[] = [
    { ...base, id: 'old', status: 'Finalizado', openedAt: '2026-10-20T10:00:00-03:00', executedAt: '2026-10-20T12:00:00-03:00', result: 'Fibra emendada' },
    { ...base, id: 'very-old', status: 'Finalizado', openedAt: '2026-08-01T10:00:00-03:00' },
    { ...base, id: 'cancelled', status: 'Cancelado', openedAt: '2026-11-01T10:00:00-03:00' },
    { ...base, id: 'now', openedAt: ago(30) },
    { ...base, id: 'other-pon', slotPon: '1/3', openedAt: ago(30) },
    { ...base, id: 'no-address', address: 'S/N', openedAt: ago(30) },
  ];
  const result = repeatHistory(calls.find((call) => call.id === 'now')!, calls);
  assert.equal(result.isRepeat, true);
  assert.equal(result.previousWithin30Days, 1);
  assert.deepEqual(result.history.map((item) => item.id), ['old', 'very-old'], 'cancelado fora, mais recente primeiro');
  assert.equal(repeatHistory(calls.find((call) => call.id === 'other-pon')!, calls).isRepeat, false);
  assert.equal(repeatHistory(calls.find((call) => call.id === 'no-address')!, calls).eligible, false);
  assert.deepEqual(repeatFlags(['now', 'other-pon', 'old'], calls), { now: 1 });
});

test('queue map groups active calls by region and neighborhood, worst first', () => {
  const calls: Call[] = [
    { ...base, id: 'a', openedAt: ago(60) },
    { ...base, id: 'b', bairro: 'Vila Nova', openedAt: ago(600), technicianId: undefined },
    { ...base, id: 'c', region: 'SAO PAULO 2', bairro: 'Mooca', openedAt: ago(30), technicianId: 't1' },
    { ...base, id: 'd', status: 'Finalizado' },
  ];
  const map = queueMap(calls, now);
  assert.equal(map.total, 3);
  assert.deepEqual(map.states, { ok: 2, soon: 0, late: 0, outlier: 1 });
  assert.equal(map.regions[0].name, 'GUARULHOS 1');
  assert.equal(map.regions[0].worst, 'outlier');
  assert.deepEqual(map.regions[0].bairros.map((item) => item.name), ['Vila Nova', 'Centro']);
  assert.equal(map.regions[0].bairros[0].calls[0].id, 'b');
});

test('technician load: free first, then lighter; counts today finished', () => {
  const tech = (id: string, name: string): Technician => ({ id, name, registration: '', region: '', shift: '', currentStatus: 'Disponivel', active: true, teamRole: 'Tecnico' });
  const technicians = [tech('t1', 'Ana'), tech('t2', 'Bia'), tech('t3', 'Caio'), { ...tech('t4', 'Aux'), teamRole: 'Auxiliar' as const }];
  const calls: Call[] = [
    { ...base, id: '1', technicianId: 't1', openedAt: ago(100) },
    { ...base, id: '2', technicianId: 't1', openedAt: ago(500) },
    { ...base, id: '3', technicianId: 't2', openedAt: ago(30) },
    { ...base, id: '4', technicianId: 't3', status: 'Finalizado', openedAt: ago(300), executedAt: ago(60) },
    { ...base, id: '5', openedAt: ago(10) },
  ];
  const load = technicianLoad(technicians, calls, now);
  assert.deepEqual(load.technicians.map((row) => row.name), ['Caio', 'Bia', 'Ana']);
  assert.equal(load.free, 1);
  assert.equal(load.unassignedActive, 1);
  const ana = load.technicians.find((row) => row.name === 'Ana')!;
  assert.equal(ana.active, 2);
  assert.equal(ana.worst, 'late');
  assert.equal(ana.oldestMinutes, 500);
  const caio = load.technicians.find((row) => row.name === 'Caio')!;
  assert.equal(caio.finishedToday, 1);
  assert.equal(caio.onTimeToday, 1);
  assert.equal(caio.avgHoursToday, 4);
});
