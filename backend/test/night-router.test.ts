import assert from 'node:assert/strict';
import test from 'node:test';
import { isNightWindow, nightStartIso, nightWeekday, pickNightOrders, saoPauloClock, type NightRun, type NightRouterSettings, type NightShift } from '../src/night-router.js';
import { activationsToAutoAccept, MAX_AUTO_ACCEPTS_PER_SWEEP, sweepNightActivations } from '../src/night-auto-accept.js';
import { receiveActivation } from '../src/store.js';
import { calls as demoCalls } from '../src/store/demo-data.js';
import type { Activation, Call, Technician } from '../src/types.js';

// 2026-11-16 e segunda-feira. 03:00Z = 00:00 em Sao Paulo; 01:00Z = 22:00 do dia anterior.
const MONDAY_0130 = Date.parse('2026-11-16T04:30:00Z');
const tech = (id: string, name: string, extra: Partial<Technician> = {}): Technician => ({ id, name, registration: id, region: 'Leste', shift: '', currentStatus: 'Disponivel', active: true, teamRole: 'Tecnico', employmentStatus: 'Trabalhando', ...extra });
const call = (id: string, extra: Partial<Call> = {}): Call => ({ id, orderNumber: `6111293805${id.padStart(5, '0')}`, bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region: 'Leste', city: '', olt: '', slotPon: '', status: 'Aberto', openedAt: '2026-11-15T22:00:00-03:00', notes: '', ofsStatus: 'pendente', ...extra });
const technicians = [tech('t1', 'Andre Costa', { active: false }), tech('t2', 'Pedro Santos', { region: 'Sul' }), tech('t3', 'Demitido Silva', { employmentStatus: 'Demitido' })];
const shifts: NightShift[] = [{ region: 'Leste', weekday: 1, technicianId: 't1' }, { region: 'sul', weekday: 1, technicianId: 't2' }, { region: 'Norte', weekday: 1, technicianId: 't3' }, { region: 'Leste', weekday: 2, technicianId: 't2' }];

test('night window is 22:00-05:59 in Sao Paulo, crossing midnight', () => {
  assert.equal(isNightWindow(Date.parse('2026-11-17T00:59:00Z')), false); // seg 21:59
  assert.equal(isNightWindow(Date.parse('2026-11-17T01:00:00Z')), true); // seg 22:00
  assert.equal(isNightWindow(Date.parse('2026-11-17T02:30:00Z')), true); // seg 23:30
  assert.equal(isNightWindow(Date.parse('2026-11-17T06:00:00Z')), true); // ter 03:00
  assert.equal(isNightWindow(Date.parse('2026-11-17T08:59:00Z')), true); // ter 05:59
  assert.equal(isNightWindow(Date.parse('2026-11-17T09:00:00Z')), false); // ter 06:00
  assert.equal(isNightWindow(Date.parse('2026-11-17T15:00:00Z')), false); // ter 12:00
  assert.deepEqual(saoPauloClock(MONDAY_0130), { hour: 1, weekday: 1 });
  // Inicio da madrugada atual: 22:00 de hoje (antes da meia-noite) ou de ontem (depois).
  assert.equal(nightStartIso(Date.parse('2026-11-17T01:00:00Z')), '2026-11-17T01:00:00.000Z');
  assert.equal(nightStartIso(Date.parse('2026-11-17T02:30:00Z')), '2026-11-17T01:00:00.000Z');
  assert.equal(nightStartIso(Date.parse('2026-11-17T06:00:00Z')), '2026-11-17T01:00:00.000Z');
  assert.equal(nightStartIso(MONDAY_0130), '2026-11-16T01:00:00.000Z');
  // Fora da janela: a ultima madrugada que comecou (22:00 de ontem).
  assert.equal(nightStartIso(Date.parse('2026-11-17T15:00:00Z')), '2026-11-17T01:00:00.000Z');
});

test('22:00-23:59 counts as the night of the next morning (same weekday as 00h-06h)', () => {
  assert.equal(nightWeekday(Date.parse('2026-11-17T01:00:00Z')), 2); // seg 22:00 -> madrugada de terca
  assert.equal(nightWeekday(Date.parse('2026-11-17T02:59:00Z')), 2); // seg 23:59 -> terca
  assert.equal(nightWeekday(Date.parse('2026-11-17T06:00:00Z')), 2); // ter 03:00 -> terca
  assert.equal(nightWeekday(Date.parse('2026-11-22T01:30:00Z')), 0); // sab 22:30 -> domingo
  const monday2230 = Date.parse('2026-11-17T01:30:00Z');
  const orders = pickNightOrders([call('1', { openedAt: '2026-11-16T22:10:00-03:00' })], shifts, technicians, [], monday2230);
  assert.deepEqual(orders.map((order) => order.tecnico), ['Pedro Santos']); // escala de terca (Leste -> t2)
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
  assert.deepEqual(pickNightOrders([call('1', { openedAt: '2026-11-16T23:00:00-03:00' })], shifts, technicians, [], tuesday).map((order) => order.tecnico), ['Pedro Santos']);
  const run = (callId: string, result: NightRun['result']): NightRun => ({ id: callId + result + Math.random(), callId, orderNumber: '', region: '', technicianId: 't1', technicianName: '', result, message: '', testMode: false, createdAt: '' });
  const calls = [call('1'), call('2'), call('3'), call('4')];
  const runs = [run('1', 'Movida'), run('2', 'Erro'), run('2', 'Erro'), run('3', 'Erro'), run('4', 'Pulada')];
  assert.deepEqual(pickNightOrders(calls, shifts, technicians, runs, MONDAY_0130).map((order) => order.callId), ['3']);
  assert.deepEqual(pickNightOrders(calls, [], technicians, [], MONDAY_0130), []);
});

