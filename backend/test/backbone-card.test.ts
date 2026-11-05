import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeOperationalMessage } from '../src/integrations/wuzapi/semantic.js';

// Card real de backbone (NOC TX): a ordem vem como "OFS:" e o evento como "ABERTO EM:".
const backboneCard = [
  '⚠️ VALIDAR COM NOC TX ⚠️',
  '',
  '⚠️ ACIONAMENTO DE EVENTO BACKBONE ⚠️',
  '',
  '- TICKET:  673908 » SP::RUP::SAO_PAULO_GZ1<>GUARULHOS_GR1::METRO:VIA_GZ2::VIP',
  '',
  '- ABERTO EM: 05/11/2026 07:06:00',
  '',
  '- TIPO: RUPTURA',
  '',
  '- OBSERVAÇÕES:',
  '',
  'Facilidades: 06:45',
  'Host A: BR-SP-SPO-GZ1-AC-03 172.16.200.69 100GE1/0/14',
  '',
  '- OFS: 610053309290102',
  '',
  '- Técnico Rede: JH TELECOM REDES',
].join('\n');

test('backbone card reads the order from "OFS:" and the event from "ABERTO EM:"', () => {
  const analysis = analyzeOperationalMessage(backboneCard);
  assert.equal(analysis.tipo_registro, 'NOC TX');
  assert.equal(analysis.office_track, '610053309290102');
  assert.equal(analysis.ticket, '673908');
  assert.equal(analysis.data_hora_evento, '05/11/2026 07:06:00');
});

test('"Data/Hora do Evento" still wins over "ABERTO EM"', () => {
  const analysis = analyzeOperationalMessage('⚠️VALIDAR COM NOC ACESSO⚠️\n- DATA/HORA DO EVENTO: 05/11/2026 06:30\n- ABERTO EM: 05/11/2026 07:06:00');
  assert.equal(analysis.data_hora_evento, '05/11/2026 06:30');
});

test('"Status OFS" is not read as the order number', () => {
  const analysis = analyzeOperationalMessage('⚠️VALIDAR COM NOC ACESSO⚠️\n- BDESK: 670496\n- Status OFS: Pendente');
  assert.equal(analysis.office_track, null);
});
