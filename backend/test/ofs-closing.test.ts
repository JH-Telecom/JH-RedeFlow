import assert from 'node:assert/strict';
import test from 'node:test';
import { callsReadyToFinish, isOfsConcluded, matchOfsClosing, orderDigits, pendingClosingOrders } from '../src/imports/ofs-closing.js';
import type { Call } from '../src/types.js';

const now = Date.parse('2026-11-05T12:00:00Z');
const base: Call = {
  id: 'c1', orderNumber: '610011231680102', bdesk: '672916', officeTrack: '610011231680102', client: '', type: 'NOC ACESSO', reason: 'Parcial',
  region: 'PALMEIRAS', city: '', olt: '', slotPon: '', status: 'Atribuido', ofsStatus: 'concluído', openedAt: '2026-11-04T15:24:00Z', executedAt: '2026-11-05T01:11:00Z', notes: '',
};

test('pending list: finished here or concluded in the OFS, without Submotivo, newest first', () => {
  const calls: Call[] = [
    base,
    { ...base, id: 'c2', orderNumber: '610032252280102', officeTrack: '610032252280102', status: 'Finalizado', ofsStatus: undefined, executedAt: '2026-11-05T02:00:00Z' },
    { ...base, id: 'c3', orderNumber: '610000000000001', officeTrack: '', status: 'Atribuido', ofsStatus: 'pendente' }, // ainda em campo
    { ...base, id: 'c4', orderNumber: '610000000000002', officeTrack: '', status: 'Finalizado', closingSubreason: 'TROCA DE POSTES' }, // ja tem
    { ...base, id: 'c4b', orderNumber: '610000000000005', officeTrack: '', status: 'Finalizado', closingReason: 'OUTROS' }, // lido, sem submotivo
    { ...base, id: 'c5', orderNumber: '610000000000003', officeTrack: '', status: 'Cancelado', ofsStatus: 'concluído' },
    { ...base, id: 'c6', orderNumber: 'PEND-abc123', officeTrack: '', status: 'Finalizado' }, // sem ordem do OFS
    { ...base, id: 'c7', orderNumber: '610000000000004', officeTrack: '', status: 'Baixar', executedAt: '2026-10-01T10:00:00Z', openedAt: '2026-10-01T08:00:00Z' }, // velho
  ];
  assert.deepEqual(pendingClosingOrders(calls, { now }), ['610032252280102', '610011231680102']);
  assert.deepEqual(pendingClosingOrders(calls, { now, limit: 1 }), ['610032252280102']);
});

test('calls saved with OFS list codes instead of the text go back to the queue', () => {
  const calls: Call[] = [
    { ...base, id: 'k1', orderNumber: '12667479', officeTrack: '12667479', status: 'Finalizado', closingReason: 'CTO_SEM_SINAL_EVENTO_PRODUTIVO', closingSubreason: '13', cableType: '12' },
    { ...base, id: 'k2', orderNumber: '12665731', officeTrack: '12665731', status: 'Finalizado', closingReason: 'CTO SEM SINAL', closingSubreason: '1' },
    { ...base, id: 'k3', orderNumber: '610105329510102', officeTrack: '', status: 'Finalizado', closingReason: 'CABO ATENUADO (Massiva de atenuação)', closingSubreason: 'REALIZADO NOVA FUSÃO NA CTO/CEO' },
  ];
  assert.deepEqual(pendingClosingOrders(calls, { now }).sort(), ['12665731', '12667479']);
  const fixed = matchOfsClosing([{ ordem: '12667479', motivo: 'CTO sem sinal', submotivo: 'Realizado nova fusão na CTO/CEO', tipoCabo: '12' }], calls);
  assert.deepEqual(fixed.matches[0].fields, { closingReason: 'CTO sem sinal', closingSubreason: 'Realizado nova fusão na CTO/CEO' });
});

test('auto-finish: only active calls the OFS concluded, with Data Fim, technician and closing text', () => {
  const ready: Call = { ...base, technicianId: 'tech-1', closingReason: 'CTO sem sinal', closingSubreason: 'Realizado nova fusão na CTO/CEO', result: 'CTO_SEM_SINAL_EVENTO_PRODUTIVO' };
  const calls: Call[] = [
    ready,
    { ...ready, id: 'keep-result', result: 'Fusão refeita na CTO' },
    { ...ready, id: 'no-tech', technicianId: undefined },
    { ...ready, id: 'no-end', executedAt: undefined },
    { ...ready, id: 'pending-ofs', ofsStatus: 'pendente' },
    { ...ready, id: 'code', closingSubreason: '13' },
    { ...ready, id: 'no-closing', closingReason: undefined, closingSubreason: undefined },
    { ...ready, id: 'already', status: 'Finalizado' },
    { ...ready, id: 'baixar', status: 'Baixar' },
  ];
  assert.deepEqual(callsReadyToFinish(calls), [
    { callId: 'c1', orderNumber: '610011231680102', fields: { status: 'Finalizado', executedAt: '2026-11-05T01:11:00Z', result: 'CTO sem sinal — Realizado nova fusão na CTO/CEO' } },
    { callId: 'keep-result', orderNumber: '610011231680102', fields: { status: 'Finalizado', executedAt: '2026-11-05T01:11:00Z', result: 'Fusão refeita na CTO' } },
  ]);
});

test('OFS status and order number normalization', () => {
  assert.equal(isOfsConcluded('concluído'), true);
  assert.equal(isOfsConcluded('Concluída'), true);
  assert.equal(isOfsConcluded('pendente'), false);
  assert.equal(orderDigits('BDESK-610011231680102'), '610011231680102');
});

test('closing data from the OFS matches the call and only sends what changed', () => {
  const calls: Call[] = [base, { ...base, id: 'c2', orderNumber: '610032252280102', officeTrack: '610032252280102', closingReason: 'CABO ROMPIDO' }];
  const result = matchOfsClosing([
    { ordem: '610011231680102', motivo: 'CTO SEM SINAL', submotivo: 'ADEQUAÇÃO DE CTO/CEO/CABOS', tipoCabo: '12' },
    { ordem: 'BDESK-610032252280102', motivo: 'CABO ROMPIDO', submotivo: ' TROCA  DE POSTES ', tipoCabo: '12' },
    { ordem: '610099999999999', motivo: 'X', submotivo: 'Y', tipoCabo: '6' },
    { ordem: '610011231680102', motivo: '', submotivo: null, tipoCabo: undefined },
  ], calls);
  assert.deepEqual(result.matches, [
    { callId: 'c1', orderNumber: '610011231680102', fields: { closingReason: 'CTO SEM SINAL', closingSubreason: 'ADEQUAÇÃO DE CTO/CEO/CABOS', cableType: '12' } },
    { callId: 'c2', orderNumber: '610032252280102', fields: { closingSubreason: 'TROCA DE POSTES', cableType: '12' } },
  ]);
  assert.deepEqual(result.unmatched, ['610099999999999']);
});

test('an order shared by two calls is not guessed', () => {
  const result = matchOfsClosing([{ ordem: '610011231680102', submotivo: 'X' }], [base, { ...base, id: 'dup' }]);
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.unmatched, ['610011231680102']);
});

test('Atrelado is auto-finished like Atribuido', () => {
  const linked: Call = { ...base, id: 'linked', status: 'Atrelado', technicianId: 'tech-1', closingReason: 'CTO sem sinal', closingSubreason: 'Troca de cordões' };
  assert.deepEqual(callsReadyToFinish([linked]).map((item) => item.callId), ['linked']);
});
