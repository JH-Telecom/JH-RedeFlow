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

test('autoisp-rede: acharOlt normaliza o nome e exige nome igual', () => {
  const lista = [{ id: 7, hostname: 'VIP-GRU-2-SPO-ONK-01' }, { id: 8, hostname: 'VIP-SAN-1-SPO-ONK-02' }];
  assert.equal(sandbox.acharOlt(lista, 'vip-gru-2-spo-onk-01 ').id, 7);
  assert.equal(sandbox.acharOlt(lista, 'vip-gru-2-spo-onk-01-0').id, 7);
  assert.equal(sandbox.acharOlt(lista, 'vip-gru-2-spo'), null); // parte do nome nao vale mais, mesmo casando 1 OLT so
  assert.equal(sandbox.acharOlt(lista, 'OUTRA-OLT-99'), null);
  assert.equal(sandbox.acharOlt(lista, ''), null);
});

test('autoisp-rede: acharOlt casa VIP- com OLT- e ignora -0 final dos dois lados', () => {
  const lista = [{ id: 1, hostname: 'OLT-GZ1-SPO-OHW-01' }, { id: 2, hostname: 'VIP-GZ1-SPO-OHW-02-0' }];
  assert.equal(sandbox.acharOlt(lista, 'VIP-GZ1-SPO-OHW-01').id, 1);
  assert.equal(sandbox.acharOlt(lista, 'OLT-GZ1-SPO-OHW-01').id, 1);
  assert.equal(sandbox.acharOlt(lista, 'VIP-GZ1-SPO-OHW-02').id, 2);
  assert.equal(sandbox.acharOlt(lista, 'OLT-GZ1-SPO-OHW-02-0').id, 2);
  assert.equal(sandbox.acharOlt([{ id: 3, hostname: 'VIP-GZ1-SPO-OHW-01' }], 'OLT-GZ1-SPO-OHW-01').id, 3);
});

