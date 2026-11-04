import assert from 'node:assert/strict';
import test from 'node:test';
import { dueSoonCalls } from '../src/due-soon.js';
import type { Call } from '../src/types.js';

const now = Date.UTC(2026, 10, 4, 18, 0, 0);
const call = (id: string, minutesAgo: number, status: Call['status'] = 'Aberto') =>
  ({ id, orderNumber: id, type: 'NOC ACESSO', region: 'SUZANO', status, openedAt: new Date(now - minutesAgo * 60_000).toISOString() }) as Call;

test('lists active calls that break the 6h deadline within 30 minutes, closest first', () => {
  const result = dueSoonCalls([
    call('a', 335), // faltam 25 min
    call('b', 355, 'Em campo'), // faltam 5 min
    call('c', 300), // faltam 60 min: fora da janela
    call('d', 400), // ja estourou
    call('e', 350, 'Finalizado'), // fechado: ignora
  ], now);
  assert.deepEqual(result.dueSoon.map((item) => [item.id, item.minutesLeft]), [['b', 5], ['a', 25]]);
  assert.equal(result.late, 1);
  assert.equal(result.windowMinutes, 30);
});
