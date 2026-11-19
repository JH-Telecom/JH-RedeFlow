import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Script classico da extensao (grupo de abas "Rede · automação"): carregado com node:vm e um chrome falso.
const file = path.resolve(process.cwd(), '..', 'extensao-rede', 'grupo-automacao.js');
const codigo = fs.readFileSync(file, 'utf8');
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const OFS = 'https://alloha.fs.ocs.oraclecloud.com/';
const ISP = 'https://auto.alloha.com/';

type Aba = { id: number; groupId: number; url?: string; pendingUrl?: string; windowId?: number; status?: string };
type Grupo = { id: number; title: string; windowId: number; color?: string; collapsed?: boolean };

// Chrome falso: abas, grupos e storage em memoria; registra o que foi criado/agrupado.
function carregar(inicial: { abas?: Aba[]; grupos?: Grupo[]; guardado?: unknown } = {}) {
  const abas: Aba[] = (inicial.abas || []).map((a) => ({ windowId: 1, status: 'complete', ...a }));
  const grupos: Grupo[] = [...(inicial.grupos || [])];
  const store: Record<string, any> = inicial.guardado ? { grupoAutomacao: inicial.guardado } : {};
  const log = { criadas: [] as any[], agrupadas: [] as any[], gruposAtualizados: [] as any[], removidas: [] as number[], scripts: [] as number[] };
  let proximaAba = 100;
  let proximoGrupo = 900;
  const chrome = {
    storage: { local: {
      get: async (k: string) => (k in store ? { [k]: JSON.parse(JSON.stringify(store[k])) } : {}),
      set: async (o: Record<string, unknown>) => { Object.assign(store, JSON.parse(JSON.stringify(o))); },
    } },
    tabGroups: {
      query: async () => grupos.map((g) => ({ ...g })),
      update: async (id: number, props: Partial<Grupo>) => { const g = grupos.find((x) => x.id === id)!; Object.assign(g, props); log.gruposAtualizados.push({ id, ...props }); return g; },
    },
    windows: {
      getLastFocused: async () => ({ id: 7, type: 'normal' }),
      getAll: async () => [{ id: 7, type: 'normal' }],
    },
    tabs: {
      query: async (q: { groupId?: number }) => abas.filter((a) => q.groupId == null || a.groupId === q.groupId).map((a) => ({ ...a })),
      get: async (id: number) => { const a = abas.find((x) => x.id === id); if (!a) throw new Error('No tab'); return { ...a }; },
      create: async (props: { url: string; windowId: number; pinned?: boolean; active?: boolean }) => {
        const a: Aba = { id: proximaAba++, groupId: -1, pendingUrl: props.url, windowId: props.windowId, status: 'loading' };
        abas.push(a);
        log.criadas.push(props);
        return { ...a };
      },
      update: async (id: number, props: Record<string, unknown>) => ({ ...abas.find((x) => x.id === id), ...props }),
      remove: async (id: number) => { log.removidas.push(id); },
      group: async (opts: { tabIds: number[]; groupId?: number; createProperties?: { windowId: number } }) => {
        let gid = opts.groupId;
        if (gid == null) { gid = proximoGrupo++; grupos.push({ id: gid, title: '', windowId: opts.createProperties!.windowId }); }
        for (const id of opts.tabIds) abas.find((x) => x.id === id)!.groupId = gid;
        log.agrupadas.push({ ...opts });
        return gid;
      },
    },
    scripting: { executeScript: async (d: { target: { tabId: number } }) => { log.scripts.push(d.target.tabId); return [{ result: 'ok' }]; } },
  };
  const sandbox: Record<string, any> = { console, chrome, setTimeout };
  vm.runInNewContext(codigo, sandbox, { filename: file });
  return { s: sandbox, abas, grupos, store, log };
}

test('grupo-automacao: escolherAbaDoGrupo usa aba do OFS so quando ela esta no grupo', () => {
  const { s } = carregar();
  const abas = [{ id: 1, groupId: -1, url: `${OFS}x`, active: true }, { id: 2, groupId: 50, url: `${OFS}y` }];
  assert.deepEqual(plain(s.escolherAbaDoGrupo('ofs', abas, 50, {})), { acao: 'usar', tabId: 2 });
});

