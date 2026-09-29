import assert from 'node:assert/strict';
import test from 'node:test';
import { getDashboardMetrics, getSupervisorIdForUser, listAuditLogs, listCalls, updateCall, createDriveCall, deleteAllCalls, recordDriveCallSnapshot, recordDriveSyncRun } from '../src/store.js';
import { buildDriveCall } from '../src/integrations/google-drive.js';
import { analyzeOperationalMessage } from '../src/integrations/wuzapi/semantic.js';
import { decideActivation, receiveActivation } from '../src/store.js';

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

    const imported = buildDriveCall({ BDESK: 'BD-99501', 'Tipo de Atividade': 'Manutencao Corretiva de Rede', 'Status da Atividade': 'Concluido', Data: '27/09/2026', Fim: '12:15', Motivo: 'Falha de rede' });
    assert.ok(imported);
    assert.equal(imported.status, 'Finalizado');
    assert.equal(imported.sourceIdentity, 'bdesk:bd99501');
    assert.equal(imported.openedAt.slice(0, 10), '2026-09-27');

    const sourceData = { identity: imported.sourceIdentity!, identifiers: imported.sourceIdentifiers!, fileId: 'drive-file-test', fileName: 'base.csv', referenceDate: '2026-09-27', fingerprint: 'test-fingerprint', payload: { BDESK: 'BD-99501' } };
    const created = await createDriveCall({ ...imported, id: 'call-drive-history-test' }, sourceData);
    const repeated = await createDriveCall({ ...imported, id: 'call-drive-history-duplicate' }, sourceData);
    assert.equal(created.created, true);
    assert.equal(repeated.created, false);
    assert.equal((await getDashboardMetrics({ from: '2026-09-27', to: '2026-09-27' })).finished, 1);

    const reconciled = await updateCall(created.call.id, { status: 'Cancelado', cancellationReason: 'Cancelamento confirmado' }, { id: 'system-google-drive', name: 'Google Drive', email: 'system@example.com', roleId: 'system', active: true, createdAt: executedAt });
    assert.equal(reconciled?.status, 'Cancelado');
    assert.equal(reconciled?.cancellationReason, 'Cancelamento confirmado');
    assert.equal((await getDashboardMetrics({ from: '2026-09-27', to: '2026-09-27' })).cancelled, 1);
    await recordDriveCallSnapshot(created.call.id, { ...sourceData, fingerprint: 'updated-fingerprint' });
    assert.equal((await listCalls()).find((item) => item.id === created.call.id)?.sourceFingerprint, 'updated-fingerprint');
    await recordDriveSyncRun(executedAt, { files: 1, rows: 1, processed: 1, newRecords: 1, updated: 0, finalised: 1, cancelled: 0, unchanged: 0, unmatched: 0, skipped: 0, errors: [] });
    assert.ok((await listAuditLogs(created.call.id)).some((entry) => entry.userName === 'Google Drive'));
  } finally {
    if (previousRuntime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previousRuntime;
    if (previousDemoData === undefined) delete process.env.REDEFLOW_DEMO_DATA; else process.env.REDEFLOW_DEMO_DATA = previousDemoData;
    if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousSupabaseUrl;
    if (previousSupabaseAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousSupabaseAnon;
    if (previousSupabaseServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabaseServiceRole;
  }
});

test('accepted NOC and Drive FIELD calls persist the official neighborhood and address', async () => {
  const previousRuntime = process.env.REDEFLOW_RUNTIME;
  const previousDemoData = process.env.REDEFLOW_DEMO_DATA;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousSupabaseUrl = process.env.SUPABASE_URL;
  const previousSupabaseAnon = process.env.SUPABASE_ANON_KEY;
  const previousSupabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.REDEFLOW_RUNTIME = 'local';
    process.env.REDEFLOW_DEMO_DATA = 'true';
    process.env.DATABASE_URL = '';
    process.env.SUPABASE_URL = '';
    process.env.SUPABASE_ANON_KEY = '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';

    const message = '⚠️VALIDAR COM NOC ACESSO⚠️\nBDESK: NOC-BARRIO-TEST-329\nOLT: VIP-CT1-SPO-OHW-01\n- Endereços:\nCEP: 01000-000\nRUA BOCAIÚVA, 250, COLOMBIA, DIADEMA - SP\n- COPE REDE: NICOLLI';
    const analysis = analyzeOperationalMessage(message);
    assert.equal(analysis.bairro_principal, 'COLOMBIA');
    const activation = await receiveActivation({
      source: 'wuzapi-test',
      originalMessage: message,
      extractedData: { orderNumber: 'NOC-BARRIO-TEST-329', bdesk: 'NOC-BARRIO-TEST-329', type: 'NOC ACESSO', reason: 'Falha de rede', olt: 'VIP-CT1-SPO-OHW-01' },
      analysis,
    });
    const accepted = await decideActivation(activation.id, 'Aceito', { id: 'user-matheus', name: 'Test Operator', email: 'operator@example.com', roleId: 'role-operator', active: true, createdAt: new Date().toISOString() });
    assert.ok(accepted.call);
    assert.equal(accepted.call?.bairro, 'COLOMBIA');
    assert.ok(accepted.call?.address);
    assert.equal(accepted.call?.region, 'CIDADE TIRADENTES 1');
    const actor = { id: 'user-matheus', name: 'Test Operator', email: 'operator@example.com', roleId: 'role-operator', active: true, createdAt: new Date().toISOString() };
    const originalNocAddress = accepted.call!.address;
    const updatedNoc = await updateCall(accepted.call!.id, { olt: 'VIP-SZN-SPO-OHW-01', bairro: '', address: '' }, actor);
    assert.equal(updatedNoc?.bairro, 'COLOMBIA');
    assert.equal(updatedNoc?.address, originalNocAddress);
    assert.equal(updatedNoc?.region, 'SUZANO');

    const fieldCall = buildDriveCall({ BDESK: 'BD-FIELD-TEST-01', 'Tipo de Atividade': 'Manutencao de Rede Field', 'Status da Atividade': 'Concluido', Endereco: 'RUA RUA BOCAIÚVA, 250 PIRAPORINHA, DIADEMA - SP', Cidade: 'DIADEMA', Estado: 'SP', 'CEP/Código Postal': '9950640', OLT: 'VIP-SZN-SPO-OHW-01' });
    assert.equal(fieldCall?.bairro, 'PIRAPORINHA');
    assert.match(fieldCall?.address || '', /^RUA BOCAIÚVA/);
    assert.equal(fieldCall?.region, 'SUZANO');
    assert.ok(fieldCall);
    const persistedField = await createDriveCall({ ...fieldCall, id: 'call-field-neighborhood-test' }, { identity: fieldCall.sourceIdentity!, identifiers: fieldCall.sourceIdentifiers!, fileId: 'drive-field-test', fileName: 'base.csv', referenceDate: '2026-09-27', fingerprint: 'field-neighborhood-test', payload: { Endereco: 'RUA RUA BOCAIÚVA, 250 PIRAPORINHA, DIADEMA - SP' } });
    assert.equal(persistedField.call.bairro, 'PIRAPORINHA');

    const noAddressCall = buildDriveCall({ BDESK: 'BD-FIELD-TEST-02', 'Tipo de Atividade': 'Manutencao de Rede Field', 'Status da Atividade': 'Concluido', Cidade: 'DIADEMA' });
    assert.equal(noAddressCall?.bairro || '', '');
    const neighborhoodMetrics = await getDashboardMetrics();
    assert.ok(neighborhoodMetrics.byNeighborhood.some((item) => item.label === 'COLOMBIA'));
    assert.ok(neighborhoodMetrics.byNeighborhood.some((item) => item.label === 'PIRAPORINHA'));
  } finally {
    if (previousRuntime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previousRuntime;
    if (previousDemoData === undefined) delete process.env.REDEFLOW_DEMO_DATA; else process.env.REDEFLOW_DEMO_DATA = previousDemoData;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousSupabaseUrl;
    if (previousSupabaseAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousSupabaseAnon;
    if (previousSupabaseServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabaseServiceRole;
  }
});

test('bulk deletion removes every call and returns the number deleted', async () => {
  const previousRuntime = process.env.REDEFLOW_RUNTIME;
  const previousDemoData = process.env.REDEFLOW_DEMO_DATA;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousSupabaseUrl = process.env.SUPABASE_URL;
  const previousSupabaseAnon = process.env.SUPABASE_ANON_KEY;
  const previousSupabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.REDEFLOW_RUNTIME = 'local';
    process.env.REDEFLOW_DEMO_DATA = 'true';
    process.env.DATABASE_URL = '';
    process.env.SUPABASE_URL = '';
    process.env.SUPABASE_ANON_KEY = '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';
    const initialCalls = await listCalls();
    assert.ok(initialCalls.length > 0);
    assert.equal(await deleteAllCalls(), initialCalls.length);
    assert.deepEqual(await listCalls(), []);
  } finally {
    if (previousRuntime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previousRuntime;
    if (previousDemoData === undefined) delete process.env.REDEFLOW_DEMO_DATA; else process.env.REDEFLOW_DEMO_DATA = previousDemoData;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousSupabaseUrl;
    if (previousSupabaseAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousSupabaseAnon;
    if (previousSupabaseServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabaseServiceRole;
  }
});
