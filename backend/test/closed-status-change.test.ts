import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareCallUpdate } from '../src/store/calls.js';
import type { Call } from '../src/types.js';

const closed = { id: 'c1', orderNumber: '610150206690102', status: 'Baixar', olt: 'VIP-SZN-SPO-OHW-02', region: 'SUZANO', openedAt: '2026-11-04T14:05:00.000Z', executedAt: '2026-11-04T15:17:00.000Z' } as Call;

test('closed call: Baixar -> Finalizado keeps the original end date', () => {
  const update = prepareCallUpdate(closed, { status: 'Finalizado' });
  assert.equal(update.status, 'Finalizado');
  assert.equal(update.executedAt, '2026-11-04T15:17:00.000Z');
});

test('closed call reopened to an active status clears the end date', () => {
  const update = prepareCallUpdate(closed, { status: 'Aberto' });
  assert.equal(update.executedAt, null);
});

test('active call keeps executedAt untouched when nothing closes it', () => {
  const update = prepareCallUpdate({ ...closed, status: 'Aberto', executedAt: undefined }, { notes: 'x' });
  assert.equal(update.executedAt, undefined);
});