test('grupo-automacao: aba do OFS fora do grupo nao conta (cria uma no grupo)', () => {
  const { s } = carregar();
  const abas = [{ id: 1, groupId: -1, url: `${OFS}x`, active: true }, { id: 3, groupId: 77, url: `${OFS}z` }];
  assert.deepEqual(plain(s.escolherAbaDoGrupo('ofs', abas, 50, {})), { acao: 'criar' });
  // Nem a aba guardada vale se o usuario a tirou do grupo.
  assert.deepEqual(plain(s.escolherAbaDoGrupo('ofs', abas, 50, { ofs: 1 })), { acao: 'criar' });
  // Sem grupo (ou groupId -1 = aba sem grupo), sempre cria.
  assert.deepEqual(plain(s.escolherAbaDoGrupo('ofs', [{ id: 1, groupId: -1, url: OFS }], -1, {})), { acao: 'criar' });
  assert.deepEqual(plain(s.escolherAbaDoGrupo('ofs', abas, null, {})), { acao: 'criar' });
});

test('grupo-automacao: ofs e fechamento nao dividem a mesma aba do OFS', () => {
  const { s } = carregar();
  const abas = [{ id: 2, groupId: 50, url: `${OFS}a` }, { id: 4, groupId: 50, url: `${OFS}b` }];
  assert.deepEqual(plain(s.escolherAbaDoGrupo('ofs', abas, 50, { ofs: 4 })), { acao: 'usar', tabId: 4 });
  assert.deepEqual(plain(s.escolherAbaDoGrupo('fechamento', abas, 50, { ofs: 4 })), { acao: 'usar', tabId: 2 });
  assert.deepEqual(plain(s.escolherAbaDoGrupo('fechamento', [abas[1]], 50, { ofs: 4 })), { acao: 'criar' });
  // A aba guardada vale mesmo fora do site (ex.: tela de login/SSO), desde que no grupo.
  assert.deepEqual(plain(s.escolherAbaDoGrupo('fechamento', [{ id: 9, groupId: 50, url: 'https://sso.exemplo/login' }], 50, { fechamento: 9 })), { acao: 'usar', tabId: 9 });
});

test('grupo-automacao: AutoISP so usa aba do grupo e no site do AutoISP', () => {
  const { s } = carregar();
  const fora = [{ id: 1, groupId: -1, url: `${ISP}client_search` }];
  assert.deepEqual(plain(s.escolherAbaDoGrupo('autoisp', fora, 50, {})), { acao: 'criar' });
  const dentro = [...fora, { id: 6, groupId: 50, url: `${OFS}x` }, { id: 8, groupId: 50, pendingUrl: ISP }];
  assert.deepEqual(plain(s.escolherAbaDoGrupo('autoisp', dentro, 50, {})), { acao: 'usar', tabId: 8 });
});

test('grupo-automacao: acharGrupoAutomacao pelo id guardado ou pelo titulo', () => {
  const { s } = carregar();
  const grupos = [{ id: 1, title: 'Outro' }, { id: 2, title: 'Rede · automação' }, { id: 3, title: 'Rede · automação' }];
  assert.equal(s.acharGrupoAutomacao(grupos, 3).id, 3); // id guardado com o titulo certo vence o primeiro de mesmo titulo
  assert.equal(s.acharGrupoAutomacao(grupos, 99).id, 2); // id antigo (Chrome reaberto): acha pelo titulo
  assert.equal(s.acharGrupoAutomacao([{ id: 1, title: 'Outro' }], 99), null);
});

