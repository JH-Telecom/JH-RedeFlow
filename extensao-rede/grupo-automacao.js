// Grupo de abas proprio da automacao (1.12.0). Script classico carregado com importScripts() pelo background.js.
// A extensao so automatiza dentro do grupo "Rede · automação" (recolhido, roxo): uma aba do OFS para exportar e
// roteirizar, outra do OFS para fechamentos, e uma do AutoISP aberta so quando precisa. Nunca escolhe,
// recarrega, navega ou injeta script numa aba fora do grupo: as abas do OFS e do AutoISP de quem usa ficam livres.
// Se o grupo sumir (janela fechada, grupo desfeito), recria na proxima vez, na ultima janela normal focada.

var GRUPO_TITULO = "Rede · automação";
var GRUPO_COR = "purple";
var GRUPO_CHAVE = "grupoAutomacao"; // chrome.storage.local: { groupId, abas: { ofs, fechamento, autoisp } }
// "ofs": exportacao e roteirizador. "fechamento": fechamentos. "autoisp": leitura de SN.
var GRUPO_TIPOS = {
  ofs: { origem: "https://alloha.fs.ocs.oraclecloud.com/", nome: "OFS" },
  fechamento: { origem: "https://alloha.fs.ocs.oraclecloud.com/", nome: "OFS" },
  autoisp: { origem: "https://auto.alloha.com/", nome: "AutoISP" },
};
var MSG_FORA_DO_GRUPO = "A aba saiu do grupo " + GRUPO_TITULO + "; a extensão abre outra no grupo na próxima rodada";

function msgLoginNoGrupo(tipo) {
  var t = GRUPO_TIPOS[tipo] || GRUPO_TIPOS.ofs;
  return "Faça login na aba do grupo " + GRUPO_TITULO + " (" + t.nome + ")";
}

function urlDaAba(aba) {
  return String((aba && (aba.url || aba.pendingUrl)) || "");
}

// ---------- decisoes puras (testadas em backend/test/extension-grupo-automacao.test.ts) ----------

// Grupo da automacao entre os grupos abertos: o id guardado, se o titulo ainda for exatamente o do grupo; senao
// (o Chrome troca os ids ao reabrir) o de titulo igual. Grupo renomeado pelo usuario deixa de ser da automacao.
function acharGrupoAutomacao(grupos, idGuardado) {
  var lista = Array.isArray(grupos) ? grupos : [];
  if (idGuardado != null) {
    for (var i = 0; i < lista.length; i++) if (lista[i] && lista[i].id === idGuardado && lista[i].title === GRUPO_TITULO) return lista[i];
  }
  for (var j = 0; j < lista.length; j++) if (lista[j] && lista[j].title === GRUPO_TITULO) return lista[j];
  return null;
}

// Qual aba usar para `tipo`. So abas DENTRO do grupo `groupId`; fora dele nada conta, nem a aba guardada.
// 1) a aba guardada para o tipo, se ainda esta no grupo (mesmo fora do site: pode estar no login/SSO);
// 2) senao uma aba do grupo no site do tipo que nao seja a guardada de outro tipo (ex.: a do OFS de fechamentos).
// Devolve { acao: "usar", tabId } ou { acao: "criar" }.
function escolherAbaDoGrupo(tipo, abas, groupId, guardadas) {
  var t = GRUPO_TIPOS[tipo];
  if (!t || groupId == null || groupId === -1) return { acao: "criar" };
  var g = guardadas || {};
  var doGrupo = (Array.isArray(abas) ? abas : []).filter(function (a) { return a && a.id != null && a.groupId === groupId; });
  var guardada = doGrupo.find(function (a) { return a.id === g[tipo]; });
  if (guardada) return { acao: "usar", tabId: guardada.id };
  var deOutros = Object.keys(g).filter(function (k) { return k !== tipo; }).map(function (k) { return g[k]; });
  var livre = doGrupo.find(function (a) { return urlDaAba(a).indexOf(t.origem) === 0 && deOutros.indexOf(a.id) < 0; });
  return livre ? { acao: "usar", tabId: livre.id } : { acao: "criar" };
}

var BLOB_OFS = "blob:https://alloha.fs.ocs.oraclecloud.com/";

// Filtro rapido do chrome.downloads.onCreated: ha captura valida e o download e um blob: do OFS?
function podeSerDaCaptura(item, captura, agora) {
  if (!captura || captura.tabId == null || !(agora <= captura.ate)) return false;
  return String((item && item.url) || "").indexOf(BLOB_OFS) === 0;
}

