import assert from 'node:assert/strict';
import test from 'node:test';
import { previousWeek, weeklyIgpText } from '../src/weekly-igp.js';
import type { Call } from '../src/types.js';

test('previous week is Monday to Sunday before the given date', () => {
  assert.deepEqual(previousWeek('2026-11-23'), { from: '2026-11-16', to: '2026-11-22' }); // segunda
  assert.deepEqual(previousWeek('2026-11-18'), { from: '2026-11-09', to: '2026-11-15' }); // quarta
});

test('weekly IGP text counts only the previous week with the IGP rules', () => {
  const call = (id: string, opened: string, closed: string, region = 'GUAIANASES 1'): Call => ({ id, orderNumber: id, bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region, city: '', address: '', olt: '', slotPon: '', status: 'Finalizado', openedAt: opened, executedAt: closed, notes: '' } as Call);
  const calls = [
    call('1', '2026-11-17T08:00:00-03:00', '2026-11-17T10:00:00-03:00'), // 2h, no prazo
    call('2', '2026-11-18T08:00:00-03:00', '2026-11-18T18:00:00-03:00'), // 10h, outlier
    call('3', '2026-11-10T08:00:00-03:00', '2026-11-10T09:00:00-03:00'), // semana anterior a essa: fora
  ];
  const { text, from, to } = weeklyIgpText(calls, '2026-11-23');
  assert.equal(from, '2026-11-16');
  assert.equal(to, '2026-11-22');
  assert.match(text, /Total: 2 ordens · 50% no prazo · 50% outlier/);
  assert.match(text, /Mês até aqui\* \(3 ordens\)/);
});
