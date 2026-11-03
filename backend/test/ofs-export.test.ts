import assert from 'node:assert/strict';
import test from 'node:test';
import { isOfsFlatExport, parseOfsActivityExport } from '../src/imports/ofs-export.js';

// O OFS exporta as colunas da visao/alocacao atual: a ordem e a quantidade mudam. A leitura e pelo nome.

test('reads the OFS export with columns in another order and a single activity type column', () => {
  const csv = [
    'Ordem de Serviço;Tipo de Atividade;Data;Status da Atividade;Recurso;Início;Tempo',
    '12662587;Manutenção de Rede Field;03/11/26;Iniciado;ROMAO CORREIA;17:10;00:40',
    '12662115;Instalação;03/11/26;Concluído;OUTRO TECNICO;08:00;01:00',
    '12662332;Manutenção Corretiva de Rede;03/11/26;Pendente;;;',
  ].join('\n');
  assert.equal(isOfsFlatExport(csv), true);
  const data = parseOfsActivityExport(csv);
  assert.equal(data.records?.length, 2, 'instalacao nao e atividade de rede');
  assert.deepEqual(data.orders, [{ order: '12662587', technician: 'ROMAO CORREIA', inicio: '17:10', tempo: '00:40' }]);
  assert.equal(data.technicians.length, 1);
  assert.deepEqual(data.activities.map((item) => item.type).sort(), ['Manutenção Corretiva de Rede', 'Manutenção de Rede Field']);
});

test('uses whichever activity type column holds the network activity', () => {
  const csv = [
    'Recurso,Tipo de Atividade,Status da Atividade,Tipo de Atividade,Ordem de Serviço',
    'TECNICO A,Reparo,Concluído,Manutenção Preventiva de Rede,OS-1',
  ].join('\n');
  assert.equal(parseOfsActivityExport(csv).records?.[0]?.activityType, 'Manutenção Preventiva de Rede');
});

test('lists the received columns when the file is not the activity export', () => {
  const csv = 'Nome;Cidade;Bairro\nA;B;C';
  assert.equal(isOfsFlatExport(csv), false);
  assert.throws(() => parseOfsActivityExport(csv), /faltam as colunas Status da Atividade, Tipo de Atividade, Ordem de Servico\. Colunas recebidas: Nome \| Cidade \| Bairro/);
});