// O download e o CSV que a aba do grupo gerou? So se a URL blob: foi criada nessa aba (lista blobsDaAba, lida
// nela pelo espiao de URL.createObjectURL). Download de outra aba (export manual do usuario) nunca e capturado.
function downloadDaExportacaoDoGrupo(item, captura, agora, blobsDaAba) {
  if (!podeSerDaCaptura(item, captura, agora)) return false;
  return Array.isArray(blobsDaAba) && blobsDaAba.indexOf(String(item.url)) >= 0;
}

// 1.13.1: a pagina do OFS recarregou/navegou no meio de um executeScript ("Frame with ID 0 was removed"): vale
// esperar a aba carregar e tentar de novo uma vez.
function erroDeFrameSumiu(mensagem) {
  return /Frame with ID \d+ was removed|No frame with id|frame was removed|Frame with ID \d+ is showing error page/i.test(String(mensagem || ""));
}

// 1.13.1: o OFS gerou o CSV mas o espiao de blob se perdeu (a pagina recarregou entre a preparacao e o export).
// Ainda da para aceitar o download se nao existe nenhuma aba do OFS fora do grupo: entao ele so pode ter vindo
// da aba da automacao. Com o OFS aberto em outra aba de quem usa, nao arrisca (pode ser um export manual).
function blobAceitavelSemEspiao(abasOfs, groupId) {
  if (groupId == null || groupId === -1) return false;
  var lista = Array.isArray(abasOfs) ? abasOfs : [];
  return lista.length > 0 && lista.every(function (a) { return a && a.groupId === groupId; });
}

// ---------- Chrome ----------

async function lerEstadoGrupo() {
  var r = await chrome.storage.local.get(GRUPO_CHAVE);
  var e = (r && r[GRUPO_CHAVE]) || {};
  return { groupId: e.groupId == null ? null : e.groupId, abas: Object.assign({}, e.abas || {}) };
}

async function janelaParaGrupo() {
  try {
    var w = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    if (w && w.id != null && w.type === "normal") return w.id;
  } catch (_) { /* sem janela focada */ }
  var todas = await chrome.windows.getAll({ windowTypes: ["normal"] }).catch(function () { return []; });
  if (todas && todas.length) return todas[0].id;
  throw new Error("Nenhuma janela do Chrome aberta para o grupo " + GRUPO_TITULO);
}

// Uma chamada por vez: alarmes e popup juntos nao criam dois grupos nem duas abas.
var FILA_GRUPO = Promise.resolve();
function abaDoGrupo(tipo) {
  var vez = FILA_GRUPO.then(function () { return abaDoGrupoAgora(tipo); });
  FILA_GRUPO = vez.catch(function () {});
  return vez;
}

async function abaDoGrupoAgora(tipo) {
  var t = GRUPO_TIPOS[tipo];
  if (!t) throw new Error("Tipo de aba desconhecido: " + tipo);
  var estado = await lerEstadoGrupo();
  var grupos = await chrome.tabGroups.query({}).catch(function () { return []; });
  var grupo = acharGrupoAutomacao(grupos, estado.groupId);
  if (grupo) {
    var abas = await chrome.tabs.query({ groupId: grupo.id });
    var escolha = escolherAbaDoGrupo(tipo, abas, grupo.id, estado.abas);
    if (escolha.acao === "usar") {
      if (estado.groupId !== grupo.id || estado.abas[tipo] !== escolha.tabId) {
        estado.groupId = grupo.id;
        estado.abas[tipo] = escolha.tabId;
        await chrome.storage.local.set({ [GRUPO_CHAVE]: estado });
      }
      return chrome.tabs.get(escolha.tabId);
    }
  }
  // Abre a aba (sem fixar: aba fixada nao entra em grupo no Chrome) e poe no grupo, criando o grupo se preciso.
  // 1.13.1: sem nenhuma janela do Chrome aberta (Chrome rodando so em segundo plano), abre uma janela minimizada ja
  // com o site, em vez de falhar com "Nenhuma janela do Chrome aberta".
  var windowId = null;
  var nova = null;
  if (grupo) windowId = grupo.windowId;
  else {
    try { windowId = await janelaParaGrupo(); }
    catch (_) {
      var janela = await chrome.windows.create({ url: t.origem, focused: false, state: "minimized", type: "normal" });
      windowId = janela.id;
      nova = janela.tabs && janela.tabs[0];
    }
  }
  if (!nova) nova = await chrome.tabs.create({ url: t.origem, active: false, pinned: false, windowId: windowId });
  try {
    await chrome.tabs.update(nova.id, { autoDiscardable: false });
    if (grupo) {
      await chrome.tabs.group({ groupId: grupo.id, tabIds: [nova.id] });
    } else {
      var novoGrupo = await chrome.tabs.group({ tabIds: [nova.id], createProperties: { windowId: windowId } });
      await chrome.tabGroups.update(novoGrupo, { title: GRUPO_TITULO, color: GRUPO_COR, collapsed: true });
      grupo = { id: novoGrupo, windowId: windowId };
      estado.abas = {}; // abas de um grupo antigo nao valem mais
    }
  } catch (e) {
    // Nao deixa aba solta fora do grupo.
    await chrome.tabs.remove(nova.id).catch(function () {});
    throw e;
  }
  estado.groupId = grupo.id;
  estado.abas[tipo] = nova.id;
  await chrome.storage.local.set({ [GRUPO_CHAVE]: estado });
  return chrome.tabs.get(nova.id).catch(function () { return nova; });
}

