import assert from 'node:assert/strict';
import test from 'node:test';
import type { Call } from '../src/types.js';

// Usa o modo demo (memoria): mesmo fluxo do cadastro no Supabase, sem banco.
process.env.REDEFLOW_DEMO_DATA = 'true';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';

const call = (id: string, technicianName?: string, technicianId?: string) => ({ id, orderNumber: id, technicianName, technicianId }) as Call;

test('registers missing workbook technicians as inactive and links their calls', async () => {
  const { registerMissingHistoricalTechnicians } = await import('../src/imports/historical-technicians.js');
  const { listTechnicians } = await import('../src/store.js');
  const before = (await listTechnicians()).length;
  const calls = [call('a', 'Carlos Junior'), call('b', 'carlos junior'), call('c', 'Enedino Assis Costa Neto'), call('d'), call('e', 'Já vinculado', 'tech-x')];

  const created = await registerMissingHistoricalTechnicians(calls);

  assert.deepEqual(created.sort(), ['Carlos Junior', 'Enedino Assis Costa Neto'], 'mesmo nome com outra caixa nao gera cadastro duplicado');
  const technicians = await listTechnicians();
  assert.equal(technicians.length, before + 2);
  const carlos = technicians.find((technician) => technician.name === 'Carlos Junior');
  assert.ok(carlos);
  assert.equal(carlos.active, false);
  assert.equal(carlos.teamRole, 'Tecnico');
  assert.match(carlos.registration, /^HIST-[0-9A-F]{8}$/);
  assert.equal(calls[0].technicianId, carlos.id);
  assert.equal(calls[1].technicianId, carlos.id);
  assert.equal(calls[3].technicianId, undefined, 'sem nome continua sem tecnico');
  assert.equal(calls[4].technicianId, 'tech-x');

  // Segunda importacao: nao cadastra de novo.
  const again = [call('f', 'Carlos Junior')];
  assert.deepEqual(await registerMissingHistoricalTechnicians(again), []);
  assert.equal(again[0].technicianId, carlos.id);
});
