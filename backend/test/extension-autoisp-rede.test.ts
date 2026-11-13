import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Script classico da extensao: carregado com node:vm, sem chrome.
const file = path.resolve(process.cwd(), '..', 'extensao-rede', 'autoisp-rede.js');
const sandbox: Record<string, any> = { console };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test('autoisp-rede: urlBuscaPon monta a busca por OLT e PON', () => {
  assert.match(sandbox.urlBuscaPon(7, '0/4/10'), /^\/client_search\/search\?olt_id=7&ponlink=0(\/|%2F)4(\/|%2F)10$/);
});

test('autoisp-rede: variantesPon tenta f/s/p e depois s/p', () => {
  assert.deepEqual(plain(sandbox.variantesPon('0/4/10')), ['0/4/10', '4/10']);
  assert.deepEqual(plain(sandbox.variantesPon('4/10')), ['4/10']);
});

test('autoisp-rede: acharOlt normaliza o nome e so aceita parte do nome se casar 1 OLT', () => {
  const lista = [{ id: 7, hostname: 'VIP-GRU-2-SPO-ONK-01' }, { id: 8, hostname: 'VIP-SAN-1-SPO-ONK-02' }];
  assert.equal(sandbox.acharOlt(lista, 'vip-gru-2-spo-onk-01 ').id, 7);
  assert.equal(sandbox.acharOlt(lista, 'vip-gru-2-spo-onk-01-0').id, 7);
  const duas = [{ id: 1, hostname: 'VIP-GRU-2-SPO-ONK-01' }, { id: 2, hostname: 'VIP-GRU-2-SPO-ONK-02' }];
  assert.equal(sandbox.acharOlt(duas, 'vip-gru-2-spo'), null);
  assert.equal(sandbox.acharOlt(lista, 'OUTRA-OLT-99'), null);
  assert.equal(sandbox.acharOlt(lista, ''), null);
});

test('autoisp-rede: normalizaOlts aceita arrays e objetos', () => {
  const lista = plain(sandbox.normalizaOlts([[3, 'A-1'], { id: 4, hostname: 'B-2' }, { value: 5, label: 'C-3' }, { id: 6, name: 'D-4' }, { id: 9 }]));
  assert.deepEqual(lista, [{ id: 3, hostname: 'A-1' }, { id: 4, hostname: 'B-2' }, { id: 5, hostname: 'C-3' }, { id: 6, hostname: 'D-4' }]);
  assert.equal(sandbox.normalizaOlts({ olts: [{ id: 1, hostname: 'X' }] }).length, 1);
  assert.equal(sandbox.normalizaOlts(null).length, 0);
});

test('autoisp-rede: limparDetalhe devolve so as chaves de NetClient, sem nome, endereco ou documento', () => {
  const json = {
    gpon_client: {
      serial_number: 'ALCL12345678',
      ponlink: '0/4/10',
      onu_status: { rx_power: '-25,37', status: 'ok' },
      acs_last_inform: '2026-11-13T10:00:00Z',
      contracted_service: { contract: { contract_install_addr_street: 'Rua Secreta 1', subscriber: { subsc_name: 'Fulano de Tal', cpf_cnpj: '12345678900' } } },
    },
    coordinates: { client: { lat: '-23.9', lng: -46.3 } },
  };
  const linha = { erp_id: '123456', serial_number: 'ALCL12345678', gpon_client_id: 987654, olt_hostname: 'VIP-GRU-2-SPO-ONK-01', ponlink: '0/4/10', subscriber_name: 'Fulano de Tal', address: 'Rua Secreta 1' };
  const c = plain(sandbox.limparDetalhe(json, linha));
  assert.deepEqual(Object.keys(c).sort(), ['contract', 'int6', 'lastInform', 'lat', 'lng', 'olt', 'onuStatus', 'ponlink', 'readAt', 'serial', 'signalRx'].sort());
  assert.equal(c.signalRx, -25.37);
  assert.equal(c.lat, -23.9);
  assert.equal(c.lng, -46.3);
  assert.equal(c.contract, '123456');
  assert.equal(c.int6, '987654');
  assert.equal(c.onuStatus, 'ok');
  assert.equal(c.olt, 'VIP-GRU-2-SPO-ONK-01');
  assert.ok(!JSON.stringify(c).match(/Fulano|Secreta|12345678900/));
});

test('autoisp-rede: limparDetalhe tolera detalhe vazio', () => {
  const c = plain(sandbox.limparDetalhe({}, { erp_id: '9', gpon_client_id: 1 }));
  assert.equal(c.signalRx, null);
  assert.equal(c.lat, null);
  assert.equal(c.lng, null);
  assert.equal(c.serial, null);
  assert.equal(c.onuStatus, null);
});
