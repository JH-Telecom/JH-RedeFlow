import assert from 'node:assert/strict';
import test from 'node:test';
import { isMissingRegion, knownRegions, missingRegionCalls, sameOltMissing } from '../src/missing-region.js';
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
