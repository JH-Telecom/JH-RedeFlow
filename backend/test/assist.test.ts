import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRiskModel, callRisk, massIncidents, suggestTechnicians } from '../src/assist.js';
import type { Call, Technician } from '../src/types.js';

const now = Date.parse('2026-11-06T15:00:00-03:00');
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const base: Call = { id: 'x', orderNumber: '1', bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region: 'GUARULHOS 1', bairro: 'Centro', city: '', olt: 'OLT-A', slotPon: '1/1', status: 'Aberto', openedAt: ago(30), notes: '' };
const finished = (id: string, tech: string, hours: number, extra: Partial<Call> = {}): Call => ({ ...base, id, status: 'Finalizado', technicianId: tech, openedAt: ago(3000), executedAt: new Date(Date.parse(ago(3000)) + hours * 3_600_000).toISOString(), ...extra });
const tech = (id: string, name: string, extra: Partial<Technician> = {}): Technician => ({ id, name, registration: '', region: '', shift: '', currentStatus: 'Disponivel', active: true, teamRole: 'Tecnico', ...extra });

test('technician suggestion: free and experienced in the region/OLT first', () => {
  const technicians = [tech('ana', 'Ana'), tech('bia', 'Bia'), tech('caio', 'Caio'), tech('aux', 'Aux', { teamRole: 'Auxiliar' }), tech('off', 'Off', { employmentStatus: 'Demitido' })];
  const calls: Call[] = [
    ...Array.from({ length: 6 }, (_, i) => finished(`a${i}`, 'ana', 3)),
    ...Array.from({ length: 6 }, (_, i) => finished(`b${i}`, 'bia', 3, { region: 'SAO PAULO', olt: 'OLT-Z', bairro: 'Mooca' })),
    { ...base, id: 'busy', status: 'Em campo', technicianId: 'caio' },
    { ...base, id: 'busy2', status: 'Em campo', technicianId: 'caio' },
  ];
  const suggestions = suggestTechnicians({ ...base, id: 'new' }, technicians, calls, now);
  assert.deepEqual(suggestions.map((item) => item.technicianId), ['ana', 'bia', 'caio']);
  assert.ok(suggestions[0].reasons.includes('Livre agora'));
  assert.ok(suggestions[0].reasons.some((reason) => /OLT OLT-A/.test(reason)));
  assert.ok(suggestions[0].reasons.some((reason) => /100% no prazo/.test(reason)));
  assert.equal(suggestions[2].reasons[0], '2 chamado(s) ativo(s)');
});

test('risk: no estimate without history; higher for late-prone region and time already spent', () => {
  assert.equal(callRisk(base, buildRiskModel([], now), now), null);
  const history: Call[] = [
    ...Array.from({ length: 40 }, (_, i) => finished(`ok${i}`, 't', 2, { region: 'SAO PAULO' })),
    ...Array.from({ length: 20 }, (_, i) => finished(`late${i}`, 't', 8, { region: 'GUARULHOS 1' })),
    ...Array.from({ length: 5 }, (_, i) => finished(`gok${i}`, 't', 2, { region: 'GUARULHOS 1' })),
  ];
  const model = buildRiskModel(history, now);
  const sp = callRisk({ ...base, region: 'SAO PAULO', technicianId: 't' }, model, now)!;
  const gru = callRisk({ ...base, technicianId: 't' }, model, now)!;
  assert.ok(gru.percent > sp.percent, `${gru.percent} > ${sp.percent}`);
  const later = callRisk({ ...base, region: 'SAO PAULO', technicianId: 't', openedAt: ago(300) }, model, now)!;
  assert.ok(later.percent > sp.percent);
  assert.equal(callRisk({ ...base, openedAt: ago(400) }, model, now), null, 'ja estourou');
  assert.equal(callRisk({ ...base, openedAt: ago(200) }, model, now)!.level, 'alto', 'sem tecnico ha mais de 3h');
});

test('mass incidents: 3+ active calls on the same OLT within 3h of each other', () => {
  const calls: Call[] = [
    { ...base, id: '1', openedAt: ago(300) },
    { ...base, id: '2', openedAt: ago(250), slotPon: '1/2' },
    { ...base, id: '3', openedAt: ago(100) },
    { ...base, id: '4', openedAt: ago(1000) }, // 11h antes: fora da janela
    { ...base, id: '5', olt: 'OLT-B' },
    { ...base, id: '6', status: 'Finalizado', openedAt: ago(200) },
  ];
  const incidents = massIncidents(calls);
  assert.equal(incidents.length, 1);
  assert.deepEqual(incidents[0].calls.map((call) => call.id), ['1', '2', '3']);
  assert.deepEqual(incidents[0].slotPons, ['1/1', '1/2']);
});
