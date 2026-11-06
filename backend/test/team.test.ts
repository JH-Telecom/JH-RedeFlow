import assert from 'node:assert/strict';
import test from 'node:test';
import { activeStatus, findMentions, monthHighlights } from '../src/team.js';
import type { Call, Supervisor, Technician } from '../src/types.js';

test('status: empty or expired does not show', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  assert.equal(activeStatus(null, now), null);
  assert.equal(activeStatus({ text: ' ', emoji: '' }, now), null);
  assert.equal(activeStatus({ text: 'Almoço', emoji: '🍽️', until: '2026-11-06T11:00:00Z' }, now), null);
  assert.deepEqual(activeStatus({ text: 'Em campo', emoji: '🚗', until: '2026-11-06T13:00:00Z' }, now), { text: 'Em campo', emoji: '🚗', until: '2026-11-06T13:00:00Z' });
});

test('mentions match full names without accents or case, longest first, never the author', () => {
  const users = [
    { id: 'ana', name: 'Ana Paula', active: true },
    { id: 'ana-souza', name: 'Ana Paula Souza', active: true },
    { id: 'joao', name: 'João Silva', active: true },
    { id: 'off', name: 'Inativo Teste', active: false },
    { id: 'me', name: 'Matheus Terra', active: true },
  ];
  assert.deepEqual(findMentions('sem mencao', users), []);
  assert.deepEqual(findMentions('@ana paula souza veja isso, e @JOAO SILVA também', users, 'me').sort(), ['ana-souza', 'joao']);
  assert.deepEqual(findMentions('Falei com @Ana Paula.', users), ['ana']);
  assert.deepEqual(findMentions('@Inativo Teste @Matheus Terra', users, 'me'), []);
  assert.deepEqual(findMentions('@João Silvano', users), [], 'nome no meio de outra palavra nao conta');
});

test('month highlights: most on time, best percent (min 10) and best supervisor', () => {
  const call = (tech: string, sup: string, hours: number, i: number): Call => ({ id: `${tech}-${i}`, orderNumber: String(i), bdesk: '', officeTrack: '', client: '', type: '', reason: '', region: '', city: '', olt: '', slotPon: '', status: 'Finalizado', technicianName: tech, supervisorName: sup, openedAt: '2026-11-03T08:00:00-03:00', executedAt: new Date(Date.parse('2026-11-03T08:00:00-03:00') + hours * 3_600_000).toISOString(), notes: '' });
  const calls = [
    ...Array.from({ length: 12 }, (_, i) => call('Ana', 'Sup A', i < 11 ? 3 : 8, i)),
    ...Array.from({ length: 14 }, (_, i) => call('Bia', 'Sup B', i < 12 ? 2 : 10, 100 + i)),
    call('Caio', 'Sup A', 2, 200),
  ];
  const technicians = ['Ana', 'Bia', 'Caio'].map((name) => ({ id: name, name, registration: '', region: '', shift: '', currentStatus: 'Disponivel', active: true, teamRole: 'Tecnico' }) as Technician);
  const supervisors: Supervisor[] = [{ id: 's1', userId: 'user-sup-a', name: 'Sup A', region: '', active: true, technicianCount: 2 }, { id: 's2', name: 'Sup B', region: '', active: true, technicianCount: 1 }];
  const highlights = Object.fromEntries(monthHighlights(calls, technicians, supervisors, '2026-11').map((item) => [item.kind, item]));
  assert.equal(highlights['most-finished'].name, 'Bia');
  assert.equal(highlights['best-on-time'].name, 'Ana', '11/12 = 91,7% > 12/14 = 85,7%');
  assert.equal(highlights['best-supervisor'].name, 'Sup A');
  assert.equal(highlights['best-supervisor'].userId, 'user-sup-a');
  assert.deepEqual(monthHighlights(calls, technicians, supervisors, '2026-10'), []);
});
