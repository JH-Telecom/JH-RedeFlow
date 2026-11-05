import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx';
import { findHistoricalTechnician, parseHistoricalActivationWorkbook } from '../src/imports/historical-activations.js';

const headers = ['Tecnico', 'Data Abertura', 'Data Acionamento', 'Data-Fim', 'ACIONAMENTO'];

// Celula de data como na planilha real: horario de Sao Paulo (UTC-3) gravado como serial do Excel,
// independente do fuso da maquina que roda o teste.
function saoPauloDateCell(instant: Date) {
  const wallClockMs = instant.getTime() - 3 * 3_600_000;
  return { t: 'n', v: wallClockMs / 86_400_000 + 25_569, z: 'm/d/yy h:mm:ss' };
}

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  const cells = rows.map((row) => row.map((value) => (value instanceof Date ? saoPauloDateCell(value) : value)));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...cells]), 'Planilha1');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const fieldMessage = (order: string, reason = 'CAIXA SEM SINAL') => [
  'ACIONAMENTO FIELD',
  '- TÉCNICO: Técnico de teste',
  `- MOTIVO: ${reason}`,
  `- OS OT: ${order}`,
  '- OLT: VIP-GRU-3-SPO-ONK-01',
  '- PLACA/PON: SLOT: 3 | PON: 12',
].join('\n');

test('parses the historical workbook, dates and exact duplicate service orders', () => {
  const openedAt = new Date('2026-06-18T17:03:26.000Z');
  const activatedAt = new Date('2026-06-18T17:03:26.000Z');
  const executedAt = new Date('2026-06-24T16:42:28.000Z');
  const message = fieldMessage('12096885');
  const parsed = parseHistoricalActivationWorkbook('historico.xlsx', workbookBuffer([
    ['Tecnico A', openedAt, activatedAt, executedAt, message],
    ['Tecnico A', openedAt, activatedAt, executedAt, message],
  ]));

  assert.equal(parsed.totalRows, 2);
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.duplicatesWithinFile, 1);
  assert.equal(parsed.conflictingOrders, 0);
  assert.equal(parsed.candidates[0].call.orderNumber, '12096885');
  assert.equal(parsed.candidates[0].call.status, 'Finalizado');
  assert.equal(parsed.candidates[0].call.openedAt, openedAt.toISOString());
  assert.equal(parsed.candidates[0].call.assignedAt, activatedAt.toISOString());
  assert.equal(parsed.candidates[0].call.executedAt, executedAt.toISOString());
  assert.equal(parsed.candidates[0].call.region, 'GUARULHOS 3');
});

test('excludes conflicting messages that reuse the same service order', () => {
  const openedAt = new Date('2026-06-18T17:03:26.000Z');
  const executedAt = new Date('2026-06-24T16:42:28.000Z');
  const parsed = parseHistoricalActivationWorkbook('historico.xlsx', workbookBuffer([
    ['Técnico A', openedAt, openedAt, executedAt, fieldMessage('12096885', 'CAIXA SEM SINAL')],
    ['Técnico B', openedAt, openedAt, executedAt, fieldMessage('12096885', 'CAIXA ATENUADA')],
  ]));

  assert.equal(parsed.candidates.length, 0);
  assert.equal(parsed.conflictingOrders, 2);
});

test('counts missing opening, finish and service order fields instead of inventing values', () => {
  const executedAt = new Date('2026-06-24T16:42:28.000Z');
  const parsed = parseHistoricalActivationWorkbook('historico.xlsx', workbookBuffer([
    ['Técnico A', '', '', executedAt, fieldMessage('12096885')],
    ['Técnico B', executedAt, executedAt, '', fieldMessage('')],
  ]));

  assert.equal(parsed.candidates.length, 0);
  assert.equal(parsed.missingOpeningDate, 1);
  assert.equal(parsed.missingFinishedDate, 1);
  assert.equal(parsed.missingOrder, 1);
});

