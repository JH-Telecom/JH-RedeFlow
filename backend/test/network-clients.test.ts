import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { enqueuePons, pendingPons, ponView, resetNetworkClientsMemory, savePonReading, type NetClient } from '../src/store/network-clients.js';
import { resetNetworkMemory, saveNetworkBatch } from '../src/store/network.js';

const OLT = 'VIP-GRU-2-SPO-ONK-01';
const client = (contract: string, status: string | null, lat: number | null, lng: number | null, extra: Partial<NetClient> = {}): NetClient => ({ contract, serial: `S${contract}`, int6: null, olt: OLT, ponlink: '0/4/10', signalRx: -20, onuStatus: status, lastInform: null, lat, lng, readAt: new Date().toISOString(), ...extra });

beforeEach(() => { resetNetworkClientsMemory(); resetNetworkMemory(); });

test('network clients: enfileirar duas vezes a mesma PON deixa 1 pedido aberto', async () => {
  await enqueuePons([{ olt: ` ${OLT.toLowerCase()} `, ponlink: '04/10' }], 'ana', 'c1');
  await enqueuePons([{ olt: OLT, ponlink: '0/4/10' }], 'ana');
  const pending = await pendingPons();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].olt, OLT);
  assert.equal(pending[0].ponlink, '0/4/10');
});

test('network clients: leitura recente evita novo pedido; savePonReading fecha o pedido', async () => {
  assert.deepEqual(await enqueuePons([{ olt: OLT, ponlink: '0/4/10' }], 'ana'), { queued: 1, skippedRecent: 0 });
  const [request] = await pendingPons();
  const saved = await savePonReading({ requestId: request.id, olt: OLT, ponlink: '0/4/10', clients: [client('1', 'OK', -23.5, -46.5)], found: 1 }, 'ext');
  assert.equal(saved.saved, 1);
  assert.equal((await pendingPons()).length, 0);
  assert.deepEqual(await enqueuePons([{ olt: OLT, ponlink: '0/4/10' }], 'ana'), { queued: 0, skippedRecent: 1 });
  const view = await ponView(OLT, '0/4/10');
  assert.ok(view.request?.doneAt);
});

test('network clients: ponView resume, marca imprecisos e acha CTO proxima', async () => {
  await saveNetworkBatch({ fileName: 'a.kml', sha256: 'x', first: true, elements: [{ kind: 'cto', code: 'CTO-1', name: 'CTO-1', projectCode: null, pop: null, fh: null, lat: -23.5001, lng: -46.5 }], cables: [] }, 'ana');
  const clients = [client('1', 'critical', -23.5, -46.5), client('2', 'warning', -23.5002, -46.5), client('3', 'OK', -23.5003, -46.5), client('4', null, null, null)];
  await savePonReading({ olt: OLT, ponlink: '0/4/10', clients, found: 4 }, 'ext');
  const view = await ponView(OLT, '0/4/10');
  assert.deepEqual(view.summary, { total: 4, problema: 1, atencao: 1, ok: 1, sem: 1 });
  assert.equal(view.clients.find((c) => c.contract === '4')?.precise, false);
  assert.equal(view.clients.find((c) => c.contract === '1')?.nearestCto?.code, 'CTO-1');
  assert.equal(view.clients.find((c) => c.contract === '4')?.nearestCto, null);
});

test('network clients: campos extras (nome) nunca sao gravados', async () => {
  const dirty = { ...client('9', 'OK', -23.5, -46.5), name: 'Fulano', address: 'Rua X', document: '123' } as NetClient;
  await savePonReading({ olt: OLT, ponlink: '0/4/10', clients: [dirty], found: 1 }, 'ext');
  const view = await ponView(OLT, '0/4/10');
  assert.equal(view.clients.length, 1);
  for (const key of ['name', 'address', 'document']) assert.equal(key in view.clients[0], false, key);
});

test('network clients: erro na leitura fica no pedido', async () => {
  await enqueuePons([{ olt: OLT, ponlink: '0/4/10' }], 'ana');
  await savePonReading({ olt: OLT, ponlink: '0/4/10', clients: [], found: 0, error: 'falhou' }, 'ext');
  assert.equal((await pendingPons()).length, 0);
  assert.equal((await ponView(OLT, '0/4/10')).request?.error, 'falhou');
});
