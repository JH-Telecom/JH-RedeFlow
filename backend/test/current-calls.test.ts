import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx';
import { parseCurrentCallsWorkbook } from '../src/imports/current-calls.js';

const headers = ['STATUS', 'ORDEM', 'TÉCNICO', 'DATA EVENTO', 'ACIONAMENTO', 'EQUIPAMENTO', 'AREA', 'DATA FIM', 'PLACA', 'PON'];

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Chamados');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

test('parses current-call statuses and reports invalid or inconsistent dates', () => {
  const parsed = parseCurrentCallsWorkbook('chamados.xlsx', workbookBuffer([
    ['Finalizado', 'OS-1', 'Técnico A', '01/10/2026 08:30', '', 'VIP-GRU-3-SPO-ONK-01', 'Guarulhos', '01/10/2026 10:00', 'PLACA-1', '10'],
    ['Pendente', 'OS-2', 'Técnico B', '01/10/2026 09:00', '', '', 'SP', '01/10/2026 11:00', '', ''],
    ['Baixar', 'OS-3', 'Técnico C', '01/10/2026 10:00', '', '', 'SP', '', '', ''],
    ['Em andamento', 'OS-4', 'Técnico D', '01/10/2026 11:00', '', '', 'SP', '', '', ''],
  ]));

  assert.equal(parsed.sheetName, 'Chamados');
  assert.equal(parsed.totalRows, 4);
  assert.deepEqual(parsed.candidates.map(({ call }) => call.status), ['Finalizado', 'Aberto', 'Baixar']);
  assert.equal(parsed.candidates[0].call.openedAt, '2026-10-01T11:30:00.000Z');
  assert.equal(parsed.candidates[0].call.executedAt, '2026-10-01T13:00:00.000Z');
  assert.equal(parsed.candidates[0].call.slotPon, 'PLACA-1/10');
  assert.equal(parsed.candidates[1].call.executedAt, undefined);
  assert.deepEqual(parsed.invalidRows, [5]);
  assert.deepEqual(parsed.missingFinishRows, [4]);
  assert.deepEqual(parsed.ignoredFinishRows, [3]);
});

test('rejects workbooks without the required current-call columns', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['ORDEM', 'STATUS'], ['OS-1', 'Pendente']]), 'Dados');

  assert.throws(
    () => parseCurrentCallsWorkbook('invalida.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer),
    /ORDEM, TÉCNICO, DATA EVENTO e ACIONAMENTO \(ou CARD\)/,
  );
});
test('reads the "Em campo" layout without STATUS, with the card in a CARD column', () => {
  const workbook = XLSX.utils.book_new();
  const header = ['ORDEM', 'TÉCNICO', 'DATA EVENTO', 'DATA/HORA ACIONAMENTO', 'TIPO DE EVENTO', 'AFETAÇÃO', 'EQUIPAMENTO', 'PLACA', 'PON', 'OBS', 'AREA', 'BDESK', 'BAIRRO', 'CARD'];
  const card = 'VALIDAR COM NOC ACESSO\n- OLT: VIP-PAL-SPO-OHW-02\n- SLOT/PON: 01/07\n- BDESK: 672314\n- Tarefa Office Track: 610150284850102';
  // 46329.735 = 03/11/2026 17:38 (horario de Sao Paulo gravado na celula)
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    header,
    [610150284850102, 'Robson Jose da Silva Oliveira', 46329.735, 46329.735, 'ALARME DE PON', 27, 'VIP-PAL-SPO-OHW-02', 1, 7, 'GIGA+', 'PALMEIRAS', '', '', card],
    [610030194750102, 'Jose Leidson da Silva Barbosa', 46329.3875, 46329.4, 'ALARME DE PON', 4, 'VIP-GZ1-SPO-OHW-03', 1, 12, 'na base', 'GUAIANASES 1', 671000, 'Jardim A', ''],
    [610030194750199, '', 46329.3875, '', 'BACKBONE', '', 'GRU <> GZ1', '', '', '', 'GUARULHOS', '', '', ''],
  ]), 'Planilha1');
  const parsed = parseCurrentCallsWorkbook('Em campo.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);

  assert.deepEqual(parsed.invalidRows, []);
  const [withCard, withoutCard, withoutTechnician] = parsed.candidates.map((candidate) => candidate.call);
  assert.equal(withCard.orderNumber, '610150284850102');
  assert.equal(withCard.status, 'Em campo');
  assert.equal(withCard.technicianName, 'Robson Jose da Silva Oliveira');
  assert.equal(withCard.olt, 'VIP-PAL-SPO-OHW-02');
  assert.equal(withCard.bdesk, '672314');
  assert.equal(withCard.region, 'PALMEIRAS');
  assert.equal(withCard.openedAt, '2026-11-03T20:38:24.000Z');
  assert.match(withCard.notes, /Obs\. da planilha: GIGA\+/);
  assert.equal(withoutCard.type, 'ALARME DE PON');
  assert.equal(withoutCard.bdesk, '671000');
  assert.equal(withoutCard.bairro, 'Jardim A');
  assert.equal(withoutCard.olt, 'VIP-GZ1-SPO-OHW-03');
  assert.equal(withoutTechnician.status, 'Aberto');
});

test('GIGA counts as pending, opening is the group send time and swapped event dates are fixed', () => {
  // Serial do Excel no relogio de Sao Paulo: 46123.37430555555 = "4/11/26 8:59" lido como 11 de abril.
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['STATUS', 'ORDEM', 'TÉCNICO', 'DATA EVENTO', 'DATA/HORA ACIONAMENTO', 'AREA', 'acionamento'],
    ['GIGA', 610011231680102, 'Robson', 46123.37430555555, 46330.390648148146, 'PALMEIRAS', 'card'],
    ['Pendente', 12665328, 'Antonio', 46330.475694444445, 46330.475694444445, 'CIDADE TIRADENTES 1', 'card'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Planilha1');
  const parsed = parseCurrentCallsWorkbook('Em campo hoje.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
  assert.deepEqual(parsed.invalidRows, []);
  const [giga, pending] = parsed.candidates.map(({ call }) => call);
  assert.equal(giga.status, 'Aberto');
  assert.equal(giga.openedAt, '2026-11-04T12:22:32.000Z', 'abertura = envio no grupo (09:22 SP)');
  assert.equal(giga.eventAt, '2026-11-04T11:59:00.000Z', 'evento 04/11 08:59 SP, nao 11/04');
  assert.equal(pending.eventAt, pending.openedAt);
});
