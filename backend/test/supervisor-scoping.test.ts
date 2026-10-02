import assert from 'node:assert/strict';
import test from 'node:test';
import { getCall, getDashboardMetrics, getSupervisorIdForUser, listAuditLogs, listCalls, updateCall, createDriveCall, deleteAllCalls, recordDriveCallSnapshot, recordDriveSyncRun } from '../src/store.js';
import { buildDriveCall, buildDriveUpdate, driveRowSkipReason, hasMeaningfulCallChange, isDriveRowEligible, shouldSkipDriveUpdate } from '../src/integrations/google-drive.js';
import { analyzeOperationalMessage } from '../src/integrations/wuzapi/semantic.js';
import { decideActivation, receiveActivation } from '../src/store.js';
import { calculateIgpMetrics, classifyIgpArea } from '../src/igp.js';

test('Google Drive preserves the OFS activity status separately from internal call status', () => {
  const row = { 'Número da Ordem': '12517410', 'Tipo de Atividade': 'Manutencao de Rede Field', 'Status da Atividade': 'Concluido', 'Status OFS': 'Concluída', 'Data Abertura': '29/09/2026 13:12', 'Data-Fim': '29/09/2026 18:08', 'Nome do Cliente': 'Cliente de teste' };
  const imported = buildDriveCall(row);

  assert.ok(imported);
  assert.equal(imported.orderNumber, '12517410');
  assert.equal(imported.status, 'Finalizado');
  assert.equal(imported.ofsStatus, 'Concluída');

  const existing = { ...imported, ofsStatus: undefined };
  const update = buildDriveUpdate(row, existing);
  assert.equal(update.status, 'Finalizado');
  assert.equal(update.ofsStatus, 'Concluída');
  assert.equal(hasMeaningfulCallChange(existing, update), true);
});

test('Google Drive sync accepts ACIONAMENTO FIELD and fills address and neighborhood', () => {
  const row = {
    'Ordem de Serviço': '12529279',
    'Office Track': '12529279',
    'Tipo de Atividade': 'ACIONAMENTO FIELD',
    'Status da Atividade': 'Finalizado',
    'Endereço': 'RUA DO FUTURO (DJ RUYCE), 152, JARDIM MUTINGA, GUARULHOS - SP',
    Cidade: 'GUARULHOS',
  };
  const imported = buildDriveCall(row);

  assert.equal(isDriveRowEligible(row), true);
  assert.equal(imported?.address, row['Endereço']);
  assert.equal(imported?.bairro, 'JARDIM MUTINGA');

  const existing = { ...imported!, address: '', bairro: '' };
  const update = buildDriveUpdate(row, existing);
  assert.equal(update.address, row['Endereço']);
  assert.equal(update.bairro, 'JARDIM MUTINGA');
  assert.equal(hasMeaningfulCallChange(existing, update), true);
});

test('Google Drive sync accepts NOC access and backbone rows so finalized calls can reconcile', () => {
  for (const type of ['NOC ACESSO', 'NOC TX']) {
    const row = { 'Ordem de Serviço': `OS-${type}`, 'Tipo de Atividade': type, 'Status da Atividade': 'Finalizado', 'Data-Fim': '02/10/2026', Fim: '10:30' };
    const imported = buildDriveCall(row);
    assert.equal(isDriveRowEligible(row), true);
    assert.equal(imported?.status, 'Finalizado');

    const existing = { ...imported!, status: 'Aberto' as const, executedAt: undefined };
    const update = buildDriveUpdate(row, existing);
    assert.equal(update.status, 'Finalizado');
    assert.equal(hasMeaningfulCallChange(existing, update), true);
  }
});

