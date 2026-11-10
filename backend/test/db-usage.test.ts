import assert from 'node:assert/strict';
import test from 'node:test';
import { addUsage, exportUsage, importUsage, limitBytes, modeFor, resetUsageForTests, scaled, usageReport, usageTarget } from '../src/db-usage.js';

const GB = 1024 ** 3;

test('db usage names the Supabase target of each request', () => {
  assert.equal(usageTarget('https://x.supabase.co/rest/v1/calls?select=*'), 'calls');
  assert.equal(usageTarget('https://x.supabase.co/rest/v1/rpc/delete_all_calls'), 'rpc delete_all_calls');
  assert.equal(usageTarget('https://x.supabase.co/auth/v1/token?grant_type=password'), 'login (auth)');
  assert.equal(usageTarget('https://x.supabase.co/other'), 'outros');
});

test('db usage switches to economy at 60% and strong economy at 85% of the limit', () => {
  assert.equal(limitBytes(), 5 * GB);
  assert.equal(modeFor(2 * GB), 'normal');
  assert.equal(modeFor(3 * GB), 'economia');
  assert.equal(modeFor(4.3 * GB), 'economia_forte');
  assert.equal(scaled(60_000, 'normal'), 60_000);
  assert.equal(scaled(60_000, 'economia'), 180_000);
  assert.equal(scaled(60_000, 'economia_forte'), 600_000);
});

test('db usage sums the last 30 days by day and target, and keeps what was saved before a restart', () => {
  resetUsageForTests();
  const now = new Date('2026-11-10T15:00:00Z');
  addUsage('calls', 1_000_000, now);
  addUsage('calls', 1_000_000, now);
  addUsage('profiles', 500, now);
  addUsage('calls', 9_000_000, new Date('2026-09-01T12:00:00Z')); // fora dos 30 dias
  const report = usageReport(now);
  assert.equal(report.today.requests, 3);
  assert.equal(report.topTargets[0].name, 'calls');
  assert.equal(report.topTargets[0].requests, 2);
  assert.equal(report.last30DaysBytes, report.today.bytes);
  assert.equal(report.daily.length, 30);
  assert.equal(report.mode, 'normal');

  const saved = exportUsage(now);
  assert.ok(!saved.days['2026-09-01'], 'dias antigos nao sao salvos');
  resetUsageForTests();
  addUsage('calls', 100, now); // medido depois de reiniciar
  importUsage(saved);
  const merged = usageReport(now);
  assert.equal(merged.today.requests, 4);
  assert.equal(merged.topTargets.find((target) => target.name === 'calls')?.requests, 3);
  resetUsageForTests();
});