// A aba ainda esta no grupo da automacao? (o usuario pode ter tirado a aba do grupo no meio de uma rodada)
async function abaNoGrupo(tabId) {
  try {
    var estado = await lerEstadoGrupo();
    if (estado.groupId == null) return false;
    var aba = await chrome.tabs.get(tabId);
    return Boolean(aba) && aba.groupId === estado.groupId;
  } catch (_) { return false; }
}

async function garantirNoGrupo(tabId) {
  if (!(await abaNoGrupo(tabId))) throw new Error(MSG_FORA_DO_GRUPO);
}

// Espera a aba terminar de carregar (ate `ms`). Aba descartada pelo Chrome e recarregada.
async function esperarAbaCarregada(tabId, ms) {
  var fim = Date.now() + (ms || 20000);
  while (Date.now() < fim) {
    var aba = null;
    try { aba = await chrome.tabs.get(tabId); } catch (_) { return false; }
    if (aba.discarded) { try { await chrome.tabs.reload(tabId); } catch (_) { return false; } }
    else if (aba.status === "complete") return true;
    await new Promise(function (resolve) { setTimeout(resolve, 1000); });
  }
  return false;
}

// Todo executeScript da automacao passa por aqui: so roda em aba do grupo. 1.13.1: se a pagina recarregou no meio
// ("Frame with ID 0 was removed"), espera carregar e tenta de novo uma vez.
async function executarNoGrupo(detalhes) {
  var tabId = detalhes && detalhes.target && detalhes.target.tabId;
  await garantirNoGrupo(tabId);
  try {
    return await chrome.scripting.executeScript(detalhes);
  } catch (e) {
    if (!erroDeFrameSumiu(e && e.message)) throw e;
    await esperarAbaCarregada(tabId, 20000);
    await garantirNoGrupo(tabId);
    return chrome.scripting.executeScript(detalhes);
  }
}

// AutoISP pronto na aba do grupo? "ok" | "login" | "timeout". Espera carregar; tela de senha ou fora do site = login.
async function autoIspPronto(tabId, ms) {
  var fim = Date.now() + (ms || 45000);
  var estado = "timeout";
  while (Date.now() < fim) {
    if (!(await abaNoGrupo(tabId))) return "fora";
    var aba = null;
    try { aba = await chrome.tabs.get(tabId); } catch (_) { return "fora"; }
    if (aba.discarded) { try { await chrome.tabs.reload(tabId); } catch (_) { /* aba fechada */ } }
    var url = urlDaAba(aba);
    if (aba.status === "complete" && url) {
      if (url.indexOf(GRUPO_TIPOS.autoisp.origem) !== 0 || /\/(login|sign_in|signin|users\/sign)/i.test(url)) return "login";
      try {
        var r = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: function () { return document.querySelector('input[type="password"]') ? "login" : "ok"; } });
        var res = r && r[0] && r[0].result;
        if (res === "ok") return "ok";
        if (res === "login") estado = "login";
      } catch (_) { estado = "login"; }
      if (estado === "login") return "login";
    }
    await new Promise(function (resolve) { setTimeout(resolve, 1500); });
  }
  return estado;
}

// Aba do AutoISP do grupo, pronta. Devolve { aba } ou { erro } com a mensagem para o popup.
async function abaAutoIspPronta() {
  var aba;
  try { aba = await abaDoGrupo("autoisp"); } catch (e) { return { erro: "Não consegui abrir o AutoISP no grupo " + GRUPO_TITULO + " (" + ((e && e.message) || e) + ")" }; }
  var estado = await autoIspPronto(aba.id);
  if (estado === "ok") return { aba: aba };
  if (estado === "login") return { erro: msgLoginNoGrupo("autoisp") };
  if (estado === "fora") return { erro: MSG_FORA_DO_GRUPO };
  return { erro: "O AutoISP não carregou na aba do grupo " + GRUPO_TITULO };
}
