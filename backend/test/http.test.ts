import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import test from 'node:test';

const port = 3433;
const baseUrl = `http://127.0.0.1:${port}`;
let server: ChildProcess;

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Backend nao iniciou a tempo.');
}

test.before(async () => {
  server = spawn(process.execPath, ['--import', 'tsx/esm', 'src/server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      REDEFLOW_RUNTIME: 'local',
      REDEFLOW_DEMO_DATA: 'true',
      PORT: String(port),
      JWT_SECRET: 'test-jwt-secret',
      WUZAPI_WEBHOOK_TOKEN: 'test-webhook-token',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    stdio: 'ignore',
  });
  await waitForServer();
});

test.after(() => {
  server.kill();
});

test('healthcheck exposes security headers', async () => {
  const response = await fetch(`${baseUrl}/health`, { headers: { origin: 'http://127.0.0.1:5173' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
});

test('login rejects repeated attempts and protects the endpoint under light concurrency', async () => {
  const payload = JSON.stringify({ email: 'unknown@example.com', password: 'wrong-password' });
  const attempts = await Promise.all(
    Array.from({ length: 6 }, () => fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    })),
  );
  assert.deepEqual(attempts.map((response) => response.status).sort((left, right) => left - right), [401, 401, 401, 401, 401, 429]);

  const startedAt = performance.now();
  const healthChecks = await Promise.all(Array.from({ length: 40 }, () => fetch(`${baseUrl}/health`)));
  const elapsedMs = performance.now() - startedAt;
  assert.ok(healthChecks.every((response) => response.status === 200));
  assert.ok(elapsedMs < 3000, `healthcheck concorrente demorou ${Math.round(elapsedMs)}ms`);
});

test('only active technicians can receive calls and their status can change', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const statusResponse = await fetch(`${baseUrl}/api/tecnicos/tech-bruno`, { method: 'PATCH', headers, body: JSON.stringify({ currentStatus: 'Indisponivel' }) });
  const assignmentResponse = await fetch(`${baseUrl}/api/chamados/call-240918-01`, { method: 'PATCH', headers, body: JSON.stringify({ technicianId: 'tech-bruno' }) });
  assert.equal(statusResponse.status, 200);
  assert.equal(assignmentResponse.status, 422);
});

test('does not create duplicate activations when WuzAPI retries a message', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const payload = JSON.stringify({ id: 'wuz-message-dedup-test', chatId: '120363422003961917@g.us', message: 'ORDEM: DEDUP-001\nMOTIVO: teste' });
  const first = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, { method: 'POST', headers, body: payload });
  const second = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, { method: 'POST', headers, body: payload });
  const firstBody = await first.json() as { activationId: string };
  const secondBody = await second.json() as { activationId: string; duplicate?: boolean };
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.equal(secondBody.activationId, firstBody.activationId);
  assert.equal(secondBody.duplicate, true);
});