test('grupo-automacao: abaDoGrupo recria o grupo quando o guardado sumiu, sem tocar na aba do usuario', async () => {
  const { s, store, log, grupos } = carregar({
    abas: [{ id: 1, groupId: -1, url: `${OFS}console`, windowId: 7 }],
    guardado: { groupId: 555, abas: { ofs: 1 } },
  });
  const aba = await s.abaDoGrupo('ofs');
  assert.notEqual(aba.id, 1);
  assert.equal(log.criadas.length, 1);
  assert.equal(log.criadas[0].url, OFS);
  assert.equal(log.criadas[0].pinned, false);
  assert.equal(log.criadas[0].active, false);
  assert.equal(log.criadas[0].windowId, 7);
  const g = grupos.find((x) => x.id === store.grupoAutomacao.groupId)!;
  assert.equal(g.title, 'Rede · automação');
  assert.equal(g.color, 'purple');
  assert.equal(g.collapsed, true);
  assert.deepEqual(store.grupoAutomacao.abas, { ofs: aba.id });
});

test('grupo-automacao: abaDoGrupo reusa a aba do grupo e poe a nova no grupo existente', async () => {
  const { s, log, store } = carregar({
    grupos: [{ id: 50, title: 'Rede · automação', windowId: 3 }],
    abas: [{ id: 1, groupId: -1, url: `${ISP}x`, windowId: 3 }, { id: 2, groupId: 50, url: `${OFS}a`, windowId: 3 }],
    guardado: { groupId: 50, abas: { ofs: 2 } },
  });
  assert.equal((await s.abaDoGrupo('ofs')).id, 2);
  assert.equal(log.criadas.length, 0);
  const isp = await s.abaDoGrupo('autoisp');
  assert.notEqual(isp.id, 1); // a aba do AutoISP do usuario fica de fora
  assert.equal(log.criadas.length, 1);
  assert.equal(log.criadas[0].url, ISP);
  assert.equal(log.criadas[0].windowId, 3);
  assert.equal(log.agrupadas[0].groupId, 50);
  assert.deepEqual(store.grupoAutomacao.abas, { ofs: 2, autoisp: isp.id });
  // Fechamento: aba do OFS do grupo ja e da exportacao, entao abre outra.
  const fech = await s.abaDoGrupo('fechamento');
  assert.notEqual(fech.id, 2);
  assert.equal(log.criadas.length, 2);
});

test('grupo-automacao: chamadas ao mesmo tempo nao criam dois grupos', async () => {
  const { s, log, grupos } = carregar();
  const [a, b] = await Promise.all([s.abaDoGrupo('ofs'), s.abaDoGrupo('autoisp')]);
  assert.notEqual(a.id, b.id);
  assert.equal(grupos.length, 1);
  assert.equal(log.criadas.length, 2);
});

test('grupo-automacao: executarNoGrupo recusa aba fora do grupo', async () => {
  const { s, log } = carregar({
    grupos: [{ id: 50, title: 'Rede · automação', windowId: 1 }],
    abas: [{ id: 1, groupId: -1, url: OFS }, { id: 2, groupId: 50, url: OFS }],
    guardado: { groupId: 50, abas: { ofs: 2 } },
  });
  await assert.rejects(s.executarNoGrupo({ target: { tabId: 1 }, func: () => 1 }), /saiu do grupo Rede · automação/);
  assert.deepEqual(log.scripts, []);
  await s.executarNoGrupo({ target: { tabId: 2 }, func: () => 1 });
  assert.deepEqual(log.scripts, [2]);
});

test('grupo-automacao: AutoISP no login vira mensagem pedindo login na aba do grupo', async () => {
  const { s } = carregar({
    grupos: [{ id: 50, title: 'Rede · automação', windowId: 1 }],
    abas: [{ id: 8, groupId: 50, url: `${ISP}users/sign_in` }],
    guardado: { groupId: 50, abas: { autoisp: 8 } },
  });
  assert.deepEqual(plain(await s.abaAutoIspPronta()), { erro: 'Faça login na aba do grupo Rede · automação (AutoISP)' });
  assert.equal(s.msgLoginNoGrupo('ofs'), 'Faça login na aba do grupo Rede · automação (OFS)');
});

