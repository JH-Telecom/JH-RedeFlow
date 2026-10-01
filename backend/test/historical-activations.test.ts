import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx';
import { parseHistoricalActivationWorkbook } from '../src/imports/historical-activations.js';

const headers = ['Tecnico', 'Data Abertura', 'Data Acionamento', 'Data-Fim', 'ACIONAMENTO'];

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Planilha1');
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
    ['Técnico A', openedAt, activatedAt, executedAt, message],
  ]), 'Planilha1');

  const parsed = parseHistoricalActivationWorkbook('historico-novo.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);

  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0].call.orderNumber, '12096886');
  assert.equal(parsed.candidates[0].call.technicianName, 'Técnico A');
  assert.equal(parsed.candidates[0].call.openedAt, openedAt.toISOString());
  assert.equal(parsed.candidates[0].call.executedAt, executedAt.toISOString());
});