import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSystemStatus, type StatusInputs } from '../src/system-status.js';

// 11/11/2026 14:00 em Sao Paulo (horario de coleta).
const now = Date.parse('2026-11-11T17:00:00Z');
const event = (kind: string, ok: boolean, minutesAgo: number) => ({ id: `${kind}-${minutesAgo}`, kind, ok, summary: '', details: {}, createdAt: new Date(now - minutesAgo * 60_000).toISOString() }) as StatusInputs['events'][number];
const base: StatusInputs = {
  now, uptimeSeconds: 7200, version: 'abc1234',
  database: { configured: true, ok: true, ms: 120, economyMode: 'normal' },
  events: [event('export', true, 20), event('db_backup', true, 600)],
  whatsapp: { configured: true, connected: true, loggedIn: true, lastMessageAt: new Date(now - 5 * 60_000).toISOString() },
  backupConfigured: true,
};
const byKey = (result: ReturnType<typeof buildSystemStatus>) => Object.fromEntries(result.components.map((item) => [item.key, item.status]));

test('everything up is ok', () => {
  const result = buildSystemStatus(base);
  assert.equal(result.status, 'ok');
  assert.deepEqual(byKey(result), { server: 'ok', database: 'ok', ofs: 'ok', whatsapp: 'ok', backup: 'ok' });
});

test('database down, WhatsApp logged out and OFS stopped show as down', () => {
  const result = buildSystemStatus({ ...base, database: { configured: true, ok: false, ms: null, error: 'timeout' }, whatsapp: { ...base.whatsapp, loggedIn: false }, events: [event('export', true, 240)] });
  assert.equal(result.status, 'down');
  assert.equal(byKey(result).database, 'down');
  assert.equal(byKey(result).whatsapp, 'down');
  assert.equal(byKey(result).ofs, 'down');
  assert.match(result.components.find((item) => item.key === 'ofs')!.detail, /computador da coleta/);
});

test('warnings: economy mode, failed last OFS try, OFS stale between 90 and 180 min, old backup', () => {
  assert.equal(byKey(buildSystemStatus({ ...base, database: { ...base.database, economyMode: 'economia' } })).database, 'warn');
  assert.equal(byKey(buildSystemStatus({ ...base, events: [event('export', false, 5), event('export', true, 30)] })).ofs, 'warn');
  assert.equal(byKey(buildSystemStatus({ ...base, events: [event('export', true, 120)] })).ofs, 'warn');
  assert.equal(byKey(buildSystemStatus({ ...base, events: [event('export', true, 20), event('db_backup', true, 40 * 60)] })).backup, 'warn');
});

test('OFS idle at night is not an alarm; unconfigured parts are unknown and do not count', () => {
  const night = Date.parse('2026-11-12T05:00:00Z'); // 02:00 em SP
  assert.equal(byKey(buildSystemStatus({ ...base, now: night, events: [event('export', true, 20)].map((item) => ({ ...item, createdAt: new Date(night - 400 * 60_000).toISOString() })) })).ofs, 'ok');
  const result = buildSystemStatus({ ...base, whatsapp: { configured: false, connected: null, loggedIn: null, lastMessageAt: null }, backupConfigured: false });
  assert.equal(byKey(result).whatsapp, 'unknown');
  assert.equal(byKey(result).backup, 'unknown');
  assert.equal(result.status, 'ok');
});
