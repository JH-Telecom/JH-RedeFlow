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
    /STATUS, ORDEM, TÉCNICO, DATA EVENTO e ACIONAMENTO/,
  );
});