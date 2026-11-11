import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesCallSearch } from '../src/store/calls.js';
import type { Call } from '../src/types.js';

const call = { id: 'c1', orderNumber: '611236335390102', officeTrack: '611236335390102', bdesk: '678676', client: 'Cliente nao identificado', type: 'NOC ACESSO', reason: 'Parcial', region: 'GUARULHOS 1', city: 'Guarulhos', bairro: 'JARDIM MARPU', address: 'RUA ALEXANDRE LEGRAND, 42', olt: 'VIP-GZ1-SPO-OHW-01', slotPon: '07/04', status: 'Atribuido', ofsStatus: 'pendente', technicianName: 'Carlos Mendes', supportTechnicianName: 'Pedro Santos', notes: 'Rompimento na caixa CTO 12', openedAt: '2026-11-10T22:42:00-03:00' } as Call;

test('queue search looks at OFS status, PON, support technician, notes and more', () => {
  for (const term of ['pendente', 'PENDENTE', '07/04', 'pedro', 'rompimento', 'atribuido', 'gz1', 'marpu', 'parcial', '678676']) assert.equal(matchesCallSearch(call, term), true, term);
});

test('several words in any order must all appear; accents ignored', () => {
  assert.equal(matchesCallSearch(call, 'guarulhos pendente'), true);
  assert.equal(matchesCallSearch(call, 'pendente  carlos   noc'), true);
  assert.equal(matchesCallSearch(call, 'jardim márpu'), true);
  assert.equal(matchesCallSearch(call, 'pendente concluido'), false);
  assert.equal(matchesCallSearch(call, ''), true);
  assert.equal(matchesCallSearch(call, '   '), true);
});
