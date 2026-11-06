import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx';
import { matchD0Rows, matchOfsTechnician, parseD0FinishedAt, technicianAssignmentsFromRows, type D0Row } from '../src/imports/d0.js';
import { parseImport } from '../src/imports/parser.js';
import { clearD0Base, getD0BaseSummary, listCalls, replaceD0Base } from '../src/store.js';
import type { Call } from '../src/types.js';

const call: Call = {
  id: 'call-d0-test',
  orderNumber: 'OS-2026-42',
  bdesk: 'BD-88421',
  officeTrack: 'OT-72014',
  client: 'Cliente teste',
  type: 'ACIONAMENTO FIELD',
  reason: 'Falha de rede',
  region: 'Sul',
  city: 'Diadema',
  address: '',
  bairro: '',
  olt: '',
  slotPon: '',
  status: 'Aberto',
  openedAt: '2026-09-29T08:00:00-03:00',
  notes: '',
};

test('D-0 enriches the unique call and keeps OFS status separate from internal status', () => {
  const row: D0Row = {
    'Número OS': 'OS-2026-42',
    'Status OFS': 'Concluída',
    Endereco: 'Rua das Flores, 10',
    Bairro: 'Centro',
    Cidade: 'Diadema',
    Regiao: 'Sul',
    OLT: 'OLT-01',
    Data: '29/09/2026',
    Fim: '16:45',
  };

  const result = matchD0Rows([row], [call]);
  assert.equal(result.unmatchedRows, 0);
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.matches[0], {
    callId: call.id,
    fields: {
      address: 'Rua das Flores, 10',
      bairro: 'Centro',
      city: 'Diadema',
      region: 'Sul',
      olt: 'OLT-01',
      ofsStatus: 'Concluída',
      executedAt: '2026-09-29T16:45:00-03:00',
    },
  });
  assert.equal(call.status, 'Aberto');
});

test('D-0 keeps Data Fim empty for open calls the OFS has not concluded', () => {
  for (const ofsStatus of ['Pendente', 'Em andamento', '']) {
    const result = matchD0Rows([{ 'Número OS': call.orderNumber, 'Status OFS': ofsStatus, Data: '29/09/2026', Fim: '16:45' }], [{ ...call, status: 'Atribuido' }]);
    assert.equal(result.matches[0]?.fields.executedAt, null);
  }
});

test('D-0 imports Data Fim only for finalized or cancelled calls', () => {
  for (const status of ['Finalizado', 'Cancelado'] as const) {
    const closedCall = { ...call, id: `call-${status}`, status };
    const result = matchD0Rows([{ 'Número OS': call.orderNumber, Data: '29/09/2026', Fim: '16:45' }], [closedCall]);
    assert.equal(result.matches[0]?.fields.executedAt, '2026-09-29T16:45:00-03:00');
  }
});

test('D-0 imports Nome only into FIELD calls', () => {
  const row: D0Row = { 'Número OS': call.orderNumber, Nome: 'Maria de Fatima' };
  const fieldResult = matchD0Rows([row], [call]);
  const nonFieldResult = matchD0Rows([row], [{ ...call, type: 'NOC ACESSO' }]);

  assert.equal(fieldResult.matches[0]?.fields.client, 'Maria de Fatima');
  assert.equal(nonFieldResult.matches[0]?.fields.client, undefined);
});

test('D-0 infers FIELD neighborhood from the full address when Bairro is absent', () => {
  const row: D0Row = {
    'Número OS': call.orderNumber,
    Cidade: 'Nao informada',
    Endereco: 'CLT_RUA RUA LEVI RIOS DE OLIVEIRA, 172 PARQUE FLAMENGO, GUARULHOS - SP',
  };
  const result = matchD0Rows([row], [{ ...call, type: 'ACIONAMENTO FIELD' }]);

  assert.equal(result.matches[0]?.fields.bairro, 'PARQUE FLAMENGO');
});

test('D-0 rejects ambiguous matches and invalid completion timestamps', () => {
  const duplicateCall = { ...call, id: 'call-duplicate' };
  const result = matchD0Rows([{ BDESK: '88421', Data: '29/09/2026', Fim: '16:45' }], [call, duplicateCall]);
  assert.equal(result.unmatchedRows, 1);
  assert.equal(result.matches.length, 0);
  assert.equal(parseD0FinishedAt('31/02/2026', '16:45'), undefined);
  assert.equal(parseD0FinishedAt('29/09/2026', '25:00'), undefined);
});

test('XLSX date and time cells are converted to D-0 strings', () => {
  const workbook = XLSX.utils.book_new();
  const excelDate = Math.round((Date.UTC(2026, 8, 29) - Date.UTC(1899, 11, 30)) / 86400000);
  const excelTime = (16 * 60 + 45) / (24 * 60);
  const sheet = XLSX.utils.aoa_to_sheet([
    ['BDESK', 'Data', 'Fim'],
    ['88421', excelDate, excelTime],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'D0');
  const parsed = parseImport('base-d0.xlsx', XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }));
  assert.equal(parsed.rows[0].Data, '29/09/2026');
  assert.equal(parsed.rows[0].Fim, '16:45');
  assert.equal(parseD0FinishedAt(parsed.rows[0].Data, parsed.rows[0].Fim), '2026-09-29T16:45:00-03:00');
});