test('Google Drive reports why rows are skipped', () => {
  assert.equal(driveRowSkipReason({ 'Tipo de Atividade': 'Tipo desconhecido', Status: 'Finalizado' }), 'unsupported-activity');
  assert.equal(driveRowSkipReason({ 'Tipo de Atividade': 'NOC ACESSO', Status: 'Pendente' }), 'pending');
  assert.equal(driveRowSkipReason({ 'Tipo de Atividade': 'NOC ACESSO', Status: 'Finalizado', Motivo: 'Não cumprimento' }), 'non-compliance');
  assert.equal(driveRowSkipReason({ 'Tipo de Atividade': 'NOC ACESSO', Status: 'Finalizado' }), undefined);
});

test('Google Drive reconciles a call drifted from an unchanged source fingerprint', () => {
  const row = { 'Ordem de Serviço': 'OS-DRIFT-1', 'Tipo de Atividade': 'NOC ACESSO', 'Status da Atividade': 'Finalizado', 'Data Abertura': '01/10/2026', 'Data-Fim': '02/10/2026', Fim: '10:30' };
  const imported = buildDriveCall(row);
  assert.ok(imported);
  const staleCall = { ...imported, source: 'google-drive', sourceFingerprint: 'same-fingerprint', status: 'Aberto' as const, openedAt: '2026-09-01T00:00:00-03:00', executedAt: undefined };
  const update = buildDriveUpdate(row, staleCall);

  assert.equal(shouldSkipDriveUpdate(staleCall, 'same-fingerprint', update), false);
  assert.equal(update.status, 'Finalizado');
  assert.equal(update.openedAt, '2026-10-01T00:00:00-03:00');

  const reconciledCall = { ...staleCall, status: 'Finalizado' as const, openedAt: update.openedAt || staleCall.openedAt, executedAt: update.executedAt };
  assert.equal(shouldSkipDriveUpdate(reconciledCall, 'same-fingerprint', buildDriveUpdate(row, reconciledCall)), true);
});

test('Google Drive preserves an explicit neighborhood when address is absent', () => {
  const imported = buildDriveCall({
    'Ordem de Serviço': '12529280',
    'Tipo de Atividade': 'ACIONAMENTO FIELD',
    'Status da Atividade': 'Pendente',
    Cidade: 'GUARULHOS',
    Bairro: 'JARDIM MUTINGA',
  });

  assert.equal(imported?.address, '');
  assert.equal(imported?.bairro, 'JARDIM MUTINGA');
});

