import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptOltRegionRequest, addCustomOperationalRegion, captureUnknownOltRequests, ignoreOltRegionRequest, listCustomOperationalRegions, listOltRegionMappings, listOltRegionRequests } from '../src/store.js';

function makeUnknownOlt(label: string) {
  const token = crypto.randomUUID().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(4, 'X');
  return `VIP-${label}-${token.slice(0, 2)}-SPO-OHW-${token.slice(2, 4)}`;
}

async function withDemoRuntime(run: () => Promise<void>) {
  const previous = {
    runtime: process.env.REDEFLOW_RUNTIME,
    demoData: process.env.REDEFLOW_DEMO_DATA,
    databaseUrl: process.env.DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.REDEFLOW_RUNTIME = 'demo';
  process.env.REDEFLOW_DEMO_DATA = 'true';
  process.env.DATABASE_URL = '';
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_ANON_KEY = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  try {
    await run();
  } finally {
    if (previous.runtime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previous.runtime;
    if (previous.demoData === undefined) delete process.env.REDEFLOW_DEMO_DATA; else process.env.REDEFLOW_DEMO_DATA = previous.demoData;
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.supabaseUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.supabaseUrl;
    if (previous.supabaseAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previous.supabaseAnonKey;
    if (previous.supabaseServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.supabaseServiceRoleKey;
  }
}

test('unknown OLT is requested once and ignored requests do not reappear', async () => {
  await withDemoRuntime(async () => {
    const olt = makeUnknownOlt('IGNORE');
    await captureUnknownOltRequests([olt, olt, 'VIP-GRU-3-SPO-ONK-01'], 'Teste');
    let request = (await listOltRegionRequests()).find((item) => item.olt === olt);
    assert.ok(request);
    assert.equal(request.occurrences, 1);

    await captureUnknownOltRequests([olt], 'Teste');
    request = (await listOltRegionRequests()).find((item) => item.olt === olt);
    assert.equal(request?.occurrences, 2);

    await ignoreOltRegionRequest(request!.id);
    await captureUnknownOltRequests([olt], 'Teste');
    assert.equal((await listOltRegionRequests()).some((item) => item.olt === olt), false);
  });
});

test('accepted OLT request adds a manual mapping and leaves the pending queue', async () => {
  await withDemoRuntime(async () => {
    const olt = makeUnknownOlt('ADD');
    await captureUnknownOltRequests([olt], 'Teste');
    const request = (await listOltRegionRequests()).find((item) => item.olt === olt);
    assert.ok(request);

    await acceptOltRegionRequest(request.id, 'GUARULHOS 3');

    assert.equal((await listOltRegionMappings()).find((item) => item.olt === olt)?.region, 'GUARULHOS 3');
    assert.equal((await listOltRegionRequests()).some((item) => item.olt === olt), false);
  });
});

test('custom operational regions can be added and listed independently of OLT mappings', async () => {
  await withDemoRuntime(async () => {
    const region = `REGIAO TESTE ${crypto.randomUUID().slice(0, 8)}`;

    assert.equal(await addCustomOperationalRegion(region.toLowerCase()), region.toUpperCase());
    assert.ok((await listCustomOperationalRegions()).includes(region.toUpperCase()));
    await assert.rejects(() => addCustomOperationalRegion(region.toLowerCase()), /ja esta cadastrada/);
  });
});