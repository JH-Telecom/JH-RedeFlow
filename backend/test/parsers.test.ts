import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx';
import { parseImport } from '../src/imports/parser.js';
import { extractOperationalData, parseIncomingMessage } from '../src/integrations/wuzapi/client.js';
import { analyzeOperationalMessage } from '../src/integrations/wuzapi/semantic.js';

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

test('infers group messages from a group JID when IsGroup is omitted', () => {
  const result = parseIncomingMessage({
    type: 'MessageEvent',
    event: {
      Info: { ID: 'msg-inferred-group', Chat: '120363422003961917@g.us', Sender: '551199999999@s.whatsapp.net' },
      Message: { conversation: 'VALIDAR COM NOC ACESSO\nBDESK: 648969' },
    },
  });

  assert.equal(result.isGroup, true);
  assert.equal(result.message, 'VALIDAR COM NOC ACESSO\nBDESK: 648969');
});

test('normalizes sender, recipient, timestamp, message type and quoted text', () => {
  const result = parseIncomingMessage({
    event: {
      Info: { ID: 'msg-metadata', Chat: 'group-rede', Sender: '551199999999@s.whatsapp.net', To: 'bot@s.whatsapp.net', IsGroup: true, IsFromMe: false, Timestamp: '2026-09-21T14:03:00Z', PushName: 'Operador' },
      Message: { extendedTextMessage: { text: 'ACIONAMENTO FIELD', contextInfo: { quotedMessage: { conversation: 'mensagem anterior' } } } },
    },
  });

  assert.equal(result.from, '551199999999@s.whatsapp.net');
  assert.equal(result.to, 'bot@s.whatsapp.net');
  assert.equal(result.timestamp, '2026-09-21T14:03:00Z');
  assert.equal(result.senderName, 'Operador');
  assert.equal(result.quotedMessage, 'mensagem anterior');
  assert.equal(result.isFromMe, false);
});

test('extracts the operational text from an extended-text quoted message', () => {
  const result = parseIncomingMessage({
    type: 'Message',
    event: {
      Info: { ID: 'msg-quoted-activation', Chat: '120363422003961917@g.us', IsGroup: true, IsFromMe: false },
      Message: {
        extendedTextMessage: {
          text: 'Validado e encerrado',
          contextInfo: {
            quotedMessage: {
              extendedTextMessage: { text: 'VALIDAR COM NOC ACESSO\nBDESK: 648948\nOLT: VIP-SZN-SPO-OHW-01' },
            },
          },
        },
      },
    },
  });

  assert.equal(result.message, 'Validado e encerrado');
  assert.match(result.quotedMessage || '', /VALIDAR COM NOC ACESSO/);
});

test('analyzes the exact direct WuzAPI envelope from Render logs', () => {
  const result = parseIncomingMessage({
    event: {
      Info: {
        Chat: '120363422003961917@g.us',
        Sender: '230086028566614@lid',
        IsFromMe: false,
        IsGroup: true,
        ID: '3EB08D25A58373F2326496',
        Type: 'text',
        Timestamp: '2026-09-21T13:07:53-03:00',
      },
      Message: {
        conversation: 'VALIDAR COM NOC ACESSO\nOLT: VIP-SZN-SPO-OHW-01\nSLOT/PON: 02/13\nDATA/HORA DO EVENTO: 21/09/2026 10:21\nAFETADOS: 19\nBDESK: 648948\nTarefa Office Track: 602141494090102',
      },
    },
    type: 'Message',
  });

  assert.equal(result.eventType, 'Message');
  assert.equal(result.chatId, '120363422003961917@g.us');
  assert.equal(result.isGroup, true);
  assert.equal(analyzeOperationalMessage(result).eh_acionamento, true);
});

test('semantically analyzes NOC access data without confusing address, date or Office Track fields', () => {
  const result = analyzeOperationalMessage(`⚠️VALIDAR COM NOC ACESSO⚠️
- OLT: * VIP-SZN-SPO-OHW-01
- SLOT/PON: * 06/00, 05/14, 05/13
- Tipo de Falha: * -
- Data/Hora do Evento: * 21/09/2026 11:03
- Contrato(s) Exemplos:
NOME: REINALDO BATISTA FIALHO
CONTRATO: 4492580
- Afetados: * 132
- BDESK: * 648969
- Tarefa Office Track: 602117355170102
- Endereços:
CEP: 08411-570
RUA PARATI, 59 VILA MARILENA, SAO PAULO - SP

CEP: 08663-125
RUA EXPEDITO, 30 CASA 2, SUZANO - SP
- COPE REDE: NICOLLI`);

  assert.equal(result.eh_acionamento, true);
  assert.equal(result.tipo_card, 'ACESSO');
  assert.equal(result.olt, 'VIP-SZN-SPO-OHW-01');
  assert.deepEqual(result.slot_pon, ['06/00', '05/14', '05/13']);
  assert.equal(result.data_hora_evento, '21/09/2026 11:03');
  assert.equal(result.office_track, '602117355170102');
  assert.equal(result.contrato, '4492580');
  assert.equal(result.afetados, 132);
  assert.equal(result.localizacao?.length, 2);
  assert.equal(result.cope_rede, 'NICOLLI');
});

test('does not classify ordinary group conversation as an activation', () => {
  assert.equal(analyzeOperationalMessage('Bom dia, equipe. Reuniao as 14h.').eh_acionamento, false);
});

test('normalizes WuzAPI event string with message data envelope', () => {
  const result = parseIncomingMessage({
    event: 'Message',
    data: {
      Info: {
        ID: 'msg-envelope',
        Chat: '120363422003961917@g.us',
        Sender: '551199999999@s.whatsapp.net',
        IsGroup: true,
      },
      Message: { conversation: 'ORDEM: RF-ENVELOPE' },
    },
  });

  assert.equal(result.eventType, 'Message');
  assert.equal(result.id, 'msg-envelope');
  assert.equal(result.chatId, '120363422003961917@g.us');
  assert.equal(result.sender, '551199999999@s.whatsapp.net');
  assert.equal(result.isGroup, true);
  assert.equal(result.message, 'ORDEM: RF-ENVELOPE');
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
