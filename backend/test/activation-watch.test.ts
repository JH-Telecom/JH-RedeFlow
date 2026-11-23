import assert from 'node:assert/strict';
import test from 'node:test';
import { cardsToRetry, RETRY_MAX_ATTEMPTS, whatsappSilence } from '../src/activation-watch.js';
import type { IntegrationEvent } from '../src/integration-health.js';

test('WhatsApp silence only counts in the daytime and after 45 minutes', () => {
  const noonSp = Date.parse('2026-11-23T15:00:00Z'); // 12:00 em Sao Paulo
  assert.equal(whatsappSilence(noonSp, noonSp - 44 * 60_000).silent, false);
  assert.equal(whatsappSilence(noonSp, noonSp - 46 * 60_000).silent, true);
  const nightSp = Date.parse('2026-11-23T05:00:00Z'); // 02:00 em Sao Paulo
  assert.equal(whatsappSilence(nightSp, nightSp - 300 * 60_000).silent, false);
});

test('failed cards are retried until one attempt works or the limit is reached', () => {
  const event = (id: string, kind: IntegrationEvent['kind'], ok: boolean, details: Record<string, unknown>): IntegrationEvent => ({ id, kind, ok, summary: '', details, createdAt: '2026-11-23T12:00:00Z' });
  const failed = event('f1', 'activation_failed', false, { text: 'CARD', source: 'g@g.us' });
  assert.deepEqual(cardsToRetry([failed]).map((card) => [card.failedId, card.attempts]), [['f1', 0]]);
  assert.equal(cardsToRetry([failed, event('r1', 'activation_retry', true, { failedId: 'f1' })]).length, 0);
  const tries = Array.from({ length: RETRY_MAX_ATTEMPTS }, (_, index) => event(`r${index}`, 'activation_retry', false, { failedId: 'f1' }));
  assert.equal(cardsToRetry([failed, ...tries]).length, 0);
  assert.equal(cardsToRetry([event('f2', 'activation_failed', false, {})]).length, 0);
});

test('quiet night does not raise the silence alert right at 7am', () => {
  const sevenTenSp = Date.parse('2026-11-23T10:10:00Z'); // 07:10 em Sao Paulo
  assert.equal(whatsappSilence(sevenTenSp, sevenTenSp - 8 * 3_600_000).silent, false);
  assert.equal(whatsappSilence(sevenTenSp + 40 * 60_000, sevenTenSp - 8 * 3_600_000).silent, true);
});

test('extension version per computer keeps the latest report of each person', async () => {
  const { extensionVersions } = await import('../src/integration-health.js');
  const event = (by: string, versao: string, createdAt: string): IntegrationEvent => ({ id: by + createdAt, kind: 'export', ok: true, summary: '', details: { by, versao }, createdAt });
  const result = extensionVersions([event('Ana', '1.9.5', '2026-11-23T10:00:00Z'), event('Ana', '1.14.0', '2026-11-23T11:00:00Z'), event('Pedro', '1.14.0', '2026-11-23T09:00:00Z'), { ...event('x', '', '2026-11-23T12:00:00Z') }]);
  assert.deepEqual(result.map((item) => [item.by, item.version]), [['Ana', '1.14.0'], ['Pedro', '1.14.0']]);
});
