import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseIncomingMessage } from '../src/integrations/wuzapi/client.js';

let port = 3433;
let baseUrl = `http://127.0.0.1:${port}`;
let server: ChildProcess | undefined;

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

async function stopServer() {
  if (!server) return;

  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server!.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
  server = undefined;
}

async function startServer() {
  await stopServer();

  port = 3433 + (Math.floor(Math.random() * 1000) % 1000);
  baseUrl = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, ['--import', 'tsx/esm', 'src/server.ts'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      REDEFLOW_RUNTIME: 'local',
      REDEFLOW_DEMO_DATA: 'true',
      DATABASE_URL: '',
      PORT: String(port),
      JWT_SECRET: 'test-jwt-secret',
      WUZAPI_WEBHOOK_TOKEN: 'test-webhook-token',
      WUZAPI_ACTIVATION_GROUP_ID: '120363422003961917@g.us',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    stdio: 'ignore',
  });

  await waitForServer();
}

test.beforeEach(async () => {
  await startServer();
});

test.after(async () => {
  await stopServer();
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

test('prefers Supabase whenever credentials are configured, even if runtime is local', async () => {
  const previousRuntime = process.env.REDEFLOW_RUNTIME;
  const previousUrl = process.env.SUPABASE_URL;
  const previousAnon = process.env.SUPABASE_ANON_KEY;
  const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.REDEFLOW_RUNTIME = 'local';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    const { isSupabaseConfigured } = await import('../src/integrations/supabase/client.js');
    assert.equal(isSupabaseConfigured(), true);
  } finally {
    if (previousRuntime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previousRuntime;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousAnon;
    if (previousServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
  }
});

test('falls back to built-in roles when Supabase is configured but unreachable', async () => {
  const previousRuntime = process.env.REDEFLOW_RUNTIME;
  const previousUrl = process.env.SUPABASE_URL;
  const previousAnon = process.env.SUPABASE_ANON_KEY;
  const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.REDEFLOW_RUNTIME = 'local';
    process.env.SUPABASE_URL = 'http://127.0.0.1:1';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    const { getRoleById } = await import('../src/store.js');
    const role = await getRoleById('role-operator');
    assert.ok(role);
    assert.equal(role?.id, 'role-operator');
    assert.equal(role?.name, 'Operador');
  } finally {
    if (previousRuntime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previousRuntime;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousAnon;
    if (previousServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
  }
});

test('surfaces a clear error when a role update is attempted against a configured but unreachable Supabase instance', async () => {
  const previousRuntime = process.env.REDEFLOW_RUNTIME;
  const previousUrl = process.env.SUPABASE_URL;
  const previousAnon = process.env.SUPABASE_ANON_KEY;
  const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.REDEFLOW_RUNTIME = 'local';
    process.env.SUPABASE_URL = 'http://127.0.0.1:1';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    const { updateRole } = await import('../src/store.js');
    await assert.rejects(
      () => updateRole('11111111-1111-1111-1111-111111111111', { permissions: ['dashboard.view'] }),
      /Supabase|configur|nao foi possivel/i,
    );
  } finally {
    if (previousRuntime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previousRuntime;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousAnon;
    if (previousServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
  }
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

  const longSlotPon = Array.from({ length: 80 }, (_, index) => `01/${String(index + 1).padStart(2, '0')}`).join(', ');
  const saveResponse = await fetch(`${baseUrl}/api/chamados/call-240918-01`, { method: 'PATCH', headers, body: JSON.stringify({ slotPon: longSlotPon }) });
  assert.equal(saveResponse.status, 200);
});

test('shares, replaces and clears the daily dashboard base', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const data = { activities: [], technicians: [], orders: [], updatedAt: new Date().toLocaleString('pt-BR') };

  const firstSave = await fetch(`${baseUrl}/api/dashboards/painel-diario/base`, { method: 'PUT', headers, body: JSON.stringify({ fileName: 'base-a.csv', data }) });
  assert.equal(firstSave.status, 200);
  const firstBase = await firstSave.json() as { base: { fileName: string } };
  assert.equal(firstBase.base.fileName, 'base-a.csv');

  const replacement = await fetch(`${baseUrl}/api/dashboards/painel-diario/base`, { method: 'PUT', headers, body: JSON.stringify({ fileName: 'base-b.csv', data }) });
  assert.equal(replacement.status, 200);
  const shared = await fetch(`${baseUrl}/api/dashboards/painel-diario/base`, { headers });
  const sharedBody = await shared.json() as { base: { fileName: string } };
  assert.equal(shared.status, 200);
  assert.equal(sharedBody.base.fileName, 'base-b.csv');

  const cleared = await fetch(`${baseUrl}/api/dashboards/painel-diario/base`, { method: 'DELETE', headers });
  assert.equal(cleared.status, 200);
  const afterClear = await fetch(`${baseUrl}/api/dashboards/painel-diario/base`, { headers });
  const afterClearBody = await afterClear.json() as { base?: unknown };
  assert.equal(afterClearBody.base, undefined);
});

test('parses WuzAPI group metadata without conflating sender and chat', () => {
  const payload = {
    event: {
      Info: {
        Chat: '120363422003961917@g.us',
        Sender: '551199999999@s.whatsapp.net',
        IsGroup: true,
        ID: 'msg-123',
      },
      type: 'Message',
      Message: {
        conversation: 'VALIDAR COM NOC ACESSO\nORDEM: RF-TESTE-99\nMOTIVO: perda de sinal',
      },
    },
  };

  const parsed = parseIncomingMessage(payload);
  assert.equal(parsed.chatId, '120363422003961917@g.us');
  assert.equal(parsed.sender, '551199999999@s.whatsapp.net');
  assert.equal(parsed.isGroup, true);
  assert.equal(parsed.message?.startsWith('VALIDAR COM NOC ACESSO'), true);
});

test('ignores private WuzAPI messages and rejects mismatched groups', async () => {
  const privateMessage = JSON.stringify({
    type: 'Message',
    event: {
      Info: {
        Sender: '551199999999@s.whatsapp.net',
        IsGroup: false,
      },
      Message: { conversation: 'ORDEM: RF-PRIVATE-01' },
    },
  });
  const privateResponse = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: privateMessage,
  });
  assert.equal(privateResponse.status, 202);
  const privateBody = await privateResponse.json() as { status?: string; reason?: string };
  assert.equal(privateBody.status, 'ignored');

  const mismatchResponse = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event: {
        type: 'Message',
        Info: {
          Chat: 'other-group@g.us',
          Sender: '551199999999@s.whatsapp.net',
          IsGroup: true,
        },
        Message: { conversation: 'ORDEM: RF-OTHER-01\nMOTIVO: teste' },
      },
    }),
  });
  assert.equal(mismatchResponse.status, 202);
  const mismatchBody = await mismatchResponse.json() as { status?: string; reason?: string; chatId?: string };
  assert.equal(mismatchBody.status, 'ignored');
  assert.equal(mismatchBody.reason, 'Grupo nao autorizado.');
});

