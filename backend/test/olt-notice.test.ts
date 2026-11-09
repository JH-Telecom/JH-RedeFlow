import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOltNotice, createPublicViewToken, extractAllSlotPons, extractNoticeAddresses, isNoticeOlt, isOltNoticeMessage, publicViewExpired, readPublicViewToken } from '../src/olt-notice.js';

const card = [
  '⚠️VALIDAR COM NOC ACESSO⚠️',
  ' • OLT: VIP-GZ1-SPO-OHW-02',
  ' • SLOT/PON: 04/10, 09/11',
  ' • Tipo de Falha: Parcial',
  ' • Data/Hora do Evento: 07/11/2026 06:08',
  ' • Afetados: 9',
  ' • Endereços:',
  'AVENIDA DOUTOR GUILHERME DE ABREU SODRÉ, 1492 APARTAMENTO:12 / BLOCO:BL-A VILA HORTENCIA, SAO PAULO - SP',
  'N/A',
  'Comp/Ref: APARTAMENTO 23B, EM FRENTE AO GINÁSIO',
].join('\n');

test('only OLTs from the Casa Cliente list get a notice (case and spaces ignored)', () => {
  assert.equal(isNoticeOlt('VIP-GZ1-SPO-OHW-02'), true);
  assert.equal(isNoticeOlt(' vip-ita-spo-ohw-04 '), true);
  assert.equal(isNoticeOlt('VIP-GRU-1-SPO-ONK-03'), false);
  assert.equal(isNoticeOlt(''), false);
});

test('slot/PON extraction keeps zeros and ignores dates', () => {
  assert.deepEqual(extractAllSlotPons(card), ['04/10', '09/11']);
  assert.deepEqual(extractAllSlotPons('SLOT/PON:06/00 e 05/04, evento 03/11/2026'), ['06/00', '05/04']);
});

test('addresses come from the Endereços block, street lines only', () => {
  assert.equal(extractNoticeAddresses(card), '• AVENIDA DOUTOR GUILHERME DE ABREU SODRÉ, 1492 APARTAMENTO:12 / BLOCO:BL-A VILA HORTENCIA, SAO PAULO - SP');
});

test('notice text: same layout as the spreadsheet, critical from 30 affected, with the read-only link', () => {
  const text = buildOltNotice({ tipo_card: 'NOC ACESSO', bdesk: '677984', office_track: '610126230530102', tipo_falha: 'Parcial', afetados: 9, olt: 'VIP-GZ1-SPO-OHW-02' }, card, 'https://jh-rede.vercel.app/consulta/abc');
  assert.match(text, /^\*ℹ️ INFORMATIVO DE ACIONAMENTO\*/);
  assert.match(text, /\*PLACA\/PON:\* 04\/10, 09\/11/);
  assert.match(text, /\*BDESK:\* 677984/);
  assert.match(text, /https:\/\/jh-rede\.vercel\.app\/consulta\/abc$/);
  assert.equal(isOltNoticeMessage(text), true);
  const critical = buildOltNotice({ afetados: 84, olt: 'VIP-GZ1-SPO-OHW-02' }, card, 'x');
  assert.match(critical, /^\*🚨 INFORMATIVO DE ACIONAMENTO CRÍTICO\*/);
  assert.equal(isOltNoticeMessage(critical), true);
  assert.equal(isOltNoticeMessage(card), false);
});

test('read-only link: token opens only its activation and the link expires 7 days after closing', () => {
  const token = createPublicViewToken('act-1', 'secret');
  assert.equal(readPublicViewToken(token, 'secret'), 'act-1');
  assert.equal(readPublicViewToken(token, 'other-secret'), null);
  assert.equal(readPublicViewToken('lixo', 'secret'), null);
  const now = Date.parse('2026-11-20T12:00:00.000Z');
  assert.equal(publicViewExpired({ receivedAt: '2026-11-10T12:00:00.000Z', closedAt: null }, now), false);
  assert.equal(publicViewExpired({ receivedAt: '2026-11-10T12:00:00.000Z', closedAt: '2026-11-14T12:00:00.000Z' }, now), false);
  assert.equal(publicViewExpired({ receivedAt: '2026-11-10T12:00:00.000Z', closedAt: '2026-11-12T12:00:00.000Z' }, now), true);
  assert.equal(publicViewExpired({ receivedAt: '2026-09-01T12:00:00.000Z', closedAt: null }, now), true);
});
