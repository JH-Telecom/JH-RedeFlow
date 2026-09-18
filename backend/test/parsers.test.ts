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

test('normalizes the group id from a WuzAPI message key', () => {
  const result = parseIncomingMessage({
    event: {
      Info: { ID: 'msg-2' },
      key: { remoteJid: '120363422003961917@g.us' },
      Message: { conversation: 'ORDEM: RF-11' },
    },
  });

  assert.equal(result.chatId, '120363422003961917@g.us');
});

test('extracts operational fields from an activation message', () => {
  const result = extractOperationalData(
    'NOC TX\nORDEM: RF-10\nBDESK: BD-20\nMOTIVO: perda de sinal\nOLT: OLT-01\nSLOT/PON: 3/7',
  );

  assert.equal(result.orderNumber, 'RF-10');
  assert.equal(result.bdesk, 'BD-20');
  assert.equal(result.type, 'NOC TX');
  assert.equal(result.reason, 'perda de sinal');
  assert.equal(result.olt, 'OLT-01');
  assert.equal(result.slotPon, '3/7');
});

test('extracts the real formatted NOC activation payload', () => {
  const result = extractOperationalData(`⚠️VALIDAR COM NOC ACESSO⚠️

- OLT: * VIP-GRU-2-SPO-ONK-02
- SLOT/PON: * 04/13
- Tipo de Falha: * Total
- Data/Hora do Evento: * 18/09/2026 09:48
- Contrato(s) Exemplo(s): * SLOT/PON: 04/13
- Afetados: * 15
- BDESK: * 647460
- Tarefa Office Track: 601111496220102
- Técnico Rede: JH TELECOM
- Endereços:
Nome: JONATHAN ALVES GOES | Contrato: 4554909.2
CEP: 07162-480
Endereço: RUA CANTO DO BURITI, 48 2 CS CIDADE SOBERANA, GUARULHOS - SP
------------------------------
- COPE REDE: kaua.silva@alloha.com`);

  assert.equal(result.orderNumber, '601111496220102');
  assert.equal(result.officeTrack, '601111496220102');
  assert.equal(result.bdesk, '647460');
  assert.equal(result.type, 'NOC ACESSO');
  assert.equal(result.reason, 'Total');
  assert.equal(result.olt, 'VIP-GRU-2-SPO-ONK-02');
  assert.equal(result.slotPon, '04/13');
  assert.equal(result.affectedCount, '15');
  assert.equal(result.technician, 'JH TELECOM');
  assert.equal(result.cope, 'kaua.silva@alloha.com');
  assert.match(result.addresses, /JONATHAN ALVES GOES/);
});

test('extracts a FIELD activation payload', () => {
  const result = extractOperationalData(`⚠️ACIONAMENTO FIELD⚠️

INFO CASA CLIENTE
- TÉCNICO: MARCOS VINICIUS SERRA ANDRADE
- TELEFONE: +5585991527230
- MOTIVO: CAIXA ATENUADA
- O.S. CASA CLIENTE: 12472057
- CONTRATO: 6478782

INFO GERÊNCIA
- S/N: ALCLFC202C48
- OLT: VIP-MG2-ALT-ONK-01
- PLACA/PON: SLOT: 3 | PON: 15

INFO REDE EXTERNA
- ID/CTO: -
- LOC CTO: https://maps.app.goo.gl/bfJ1jCMfP8DYytnC7
- AFETAÇÃO: 2
- OS OT: 12473446
- TÉCNICO REDE: 0`);

  assert.equal(result.type, 'ACIONAMENTO FIELD');
  assert.equal(result.customerOrder, '12472057');
  assert.equal(result.officeTrack, '12473446');
  assert.equal(result.orderNumber, '12473446');
  assert.equal(result.reason, 'CAIXA ATENUADA');
  assert.equal(result.slotPon, '3 / 15');
  assert.equal(result.affectedCount, '2');
  assert.equal(result.phone, '+5585991527230');
  assert.equal(result.ctoLocation, 'https://maps.app.goo.gl/bfJ1jCMfP8DYytnC7');
});

test('extracts a backbone NOC TX activation payload', () => {
  const result = extractOperationalData(`⚠️VALIDAR COM NOC TX⚠️
⚠️ACIONAMENTO DE EVENTO BACKBONE ⚠️
- TICKET: 647361 » SP::RUP::SAO_PAULO_SPN<>COTIA_SPN::DWDM::ALLOHA
- ABERTO EM: 18/09/2026 06:15:00
- TIPO: RUPTURA
- OBSERVAÇÕES: TRECHO DOWN DWDM
- OfficeTrack: 601014419540102
- Técnico Rede: JH TELECOM REDES`);

  assert.equal(result.type, 'NOC TX');
  assert.equal(result.ticket, '647361 » SP::RUP::SAO_PAULO_SPN<>COTIA_SPN::DWDM::ALLOHA');
  assert.equal(result.officeTrack, '601014419540102');
  assert.equal(result.orderNumber, '601014419540102');
  assert.equal(result.reason, 'RUPTURA');
  assert.equal(result.observations, 'TRECHO DOWN DWDM');
  assert.equal(result.openedAt, '18/09/2026 06:15:00');
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
