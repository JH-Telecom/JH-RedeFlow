import assert from 'node:assert/strict';
import test from 'node:test';
import { nightShiftCutoffIso, planDailyReset } from '../src/daily-reset.js';
import type { Call, CallStatus } from '../src/types.js';

function call(id: string, status: CallStatus, assignedAt?: string, technicianId: string | undefined = 'tech-1'): Call {
  return { id, orderNumber: id, bdesk: '', officeTrack: '', client: '', type: 'ACIONAMENTO FIELD', reason: '', region: '', city: '', address: '', bairro: '', olt: '', slotPon: '', status, technicianId, assignedAt, openedAt: '2026-11-08T12:00:00.000Z', notes: '' };
}

// Limpeza de 10/11/2026 as 06:05 de Sao Paulo (09:05 UTC). Corte: 09/11 as 19:00 de Sao Paulo = 22:00 UTC.
const now = new Date('2026-11-10T09:05:00.000Z');

test('cutoff is 19:00 of the previous day in Sao Paulo', () => {
  assert.equal(nightShiftCutoffIso('2026-11-10'), '2026-11-09T22:00:00.000Z');
});

test('orders assigned before 19:00 yesterday go back to open; night-shift ones stay', () => {
  const calls = [
    call('tarde-ontem', 'Atribuido', '2026-11-09T21:59:00.000Z'),      // 18:59 de ontem -> limpa
    call('19h-ontem', 'Em campo', '2026-11-09T22:00:00.000Z'),          // 19:00 de ontem -> fica
    call('madrugada', 'Deslocamento', '2026-11-10T02:00:00.000Z'),      // 23:00 de ontem -> fica
    call('noite-anteontem', 'Atribuido', '2026-11-09T01:00:00.000Z'),   // 22:00 de anteontem -> limpa
    call('atrelado', 'Atrelado', '2026-11-08T12:00:00.000Z'),           // Atrelado nao entra
    call('aberto', 'Aberto', undefined, undefined),                     // sem tecnico
    call('finalizado', 'Finalizado', '2026-11-08T12:00:00.000Z'),       // encerrado nao entra
  ];
  const plan = planDailyReset(calls, new Map(), now);
  assert.equal(plan.resetDate, '2026-11-10');
  assert.deepEqual(plan.reset.map((item) => item.id), ['tarde-ontem', 'noite-anteontem']);
  assert.deepEqual(plan.kept.map((item) => item.id), ['19h-ontem', 'madrugada']);
});

test('the latest technician change in the history wins over the first assignment', () => {
  // Primeira atribuicao de manha, mas trocado para o tecnico da noite as 20:30 de ontem: fica.
  const reassigned = call('trocado-a-noite', 'Atribuido', '2026-11-09T12:00:00.000Z');
  // Sem nenhum horario de atribuicao: usa a abertura (antiga) e limpa.
  const unknown = call('sem-horario', 'Atribuido');
  const plan = planDailyReset([reassigned, unknown], new Map([['trocado-a-noite', '2026-11-09T23:30:00.000Z']]), now);
  assert.deepEqual(plan.kept.map((item) => item.id), ['trocado-a-noite']);
  assert.deepEqual(plan.reset.map((item) => item.id), ['sem-horario']);
});

test('daily reset job: runs once per day after 06:00, returns stale orders to open and keeps the night shift', async () => {
  process.env.REDEFLOW_DEMO_DATA = 'true';
  const { calls, auditLogs } = await import('../src/store/demo-data.js');
  const { listCalls } = await import('../src/store.js');
  const { runDailyReset } = await import('../src/daily-reset-job.js');
  await listCalls(); // carrega os dados de demonstracao antes de incluir os chamados do teste
  for (const item of [...calls.values()]) if (['Atribuido', 'Deslocamento', 'Em campo'].includes(item.status)) calls.delete(item.id);
  calls.set('reset-dia', call('reset-dia', 'Atribuido', '2026-11-09T15:00:00.000Z'));
  calls.set('reset-noite', call('reset-noite', 'Em campo', '2026-11-09T12:00:00.000Z'));
  // Trocado para o tecnico da noite as 21:00 de ontem (historico): fica.
  auditLogs.set('log-noite', { id: 'log-noite', callId: 'reset-noite', userId: 'u1', userName: 'Despacho', action: 'Tecnico alterado', field: 'technicianId', previousValue: 'tech-0', newValue: 'tech-1', createdAt: '2026-11-10T00:00:00.000Z' });

  assert.equal(await runDailyReset(new Date('2026-11-10T08:30:00.000Z')), null, 'antes das 06:00 nao roda');
  assert.equal(await runDailyReset(new Date('2026-11-10T14:05:00.000Z')), null, 'depois das 10:59 fica para o dia seguinte');

  const plan = await runDailyReset(now);
  assert.ok(plan);
  assert.deepEqual(plan.reset.map((item) => item.id), ['reset-dia']);
  assert.deepEqual(plan.kept.map((item) => item.id), ['reset-noite']);
  const after = new Map((await listCalls()).map((item) => [item.id, item]));
  assert.equal(after.get('reset-dia')?.status, 'Aberto');
  assert.equal(after.get('reset-dia')?.technicianId, undefined);
  assert.equal(after.get('reset-noite')?.status, 'Em campo');
  assert.equal(after.get('reset-noite')?.technicianId, 'tech-1');

  assert.equal(await runDailyReset(new Date('2026-11-10T12:00:00.000Z')), null, 'uma vez por dia');
});
