import assert from 'node:assert/strict';
import test from 'node:test';
import { checklistFor, checklistNote, missingChecklistItems, type ChecklistTemplate } from '../src/field.js';

const templates: ChecklistTemplate[] = [
  { id: '1', name: 'Geral', callTypes: [], items: ['Sinal conferido'], active: true },
  { id: '2', name: 'Rompimento', callTypes: ['ACIONAMENTO FIELD'], items: ['Emenda testada', 'Sinal conferido na OLT'], active: true },
  { id: '3', name: 'Desligado', callTypes: ['NOC TX'], items: ['X'], active: false },
];

test('checklist: specific type wins, empty types apply to all, inactive is ignored', () => {
  assert.equal(checklistFor('acionamento field', templates)?.name, 'Rompimento');
  assert.equal(checklistFor('NOC ACESSO', templates)?.name, 'Geral');
  assert.equal(checklistFor('NOC TX', templates)?.name, 'Geral', 'o especifico esta desligado');
  assert.equal(checklistFor('NOC TX', templates.filter((item) => item.id !== '1')), null);
});

test('checklist: missing items compare without accents or case, and the note lists them', () => {
  const template = templates[1];
  assert.deepEqual(missingChecklistItems(template, ['emenda testada']), ['Sinal conferido na OLT']);
  assert.deepEqual(missingChecklistItems(template, ['Emenda testada', 'SINAL CONFERIDO NA OLT']), []);
  assert.deepEqual(missingChecklistItems(null, []), []);
  assert.equal(checklistNote(template), 'Checklist "Rompimento": ✔ Emenda testada; ✔ Sinal conferido na OLT');
});
