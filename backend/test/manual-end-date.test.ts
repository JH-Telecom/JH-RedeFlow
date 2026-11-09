import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOfsRowsToCalls, listCalls, updateCallEndDate } from '../src/store.js';
import { calls } from '../src/store/demo-data.js';
import type { Call, User } from '../src/types.js';

function closedCall(id: string, orderNumber: string): Call {
  return { id, orderNumber, bdesk: '', officeTrack: '', client: 'Cliente teste', type: 'ACIONAMENTO FIELD', reason: 'CAIXA SEM SINAL', region: 'DIADEMA', city: 'DIADEMA', address: '', bairro: '', olt: '', slotPon: '', status: 'Baixar', openedAt: '2026-09-14T16:47:00.000Z', notes: '' };
}

const person: User = { id: 'user-end-date-test', name: 'Pessoa Teste', email: 'pessoa@jhtelecom.com', roleId: 'role-admin', active: true, createdAt: new Date().toISOString() };

test('an end date corrected by a person is kept when the OFS sync runs again; others still follow the OFS', async () => {
  process.env.REDEFLOW_DEMO_DATA = 'true'; // memoria local (sem isso o store limpa os chamados a cada leitura)
  await listCalls(); // carrega os dados de demonstracao antes de incluir os chamados do teste
  // Dois chamados em Baixar (fechados aqui), para o OFS trazer a Data Fim.
  const corrected = closedCall('call-end-date-manual', '91000001');
  const untouched = closedCall('call-end-date-ofs', '91000002');
  calls.set(corrected.id, corrected);
  calls.set(untouched.id, untouched);

  const manual = '2026-11-01T18:30:00.000Z';
  const saved = await updateCallEndDate(corrected.id, manual, person);
  assert.equal(saved?.status, 'Baixar', 'continua encerrado');
  assert.equal(saved?.executedAt, manual);

  const rows = [corrected, untouched].map((call) => ({ 'Número OS': call.orderNumber, 'Status OFS': 'Concluída', Data: '06/11/2026', Fim: '15:35' }));
  await applyOfsRowsToCalls(rows, 'Teste OFS');

  const after = new Map((await listCalls()).map((call) => [call.id, call]));
  assert.equal(after.get(corrected.id)?.executedAt, manual, 'correcao manual mantida');
  assert.ok(after.get(untouched.id)?.executedAt?.startsWith('2026-11-06'), 'sem correcao manual, segue o OFS');
});