test('D-0 replaces the stored base and clearing it preserves enriched call data', async () => {
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

    const row: D0Row = { BDESK: '88421', 'Status OFS': 'Concluída', Endereco: 'Rua das Flores, 10', Bairro: 'Centro', Data: '29/09/2026', Fim: '16:45' };
    const result = await replaceD0Base('d0.xlsx', 'Operador teste', [row]);
    const updatedCall = (await listCalls()).find((item) => item.id === 'call-240918-01');
    assert.deepEqual(result, { rows: 1, matchedCalls: 1, updatedCalls: 1, unmatchedRows: 0 });
    assert.equal(updatedCall?.status, 'Aberto');
    assert.equal(updatedCall?.ofsStatus, 'Concluída');
    assert.equal(updatedCall?.address, 'Rua das Flores, 10');
    assert.equal(updatedCall?.bairro, 'Centro');
    assert.equal(updatedCall?.executedAt, '2026-09-29T16:45:00-03:00');
    assert.deepEqual(await getD0BaseSummary(), { fileName: 'd0.xlsx', rowCount: 1, uploadedBy: 'Operador teste', uploadedAt: (await getD0BaseSummary()).uploadedAt });

    assert.equal(await clearD0Base(), 1);
    assert.equal((await getD0BaseSummary()).rowCount, 0);
    assert.equal((await listCalls()).find((item) => item.id === 'call-240918-01')?.ofsStatus, 'Concluída');
  } finally {
    if (previousRuntime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previousRuntime;
    if (previousDemoData === undefined) delete process.env.REDEFLOW_DEMO_DATA; else process.env.REDEFLOW_DEMO_DATA = previousDemoData;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousSupabaseUrl;
    if (previousSupabaseAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousSupabaseAnon;
    if (previousSupabaseServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabaseServiceRole;
  }
});
test('an order repeated by a cancelled copy updates the active call', () => {
  // Card mandado duas vezes: o segundo chamado foi cancelado; o OFS tem que chegar no que ficou ativo.
  const active = { ...call, id: 'call-active', status: 'Atribuido' as const };
  const cancelled = { ...call, id: 'call-cancelled', status: 'Cancelado' as const };
  const result = matchD0Rows([{ 'Ordem de Serviço': `BDESK-${call.orderNumber}`, 'Status da Atividade': 'em rota' }], [active, cancelled]);
  assert.equal(result.unmatchedRows, 0);
  assert.equal(result.matches[0]?.callId, 'call-active');
  assert.equal(result.matches[0]?.fields.ofsStatus, 'em rota');
  // Dois ativos: continua sem adivinhar.
  assert.equal(matchD0Rows([{ 'Ordem de Serviço': call.orderNumber }], [active, { ...active, id: 'other' }]).unmatchedRows, 1);
});

test('OFS Recurso fills the technician of calls that have none', () => {
  const techs = [
    { id: 't1', name: 'Caíque da Silva Bento Aguiar', active: true, teamRole: 'Tecnico', employmentStatus: 'Trabalhando' },
    { id: 't2', name: 'Carlos Roberto Oliveira Filho', active: true, teamRole: 'Tecnico', employmentStatus: 'Trabalhando' },
    { id: 't3', name: 'Maicon Torres dos Santos', active: true, teamRole: 'Tecnico', employmentStatus: 'Trabalhando' },
    { id: 't4', name: 'Fulano Demitido Silva', active: true, teamRole: 'Tecnico', employmentStatus: 'Demitido' },
  ];
  assert.equal(matchOfsTechnician('CAIQUE DA SILVA BENTO AGUIAR', techs)?.id, 't1');
  assert.equal(matchOfsTechnician('CLUSTER_C08', techs), undefined);
  assert.equal(matchOfsTechnician('Fulano Demitido Silva', techs), undefined);
  assert.equal(matchOfsTechnician('Desconhecido da Silva', techs), undefined);

  const open = { ...call, id: 'open', status: 'Aberto' as const };
  const assigned = { ...call, id: 'assigned', orderNumber: 'OS-2', bdesk: 'B2', officeTrack: 'O2', status: 'Atribuido' as const, technicianId: 'tX' };
  const rows: D0Row[] = [
    // mesma ordem duas vezes: a suspensa (Carlos) perde para a pendente (Maicon)
    { 'Ordem de Serviço': `BDESK-${call.orderNumber}`, Recurso: 'Carlos Roberto Oliveira Filho', 'Status da Atividade': 'suspenso' },
    { 'Ordem de Serviço': `BDESK-${call.orderNumber}`, Recurso: 'Maicon Torres dos Santos', 'Status da Atividade': 'pendente' },
    { 'Ordem de Serviço': 'OS-2', Recurso: 'Carlos Roberto Oliveira Filho', 'Status da Atividade': 'concluído' },
  ];
  assert.deepEqual(technicianAssignmentsFromRows(rows, [open, assigned], techs), [{ callId: 'open', technicianId: 't3', status: 'Atribuido' }]);
});