test('only calls opened since 22:00 of the current night are routed', () => {
  const monday2330 = Date.parse('2026-11-17T02:30:00Z');
  const calls = [call('1', { openedAt: '2026-11-16T21:30:00-03:00' }), call('2', { openedAt: '2026-11-16T22:10:00-03:00' }), call('3', { openedAt: '2026-11-16T22:00:00-03:00' }), call('4', { openedAt: '' })];
  assert.deepEqual(pickNightOrders(calls, shifts, technicians, [], monday2330).map((order) => order.callId), ['3', '2']);
  // Mesmo filtro no modo tecnico unico.
  assert.deepEqual(pickNightOrders(calls, [], technicians, [], monday2330, false, 't2').map((order) => order.callId), ['3', '2']);
});

test('single technician gets every eligible call of every region and type, ignoring the scale', () => {
  const calls = [
    call('1', { region: 'Leste', type: 'NOC ACESSO' }),
    call('2', { region: 'Oeste', type: 'NOC TX' }),
    call('3', { region: 'Nao informada', type: 'Backbone' }),
    call('4', { region: 'Norte', type: 'ACIONAMENTO FIELD' }),
    call('5', { region: 'Sul', type: 'NOC ACESSO', technicianId: 't1', status: 'Atribuido' }),
    call('6', { ofsStatus: 'Iniciado' }),
  ];
  const orders = pickNightOrders(calls, [], technicians, [], MONDAY_0130, false, 't2');
  assert.deepEqual(orders.map((order) => [order.callId, order.tecnicoId, order.tecnico]), [['1', 't2', 'Pedro Santos'], ['2', 't2', 'Pedro Santos'], ['3', 't2', 'Pedro Santos'], ['4', 't2', 'Pedro Santos']]);
  // Com escala tambem: o tecnico unico manda.
  assert.ok(pickNightOrders(calls, shifts, technicians, [], MONDAY_0130, false, 't2').every((order) => order.tecnicoId === 't2'));
  // Limite por ciclo continua.
  const many = Array.from({ length: 15 }, (_, index) => call(String(index + 1)));
  assert.equal(pickNightOrders(many, [], technicians, [], MONDAY_0130, false, 't2').length, 10);
});

test('invalid, fired or non-technician single technician falls back to the regional scale', () => {
  const extra = [...technicians, tech('s1', 'Auxiliar Souza', { teamRole: 'Auxiliar' })];
  const calls = [call('1'), call('2', { region: 'Sul' }), call('3', { region: 'Oeste' })];
  for (const id of ['nao-existe', 't3', 's1', '', null]) {
    assert.deepEqual(pickNightOrders(calls, shifts, extra, [], MONDAY_0130, false, id).map((order) => [order.callId, order.tecnico]), [['1', 'Andre Costa'], ['2', 'Pedro Santos']], String(id));
  }
});

// Aceite automatico dos acionamentos da madrugada.
const settings = (extra: Partial<NightRouterSettings> = {}): NightRouterSettings => ({ enabled: true, testMode: false, singleTechnicianId: null, updatedAt: null, updatedBy: null, ...extra });
const activation = (id: string, receivedAt: string, extra: Partial<Activation> = {}): Activation => ({ id, source: 'wuzapi', originalMessage: id, receivedAt, status: 'Pendente', extractedData: {}, ...extra });
const MONDAY_2330 = Date.parse('2026-11-17T02:30:00Z');
const list = [
  activation('antes', '2026-11-16T21:30:00-03:00'),
  activation('dentro-2', '2026-11-16T23:10:00-03:00'),
  activation('dentro-1', '2026-11-16T22:05:00-03:00'),
  activation('aceito', '2026-11-16T22:30:00-03:00', { status: 'Aceito' }),
  activation('recusado', '2026-11-16T22:40:00-03:00', { status: 'Recusado' }),
  activation('processando', '2026-11-16T22:50:00-03:00', { status: 'Processando' }),
];

test('auto-accept picks only pending activations received inside the current night window, oldest first', () => {
  assert.deepEqual(activationsToAutoAccept(list, MONDAY_2330).map((item) => item.id), ['dentro-1', 'dentro-2']);
  assert.deepEqual(activationsToAutoAccept(list, Date.parse('2026-11-17T00:59:00Z')), []); // 21:59: fora da janela
  assert.deepEqual(activationsToAutoAccept(list, Date.parse('2026-11-17T09:00:00Z')), []); // 06:00: fora da janela
});

