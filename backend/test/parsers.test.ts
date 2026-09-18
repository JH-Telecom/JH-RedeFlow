import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx';
import { parseImport } from '../src/imports/parser.js';
import { extractOperationalData, parseIncomingMessage } from '../src/integrations/wuzapi/client.js';

test('normalizes a nested WuzAPI message', () => {
  const result = parseIncomingMessage({
    event: {
      Info: { ID: 'msg-1', Chat: 'group-rede' },
      Message: { extendedTextMessage: { text: 'ORDEM: RF-10' } },
    },
  });

  assert.equal(result.id, 'msg-1');
  assert.equal(result.source, 'group-rede');
  assert.equal(result.message, 'ORDEM: RF-10');
});

test('extracts operational fields from an activation message', () => {
  const result = extractOperationalData(
    'NOC TX\nORDEM: RF-10\nBDESK: BD-20\nMOTIVO: perda de sinal\nOLT: OLT-01\nSLOT/PON: 3/7',
  );

  assert.deepEqual(result, {
    orderNumber: 'RF-10',
    bdesk: 'BD-20',
    type: 'NOC TX',
    reason: 'perda de sinal',
    olt: 'OLT-01',
    slotPon: '3/7',
    client: '',
    region: '',
    city: '',
  });
});

test('parses CSV rows and reports empty files', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['ORDEM', 'STATUS'],
    ['RF-10', 'Aberto'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'BASE');
  const content = XLSX.write(workbook, { type: 'base64', bookType: 'csv' });
  const parsed = parseImport('base.csv', content);

  assert.equal(parsed.fileType, 'csv');
  assert.equal(parsed.sheetName, 'Sheet1');
  assert.deepEqual(parsed.columns, ['ORDEM', 'STATUS']);
  assert.deepEqual(parsed.rows, [{ ORDEM: 'RF-10', STATUS: 'Aberto' }]);
  assert.deepEqual(parsed.errors, []);

  const empty = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(empty, XLSX.utils.aoa_to_sheet([]), 'EMPTY');
  const emptyContent = XLSX.write(empty, { type: 'base64', bookType: 'csv' });
  assert.deepEqual(parseImport('empty.csv', emptyContent).errors, ['A planilha nao possui linhas de dados.']);
});
