import assert from 'node:assert/strict';
import test from 'node:test';
import { findAtreladaCallOrder } from '../src/integrations/wuzapi/noc-consolidation.js';
import type { ActivationAnalysis, Call, CallStatus } from '../src/types.js';

// Caso real (10/11/2026): FIELD 12687665 na VIP-SZN-SPO-OHW-01 SLOT 3 PON 11; a planilha achou o 12687558.
const field = {
  olt: 'VIP-SZN-SPO-OHW-01', placa_pon: 'SLOT: 3 PON: 11', slot_pon: [], office_track: '12687665',
  data_hora_evento: '10/11/2026 09:00', raw_text: '',
} as unknown as ActivationAnalysis;
const call = (orderNumber: string, openedAt: string, extra: Partial<Call> = {}): Call => ({
  id: orderNumber, orderNumber, officeTrack: orderNumber, bdesk: '', client: '', type: 'ACIONAMENTO FIELD', reason: '', region: '', city: '',
  olt: 'VIP-SZN-SPO-OHW-01', slotPon: 'SLOT:3|PON:11', status: 'Aberto' as CallStatus, openedAt, notes: '', ...extra,
});

test('atrelado: open call without OFS status counts as pending, like the spreadsheet STATUS', () => {
  assert.equal(findAtreladaCallOrder(field, [call('12687558', '2026-11-10T07:30:00-03:00')]), '12687558');
  assert.equal(findAtreladaCallOrder(field, [call('12687558', '2026-11-10T07:30:00-03:00', { status: 'Atribuido', technicianId: 't1' })]), '12687558');
});

test('atrelado: started, closed or OFS non-pending calls are not linked', () => {
  assert.equal(findAtreladaCallOrder(field, [call('A', '2026-11-10T07:30:00-03:00', { status: 'Em campo' })]), undefined);
  assert.equal(findAtreladaCallOrder(field, [call('B', '2026-11-10T07:30:00-03:00', { status: 'Finalizado' })]), undefined);
  assert.equal(findAtreladaCallOrder(field, [call('C', '2026-11-10T07:30:00-03:00', { ofsStatus: 'iniciado' })]), undefined);
  assert.equal(findAtreladaCallOrder(field, [call('D', '2026-11-10T07:30:00-03:00', { status: 'Deslocamento', ofsStatus: 'pendente' })]), 'D');
});

test('atrelado: card time is Sao Paulo time (a call opened 1h before the event is older, not newer)', () => {
  // 08:00 em SP = 11:00Z. Lendo "09:00" como UTC (bug antigo), o evento seria 06:00 em SP e o chamado ficava de fora.
  assert.equal(findAtreladaCallOrder(field, [call('12687558', '2026-11-10T11:00:00Z')]), '12687558');
  assert.equal(findAtreladaCallOrder(field, [call('LATER', '2026-11-10T09:30:00-03:00')]), undefined);
});

test('atrelado: uses the call event date when it exists and picks the oldest', () => {
  const calls = [
    call('NEWER', '2026-11-10T06:00:00-03:00', { eventAt: '2026-11-10T08:00:00-03:00' }),
    call('OLDER', '2026-11-10T07:00:00-03:00', { eventAt: '2026-11-10T05:00:00-03:00' }),
    call('SELF', '2026-11-10T04:00:00-03:00', { orderNumber: '12687665', officeTrack: '12687665' }),
    call('OTHER-PON', '2026-11-10T03:00:00-03:00', { slotPon: '3/12' }),
  ];
  assert.equal(findAtreladaCallOrder(field, calls), 'OLDER');
});
