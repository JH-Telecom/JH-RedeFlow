import assert from 'node:assert/strict';
import test from 'node:test';
import { nextGigaPlus, shouldAutoFinalize } from '../src/call-status.js';
import { countsForRedeIndicators } from '../src/igp.js';

test('Baixar and GIGA+ become Finalizado only when OFS concluded, with technician and end date', () => {
  const base = { technicianId: 't1', executedAt: '2026-11-24T12:00:00Z', ofsStatus: 'Concluído' };
  assert.equal(shouldAutoFinalize({ ...base, status: 'Baixar' }), true);
  assert.equal(shouldAutoFinalize({ ...base, status: 'GIGA+' }), true);
  assert.equal(shouldAutoFinalize({ ...base, status: 'Baixar', ofsStatus: 'Em execução' }), false);
  assert.equal(shouldAutoFinalize({ ...base, status: 'GIGA+', technicianId: null }), false);
  assert.equal(shouldAutoFinalize({ ...base, status: 'Atribuido' }), false);
});

test('GIGA+ mark survives closing and is cleared only when the call goes back to the team', () => {
  assert.equal(nextGigaPlus({ status: 'Atribuido' }, 'GIGA+'), true);
  assert.equal(nextGigaPlus({ status: 'GIGA+' }, 'Finalizado'), true);
  assert.equal(nextGigaPlus({ status: 'GIGA+', gigaPlus: true }, 'Finalizado'), undefined);
  assert.equal(nextGigaPlus({ status: 'GIGA+', gigaPlus: true }, 'Atribuido'), false);
  assert.equal(nextGigaPlus({ status: 'Baixar' }, 'Finalizado'), undefined);
});

test('finalized GIGA+ counts in the other areas but never in the SP area', () => {
  assert.equal(countsForRedeIndicators({ status: 'GIGA+', region: 'SUZANO' }), false);
  assert.equal(countsForRedeIndicators({ status: 'Finalizado', gigaPlus: true, region: 'SUZANO' }), true);
  assert.equal(countsForRedeIndicators({ status: 'Finalizado', gigaPlus: true, region: 'GUARULHOS 1' }), true);
  assert.equal(countsForRedeIndicators({ status: 'Finalizado', gigaPlus: true, region: 'GUAIANASES 1' }), false);
  assert.equal(countsForRedeIndicators({ status: 'Finalizado', region: 'PALMEIRAS' }), true);
});