test('uses the workbook technician column when the message does not contain one and retains the source message', () => {
  const openedAt = new Date('2026-06-18T17:03:26.000Z');
  const executedAt = new Date('2026-06-24T16:42:28.000Z');
  const message = fieldMessage('12096885').replace('- TÉCNICO: Técnico de teste\n', '');
  const parsed = parseHistoricalActivationWorkbook('historico.xlsx', workbookBuffer([
    ['Técnico da planilha', openedAt, openedAt, executedAt, message],
  ]));

  assert.equal(parsed.candidates[0].call.technicianName, 'Técnico da planilha');
  assert.ok(parsed.candidates[0].call.notes.includes(message));
});

test('reads the finalized historical workbook when columns use the newer naming variants', () => {
  const openedAt = new Date('2026-06-18T17:03:26.000Z');
  const activatedAt = new Date('2026-06-18T17:15:00.000Z');
  const executedAt = new Date('2026-06-24T16:42:28.000Z');
  const message = fieldMessage('12096886');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Técnico', 'Data de Abertura', 'Data do Acionamento', 'Data de Fim', 'Mensagem de Acionamento'],
    ['Técnico A', saoPauloDateCell(openedAt), saoPauloDateCell(activatedAt), saoPauloDateCell(executedAt), message],
  ]), 'Planilha1');

  const parsed = parseHistoricalActivationWorkbook('historico-novo.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);

  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0].call.orderNumber, '12096886');
  assert.equal(parsed.candidates[0].call.technicianName, 'Técnico A');
  assert.equal(parsed.candidates[0].call.openedAt, openedAt.toISOString());
  assert.equal(parsed.candidates[0].call.executedAt, executedAt.toISOString());
});

test('matches workbook technician names to one registered technician, ignoring accents and case', () => {
  const technicians = [
    { id: 'tech-jose', name: 'José da Silva', registration: 'TEC-001', region: '', shift: '', currentStatus: 'Disponivel' as const, active: true, teamRole: 'Tecnico' as const },
    { id: 'assistant-jose', name: 'Jose da Silva', registration: 'AUX-001', region: '', shift: '', currentStatus: 'Disponivel' as const, active: true, teamRole: 'Auxiliar' as const },
  ];

  assert.equal(findHistoricalTechnician('  JOSE   DA SILVA ', technicians)?.id, 'tech-jose');
  assert.equal(findHistoricalTechnician('Técnico inexistente', technicians), undefined);
});
test('picks the single active record when a technician name is registered twice', () => {
  const base = { registration: '', region: '', shift: '', currentStatus: 'Disponivel' as const, teamRole: 'Tecnico' as const };
  const duplicated = [
    { ...base, id: 'ricardo-old', name: 'Ricardo Mendes de souza', active: false },
    { ...base, id: 'ricardo-new', name: 'Ricardo Mendes de Souza', active: true },
  ];
  assert.equal(findHistoricalTechnician('Ricardo Mendes de souza', duplicated)?.id, 'ricardo-new');
  const bothActive = duplicated.map((technician) => ({ ...technician, active: true }));
  assert.equal(findHistoricalTechnician('Ricardo Mendes de souza', bothActive), undefined, 'dois ativos continua ambiguo');
});

test('team names in the workbook resolve to the JH Telecom registration', () => {
  const base = { registration: '', region: '', shift: '', currentStatus: 'Disponivel' as const, teamRole: 'Tecnico' as const, active: true };
  const technicians = [{ ...base, id: 'jh-team', name: 'JH Telecom' }, { ...base, id: 'other', name: 'Outro Tecnico' }];
  for (const name of ['Equipe JH', 'JH TELECOM REDES', 'JH Telecom Rede', 'jh telecom']) assert.equal(findHistoricalTechnician(name, technicians)?.id, 'jh-team', name);
  assert.equal(findHistoricalTechnician('JH Telecom Engenharia', technicians), undefined);
});

