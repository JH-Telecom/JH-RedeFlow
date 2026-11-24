import assert from 'node:assert/strict';
import test from 'node:test';
import { integrationOutage, outageText } from '../src/alerts.js';
import type { IntegrationEvent } from '../src/integration-health.js';

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
