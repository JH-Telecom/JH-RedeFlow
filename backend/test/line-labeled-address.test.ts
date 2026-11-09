import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeOperationalMessage } from '../src/integrations/wuzapi/semantic.js';

// Card do NOC sem CEP, com o endereco "em linhas" (rotulo numa linha e valor na de baixo). Antes, o bairro saia
// com o texto de todos os clientes (311 caracteres) e o aceite falhava: "value too long for type character varying(160)".
const card = [
  '⚠️VALIDAR COM NOC ACESSO⚠️', '', '- OLT:VIP-GRU-1-SPO-ONK-02', '', '- SLOT/PON:08/02', '', '- Tipo de falha: total', '',
  '- Data/Hora do Evento:07/11/2026 06:08', '', '- Contrato(s) Exemplo(s):', 'NOME: CLIENTE UM || CONTRATO: 1000001', 'NOME: CLIENTE DOIS || CONTRATO: 1000002', '',
  '- Afetados: 26', '', '- BDESK:676030', '', '- Tarefa OFS: 610032319500102', '', '- Técnico Rede: Tecnico Teste', '', '- Endereços:', '',
  'NOME: CLIENTE DOIS || CONTRATO: 1000002', 'Endereço Cobrança', 'RUA', 'UM', 'Número', '130', 'Bairro', 'JARDIM GUILHERMINO', 'Cidade', 'GUARULHOS', '',
  'NOME: CLIENTE TRES || CONTRATO: 1000003', 'RUA', 'RUA UM', 'Número', '130', 'Bairro', 'JARDIM GUILHERMINO', 'Cidade', 'GUARULHOS', '',
  'NOME: CLIENTE QUATRO || CONTRATO: 1000004', 'RUA', 'MUCUGEO', 'Número', '130', 'Bairro', 'JARDIM GUILHERMINO', 'Cidade', 'GUARULHOS', '',
  'NOME: CLIENTE CINCO', 'RUA', 'UM', 'Número', '130', 'Bairro', 'JARDIM GUILHERMINO', 'Cidade', 'GUARULHOS',
].join('\n');

test('NOC card with line-labeled addresses and no CEP: one record per client, short neighborhood', () => {
  const analysis = analyzeOperationalMessage(card);
  assert.equal(analysis.bairro_principal, 'JARDIM GUILHERMINO');
  assert.equal(analysis.endereco_principal, 'RUA UM, 130');
  assert.equal(analysis.office_track, '610032319500102');
  assert.ok((analysis.bairro_principal || '').length <= 160);
});
