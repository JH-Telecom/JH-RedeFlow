import assert from 'node:assert/strict';
import test from 'node:test';
import { getDashboardMetrics, getSupervisorIdForUser, listCalls, updateCall } from '../src/store.js';

test('supervisor users resolve to their own team and can only see their calls', async () => {
  const previousRuntime = process.env.REDEFLOW_RUNTIME;
  const previousDemoData = process.env.REDEFLOW_DEMO_DATA;
  const previousSupabaseUrl = process.env.SUPABASE_URL;
  const previousSupabaseAnon = process.env.SUPABASE_ANON_KEY;
  const previousSupabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.REDEFLOW_RUNTIME = 'local';
    process.env.REDEFLOW_DEMO_DATA = 'true';
    process.env.SUPABASE_URL = '';
    process.env.SUPABASE_ANON_KEY = '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';

    const supervisorId = await getSupervisorIdForUser('user-joao');
    assert.equal(supervisorId, 'supervisor-joao');

    const calls = await listCalls(undefined, { supervisorId: 'supervisor-joao' });
    assert.ok(calls.some((call) => call.id === 'call-240917-01'));
    assert.ok(!calls.some((call) => call.id === 'call-240916-01'));
    assert.ok(calls.every((call) => !call.technicianId || call.supervisorName === 'Joao da Silva'));
  } finally {
    if (previousRuntime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previousRuntime;
    if (previousDemoData === undefined) delete process.env.REDEFLOW_DEMO_DATA; else process.env.REDEFLOW_DEMO_DATA = previousDemoData;
    if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousSupabaseUrl;
    if (previousSupabaseAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousSupabaseAnon;
    if (previousSupabaseServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabaseServiceRole;
  }
});

test('historical date filters use execution date for finished calls and dashboard metrics', async () => {
  const previousRuntime = process.env.REDEFLOW_RUNTIME;
  const previousDemoData = process.env.REDEFLOW_DEMO_DATA;
  const previousSupabaseUrl = process.env.SUPABASE_URL;
  const previousSupabaseAnon = process.env.SUPABASE_ANON_KEY;
  const previousSupabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.REDEFLOW_RUNTIME = 'local';
    process.env.REDEFLOW_DEMO_DATA = 'true';
    process.env.SUPABASE_URL = '';
    process.env.SUPABASE_ANON_KEY = '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';

    const call = (await listCalls()).find((item) => item.id === 'call-240918-01');
    assert.ok(call);
    const executedAt = '2026-09-28T10:30:00.000Z';
    const updated = await updateCall(call.id, { status: 'Finalizado', executedAt }, { id: 'test-user', name: 'Test User', email: 'test@example.com', roleId: 'role-operator', active: true, createdAt: executedAt });
    assert.equal(updated?.status, 'Finalizado');

    const filteredCalls = await listCalls(undefined, { from: '2026-09-28', to: '2026-09-28' });
    assert.ok(filteredCalls.some((item) => item.id === call.id));
    const metrics = await getDashboardMetrics({ from: '2026-09-28', to: '2026-09-28' });
    assert.equal(metrics.finished, 1);
  } finally {
    if (previousRuntime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previousRuntime;
    if (previousDemoData === undefined) delete process.env.REDEFLOW_DEMO_DATA; else process.env.REDEFLOW_DEMO_DATA = previousDemoData;
    if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousSupabaseUrl;
    if (previousSupabaseAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousSupabaseAnon;
    if (previousSupabaseServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabaseServiceRole;
  }
});