test('reads the operator report layout (OS, ORIGEM, DATA_ABERTURA, DATA_FECHAMENTO, RECURSO)', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['OS', 'BDESK', 'ORIGEM', 'TME', 'CAUSA_SIMPLES', 'CIDADE', 'CLIENTES_AFETADOS', 'DATA_ABERTURA', 'DATA_FECHAMENTO', 'ELEMENTO', 'CLUSTER', 'OS_OFS', 'RECURSO', 'REDE'],
    [610152573830102, 671715, 'BACKBONE', 8.516667, '', 'Ferraz De Vasconcelos', '', '2026-11-02 14:47:57', '2026-11-02 23:19:00', 'SPSPO_GR1_SWP_03-SPSPO_GZ1_SWP_03', 'C.11 | Alto Tiete', '610152573830102', 'LUCAS OLIVEIRA SANTOS', 'BackBone Geral - VIP'],
    [610103301480102, 671419, 'BDESK', 3.2, 'Cabo Danificado', 'Guarulhos Ii', 11, '2026-11-01 08:00:00', '2026-11-01 11:12:00', 'CABO 12', 'C.12 | Guarulhos', '610103301480102', 'TIAGO DA SILVA', 'ACESSO'],
    [12657628, '', 'FIELD', 2, '', 'Sao Paulo/guaianases', '', '2026-11-03 09:00:00', '2026-11-03 11:00:00', '', 'C.8 | Sao Paulo', '12657628', 'MARCOS ANTONIO RAMOS', ''],
  ]), 'Planilha1');
  const parsed = parseHistoricalActivationWorkbook('Finalizadas.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);

  assert.equal(parsed.candidates.length, 3);
  assert.deepEqual(parsed.byType, { 'NOC TX': 1, 'NOC ACESSO': 1, 'ACIONAMENTO FIELD': 1 });
  const [backbone, access, field] = parsed.candidates.map((candidate) => candidate.call);
  assert.equal(backbone.orderNumber, '610152573830102');
  assert.equal(backbone.bdesk, '671715');
  assert.equal(backbone.status, 'Finalizado');
  assert.equal(backbone.openedAt, '2026-11-02T17:47:57.000Z', 'horario de Sao Paulo, independente do fuso do servidor');
  assert.equal(backbone.executedAt, '2026-11-03T02:19:00.000Z');
  assert.equal(backbone.technicianName, 'Lucas Oliveira Santos');
  assert.match(backbone.notes, /Elemento: SPSPO_GR1_SWP_03/);
  assert.equal(access.region, 'GUARULHOS 2');
  assert.equal(access.reason, 'Cabo Danificado');
  assert.match(field.region, /GUAIANASES/);
});

test('matches technician names written differently in the report, without guessing between people', () => {
  const base = { registration: '', region: '', shift: '', currentStatus: 'Disponivel' as const, teamRole: 'Tecnico' as const, active: true };
  const technicians = [
    { ...base, id: 'marcos', name: 'Marcos Antônio Ramos dos Santos' },
    { ...base, id: 'paulo', name: 'Paulo Herculano' },
    { ...base, id: 'ricardo', name: 'Ricardo Mendes de souza' },
    { ...base, id: 'carlos-filho', name: 'Carlos Roberto Oliveira Filho' },
    { ...base, id: 'carlos-junior', name: 'Carlos Junior', active: false },
    { ...base, id: 'lucas', name: 'Lucas Oliveira Santos' },
    { ...base, id: 'guilherme', name: 'Guilherme Lima Oliveira Santos' },
  ];
  const id = (name: string) => findHistoricalTechnician(name, technicians)?.id;
  assert.equal(id('MARCOS ANTONIO RAMOS'), 'marcos');
  assert.equal(id('PAULO HERCULANO FIRMO'), 'paulo');
  assert.equal(id('RICARDO MENDES DE SOUSA'), 'ricardo');
  assert.equal(id('CARLOS ROBERTO OLIVEIRA FILHO'), 'carlos-filho');
  assert.equal(id('CARLOS ROBERTO OLIVEIRA JUNIO'), 'carlos-junior');
  assert.equal(id('LUCAS OLIVEIRA SANTOS'), 'lucas');
  assert.equal(id('TIAGO DA SILVA'), undefined);
  assert.equal(id('OLIVEIRA SANTOS'), undefined, 'primeiro nome diferente nao casa');
  assert.equal(id('Carlos'), undefined, 'um nome so nao basta');
});