test('grupo-automacao: grupo guardado que foi renomeado deixa de ser da automacao', () => {
  const { s } = carregar();
  assert.equal(s.acharGrupoAutomacao([{ id: 1, title: 'Minhas abas' }], 1), null);
  assert.equal(s.acharGrupoAutomacao([{ id: 1, title: 'Minhas abas' }, { id: 2, title: 'Rede · automação' }], 1).id, 2);
});

test('grupo-automacao: download que nao veio da aba do grupo e deixado em paz', () => {
  const { s } = carregar();
  const agora = 1_000;
  const captura = { ate: agora + 90_000, tabId: 2, data: '2026-11-13' };
  const nosso = { url: 'blob:https://alloha.fs.ocs.oraclecloud.com/abc' };
  const doUsuario = { url: 'blob:https://alloha.fs.ocs.oraclecloud.com/xyz' };
  // Blob criado na aba do grupo durante a captura: e nosso.
  assert.equal(s.downloadDaExportacaoDoGrupo(nosso, captura, agora, [nosso.url]), true);
  // Export manual do usuario em outra aba (blob que a aba do grupo nao criou): nao e capturado.
  assert.equal(s.downloadDaExportacaoDoGrupo(doUsuario, captura, agora, [nosso.url]), false);
  assert.equal(s.downloadDaExportacaoDoGrupo(doUsuario, captura, agora, []), false);
  // Sem captura, captura vencida ou download que nao e blob: do OFS: nunca.
  assert.equal(s.downloadDaExportacaoDoGrupo(nosso, null, agora, [nosso.url]), false);
  assert.equal(s.downloadDaExportacaoDoGrupo(nosso, { ...captura, ate: agora - 1 }, agora, [nosso.url]), false);
  const http = { url: 'https://alloha.fs.ocs.oraclecloud.com/export.csv', referrer: 'https://alloha.fs.ocs.oraclecloud.com/' };
  assert.equal(s.podeSerDaCaptura(http, captura, agora), false);
  assert.equal(s.downloadDaExportacaoDoGrupo(http, captura, agora, [http.url]), false);
  assert.equal(s.podeSerDaCaptura(nosso, captura, agora), true);
});

test('grupo-automacao 1.13.1: frame removido e blob sem espiao', () => {
  const { s } = carregar();
  assert.equal(s.erroDeFrameSumiu('Frame with ID 0 was removed.'), true);
  assert.equal(s.erroDeFrameSumiu('Cannot access a chrome:// URL'), false);
  // Sem aba do OFS fora do grupo: o download so pode ser da automacao.
  assert.equal(s.blobAceitavelSemEspiao([{ id: 1, groupId: 50 }], 50), true);
  // OFS aberto em outra aba de quem usa: nao arrisca.
  assert.equal(s.blobAceitavelSemEspiao([{ id: 1, groupId: 50 }, { id: 2, groupId: -1 }], 50), false);
  assert.equal(s.blobAceitavelSemEspiao([], 50), false);
  assert.equal(s.blobAceitavelSemEspiao([{ id: 1, groupId: 50 }], null), false);
});

test('grupo-automacao 1.13.1: sem nenhuma janela do Chrome, abre uma minimizada com o OFS e cria o grupo nela', async () => {
  const { s, abas, log } = carregar();
  const janelas: any[] = [];
  s.chrome.windows = {
    getLastFocused: async () => { throw new Error('No last-focused window'); },
    getAll: async () => [],
    create: async (props: { url: string; state: string; focused: boolean }) => {
      janelas.push(props);
      const aba = { id: 555, groupId: -1, pendingUrl: props.url, windowId: 33, status: 'loading' };
      abas.push(aba);
      return { id: 33, tabs: [{ ...aba }] };
    },
  };
  const aba = await s.abaDoGrupo('ofs');
  assert.equal(aba.id, 555);
  assert.deepEqual(plain(janelas), [{ url: OFS, focused: false, state: 'minimized', type: 'normal' }]);
  assert.equal(log.criadas.length, 0); // nao abriu outra aba alem da da janela nova
  assert.equal(log.agrupadas[0].createProperties.windowId, 33);
});
