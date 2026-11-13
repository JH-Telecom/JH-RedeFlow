import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

let baseUrl = '';
let server: ChildProcess | undefined;

async function stopServer() {
  if (!server) return;
  server.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => server!.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 500))]);
  server = undefined;
}

// Cada teste sobe um backend novo (memoria local), entao os stores de rede comecam vazios.
async function startServer() {
  await stopServer();
  const port = 4433 + Math.floor(Math.random() * 1000);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['--import', 'tsx/esm', 'src/server.ts'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, NODE_ENV: 'test', REDEFLOW_RUNTIME: 'local', REDEFLOW_DEMO_DATA: 'true', DATABASE_URL: '', PORT: String(port), JWT_SECRET: 'test-jwt-secret', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', OFS_INGEST_TOKEN: 'test-ofs-token' },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/health`)).ok) return; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error('Backend nao iniciou a tempo.');
}

async function login(email: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'RedeFlow@2026' }) });
  const session = await response.json() as { token: string };
  return { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
}

const machine = { 'content-type': 'application/json', 'x-redeflow-ofs-token': 'test-ofs-token' };

test.beforeEach(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

test('rede: sem network.view a area do mapa responde 403', async () => {
  const headers = await login('joao@jhtelecom.com'); // supervisor
  const response = await fetch(`${baseUrl}/api/rede/area?minLat=-23.6&minLng=-46.7&maxLat=-23.5&maxLng=-46.6&zoom=15`, { headers });
  assert.equal(response.status, 403);
});

test('rede: caixa maior que 0,5 grau responde 400 e caixa pequena responde 200', async () => {
  const headers = await login('admin@jhtelecom.com');
  const big = await fetch(`${baseUrl}/api/rede/area?minLat=-24&minLng=-47&maxLat=-23&maxLng=-46&zoom=10`, { headers });
  assert.equal(big.status, 400);
  assert.equal((await big.json() as { message: string }).message, 'Aproxime o mapa.');
  const small = await fetch(`${baseUrl}/api/rede/area?minLat=-23.6&minLng=-46.7&maxLat=-23.5&maxLng=-46.6&zoom=15`, { headers });
  assert.equal(small.status, 200);
});

test('rede: a extensao nao consegue enviar cliente com nome ou endereco', async () => {
  const base = { olt: 'VIP-SMP-SPO-ONK-01', ponlink: '0/4/9', found: 1 };
  const client = { contract: '123', serial: null, int6: null, olt: 'VIP-SMP-SPO-ONK-01', ponlink: '0/4/9', signalRx: -20, onuStatus: 'ok', lastInform: null, lat: -23.55, lng: -46.63, readAt: new Date().toISOString() };
  const withName = await fetch(`${baseUrl}/api/integrations/autoisp/pon`, { method: 'POST', headers: machine, body: JSON.stringify({ ...base, clients: [{ ...client, name: 'Fulano de Tal' }] }) });
  assert.equal(withName.status, 400);
  const withAddress = await fetch(`${baseUrl}/api/integrations/autoisp/pon`, { method: 'POST', headers: machine, body: JSON.stringify({ ...base, clients: [{ ...client, address: 'Rua X, 1' }] }) });
  assert.equal(withAddress.status, 400);
  const ok = await fetch(`${baseUrl}/api/integrations/autoisp/pon`, { method: 'POST', headers: machine, body: JSON.stringify({ ...base, clients: [client] }) });
  assert.equal(ok.status, 200);
  const noAuth = await fetch(`${baseUrl}/api/integrations/autoisp/pons-pendentes`);
  assert.equal(noAuth.status, 401);
  const pending = await fetch(`${baseUrl}/api/integrations/autoisp/pons-pendentes`, { headers: machine });
  assert.equal(pending.status, 200);
  assert.ok(Array.isArray((await pending.json() as { itens: unknown[] }).itens));
});

test('rede: solicitar PON por chamado com duas PONs enfileira 2 e devolve as PONs normalizadas', async () => {
  const headers = await login('admin@jhtelecom.com');
  const patch = await fetch(`${baseUrl}/api/chamados/call-240918-01`, { method: 'PATCH', headers, body: JSON.stringify({ olt: 'vip-ct1-spo-ohw-01 ', slotPon: '04/10, 09/11' }) });
  assert.equal(patch.status, 200);
  const response = await fetch(`${baseUrl}/api/rede/pon/solicitar`, { method: 'POST', headers, body: JSON.stringify({ callId: 'call-240918-01' }) });
  assert.equal(response.status, 200);
  const body = await response.json() as { queued: number; skippedRecent: number; pons: Array<{ olt: string; ponlink: string }> };
  assert.equal(body.queued, 2);
  assert.equal(body.pons.length, 2);
  assert.deepEqual(body.pons.map((item) => item.ponlink), ['0/4/10', '0/9/11']);
  const pending = await fetch(`${baseUrl}/api/integrations/autoisp/pons-pendentes`, { headers: machine });
  assert.equal((await pending.json() as { itens: unknown[] }).itens.length, 2);
});

test('rede: chamado sem slot/PON responde 422 e chamado inexistente 404', async () => {
  const headers = await login('admin@jhtelecom.com');
  await fetch(`${baseUrl}/api/chamados/call-240918-02`, { method: 'PATCH', headers, body: JSON.stringify({ slotPon: '' }) });
  const empty = await fetch(`${baseUrl}/api/rede/pon/solicitar`, { method: 'POST', headers, body: JSON.stringify({ callId: 'call-240918-02' }) });
  assert.equal(empty.status, 422);
  assert.equal((await empty.json() as { message: string }).message, 'Este chamado nao tem OLT e slot/PON.');
  const missing = await fetch(`${baseUrl}/api/rede/pon/solicitar`, { method: 'POST', headers, body: JSON.stringify({ callId: 'nao-existe' }) });
  assert.equal(missing.status, 404);
});

test('rede: importacao, fontes e POP para OLT exigem network.manage', async () => {
  const admin = await login('admin@jhtelecom.com');
  const supervisor = await login('joao@jhtelecom.com');
  const batch = { fileName: 'penha.kmz', sha256: 'abc', first: true, elements: [{ kind: 'cto', code: 'CTO-1', name: 'CTO-1', projectCode: null, pop: 'PENHA', fh: null, lat: -23.53, lng: -46.54 }], cables: [] };
  assert.equal((await fetch(`${baseUrl}/api/rede/importacao`, { method: 'POST', headers: supervisor, body: JSON.stringify(batch) })).status, 403);
  const imported = await fetch(`${baseUrl}/api/rede/importacao`, { method: 'POST', headers: admin, body: JSON.stringify(batch) });
  assert.equal(imported.status, 200);
  const sources = await fetch(`${baseUrl}/api/rede/fontes`, { headers: admin });
  assert.equal((await sources.json() as { sources: Array<{ fileName: string }> }).sources[0]?.fileName, 'penha.kmz');
  const put = await fetch(`${baseUrl}/api/rede/pop-olt`, { method: 'PUT', headers: admin, body: JSON.stringify({ pop: 'PENHA', olt: 'VIP-SMP-SPO-ONK-01', active: true }) });
  assert.equal(put.status, 200);
  const list = await fetch(`${baseUrl}/api/rede/pop-olt`, { headers: admin });
  assert.equal((await list.json() as { popOlts: unknown[] }).popOlts.length, 1);
  const view = await fetch(`${baseUrl}/api/rede/pon?olt=VIP-SMP-SPO-ONK-01&ponlink=4/9`, { headers: admin });
  assert.equal(view.status, 200);
});