test('auto-accept sweep accepts in production mode, only counts in test mode, and respects the switches and the cap', async () => {
  const decided: string[] = [];
  const deps = { list: async () => list, decide: async (id: string) => { decided.push(id); return { activation: { ...list.find((item) => item.id === id)!, status: 'Aceito' as const }, call: call(id) }; }, record: async () => {} };
  const real = await sweepNightActivations(settings(), MONDAY_2330, deps);
  assert.deepEqual(decided, ['dentro-1', 'dentro-2']);
  assert.equal(real.aceitos, 2);
  assert.equal(real.aceitariamos, 0);

  decided.length = 0;
  const dryRun = await sweepNightActivations(settings({ testMode: true }), MONDAY_2330, deps);
  assert.deepEqual(decided, []);
  assert.equal(dryRun.aceitos, 0);
  assert.equal(dryRun.aceitariamos, 2);

  assert.equal((await sweepNightActivations(settings({ enabled: false }), MONDAY_2330, deps)).aceitariamos, 0);
  assert.equal((await sweepNightActivations(settings(), Date.parse('2026-11-17T00:59:00Z'), deps)).aceitos, 0);
  assert.deepEqual(decided, []);

  const lots = Array.from({ length: MAX_AUTO_ACCEPTS_PER_SWEEP + 5 }, (_, index) => activation(`a${index}`, '2026-11-16T22:30:00-03:00'));
  const capped = await sweepNightActivations(settings(), MONDAY_2330, { ...deps, list: async () => lots });
  assert.equal(capped.aceitos, MAX_AUTO_ACCEPTS_PER_SWEEP);
  assert.equal(capped.restantes, 5);
});

test('auto-accept sweep keeps going when one accept fails and records a summary', async () => {
  const events: Array<{ ok: boolean; summary: string }> = [];
  const deps = {
    list: async () => list,
    decide: async (id: string) => { if (id === 'dentro-1') throw new Error('falhou'); return { activation: { ...list.find((item) => item.id === id)!, status: 'Aceito' as const }, call: call(id) }; },
    record: async (ok: boolean, summary: string) => { events.push({ ok, summary }); },
  };
  const result = await sweepNightActivations(settings(), MONDAY_2330, deps);
  assert.equal(result.aceitos, 1);
  assert.equal(result.erros, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].ok, false);
  assert.match(events[0].summary, /1 aceito/);
});

test('auto-accept of a duplicate card links it to the existing call (demo store)', async () => {
  const previous = { runtime: process.env.REDEFLOW_RUNTIME, demo: process.env.REDEFLOW_DEMO_DATA, url: process.env.SUPABASE_URL };
  try {
    process.env.REDEFLOW_RUNTIME = 'local';
    process.env.REDEFLOW_DEMO_DATA = 'true';
    process.env.SUPABASE_URL = '';
    const existing: Call = call('dup-existing', { id: 'call-dup-existing', orderNumber: '619880000077701', officeTrack: '619880000077701', openedAt: '2030-03-04T20:00:00-03:00' });
    demoCalls.set(existing.id, existing);
    const created = await receiveActivation({ source: 'test', originalMessage: 'card duplicado 619880000077701', extractedData: { orderNumber: '619880000077701', officeTrack: '619880000077701' } });
    created.receivedAt = '2030-03-04T22:15:00-03:00';
    const fresh = await receiveActivation({ source: 'test', originalMessage: 'card novo 619880000077702', extractedData: { orderNumber: '619880000077702', officeTrack: '619880000077702' } });
    fresh.receivedAt = '2030-03-04T22:20:00-03:00';
    const early = await receiveActivation({ source: 'test', originalMessage: 'card cedo 619880000077703', extractedData: { orderNumber: '619880000077703', officeTrack: '619880000077703' } });
    early.receivedAt = '2030-03-04T21:50:00-03:00';
    const result = await sweepNightActivations(settings(), Date.parse('2030-03-05T02:30:00Z'), { record: async () => {} });
    assert.equal(result.aceitos, 2);
    assert.equal(created.status, 'Aceito');
    assert.equal(created.createdCallId, existing.id);
    assert.equal(created.decisionBy, 'system-night-router');
    assert.equal(fresh.status, 'Aceito');
    assert.ok(fresh.createdCallId && fresh.createdCallId !== existing.id);
    assert.equal(demoCalls.get(fresh.createdCallId!)?.openedAt, fresh.receivedAt);
    assert.match(demoCalls.get(fresh.createdCallId!)?.notes ?? '', /Aceito automaticamente pelo Roteirizador da madrugada/);
    assert.doesNotMatch(existing.notes, /Roteirizador/);
    assert.equal(early.status, 'Pendente');
  } finally {
    if (previous.runtime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previous.runtime;
    if (previous.demo === undefined) delete process.env.REDEFLOW_DEMO_DATA; else process.env.REDEFLOW_DEMO_DATA = previous.demo;
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
  }
});
