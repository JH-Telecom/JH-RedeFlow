import assert from 'node:assert/strict';
import test from 'node:test';
import { getSupervisorIdForUser, listCalls } from '../src/store.js';

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
