import assert from 'node:assert/strict';
import test from 'node:test';
import { activationKeys, findDuplicateCall, serializeAccept } from '../src/activation-dedupe.js';

const call = (id: string, status: string, orderNumber: string, officeTrack = '') => ({ id, status, orderNumber, officeTrack }) as never;
const found = (orders: string[], calls: never[]) => (findDuplicateCall(activationKeys({ orders }), calls) as { id: string } | undefined)?.id;

test('same OS finds the existing call; cancelled calls and PEND orders do not count', () => {
  const calls = [call('a', 'Finalizado', '610056119940102'), call('b', 'Cancelado', '611111111110102'), call('c', 'Aberto', 'PEND-123456', '612000000000102')];
  assert.equal(found(['610056119940102'], calls), 'a');
  assert.equal(found(['611111111110102'], calls), undefined);
  assert.equal(found(['PEND-123456'], calls), undefined);
  assert.equal(found(['612000000000102'], calls), 'c');
});

test('same BDESK with another OS is a different call (678676 in PAL and in GZ1)', () => {
  const calls = [{ id: 'giga', status: 'GIGA+', orderNumber: '611052298430102', officeTrack: '611052298430102', bdesk: '678676' }] as never[];
  assert.equal(found(['611236335390102'], calls), undefined);
});

test('accepts run one at a time even when fired together', async () => {
  const order: string[] = [];
  const slow = (name: string, ms: number) => serializeAccept(async () => { order.push(`start ${name}`); await new Promise((resolve) => setTimeout(resolve, ms)); order.push(`end ${name}`); });
  await Promise.all([slow('a', 30), slow('b', 1)]);
  assert.deepEqual(order, ['start a', 'end a', 'start b', 'end b']);
});
