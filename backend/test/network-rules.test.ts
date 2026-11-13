import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CTO_HIGHLIGHT_METERS, RECENT_READING_MINUTES, markImprecise, nearestCto, normalizeOlt, normalizePonlink, ponsFromCall, situationOf, validLocation } from '../src/network.js';

test('network rules: situationOf', () => {
  assert.equal(situationOf('OK'), 'ok');
  assert.equal(situationOf('warning'), 'atencao');
  for (const status of ['critical', 'power_fail', 'loss_signal', 'down', 'massive_loss_signal']) assert.equal(situationOf(status), 'problema', status);
  for (const status of ['', null, undefined, 'algo novo']) assert.equal(situationOf(status), 'sem');
});

test('network rules: normalizeOlt', () => {
  assert.equal(normalizeOlt(' vip-gru-2-spo-onk-01 '), 'VIP-GRU-2-SPO-ONK-01');
  assert.equal(normalizeOlt('vip gru'), 'VIPGRU');
});

test('network rules: normalizePonlink', () => {
  assert.equal(normalizePonlink('04/10'), '0/4/10');
  assert.equal(normalizePonlink('0/4/10'), '0/4/10');
  assert.equal(normalizePonlink('1/02/03'), '1/2/3');
  assert.equal(normalizePonlink('abc'), null);
  assert.equal(normalizePonlink(''), null);
});

test('network rules: ponsFromCall nao duplica', () => {
  const pons = ponsFromCall('VIP-GZ1-SPO-OHW-02', '04/10, 09/11, 4/10');
  assert.deepEqual(pons, [{ olt: 'VIP-GZ1-SPO-OHW-02', ponlink: '0/4/10' }, { olt: 'VIP-GZ1-SPO-OHW-02', ponlink: '0/9/11' }]);
});

test('network rules: validLocation', () => {
  assert.equal(validLocation(0, 0), false);
  assert.equal(validLocation(null, -46), false);
  assert.equal(validLocation(-23.45, -46.5), true);
  assert.equal(validLocation(-10, -46), false);
});

test('network rules: markImprecise', () => {
  const same = (n: number) => Array.from({ length: n }, () => ({ lat: -23.5, lng: -46.5 }));
  assert.ok(markImprecise(same(10)).every((c) => c.precise === false));
  assert.ok(markImprecise(same(9)).every((c) => c.precise === true));
  const mixed = markImprecise([{ lat: 0, lng: 0 }, { lat: null, lng: null }, { lat: -23.5, lng: -46.5 }]);
  assert.deepEqual(mixed.map((c) => c.precise), [false, false, true]);
});

test('network rules: nearestCto', () => {
  const point = { lat: -23.5, lng: -46.5 };
  const near = { code: 'NEAR', lat: -23.5 + 13 / 111320, lng: -46.5 };
  const far = { code: 'FAR', lat: -23.5 + 40 / 111320, lng: -46.5 };
  const result = nearestCto(point, [far, near]);
  assert.equal(result?.code, 'NEAR');
  assert.ok(Math.abs((result?.meters ?? 0) - 13) < 1);
  assert.equal(nearestCto(point, []), null);
  assert.equal(CTO_HIGHLIGHT_METERS, 150);
  assert.equal(RECENT_READING_MINUTES, 30);
});
