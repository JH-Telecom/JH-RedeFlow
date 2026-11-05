import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSaoPauloLocal } from '../src/timezone.js';

test('a datetime-local value without a zone is read as Sao Paulo time', () => {
  // Pedro digitou 16:20 no "Finalizar chamado": tem que ficar 16:20 em SP (19:20 UTC), nao 13:20.
  assert.equal(normalizeSaoPauloLocal('2026-11-04T16:20'), '2026-11-04T19:20:00.000Z');
  assert.equal(normalizeSaoPauloLocal('2026-11-04T23:30:15'), '2026-11-05T02:30:15.000Z');
  // Ja com fuso: nao mexe.
  assert.equal(normalizeSaoPauloLocal('2026-11-04T19:20:00.000Z'), '2026-11-04T19:20:00.000Z');
  assert.equal(normalizeSaoPauloLocal('2026-11-04T16:20:00-03:00'), '2026-11-04T16:20:00-03:00');
});
