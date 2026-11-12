import assert from 'node:assert/strict';
import test from 'node:test';
import { finishAfterOpening } from '../src/imports/d0.js';
import { isManualEndDateLog } from '../src/store/observations.js';

test('OFS end after midnight moves to the next day', () => {
  assert.equal(finishAfterOpening('2026-11-05T00:05:00-03:00', '2026-11-05T21:10:00-03:00'), '2026-11-06T00:05:00-03:00');
  assert.equal(finishAfterOpening('2026-11-30T05:41:00-03:00', '2026-11-30T18:15:00-03:00'), '2026-12-01T05:41:00-03:00');
  assert.equal(finishAfterOpening('2026-11-05T16:08:00-03:00', '2026-11-05T15:43:00-03:00'), '2026-11-05T16:08:00-03:00');
  // mais de um dia antes: nao e virada de meia-noite, fica como veio
  assert.equal(finishAfterOpening('2026-11-01T10:00:00-03:00', '2026-11-05T21:10:00-03:00'), '2026-11-01T10:00:00-03:00');
});

test('only a real end-date correction locks the date', () => {
  assert.equal(isManualEndDateLog({ action: 'Data Fim corrigida', previousValue: '', newValue: '2026-11-05T16:08:00-03:00' }), true);
  assert.equal(isManualEndDateLog({ action: 'Data de finalizacao alterado', previousValue: '2026-11-05T19:08:00Z', newValue: '2026-11-05T18:00:00Z' }), true);
  assert.equal(isManualEndDateLog({ action: 'Data de finalizacao alterado', previousValue: '2026-11-05T19:08:00Z', newValue: '' }), false);
  assert.equal(isManualEndDateLog({ action: 'Data de finalizacao alterado', previousValue: '', newValue: '2026-11-06T07:22:00Z' }), false);
});