test('reads "Tarefa OFS" cards, falls back to the ORDEM column and to the REGIAO column', () => {
  const workbook = XLSX.utils.book_new();
  const open = new Date('2026-11-01T13:00:00Z');
  const close = new Date('2026-11-01T16:00:00Z');
  const ofsCard = ['⚠️VALIDAR COM NOC ACESSO⚠️', '- OLT: VIP-ITA-SPO-OHW-04', '- SLOT/PON: 02/07', '- BDESK: 670496', '- Tarefa OFS: 613123218810102'].join('\n');
  const noOrderCard = ['⚠️VALIDAR COM NOC ACESSO⚠️', '- OLT: br.sp.cti.qua.gp.01', '- BDESK: 671400'].join('\n');
  const sheet = XLSX.utils.aoa_to_sheet([
    ['ORDEM', 'Tecnico', 'Data Abertura', 'Data-Fim', 'REGIAO', 'ACIONAMENTO'],
    ['', 'Wesley', saoPauloDateCell(open), saoPauloDateCell(close), 'ITAIM PAULISTA', ofsCard],
    [610123034740102, 'Wesley', saoPauloDateCell(open), saoPauloDateCell(close), 'CIDADE TIRADENTES', noOrderCard],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Planilha1');
  const preview = parseHistoricalActivationWorkbook('Finalizados.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
  assert.equal(preview.missingOrder, 0);
  assert.deepEqual(preview.candidates.map((item) => item.call.orderNumber), ['613123218810102', '610123034740102']);
  assert.equal(preview.candidates[1].call.region, 'CIDADE TIRADENTES');
});

test('Finalizados: repairs day/month swaps using the opening + Data Fim pair', async () => {
  const { fixSwappedOpenFinish } = await import('../src/imports/historical-activations.js');
  const now = Date.parse('2026-11-05T12:00:00Z');
  const sp = (text: string) => new Date(`${text}-03:00`).toISOString();
  // Print do usuario: abertura lida como 11/03, fim 03/11 -> os dois em 03/11 (empate: fica a mais recente).
  assert.deepEqual(fixSwappedOpenFinish(sp('2026-03-11T20:28:00'), sp('2026-11-03T22:39:00'), now), { openedAt: sp('2026-11-03T20:28:00'), executedAt: sp('2026-11-03T22:39:00') });
  // Abertura no futuro (07/11 lido no lugar de 11/07) com fim em julho -> abertura volta para 11/07.
  assert.deepEqual(fixSwappedOpenFinish(sp('2026-11-07T08:10:00'), sp('2026-07-11T09:00:00'), now), { openedAt: sp('2026-07-11T08:10:00'), executedAt: sp('2026-07-11T09:00:00') });
  // Fim trocado: abertura 05/08, fim lido como 08/05 -> fim volta para 05/08.
  assert.deepEqual(fixSwappedOpenFinish(sp('2026-08-05T10:00:00'), sp('2026-05-08T15:00:00'), now), { openedAt: sp('2026-08-05T10:00:00'), executedAt: sp('2026-08-05T15:00:00') });
  // Ja correto: nao mexe.
  assert.deepEqual(fixSwappedOpenFinish(sp('2026-10-02T10:00:00'), sp('2026-10-02T18:00:00'), now), { openedAt: sp('2026-10-02T10:00:00'), executedAt: sp('2026-10-02T18:00:00') });
  // Sem combinacao valida (fim antes da abertura no mesmo dia): fica como veio.
  assert.deepEqual(fixSwappedOpenFinish(sp('2026-08-26T08:20:00'), sp('2026-08-26T02:40:00'), now), { openedAt: sp('2026-08-26T08:20:00'), executedAt: sp('2026-08-26T02:40:00') });
});
