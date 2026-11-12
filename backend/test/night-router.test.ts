import assert from 'node:assert/strict';
import test from 'node:test';
import { isNightWindow, nightStartIso, pickNightOrders, saoPauloClock, type NightRun, type NightShift } from '../src/night-router.js';
import type { Call, Technician } from '../src/types.js';

// 2026-11-16 e segunda-feira. 03:00Z = 00:00 em Sao Paulo.
const MONDAY_0130 = Date.parse('2026-11-16T04:30:00Z');
const tech = (id: string, name: string, extra: Partial<Technician> = {}): Technician => ({ id, name, registration: id, region: 'Leste', shift: '', currentStatus: 'Disponivel', active: true, teamRole: 'Tecnico', employmentStatus: 'Trabalhando', ...extra });
const call = (id: string, extra: Partial<Call> = {}): Call => ({ id, orderNumber: `6111293805${id.padStart(5, '0')}`, bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region: 'Leste', city: '', olt: '', slotPon: '', status: 'Aberto', openedAt: '2026-11-15T22:00:00-03:00', notes: '', ofsStatus: 'pendente', ...extra });
const technicians = [tech('t1', 'Andre Costa', { active: false }), tech('t2', 'Pedro Santos', { region: 'Sul' }), tech('t3', 'Demitido Silva', { employmentStatus: 'Demitido' })];
const shifts: NightShift[] = [{ region: 'Leste', weekday: 1, technicianId: 't1' }, { region: 'sul', weekday: 1, technicianId: 't2' }, { region: 'Norte', weekday: 1, technicianId: 't3' }, { region: 'Leste', weekday: 2, technicianId: 't2' }];

test('night window is 00:00-05:59 in Sao Paulo', () => {
  assert.equal(isNightWindow(Date.parse('2026-11-16T03:00:00Z')), true);
  assert.equal(isNightWindow(Date.parse('2026-11-16T08:59:00Z')), true);
  assert.equal(isNightWindow(Date.parse('2026-11-16T09:00:00Z')), false);
  assert.equal(isNightWindow(Date.parse('2026-11-16T02:59:00Z')), false);
  assert.deepEqual(saoPauloClock(MONDAY_0130), { hour: 1, weekday: 1 });
  assert.equal(nightStartIso(MONDAY_0130), '2026-11-16T03:00:00.000Z');
});

test('picks open calls without technician for the on-duty technician of the region', () => {
  const calls = [
    call('1'),
    call('2', { region: 'Sul' }),
    call('3', { technicianId: 't1', status: 'Atribuido' }),
    call('4', { ofsStatus: 'iniciado' }),
    call('5', { status: 'GIGA+' }),
    call('6', { region: 'Norte' }),
    call('7', { region: 'Oeste' }),
    call('8', { status: 'Finalizado' }),
    call('9', { ofsStatus: 'Pendente' }),
  ];
  const orders = pickNightOrders(calls, shifts, technicians, [], MONDAY_0130);
  assert.deepEqual(orders.map((order) => [order.callId, order.tecnico]), [['1', 'Andre Costa'], ['2', 'Pedro Santos'], ['9', 'Andre Costa']]);
  assert.equal(orders[0].os, '611129380500001');
});

test('uses the weekday of the night and skips calls already handled tonight', () => {
  const tuesday = Date.parse('2026-11-17T04:30:00Z');
  assert.deepEqual(pickNightOrders([call('1')], shifts, technicians, [], tuesday).map((order) => order.tecnico), ['Pedro Santos']);
  const run = (callId: string, result: NightRun['result']): NightRun => ({ id: callId + result + Math.random(), callId, orderNumber: '', region: '', technicianId: 't1', technicianName: '', result, message: '', testMode: false, createdAt: '' });
  const calls = [call('1'), call('2'), call('3'), call('4')];
  const runs = [run('1', 'Movida'), run('2', 'Erro'), run('2', 'Erro'), run('3', 'Erro'), run('4', 'Pulada')];
  assert.deepEqual(pickNightOrders(calls, shifts, technicians, runs, MONDAY_0130).map((order) => order.callId), ['3']);
  assert.deepEqual(pickNightOrders(calls, [], technicians, [], MONDAY_0130), []);
});
