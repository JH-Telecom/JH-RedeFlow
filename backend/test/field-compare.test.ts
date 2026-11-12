import assert from 'node:assert/strict';
import test from 'node:test';
import { sameFieldValue } from '../src/field-compare.js';

test('dates compare by instant, other fields by text', () => {
  assert.equal(sameFieldValue('executedAt', '2026-11-11T18:42:00+00:00', '2026-11-11T15:42:00-03:00'), true);
  assert.equal(sameFieldValue('executedAt', '2026-11-11T18:42:00+00:00', '2026-11-11T15:43:00-03:00'), false);
  assert.equal(sameFieldValue('executedAt', null, '2026-11-11T15:42:00-03:00'), false);
  assert.equal(sameFieldValue('executedAt', undefined, null), true);
  assert.equal(sameFieldValue('ofsStatus', 'iniciado', 'iniciado'), true);
  assert.equal(sameFieldValue('ofsStatus', 'iniciado', 'concluído'), false);
  assert.equal(sameFieldValue('address', undefined, ''), true);
});
