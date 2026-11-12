import assert from 'node:assert/strict';
import test from 'node:test';
import { DUTY_STATUSES, dutyStatusChanges, isWorkingDuty } from '../src/duty-status.js';

test('day status drives active and the old situation', () => {
  assert.equal(DUTY_STATUSES.length, 11);
  assert.deepEqual(dutyStatusChanges('Ativo', 'Em campo'), { active: true, currentStatus: 'Em campo' });
  assert.deepEqual(dutyStatusChanges('Vindo na base', 'Indisponivel'), { active: true, currentStatus: 'Disponivel' });
  assert.deepEqual(dutyStatusChanges('Folga', 'Disponivel'), { active: false, currentStatus: 'Indisponivel' });
  assert.equal(isWorkingDuty('Ativar às 13:00'), false);
});

test('saving status and note on a technician (demo store)', async () => {
  process.env.REDEFLOW_DEMO_DATA = 'true';
  const { addTechnician, updateTechnician } = await import('../src/store/teams.js');
  const first = await addTechnician({ name: 'Teste Status', registration: 'TEC-STATUS-1', region: 'Leste', shift: '08:00 - 17:00', currentStatus: 'Disponivel', active: true, teamRole: 'Tecnico' });
  const off = await updateTechnician(first.id, { dutyStatus: 'Atestado', statusNote: 'volta segunda' });
  assert.equal(off?.dutyStatus, 'Atestado');
  assert.equal(off?.statusNote, 'volta segunda');
  assert.equal(off?.active, false);
  assert.ok(off?.statusUpdatedAt);
  const back = await updateTechnician(first.id, { dutyStatus: 'Ativo', statusNote: null });
  assert.equal(back?.active, true);
  assert.equal(back?.statusNote, null);
});
