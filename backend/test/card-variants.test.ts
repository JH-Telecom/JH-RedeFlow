import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCardText, splitTicket } from '../src/integrations/wuzapi/card-normalizer.js';
import { analyzeOperationalMessage } from '../src/integrations/wuzapi/semantic.js';
import { extractOperationalData, parseIncomingMessage } from '../src/integrations/wuzapi/client.js';

// Variacoes reais vistas nos grupos: cada pessoa escreve o card de um jeito.

test('card com cabecalho do COP, negrito e bullets e reconhecido como NOC ACESSO', () => {
  const result = analyzeOperationalMessage(`Gabriel Sales - COP Redes
*NOC-ACESSO*
• *BDESK*: 4518877
• *OLT*: OLT-SPO-MOOCA-01
• *Slot/PON*: 3/14
• *Motivo*: LOS em massa
• *Clientes afetados*: 37 clientes
▶️ Técnico de rede: Fulano da Silva`);
  assert.equal(result.eh_acionamento, true);
  assert.equal(result.tipo_card, 'ACESSO');
  assert.equal(result.bdesk, '4518877');
  assert.equal(result.olt, 'OLT-SPO-MOOCA-01');
  assert.deepEqual(result.slot_pon, ['3/14']);
  assert.equal(result.motivo, 'LOS em massa');
  assert.equal(result.afetados, 37);
  assert.equal(result.tecnico_rede, 'Fulano da Silva');
});

test('card FIELD com cabecalho ### e secoes === e lido', () => {
  const result = analyzeOperationalMessage(`### ACIONAMENTO DE CAMPO ###
=== INFO DO EVENTO ===
Tarefa do OT - 90876543
OLT = OLT-GRU-CENTRO-02
Tipo da falha – Rompimento de fibra
=== EQUIPE ===
Técnico: 0
Auxiliar: -`);
  assert.equal(result.tipo_card, 'FIELD');
  assert.equal(result.office_track, '90876543');
  assert.equal(result.olt, 'OLT-GRU-CENTRO-02');
  assert.equal(result.tipo_falha, 'Rompimento de fibra');
  assert.equal(result.tecnico, null, 'tecnico "0" significa sem tecnico');
  assert.equal(result.auxiliar, null);
});

test('ticket do backbone separa numero e trecho', () => {
  const result = analyzeOperationalMessage(`EVENTO DE BACK-BONE
TICKET: 658278 » SP::ATN::MAUA_TUR<>SAO_PAULO_MTX::DWDM::VIP
Motivo: Rompimento`);
  assert.equal(result.tipo_card, 'TX');
  assert.equal(result.bdesk, '658278');
  assert.equal(result.ticket, '658278');
  assert.equal(result.trecho, 'SP::ATN::MAUA_TUR<>SAO_PAULO_MTX::DWDM::VIP');
  assert.equal(extractOperationalData('NOC TX\nTICKET: 658278 » SP::ATN::X').bdesk, '658278');
});

test('rotulo sem valor nao captura a linha seguinte', () => {
  const result = analyzeOperationalMessage(`NOC ACESSO
BDESK: 4400001
Contrato(s) Exemplo(s):
NOME: CLIENTE TESTE
CONTRATO: 4492580
Técnico Rede:
OBS: verificar CTO`);
  assert.equal(result.contrato, '4492580');
  assert.equal(result.tecnico_rede, null);
  assert.equal(result.observacoes, 'verificar CTO');
});

test('normalizador preserva enderecos e trechos com hifen', () => {
  const text = normalizeCardText('RUA DAS FLORES, 10 - CENTRO\nSAO PAULO - SP\nSP::RUP::MAUA_TUR');
  assert.equal(text, 'RUA DAS FLORES, 10 - CENTRO\nSAO PAULO - SP\nSP::RUP::MAUA_TUR');
});

test('variacoes de tipo de card sao reconhecidas', () => {
  assert.equal(analyzeOperationalMessage('Validar c/ o NOC\nOLT: X\nBDESK: 4400002').tipo_card, 'ACESSO');
  assert.equal(analyzeOperationalMessage('noc_tx\nTICKET: 700001').tipo_card, 'TX');
  assert.equal(analyzeOperationalMessage('Acionamento de fild\nOT: 123456').tipo_card, 'FIELD');
});

test('splitTicket aceita numero simples e com cerquilha', () => {
  assert.deepEqual(splitTicket('#4518877'), { numero: '4518877', trecho: null });
  assert.deepEqual(splitTicket('658278 > SP::X'), { numero: '658278', trecho: 'SP::X' });
  assert.deepEqual(splitTicket(null), { numero: null, trecho: null });
});

test('evento de recibo com Chat no nivel do evento informa o grupo', () => {
  const parsed = parseIncomingMessage({ type: 'ReadReceipt', event: { Chat: '120363183251501300@g.us', Sender: '5511999999999@s.whatsapp.net', IsGroup: true } });
  assert.equal(parsed.chatId, '120363183251501300@g.us');
});
