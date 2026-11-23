import assert from 'node:assert/strict';
import test from 'node:test';
import { cardMissing, cardPreview, summarizeCards } from '../src/activation-summary.js';
import type { IntegrationEvent } from '../src/integration-health.js';

test('card summary counts today and lists cards read without OS or OLT', () => {
  const now = new Date('2026-11-23T15:00:00Z');
  const cards = [
    { id: 'a', status: 'Aceito', receivedAt: '2026-11-23T12:00:00Z', extracted: { orderNumber: '1', _analysis: { olt: 'VIP-1', tipo_card: 'ACESSO', regiao_ia: { regiao: 'SUZANO' } } } },
    { id: 'b', status: 'Pendente', receivedAt: '2026-11-23T13:00:00Z', extracted: { type: 'NOC TX', _analysis: { tipo_card: 'TX' } } },
    { id: 'c', status: 'Recusado', receivedAt: '2026-11-23T14:00:00Z', extracted: {} },
    { id: 'd', status: 'Aceito', receivedAt: '2026-11-20T14:00:00Z', extracted: { orderNumber: '9', _analysis: { tipo_card: 'FIELD' } } },
  ];
  const blocked: IntegrationEvent[] = [{ id: 'e', kind: 'card_blocked', ok: true, summary: '', details: { reason: 'same_call' }, createdAt: '2026-11-23T13:30:00Z' }];
  const summary = summarizeCards(cards, blocked, now);
  assert.deepEqual([summary.today.received, summary.today.accepted, summary.today.pending, summary.today.refused, summary.today.blocked, summary.today.blockedSameCall, summary.today.aiRegion], [3, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(summary.problems.map((problem) => [problem.id, problem.missing.join(',')]), [['b', 'OS'], ['d', 'OLT']]);
  assert.deepEqual(cardMissing({ _analysis: { tipo_card: 'TX' } }).missing, ['OS']);
  assert.equal(cardPreview('⚠️VALIDAR COM NOC TX⚠️\n \n- TICKET: 1\n- OS: 2'), 'VALIDAR COM NOC TX · - TICKET: 1 · - OS: 2');
});
