import assert from 'node:assert/strict';
import test from 'node:test';
import { CALL_VIEW_WINDOW_MS, callViewersOf, lastCallSave, leaveCall, markCallSaved, touchCallViewer } from '../src/presence.js';

test('call presence: others viewing, editing flag, expiry, leave and last save', () => {
  const now = Date.parse('2026-11-18T10:00:00-03:00');
  touchCallViewer('c1', 'u1', 'Matheus', false, now);
  touchCallViewer('c1', 'u2', 'Joao', true, now + 1000);
  assert.deepEqual(callViewersOf('c1', 'u1', now + 2000), [{ name: 'Joao', editing: true }]);
  assert.deepEqual(callViewersOf('c1', 'u2', now + 2000), [{ name: 'Matheus', editing: false }]);
  // Sem aviso por mais de 40 s: some da lista.
  assert.deepEqual(callViewersOf('c1', 'u1', now + 1000 + CALL_VIEW_WINDOW_MS + 1), []);
  touchCallViewer('c2', 'u1', 'Matheus', false, now);
  touchCallViewer('c2', 'u2', 'Joao', false, now);
  leaveCall('c2', 'u2');
  assert.deepEqual(callViewersOf('c2', 'u1', now), []);
  assert.equal(lastCallSave('c3'), null);
  markCallSaved('c3', 'u2', 'Joao', now);
  assert.deepEqual(lastCallSave('c3'), { userId: 'u2', name: 'Joao', at: new Date(now).toISOString() });
});
