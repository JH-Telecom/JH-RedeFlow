import assert from 'node:assert/strict';
import test from 'node:test';
import { isMissingRegion, knownRegions, missingRegionCalls, sameOltMissing, suggestRegion, isRealOlt } from '../src/missing-region.js';
import type { Call } from '../src/types.js';

const call = (id: string, region: string, olt = 'VIP-CT1-SPO-OHW-01', openedAt = '2026-11-10T10:00:00-03:00'): Call => ({ id, orderNumber: id, bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region, city: '', olt, slotPon: '', status: 'Finalizado', openedAt, notes: '' });

test('missing region covers empty and "Nao informada" in any spelling', () => {
  for (const value of ['', '  ', 'Nao informada', 'NÃO INFORMADA', 'nao informado', 'Sem região', undefined]) assert.equal(isMissingRegion(value), true, String(value));
  assert.equal(isMissingRegion('GUARULHOS 1'), false);
});

test('lists calls without region (newest first), same-OLT siblings and known regions', () => {
  const calls = [call('a', 'Nao informada', 'OLT-1', '2026-11-10T10:00:00-03:00'), call('b', '', 'OLT-1', '2026-11-11T10:00:00-03:00'), call('c', 'SUZANO', 'OLT-1'), call('d', 'Nao informada', 'OLT-2')];
  assert.deepEqual(missingRegionCalls(calls).map((item) => item.id), ['b', 'a', 'd']);
  assert.deepEqual(sameOltMissing(calls, 'OLT-1', 'a').map((item) => item.id), ['b']);
  assert.deepEqual(sameOltMissing(calls, '', 'a'), []);
  assert.deepEqual(knownRegions(['SUZANO', 'Nao informada', 'suzano'], ['DIADEMA', '']), ['DIADEMA', 'SUZANO']);
});

test('region suggestion: OLT mapping first, then the most common region of the same bairro, then a clear city majority', () => {
  const withPlace = (id: string, region: string, bairro: string, city: string): Call => ({ ...call(id, region, ''), bairro, city });
  const calls = [withPlace('1', 'GUAIANASES 1', 'JARDIM SAO PEDRO', 'Sao Paulo'), withPlace('2', 'GUAIANASES 1', 'Jardim São Pedro', 'SAO PAULO'), withPlace('3', 'ITAIM PAULISTA', 'JARDIM SAO PEDRO', 'Sao Paulo'),
    withPlace('4', 'DIADEMA', 'CENTRO', 'Diadema'), withPlace('5', 'DIADEMA', 'TABOAO', 'Diadema'), withPlace('6', 'DIADEMA', 'SERRARIA', 'Diadema'), withPlace('7', 'Nao informada', 'JARDIM SAO PEDRO', 'Sao Paulo')];
  const noOlt = () => null;
  assert.deepEqual(suggestRegion({ olt: 'VIP-X', bairro: 'JARDIM SAO PEDRO', city: 'Sao Paulo' }, calls, () => 'SUZANO 1'), { region: 'SUZANO 1', reason: 'olt', detail: 'OLT VIP-X' });
  assert.equal(suggestRegion({ olt: '', bairro: 'jardim sao pedro', city: 'Sao Paulo' }, calls, noOlt)?.region, 'GUAIANASES 1');
  assert.equal(suggestRegion({ olt: '', bairro: 'CANHEMA', city: 'DIADEMA' }, calls, noOlt)?.reason, 'cidade');
  assert.equal(suggestRegion({ olt: '', bairro: 'X', city: 'Mogi' }, calls, noOlt), null);
});

test('same bairro in another city is not a suggestion; city comes from the address; junk OLT is ignored', () => {
  const at = (id: string, region: string, bairro: string, city: string, address = ''): Call => ({ ...call(id, region, ''), bairro, city, address });
  const calls = [at('1', 'FERRAZ DE VASCONCELOS', 'JARDIM BELA VISTA', 'Ferraz de Vasconcelos'), at('2', 'FERRAZ DE VASCONCELOS', 'JARDIM BELA VISTA', 'Ferraz de Vasconcelos'), at('3', 'GUARULHOS 2', 'JARDIM BELA VISTA', 'Guarulhos')];
  // Cidade so no endereco: Guarulhos.
  assert.equal(suggestRegion({ olt: 'ATIVAÇÃO', bairro: 'JARDIM BELA VISTA', city: 'Nao informada', address: 'AGNELLO TRAMA, 77 JARDIM BELA VISTA, GUARULHOS - SP' }, calls, () => 'SUZANO 1')?.region, 'GUARULHOS 2');
  // Sem cidade nenhuma e o bairro em regioes diferentes: nao sugere pelo bairro.
  assert.equal(suggestRegion({ olt: '', bairro: 'JARDIM BELA VISTA', city: '' }, calls, () => null), null);
  assert.equal(isRealOlt('ATIVAÇÃO'), false);
  assert.equal(isRealOlt('VIP-ITA-SPO-OHW-01'), true);
  assert.deepEqual(sameOltMissing([at('9', 'Nao informada', 'X', 'Y')].map((item) => ({ ...item, olt: 'ATIVAÇÃO' })), 'ATIVAÇÃO', 'z'), []);
});
