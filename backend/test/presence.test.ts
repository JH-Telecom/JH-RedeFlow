import assert from 'node:assert/strict';
import test from 'node:test';
import { clearPresence, ONLINE_WINDOW_MS, presenceOf, touchPresence } from '../src/presence.js';

test('a user is online while requests keep arriving and offline after the window or logout', () => {
  const start = Date.UTC(2026, 10, 4, 15, 0, 0);
  assert.deepEqual(presenceOf('u-presence', start), { online: false });
  touchPresence('u-presence', start);
  assert.equal(presenceOf('u-presence', start + 30_000).online, true);
  assert.equal(presenceOf('u-presence', start + ONLINE_WINDOW_MS + 1).online, false);
  assert.equal(presenceOf('u-presence', start + ONLINE_WINDOW_MS + 1).lastSeenAt, new Date(start).toISOString());
  touchPresence('u-presence', start + 60_000);
  clearPresence('u-presence');
  assert.deepEqual(presenceOf('u-presence', start + 61_000), { online: false });
});
