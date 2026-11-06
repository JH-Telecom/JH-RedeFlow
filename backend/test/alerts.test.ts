import assert from 'node:assert/strict';
import test from 'node:test';
import { escalations, escalationText, integrationOutage, outageText } from '../src/alerts.js';
import type { IntegrationEvent } from '../src/integration-health.js';
import type { Call } from '../src/types.js';

const now = Date.parse('2026-11-06T15:00:00-03:00');
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const event = (kind: IntegrationEvent['kind'], minutes: number, ok = true): IntegrationEvent => ({ id: `${kind}${minutes}`, kind, ok, summary: '', details: {}, createdAt: ago(minutes) });

test('integration outage: more than 2h without a good export or closing cycle', () => {
  assert.deepEqual(integrationOutage([], now).known, false);
  assert.equal(integrationOutage([event('export', 30)], now).down, false);
  assert.equal(integrationOutage([event('export', 150), event('closing', 10, false)], now).down, true);
  assert.equal(integrationOutage([event('closing', 200, false)], now).down, true, 'so falhas: parada');
  assert.equal(integrationOutage([event('cluster', 5)], now).known, false, 'cluster sozinho nao conta');
  assert.match(outageText(integrationOutage([event('export', 150)], now)), /há 2h30 sem enviar/);
});

const base: Call = { id: 'x', orderNumber: '1', bdesk: '', officeTrack: '', client: '', type: '', reason: '', region: 'Leste', city: '', olt: '', slotPon: '', status: 'Aberto', openedAt: ago(60), notes: '' };

test('escalations: no technician after 5h, no observation for 2h', () => {
  const calls: Call[] = [
    { ...base, id: 'fresh' },
    { ...base, id: 'no-tech', openedAt: ago(320) },
    { ...base, id: 'quiet', status: 'Em campo', technicianId: 't', technicianName: 'Ana', openedAt: ago(400), assignedAt: ago(300), lastObservationAt: ago(150) },
    { ...base, id: 'talking', status: 'Em campo', technicianId: 't', openedAt: ago(400), lastObservationAt: ago(30) },
    { ...base, id: 'just-assigned', status: 'Atribuido', technicianId: 't', openedAt: ago(400), assignedAt: ago(20) },
    { ...base, id: 'done', status: 'Finalizado', technicianId: 't', openedAt: ago(900) },
  ];
  const result = escalations(calls, now);
  assert.deepEqual(result.map((item) => [item.callId, item.rule]), [['no-tech', 'sem-tecnico'], ['quiet', 'sem-observacao']]);
  assert.equal(result.find((item) => item.callId === 'quiet')!.minutes, 150);
  assert.match(escalationText(result), /sem técnico há mais de 5h \(5h20\) · Leste/);
});