test('IGP calculates weighted monthly indicators for Access and Backbone', () => {
  for (const region of ['GUARULHOS 1', 'GUARULHOS 2', 'GUARULHOS 3', 'GUARULHOS 4', 'GUARULHOS 5']) {
    assert.equal(classifyIgpArea(region), 'GRU');
  }
  for (const region of ['GUARULHOS', 'GUARULHOS 6', 'GUAIANASES 1', 'DIADEMA']) {
    assert.equal(classifyIgpArea(region), 'SP');
  }
  for (const region of ['FERRAZ DE VASCONCELOS 2', 'MOGI DAS CRUZES', 'MOGI 1', 'MOGI 2', 'PALMEIRAS', 'SUZANO', 'FERRAZ DE VASCONCELOS', 'FERRAZ DE VASCONCELOS 1']) {
    assert.equal(classifyIgpArea(region), 'ALTO_TIETE');
  }
  assert.equal(classifyIgpArea('MOGI 3'), 'SP');

  const createCall = (id: string, type: string, status: Call['status'], openedAt: string, executedAt?: string, region = 'SÃO PAULO'): Call => ({
    id,
    orderNumber: id,
    bdesk: '',
    officeTrack: '',
    client: '',
    type,
    reason: '',
    region,
    city: '',
    olt: '',
    slotPon: '',
    status,
    openedAt,
    executedAt,
    notes: '',
  });
  const metrics = calculateIgpMetrics([
    createCall('access-on-time', 'NOC ACESSO', 'Finalizado', '2026-09-02T00:00:00.000Z', '2026-09-02T08:00:00.000Z'),
    createCall('access-outlier', 'ACIONAMENTO FIELD', 'Finalizado', '2026-09-03T00:00:00.000Z', '2026-09-03T11:00:00.000Z'),
    createCall('backbone-late', 'NOC TX', 'Finalizado', '2026-09-04T00:00:00.000Z', '2026-09-04T09:00:00.000Z'),
    createCall('unknown-type', 'BAIXA TECNICA', 'Finalizado', '2026-09-05T00:00:00.000Z', '2026-09-05T04:00:00.000Z'),
    createCall('open-call', 'NOC TX', 'Aberto', '2026-09-05T00:00:00.000Z'),
    createCall('other-month', 'NOC TX', 'Finalizado', '2026-10-01T00:00:00.000Z', '2026-10-01T02:00:00.000Z'),
  ], '2026-09');

  assert.equal(metrics.access.orders, 2);
  assert.equal(metrics.access.outlierPercent, 50);
  assert.equal(metrics.access.onTimePercent, 50);
  assert.equal(metrics.access.mttrHours, 9.5);
  assert.equal(metrics.backbone.orders, 1);
  assert.equal(metrics.backbone.outlierPercent, 0);
  assert.equal(metrics.backbone.onTimePercent, 0);
  assert.equal(metrics.total.orders, 3);
  assert.ok(Math.abs(metrics.total.outlierPercent! - 100 / 3) < 1e-10);
  assert.ok(Math.abs(metrics.total.onTimePercent! - 100 / 3) < 1e-10);
  assert.equal(metrics.total.mttrHours, 28 / 3);
  assert.equal(metrics.excludedOrders, 1);

  const guarulhosMetrics = calculateIgpMetrics([
    createCall('gru-call', 'NOC ACESSO', 'Finalizado', '2026-09-02T00:00:00.000Z', '2026-09-02T04:00:00.000Z', 'GUARULHOS 3'),
    createCall('sp-call', 'NOC TX', 'Finalizado', '2026-09-02T00:00:00.000Z', '2026-09-02T04:00:00.000Z', 'DIADEMA'),
  ], '2026-09', 'GRU');
  assert.equal(guarulhosMetrics.area, 'GRU');
  assert.equal(guarulhosMetrics.total.orders, 1);
  assert.equal(guarulhosMetrics.access.orders, 1);
  assert.equal(guarulhosMetrics.backbone.orders, 0);
  const altoTieteMetrics = calculateIgpMetrics([
    createCall('alto-tiete-call', 'NOC TX', 'Finalizado', '2026-09-02T00:00:00.000Z', '2026-09-02T04:00:00.000Z', 'MOGI DAS CRUZES'),
  ], '2026-09', 'ALTO_TIETE');
  assert.equal(altoTieteMetrics.total.orders, 1);
  assert.equal(altoTieteMetrics.backbone.orders, 1);
});

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

