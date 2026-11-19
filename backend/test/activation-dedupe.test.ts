import assert from 'node:assert/strict';
import test from 'node:test';
import { activationKeys, findDuplicateCall, isClosingReport, serializeAccept } from '../src/activation-dedupe.js';

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

test('card without OS (only BDESK) is the call of that BDESK; with OS the BDESK still does not count', () => {
  const calls = [
    { id: 'a', status: 'GIGA+' as const, orderNumber: '611035281650102', officeTrack: '611035281650102', bdesk: '684169' },
    { id: 'b', status: 'Cancelado' as const, orderNumber: '611099999990102', officeTrack: '', bdesk: '700000' },
  ];
  // So o BDESK (relatorio do tecnico, ou card sem Tarefa OFS): liga ao chamado do BDESK.
  assert.equal(findDuplicateCall(activationKeys({ orders: ['684169'], bdesks: ['684169'] }), calls)?.id, 'a');
  // Com OS diferente: o mesmo BDESK nao faz ser o mesmo chamado (o NOC reaproveita BDESK).
  assert.equal(findDuplicateCall(activationKeys({ orders: ['611011111110102'], bdesks: ['684169'] }), calls), undefined);
  // Cancelado nao conta.
  assert.equal(findDuplicateCall(activationKeys({ orders: [], bdesks: ['700000'] }), calls), undefined);
});

test('technician closing report in the activation group is not a new activation', () => {
  const report = `- *✅ TÉCNICO:* Marcos Antônio\n*- ✅BDESK: 684169\nCAUSA DA FALHA:  vandalismo\n*- ✅ TRATATIVA REALIZADA.*\nCTO esta funcionando\n- ✅MATERIAL UTILIZADOS:\n- 0\n*✅ QUANTIDADE DE FUSÃO:*  0`;
  assert.equal(isClosingReport(report), true);
  const card = `⚠️VALIDAR COM NOC ACESSO⚠️\n- OLT: VIP-BSK-MDC-OHW-01\n- BDESK: 684169\n- Tarefa OFS: 611035281650102\nTRATATIVA REALIZADA: x\nCAUSA DA FALHA: y`;
  assert.equal(isClosingReport(card), false);
  assert.equal(isClosingReport('BDESK: 1\nTRATATIVA REALIZADA: troca de conector'), false);
});
