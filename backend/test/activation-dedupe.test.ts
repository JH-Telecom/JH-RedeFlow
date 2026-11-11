import assert from 'node:assert/strict';
import test from 'node:test';
import { activationKeys, findDuplicateCall, serializeAccept } from '../src/activation-dedupe.js';

const call = (id: string, status: string, orderNumber: string, bdesk = '', officeTrack = '') => ({ id, status, orderNumber, officeTrack, bdesk }) as never;

test('same OS or same BDESK finds the existing call; cancelled calls do not count', () => {
  const calls = [call('a', 'Finalizado', '610056119940102', '675979'), call('b', 'Cancelado', '611111111110102', '600001')];
  assert.equal((findDuplicateCall(activationKeys({ orders: ['610056119940102'] }), calls) as { id: string })?.id, 'a');
  assert.equal((findDuplicateCall(activationKeys({ orders: ['699999999990102'], bdesk: 'BDESK-675979' }), calls) as { id: string })?.id, 'a');
  assert.equal(findDuplicateCall(activationKeys({ orders: ['611111111110102'], bdesk: '600001' }), calls), undefined);
  assert.equal(findDuplicateCall(activationKeys({ orders: ['PEND-123456'], bdesk: '' }), calls), undefined);
  assert.equal(findDuplicateCall(activationKeys({ orders: ['679131'], bdesk: '679131' }), [call('c', 'Aberto', '612000000000102', '', '679131')]) && true, true);
});

test('accepts run one at a time even when fired together', async () => {
  const order: string[] = [];
  const slow = (name: string, ms: number) => serializeAccept(async () => { order.push(`start ${name}`); await new Promise((resolve) => setTimeout(resolve, ms)); order.push(`end ${name}`); });
  await Promise.all([slow('a', 30), slow('b', 1)]);
  assert.deepEqual(order, ['start a', 'end a', 'start b', 'end b']);
});
