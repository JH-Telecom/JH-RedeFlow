import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { listNetworkArea, listNetworkSources, listPopOlts, resetNetworkMemory, saveNetworkBatch, savePopOlt, type NetCable, type NetElement } from '../src/store/network.js';

const cto = (code: string | null, lat: number, lng: number, extra: Partial<NetElement> = {}): NetElement => ({ kind: 'cto', code, name: code || 'sem codigo', projectCode: null, pop: null, fh: null, lat, lng, ...extra });
const cable = (name: string, points: Array<[number, number]>): NetCable => ({ name, color: null, points });
const batch = (fileName: string, elements: NetElement[], cables: NetCable[] = [], first = true) => ({ fileName, sha256: `sha-${fileName}`, first, elements, cables });
const BIG = { minLat: -90, minLng: -180, maxLat: 90, maxLng: 180 };

beforeEach(() => resetNetworkMemory());

test('network store: reimportar uma CTO de outro arquivo deixa 1 registro do arquivo novo', async () => {
  await saveNetworkBatch(batch('Penha 01.kmz', [cto('X1', -23.5, -46.5)]), 'ana');
  await saveNetworkBatch(batch('Penha.kmz', [cto('X1', -23.5, -46.5, { name: 'novo nome' })]), 'ana');
  const area = await listNetworkArea(BIG, 16);
  assert.equal(area.elements.length, 1);
  assert.equal(area.elements[0].sourceFile, 'Penha.kmz');
  assert.equal(area.elements[0].name, 'novo nome');
});

test('network store: first true em A.kml nao apaga elementos de B.kml', async () => {
  await saveNetworkBatch(batch('A.kml', [cto('A1', -23.5, -46.5)], [cable('c', [[-46.5, -23.5], [-46.4, -23.4]])]), 'ana');
  await saveNetworkBatch(batch('B.kml', [cto('B1', -23.6, -46.6)]), 'ana');
  await saveNetworkBatch(batch('A.kml', [cto('A2', -23.5, -46.5)]), 'ana');
  const area = await listNetworkArea(BIG, 16);
  assert.deepEqual(area.elements.map((e) => e.code).sort(), ['A2', 'B1']);
  assert.equal(area.cables.length, 0);
});

test('network store: CTO que passou para outro arquivo sobrevive ao first true do arquivo antigo', async () => {
  await saveNetworkBatch(batch('A.kml', [cto('X', -23.5, -46.5)]), 'ana');
  await saveNetworkBatch(batch('B.kml', [cto('X', -23.5, -46.5)], [], false), 'ana');
  await saveNetworkBatch(batch('A.kml', [cto('Y', -23.7, -46.7)]), 'ana');
  const area = await listNetworkArea(BIG, 16);
  const x = area.elements.find((e) => e.code === 'X');
  assert.ok(x);
  assert.equal(x.sourceFile, 'B.kml');
  const sources = await listNetworkSources();
  assert.equal(sources.find((s) => s.fileName === 'B.kml')?.elements, 1);
  assert.equal(sources.find((s) => s.fileName === 'A.kml')?.elements, 1);
});

test('network store: lote em partes (first false) acumula e codigo repetido no lote vale o ultimo', async () => {
  await saveNetworkBatch(batch('A.kml', [cto('A1', -23.5, -46.5)]), 'ana');
  const result = await saveNetworkBatch(batch('A.kml', [cto('A2', -23.5, -46.5), cto('A2', -23.5, -46.5, { name: 'dup' }), cto(null, -23.5, -46.5)], [], false), 'ana');
  assert.deepEqual(result, { elements: 2, cables: 0 });
  const sources = await listNetworkSources();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].elements, 3);
  assert.equal(sources[0].importedBy, 'ana');
});

test('network store: area devolve so o que esta dentro da caixa', async () => {
  await saveNetworkBatch(batch('A.kml', [cto('IN', -23.5, -46.5), cto('OUT', -22.0, -45.0)]), 'ana');
  const area = await listNetworkArea({ minLat: -24, minLng: -47, maxLat: -23, maxLng: -46 }, 16);
  assert.deepEqual(area.elements.map((e) => e.code), ['IN']);
  assert.deepEqual(area.clusters, []);
});

test('network store: zoom 12 agrupa 30 CTOs proximas em 1 cluster e mantem POPs individuais', async () => {
  const ctos = Array.from({ length: 30 }, (_, i) => cto(`C${i}`, -23.5001 - i * 0.00005, -46.5001 - i * 0.00005));
  const pop: NetElement = { kind: 'pop', code: 'POP1', name: 'Penha', projectCode: null, pop: 'PENHA', fh: null, lat: -23.5002, lng: -46.5002 };
  await saveNetworkBatch(batch('A.kml', [...ctos, pop]), 'ana');
  const area = await listNetworkArea(BIG, 12);
  assert.equal(area.clusters.length, 1);
  assert.equal(area.clusters[0].count, 30);
  assert.deepEqual(area.elements.map((e) => e.kind), ['pop']);
  const outro: NetElement = { kind: 'outro', code: 'O1', name: 'outro', projectCode: null, pop: null, fh: null, lat: -23.5003, lng: -46.5003 };
  await saveNetworkBatch(batch('B.kml', [outro]), 'ana');
  const withOutro = await listNetworkArea(BIG, 12);
  assert.deepEqual(withOutro.elements.map((e) => e.kind), ['pop']);
  assert.equal(withOutro.clusters.reduce((sum, c) => sum + c.count, 0), 30);
  const near = await listNetworkArea(BIG, 15);
  assert.equal(near.clusters.length, 0);
  assert.equal(near.elements.length, 32);
});

test('network store: cabo que cruza a caixa sem ponto dentro dela e devolvido', async () => {
  await saveNetworkBatch(batch('A.kml', [], [cable('cruza', [[-47, -23.5], [-46, -23.5]]), cable('longe', [[-40, -10], [-39, -10]])]), 'ana');
  const area = await listNetworkArea({ minLat: -23.6, minLng: -46.6, maxLat: -23.4, maxLng: -46.4 }, 16);
  assert.deepEqual(area.cables.map((c) => c.name), ['cruza']);
});

test('network store: POP para OLT exige motivo ao desativar', async () => {
  await assert.rejects(savePopOlt({ pop: 'PENHA', olt: 'OLT 1', active: false }, 'ana'), /Para desativar, escreva o motivo\./);
  await assert.rejects(savePopOlt({ pop: 'PENHA', olt: 'OLT 1', active: false, note: '  ' }, 'ana'), /Para desativar/);
  await savePopOlt({ pop: 'PENHA', olt: 'OLT 1', active: true }, 'ana');
  const off = await savePopOlt({ pop: 'PENHA', olt: 'OLT 1', active: false, note: 'migrou' }, 'bia');
  assert.equal(off.active, false);
  assert.equal(off.note, 'migrou');
  assert.equal(off.confirmedBy, 'bia');
  const list = await listPopOlts();
  assert.equal(list.length, 1);
});
