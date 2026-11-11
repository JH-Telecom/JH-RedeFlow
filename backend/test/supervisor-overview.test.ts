import assert from 'node:assert/strict';
import test from 'node:test';
import { supervisorOverview, weekStart } from '../src/supervisor-overview.js';
import type { Call } from '../src/types.js';

let seq = 0;
const call = (openedAt: string, extra: Partial<Call> = {}): Call => ({ id: `c${++seq}`, orderNumber: `${seq}`, bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region: 'GUARULHOS', city: '', olt: '', slotPon: '', status: 'Aberto', openedAt, notes: '', ...extra });

// "Agora": quarta 11/11/2026 10:00 em Sao Paulo.
const now = new Date('2026-11-11T13:00:00Z');

test('week starts on Monday', () => {
  assert.equal(weekStart('2026-11-11'), '2026-11-09');
  assert.equal(weekStart('2026-11-09'), '2026-11-09');
  assert.equal(weekStart('2026-11-15'), '2026-11-09');
});

test('counts incoming calls by month, week, area and hour; skips cancelled, counts GIGA+', () => {
  const calls = [
    call('2026-11-02T11:00:00Z'), // 02/11 08h, mes
    call('2026-11-09T13:30:00Z', { region: 'SAO PAULO' }), // 09/11 10h, semana
    call('2026-11-10T02:30:00Z'), // 09/11 23h30 em SP, semana
    call('2026-11-11T12:00:00Z', { status: 'Finalizado', executedAt: '2026-11-11T14:30:00Z' }), // hoje 09h, TME 2,5 h
    call('2026-11-10T12:00:00Z', { status: 'Cancelado' }),
    call('2026-11-10T12:00:00Z', { status: 'GIGA+' }), // 10/11 09h, semana (GIGA+ aberto)
    call('2026-11-10T13:00:00Z', { status: 'GIGA+', ofsStatus: 'Concluido', executedAt: '2026-11-10T17:00:00Z' }), // 10/11 10h, GIGA+ concluido: TME 4 h
    call('2026-10-31T12:00:00Z'), // outubro
  ];
  const result = supervisorOverview(calls, { from: '2026-11-01', to: '2026-11-30' }, now);
  assert.equal(result.month.entrantes, 6);
  assert.equal(result.month.perDay, 6 / 11);
  assert.equal(result.week.entrantes, 5);
  assert.equal(result.week.perDay, 5 / 3); // 5 em 3 dias (seg a qua)
  assert.equal(result.period.entrantes, 6);
  assert.equal(result.period.days, 11); // ate hoje, nao ate 30/11
  assert.equal(result.period.finalizados, 2); // o Finalizado e o GIGA+ concluido
  assert.equal(result.period.tmeHours, (2.5 + 4) / 2);
  assert.equal(result.byHour[8].entrantes, 1);
  assert.equal(result.byHour[23].entrantes, 1);
  assert.equal(result.byHour.reduce((sum, item) => sum + item.entrantes, 0), 6);
  assert.deepEqual(result.byRegion.map((row) => [row.region, row.entrantes]), [['GUARULHOS', 5], ['SAO PAULO', 1]]);
  assert.deepEqual(result.regions, ['GUARULHOS', 'SAO PAULO']);
  assert.equal(result.byDay.length, 11);
  assert.equal(result.byDay.find((day) => day.day === '2026-11-09')?.entrantes, 2);
});

test('region and type filters apply to every number; empty region goes last as SEM REGIÃO', () => {
  const calls = [call('2026-11-10T12:00:00Z', { region: 'SAO PAULO' }), call('2026-11-10T12:00:00Z', { type: 'NOC TX' }), call('2026-11-10T12:00:00Z'), call('2026-11-10T12:00:00Z', { region: 'Nao informada' }), call('2026-11-10T12:00:00Z', { region: 'Nao informada' })];
  assert.equal(supervisorOverview(calls, { from: '2026-11-01', to: '2026-11-30', region: 'guarulhos' }, now).month.entrantes, 2);
  const all = supervisorOverview(calls, { from: '2026-11-01', to: '2026-11-30' }, now);
  assert.deepEqual(all.byRegion.map((row) => row.region), ['GUARULHOS', 'SAO PAULO', 'SEM REGIÃO']);
  assert.ok(!all.regions.includes('SEM REGIÃO'));
  assert.equal(supervisorOverview(calls, { from: '2026-11-01', to: '2026-11-30', type: 'NOC TX' }, now).week.entrantes, 1);
  assert.deepEqual(supervisorOverview(calls, { from: '2026-11-01', to: '2026-11-30' }, now).types, ['NOC ACESSO', 'NOC TX']);
});
