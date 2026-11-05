import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateIgpMetrics, classifyCallArea, igpAreaClusters, normalizeCluster } from '../src/igp.js';
import type { Call } from '../src/types.js';

test('bucket names and labels become cluster codes', () => {
  assert.equal(normalizeCluster('CLUSTER_C08 (21)'), 'C08');
  assert.equal(normalizeCluster('C.9 | ABC'), 'C09');
  assert.equal(normalizeCluster('CLUSTER_C12'), 'C12');
  assert.equal(normalizeCluster('JH TELECOM REDES'), undefined);
  assert.deepEqual(igpAreaClusters('ABC'), ['C09']);
});

test('area comes from the OFS cluster first, then from the region', () => {
  assert.equal(classifyCallArea({ cluster: 'C12', region: 'SAO PAULO' }), 'GRU');
  assert.equal(classifyCallArea({ cluster: 'C09', region: 'Nao informada' }), 'ABC');
  assert.equal(classifyCallArea({ region: 'Diadema' }), 'ABC');
  assert.equal(classifyCallArea({ region: 'Suzano' }), 'ALTO_TIETE');
  assert.equal(classifyCallArea({ region: 'Nao informada' }), 'OUTRAS');
});

test('IGP by area uses the cluster', () => {
  const call = (id: string, cluster: string | undefined, region: string): Call => ({ id, orderNumber: id, bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region, city: '', olt: '', slotPon: '', status: 'Finalizado', openedAt: '2026-11-04T12:00:00Z', executedAt: '2026-11-04T14:00:00Z', notes: '', cluster });
  const calls = [call('a', 'C09', 'Nao informada'), call('b', undefined, 'Diadema'), call('c', 'C08', 'Diadema')];
  assert.equal(calculateIgpMetrics(calls, '2026-11', 'ABC').total.orders, 2);
  assert.equal(calculateIgpMetrics(calls, '2026-11', 'SP').total.orders, 1);
});

test('cluster export tags the calls in the bucket and teaches the workzone for assigned ones', async () => {
  const previous = { runtime: process.env.REDEFLOW_RUNTIME, demo: process.env.REDEFLOW_DEMO_DATA, url: process.env.SUPABASE_URL };
  try {
    process.env.REDEFLOW_RUNTIME = 'local';
    process.env.REDEFLOW_DEMO_DATA = 'true';
    process.env.SUPABASE_URL = '';
    const { applyClusterExport, assignClustersFromWorkzones } = await import('../src/store/clusters.js');
    const { listCalls } = await import('../src/store.js');
    const { matchRowsToCalls } = await import('../src/imports/d0.js');
    const all = await listCalls();
    // So ordens que batem em um unico chamado (mesma regra da D-0).
    const unique = all.filter((call) => matchRowsToCalls([{ 'Ordem de Serviço': call.orderNumber }], all).length === 1);
    const [inBucket, assigned] = unique;
    assert.ok(inBucket && assigned, 'precisa de duas ordens unicas na demo');
    const bucket = await applyClusterExport([{ 'Ordem de Serviço': inBucket.orderNumber, 'Chave Workzone': 'SP-000GRS3-WZ001' }], 'CLUSTER_C12');
    assert.equal(bucket.matchedCalls, 1);
    assert.equal(bucket.learnedWorkzones, 1);
    // Ordem ja atribuida: so aparece no export do JH TELECOM REDES, com a mesma Workzone.
    const viaWorkzone = await assignClustersFromWorkzones([{ 'Ordem de Serviço': assigned.orderNumber, 'Chave Workzone': 'sp-000grs3-wz001' }]);
    assert.equal(viaWorkzone, 1);
    const after = await listCalls();
    assert.equal(after.find((call) => call.id === inBucket.id)?.cluster, 'C12');
    assert.equal(after.find((call) => call.id === assigned.id)?.cluster, 'C12');
    await assert.rejects(() => applyClusterExport([], 'JH TELECOM REDES'));
  } finally {
    if (previous.runtime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previous.runtime;
    if (previous.demo === undefined) delete process.env.REDEFLOW_DEMO_DATA; else process.env.REDEFLOW_DEMO_DATA = previous.demo;
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
  }
});
