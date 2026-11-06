import assert from 'node:assert/strict';
import test from 'node:test';
import { healthChecks, stuckOfsCalls, type IntegrationEvent } from '../src/integration-health.js';
import { nearDeadlineCalls, whatsappAlertText } from '../src/sla-alerts.js';
import { whatsappConfig } from '../src/integrations/wuzapi/sender.js';
import type { Call } from '../src/types.js';

const now = Date.parse('2026-11-06T12:00:00-03:00');
const base: Call = { id: 'x', orderNumber: '12345678', bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region: 'GUARULHOS 1', city: '', olt: '', slotPon: '', status: 'Em campo', openedAt: '2026-11-06T08:00:00-03:00', notes: '' };

test('stuck OFS calls list what is missing for the automatic finish', () => {
  const calls: Call[] = [
    { ...base, id: 'no-tech', orderNumber: '11111111', ofsStatus: 'Concluído', executedAt: '2026-11-06T09:00:00-03:00', closingReason: 'Fibra rompida' },
    { ...base, id: 'no-closing', orderNumber: '22222222', ofsStatus: 'Concluído', executedAt: '2026-11-06T11:00:00-03:00', technicianId: 't1' },
    { ...base, id: 'code', orderNumber: '33333333', ofsStatus: 'Concluído', executedAt: '2026-11-06T11:30:00-03:00', technicianId: 't1', closingSubreason: '13' },
    { ...base, id: 'ready', orderNumber: '44444444', ofsStatus: 'Concluído', executedAt: '2026-11-06T11:50:00-03:00', technicianId: 't1', closingReason: 'Fibra rompida' },
    { ...base, id: 'dup-a', orderNumber: '55555555', ofsStatus: 'Concluído', technicianId: 't1', closingReason: 'X' },
    { ...base, id: 'dup-b', orderNumber: '55555555', status: 'Aberto' },
    { ...base, id: 'not-concluded', orderNumber: '66666666', ofsStatus: 'Iniciado' },
    { ...base, id: 'finished', orderNumber: '77777777', status: 'Finalizado', ofsStatus: 'Concluído' },
  ];
  const stuck = stuckOfsCalls(calls, now);
  const reasons = Object.fromEntries(stuck.map((call) => [call.id, call.reasons]));
  assert.deepEqual(Object.keys(reasons).sort(), ['code', 'dup-a', 'no-closing', 'no-tech', 'ready']);
  assert.deepEqual(reasons['no-tech'], ['sem-tecnico']);
  assert.deepEqual(reasons['no-closing'], ['sem-fechamento']);
  assert.deepEqual(reasons['code'], ['fechamento-codigo']);
  assert.deepEqual(reasons['ready'], ['pronto']);
  assert.deepEqual(reasons['dup-a'], ['ordem-duplicada', 'sem-data-fim']);
  assert.equal(stuck[0].id, 'dup-a', 'mais tempo esperando primeiro (sem Data Fim conta da abertura)');
  assert.equal(stuck.find((call) => call.id === 'no-tech')?.waitingMinutes, 180);
});

const event = (kind: IntegrationEvent['kind'], minutesAgo: number, ok = true, summary = 'ok'): IntegrationEvent => ({ id: `${kind}-${minutesAgo}`, kind, ok, summary, details: {}, createdAt: new Date(now - minutesAgo * 60_000).toISOString() });

test('health checks: fresh, late and failing parts of the OFS collection', () => {
  const checks = Object.fromEntries(healthChecks([event('export', 30), event('closing', 200), event('closing', 10, false, 'aba fixada fora do Console')], [], now).map((check) => [check.key, check]));
  assert.equal(checks.export.status, 'ok');
  assert.equal(checks.closing.status, 'critical', 'ultimo ciclo certo ha mais de 3h');
  assert.match(checks.closing.detail, /aba fixada fora do Console/);
  assert.equal(checks.cluster.status, 'unknown');
  assert.equal(checks.errors.status, 'warn');
  assert.equal(checks.stuck.status, 'ok');
  const recentFail = Object.fromEntries(healthChecks([event('export', 5, false, 'HTTP 500'), event('export', 20)], [], now).map((check) => [check.key, check]));
  assert.equal(recentFail.export.status, 'warn', 'certo ha pouco, mas a ultima tentativa falhou');
});

test('near-deadline calls and WhatsApp text', () => {
  const calls: Call[] = [
    { ...base, id: 'in-90', openedAt: new Date(now - 270 * 60_000).toISOString() }, // faltam 90 min
    { ...base, id: 'in-30', orderNumber: '999', openedAt: new Date(now - 330 * 60_000).toISOString(), technicianName: 'Ana' }, // faltam 30
    { ...base, id: 'late', openedAt: new Date(now - 400 * 60_000).toISOString() },
    { ...base, id: 'early', openedAt: new Date(now - 60 * 60_000).toISOString() },
    { ...base, id: 'done', status: 'Finalizado', openedAt: new Date(now - 330 * 60_000).toISOString() },
  ];
  assert.deepEqual(nearDeadlineCalls(calls, 120, now).map((call) => call.id), ['in-30', 'in-90']);
  const hour = nearDeadlineCalls(calls, 60, now);
  assert.deepEqual(hour.map((call) => call.id), ['in-30']);
  const text = whatsappAlertText(hour, 'https://app.exemplo/');
  assert.match(text, /999 — NOC ACESSO · GUARULHOS 1 · Ana · faltam 30 min/);
  assert.match(text, /https:\/\/app\.exemplo\/chamados\/atendimento$/);
  assert.doesNotMatch(text, /client/i);
});

test('WhatsApp sending stays off until the three variables are set', () => {
  assert.equal(whatsappConfig({}), null);
  assert.equal(whatsappConfig({ WUZAPI_API_URL: 'https://w', WUZAPI_USER_TOKEN: 't' }), null);
  assert.deepEqual(whatsappConfig({ WUZAPI_API_URL: 'https://w/', WUZAPI_USER_TOKEN: 't', WUZAPI_ALERT_CHAT: '1203@g.us' }), { url: 'https://w', token: 't', chat: '1203@g.us' });
});