test('call detail lookup returns only the requested ID', async () => {
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

    const call = await getCall('call-240918-01');
    const filtered = await listCalls(undefined, { id: 'call-240918-01' });
    const missing = await getCall('call-does-not-exist');
    const outsideSupervisorScope = await getCall('call-240916-01', { supervisorId: 'supervisor-joao' });

    assert.equal(call?.id, 'call-240918-01');
    assert.deepEqual(filtered.map((item) => item.id), ['call-240918-01']);
    assert.equal(missing, undefined);
    assert.equal(outsideSupervisorScope, undefined);
  } finally {
    if (previousRuntime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previousRuntime;
    if (previousDemoData === undefined) delete process.env.REDEFLOW_DEMO_DATA; else process.env.REDEFLOW_DEMO_DATA = previousDemoData;
    if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousSupabaseUrl;
    if (previousSupabaseAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousSupabaseAnon;
    if (previousSupabaseServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabaseServiceRole;
  }
});

test('call listing accepts a set of statuses without including open calls', async () => {
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

    const allCalls = await listCalls();
    const closedStatuses = ['Finalizado', 'Cancelado', 'Baixar'] as const;
    const closedCalls = await listCalls([...closedStatuses]);

    assert.ok(allCalls.some((call) => !closedStatuses.includes(call.status as typeof closedStatuses[number])));
    assert.deepEqual(closedCalls.map((call) => call.id), allCalls.filter((call) => closedStatuses.includes(call.status as typeof closedStatuses[number])).map((call) => call.id));
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

test('D-1 maps Nome to the client field only for FIELD activities', () => {
  const fieldRow = { BDESK: 'BD-FIELD-NAME-01', 'Tipo de Atividade': 'Manutencao de Rede Field', 'Status da Atividade': 'Concluido', Nome: 'Maria de Fatima' };
  const nonFieldRow = { BDESK: 'BD-NAME-01', 'Tipo de Atividade': 'Manutencao Corretiva de Rede', 'Status da Atividade': 'Concluido', Nome: 'Cliente fora de Field' };
  const fieldCall = buildDriveCall(fieldRow);
  const nonFieldCall = buildDriveCall(nonFieldRow);

  assert.equal(fieldCall?.client, 'Maria de Fatima');
  assert.equal(nonFieldCall?.client, '');
  assert.ok(fieldCall);
  assert.ok(nonFieldCall);

  const existingFieldCall = { ...fieldCall, client: 'Cliente nao identificado' };
  const fieldUpdate = buildDriveUpdate(fieldRow, existingFieldCall);
  assert.equal(fieldUpdate.client, 'Maria de Fatima');
  assert.equal(hasMeaningfulCallChange(existingFieldCall, fieldUpdate), true);

  const existingNonFieldCall = { ...nonFieldCall, client: 'Cliente existente' };
  const nonFieldUpdate = buildDriveUpdate(nonFieldRow, existingNonFieldCall);
  assert.equal(nonFieldUpdate.client, undefined);

  const locationRow = { ...fieldRow, Cidade: 'GUARULHOS', Endereco: 'CLT_RUA RUA LEVI RIOS DE OLIVEIRA, 172 PARQUE FLAMENGO, GUARULHOS - SP' };
  const existingLocationCall = { ...fieldCall, city: 'GUARULHOS', address: 'RUA LEVI RIOS DE OLIVEIRA, 172 PARQUE FLAMENGO, GUARULHOS - SP', bairro: '' };
  const locationUpdate = buildDriveUpdate(locationRow, existingLocationCall);
  assert.equal(locationUpdate.bairro, 'PARQUE FLAMENGO');
  const otherwiseUnchangedCall = { ...existingLocationCall, ...locationUpdate, bairro: '' };
  const changedFields = Object.entries(locationUpdate).filter(([field, value]) => String(otherwiseUnchangedCall[field as keyof typeof otherwiseUnchangedCall] ?? '') !== String(value ?? '')).map(([field]) => field);
  assert.deepEqual(changedFields, ['bairro']);
  assert.equal(hasMeaningfulCallChange(otherwiseUnchangedCall, locationUpdate), true);

  const callBeforeNeighborhood = { ...fieldCall, bairro: '' };
  const callAfterNeighborhood = { ...callBeforeNeighborhood, bairro: 'PARQUE FLAMENGO' };
  assert.equal(hasMeaningfulCallChange(callBeforeNeighborhood, callAfterNeighborhood), true);
});

test('D-1 infers FIELD city and neighborhood from address when the city column is unavailable', () => {
  const fieldCall = buildDriveCall({
    BDESK: 'BD-FIELD-LOCATION-01',
    'Tipo de Atividade': 'Manutencao de Rede Field',
    'Status da Atividade': 'Concluido',
    Cidade: 'Nao informada',
    Endereco: 'CLT_RUA RUA LEVI RIOS DE OLIVEIRA, 172 PARQUE FLAMENGO, GUARULHOS - SP',
  });

  assert.equal(fieldCall?.city, 'GUARULHOS');
  assert.equal(fieldCall?.address, 'RUA LEVI RIOS DE OLIVEIRA, 172 PARQUE FLAMENGO, GUARULHOS - SP');
  assert.equal(fieldCall?.bairro, 'PARQUE FLAMENGO');
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