test('admin can delete a test call through the protected API route', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };

  const deleteResponse = await fetch(`${baseUrl}/api/chamados/call-240918-02`, {
    method: 'DELETE',
    headers,
  });

  assert.equal(deleteResponse.status, 200);
  const body = await deleteResponse.json() as { deleted: boolean };
  assert.equal(body.deleted, true);

  const fetchResponse = await fetch(`${baseUrl}/api/chamados/call-240918-02`, {
    headers,
  });
  assert.equal(fetchResponse.status, 404);
});

test('does not create duplicate activations when WuzAPI retries a message', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const payload = JSON.stringify({ id: 'wuz-message-dedup-test', type: 'Message', chatId: '120363422003961917@g.us', isGroup: true, message: 'ORDEM: DEDUP-001\nMOTIVO: teste' });
  const first = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, { method: 'POST', headers, body: payload });
  const second = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, { method: 'POST', headers, body: payload });
  const firstBody = await first.json() as { activationId: string };
  const secondBody = await second.json() as { activationId: string; duplicate?: boolean };
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.equal(secondBody.activationId, firstBody.activationId);
  assert.equal(secondBody.duplicate, true);
});

test('does not create duplicate activations when the same call has different message IDs', async () => {
  const payload = (id: string) => JSON.stringify({ id, type: 'Message', chatId: '120363422003961917@g.us', isGroup: true, message: 'VALIDAR COM NOC ACESSO\nBDESK: SAME-CALL-001\nTAREFA OFFICE TRACK: OT-SAME-CALL-001\nMOTIVO: teste' });
  const first = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload('different-id-1') });
  const second = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload('different-id-2') });
  const firstBody = await first.json() as { activationId: string };
  const secondBody = await second.json() as { activationId: string };
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.equal(secondBody.activationId, firstBody.activationId);
});

test('rejects missing chatId even when sender identifies a WhatsApp user', async () => {
  const response = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'Message', event: { Info: { Sender: '551199999999@s.whatsapp.net', IsGroup: true }, Message: { conversation: 'ORDEM: RF-NO-CHAT' } } }),
  });
  assert.equal(response.status, 202);
  assert.equal((await response.json() as { status?: string }).status, 'ignored');
});

test('accepts a valid jsonData group payload', async () => {
  const body = JSON.stringify({
    jsonData: JSON.stringify({
      type: 'Message',
      event: {
        Info: { ID: 'json-data-message', Chat: '120363422003961917@g.us', Sender: '551188888888@s.whatsapp.net', IsGroup: true },
        Message: { conversation: 'ORDEM: RF-JSON-DATA\nMOTIVO: teste' },
      },
    }),
  });
  const response = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  assert.equal(response.status, 202);
  assert.equal((await response.json() as { status?: string }).status, 'Pendente');
});
