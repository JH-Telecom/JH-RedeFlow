import assert from 'node:assert/strict';
import test from 'node:test';
import { isCallClosed, matchesGigaState } from '../src/call-status.js';
import { callsReadyToFinish } from '../src/imports/ofs-closing.js';
import type { Call } from '../src/types.js';

const giga = (ofsStatus?: string): Call => ({
  id: 'g', orderNumber: '611045493260102', officeTrack: '611045493260102', bdesk: '', client: '', type: 'NOC ACESSO', reason: 'x', region: '', city: '',
  olt: 'VIP-SZN-SPO-OHW-01', slotPon: '03/13', status: 'GIGA+', ofsStatus, technicianId: 't1', openedAt: '2026-11-10T11:50:00Z', notes: '',
  executedAt: '2026-11-10T12:30:00Z', closingReason: 'Reparo', closingSubreason: 'Fibra emendada',
});

test('GIGA+ stays open until the OFS concludes the activity', () => {
  assert.equal(isCallClosed(giga('pendente')), false);
  assert.equal(isCallClosed(giga('iniciado')), false);
  assert.equal(isCallClosed(giga(undefined)), false, 'sem status do OFS: aberto (mesmo com Data Fim antiga)');
  assert.equal(isCallClosed(giga('Concluído')), true);
  assert.equal(isCallClosed({ status: 'Finalizado' }), true);
  assert.equal(isCallClosed({ status: 'Aberto', ofsStatus: 'concluido' }), false, 'so GIGA+ fecha pelo OFS');
});

test('queue filter splits open and concluded GIGA+ and ignores other statuses', () => {
  assert.equal(matchesGigaState(giga('pendente'), false), true);
  assert.equal(matchesGigaState(giga('pendente'), true), false);
  assert.equal(matchesGigaState(giga('concluido'), true), true);
  assert.equal(matchesGigaState({ status: 'Finalizado' }, true), true);
  assert.equal(matchesGigaState(giga('pendente'), undefined), true);
});

test('GIGA+ never becomes Finalizado by the OFS closing (it is not ours)', () => {
  assert.deepEqual(callsReadyToFinish([giga('concluido')]), []);
});