test('autoisp-rede: acharOlt nao casa OLTs parecidas por substring', () => {
  assert.equal(sandbox.acharOlt([{ id: 1, hostname: 'VIP-GRU-2-SPO-ONK-011' }], 'VIP-GRU-2-SPO-ONK-01'), null);
  assert.equal(sandbox.acharOlt([{ id: 1, hostname: 'VIP-GRU-2-SPO-ONK-01' }], 'VIP-GRU-2-SPO-ONK-011'), null);
  assert.equal(sandbox.acharOlt([{ id: 1, hostname: 'VIP-GRU-2-SPO-ONK-01-A' }], 'VIP-GRU-2-SPO-ONK-01'), null);
  const duas = [{ id: 1, hostname: 'VIP-GRU-2-SPO-ONK-01' }, { id: 2, hostname: 'VIP-GRU-2-SPO-ONK-02' }];
  assert.equal(sandbox.acharOlt(duas, 'vip-gru-2-spo'), null);
  assert.equal(sandbox.acharOlt(duas, 'VIP-GRU-2-SPO-ONK-02').id, 2);
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

test('autoisp-rede: montarClientes nao envia cliente cujo detalhe falhou', () => {
  const linhas = [{ erp_id: '1', gpon_client_id: 11 }, { erp_id: '2', gpon_client_id: 22 }, { erp_id: '3', gpon_client_id: 33 }];
  const detalhes = [{ json: { gpon_client: { onu_status: { rx_power: -20, status: 'ok' } }, coordinates: { client: { lat: -23.9, lng: -46.3 } } } }, { erro: 'AutoISP HTTP 500' }, undefined];
  const r = plain(sandbox.montarClientes(linhas, detalhes, 'OLT-1', '0/4/10'));
  assert.equal(r.clients.length, 1);
  assert.equal(r.clients[0].contract, '1');
  assert.equal(r.clients[0].olt, 'OLT-1');
  assert.equal(r.error, '2 cliente(s) sem detalhe no AutoISP');
  assert.equal(plain(sandbox.montarClientes(linhas.slice(0, 1), [detalhes[0]], 'O', 'p')).error, null);
});

test('autoisp-rede: corpoErroEnvio fecha o pedido so com o erro do servidor', () => {
  const corpo = plain(sandbox.corpoErroEnvio({ id: 'r1', olt: 'VIP-1', ponlink: '0/4/10' }, 12, 400));
  assert.deepEqual(corpo, { requestId: 'r1', olt: 'VIP-1', ponlink: '0/4/10', found: 12, error: 'Resposta recusada pelo servidor (HTTP 400)', clients: [] });
});

// Ambiente falso do Chrome/RedeFlow para rodar lerPonsPendentes inteiro.
function fakeEnv(postStatuses: number[]) {
  const posts: any[] = [];
  let queries = 0;
  let releaseQuery: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseQuery = resolve; });
  sandbox.autenticacao = async () => ({ headers: { authorization: 'x' } });
  sandbox.API_BASE = 'https://api.test';
  sandbox.CACHE_OLTS_REDE = { lista: [], quando: 0 };
  sandbox.chrome = {
    tabs: { query: async () => { queries += 1; await gate; return [{ id: 5 }]; } },
    storage: { local: { set: async () => {} } },
    scripting: {
      executeScript: async ({ args }: { args: [string, string] }) => {
        const [url, modo] = args;
        if (url === '/olts/get_all_for_select') return [{ result: { json: [[7, 'OLT-GZ1-SPO-OHW-01']] } }];
        if (modo === 'busca') return [{ result: { json: [{ erp_id: '1', gpon_client_id: 11, serial_number: 'S'.repeat(50), olt_hostname: 'OLT-GZ1-SPO-OHW-01', ponlink: '0/4/10' }] } }];
        return [{ result: { json: { gpon_client: { onu_status: { rx_power: -20, status: 'ok' } }, coordinates: { client: { lat: -23.5, lng: -46.5 } } } } }];
      },
    },
  };
  sandbox.fetch = async (url: string, init?: { method?: string; body?: string }) => {
    if (!init || !init.method) return { ok: true, status: 200, json: async () => ({ itens: [{ id: 'r1', olt: 'VIP-GZ1-SPO-OHW-01', ponlink: '0/4/10' }] }) };
    posts.push(JSON.parse(init.body || '{}'));
    const status = postStatuses.shift() ?? 200;
    return { ok: status < 300, status, json: async () => ({ message: 'Dados da PON invalidos.' }) };
  };
  return { posts, queries: () => queries, release: () => releaseQuery() };
}

test('autoisp-rede: POST recusado (4xx) manda um POST so de erro para fechar o pedido', async () => {
  const env = fakeEnv([400, 200]);
  env.release();
  const registro = plain(await sandbox.lerPonsPendentes());
  assert.equal(env.posts.length, 2);
  assert.equal(env.posts[0].clients.length, 1);
  assert.deepEqual(env.posts[1], { requestId: 'r1', olt: 'VIP-GZ1-SPO-OHW-01', ponlink: '0/4/10', found: 1, error: 'Resposta recusada pelo servidor (HTTP 400)', clients: [] });
  assert.ok(registro.erros.some((erro: string) => /HTTP 400|invalidos/.test(erro)));
});

test('autoisp-rede: POST com erro 5xx nao manda POST de erro (pedido fica para a proxima rodada)', async () => {
  const env = fakeEnv([500]);
  env.release();
  await sandbox.lerPonsPendentes();
  assert.equal(env.posts.length, 1);
});

test('autoisp-rede: lerPonsPendentes nao roda duas vezes ao mesmo tempo', async () => {
  const env = fakeEnv([]);
  const a = sandbox.lerPonsPendentes();
  const b = sandbox.lerPonsPendentes();
  env.release();
  await Promise.all([a, b]);
  assert.equal(env.queries(), 1);
  assert.equal(env.posts.length, 1);
  await sandbox.lerPonsPendentes(); // terminou: a proxima rodada volta a executar
  assert.equal(env.queries(), 2);
});
