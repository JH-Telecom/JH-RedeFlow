// Mapa da rede (1.11.0): le no AutoISP (auto.alloha.com) os clientes das PONs das massivas e manda ao RedeFlow.
// Script classico carregado com importScripts() pelo background.js (usa autenticacao() e API_BASE de la).
// Manda so contrato, serial, int6, OLT, ponlink, sinal, status, ultimo contato e lat/lng: nunca nome, endereco ou documento.
// So GET no AutoISP, sempre dentro da aba dele (login de quem usa), no maximo 3 consultas ao mesmo tempo.

var MSG_SEM_ABA_AUTOISP = "Abra o AutoISP (auto.alloha.com) logado neste Chrome";
var CACHE_OLTS_REDE = { lista: [], quando: 0 };

function apiBaseRede() {
  return typeof API_BASE === "string" ? API_BASE : "https://jh-redeflow-api.onrender.com";
}

function urlBuscaPon(oltId, ponlink) {
  return "/client_search/search?olt_id=" + encodeURIComponent(oltId) + "&ponlink=" + String(ponlink).replace(/[^0-9A-Za-z/_.-]/g, "");
}

// '0/4/10' (frame/slot/porta) e '4/10' (slot/porta): o AutoISP aceita um ou outro conforme a OLT.
function variantesPon(ponlink) {
  var p = String(ponlink || "").trim();
  var partes = p.split("/");
  var lista = [p];
  if (partes.length === 3) lista.push(partes[1] + "/" + partes[2]);
  return lista.filter(function (x, i) { return x && lista.indexOf(x) === i; });
}

function normalizaNomeOlt(nome) {
  return String(nome == null ? "" : nome).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, "");
}

// /olts/get_all_for_select pode vir como lista de listas, de objetos (id/value, hostname/label/name/text/title) ou { olts|data|items }.
function normalizaOlts(j) {
  var arr = Array.isArray(j) ? j : (j && (j.olts || j.data || j.items)) || [];
  if (!Array.isArray(arr)) arr = [];
  return arr.map(function (x) {
    if (Array.isArray(x)) return { id: x[0], hostname: String(x[1] == null ? "" : x[1]).trim() };
    if (!x || typeof x !== "object") return null;
    var id = x.id != null ? x.id : x.value;
    var nome = x.hostname || x.label || x.name || x.text || x.title || "";
    return id == null ? null : { id: id, hostname: String(nome).trim() };
  }).filter(function (o) { return o && o.hostname; });
}

// Nome igual (sem espaco/maiuscula); senao, parte do nome so vale se casar exatamente 1 OLT.
function acharOlt(lista, nome) {
  var alvo = normalizaNomeOlt(nome);
  if (!alvo || !Array.isArray(lista)) return null;
  var exata = lista.filter(function (o) { return normalizaNomeOlt(o.hostname) === alvo; });
  if (exata.length === 1) return { id: exata[0].id, hostname: exata[0].hostname };
  var partes = String(nome).toUpperCase().split(/[^0-9A-Z]+/).filter(Boolean);
  var parcial = lista.filter(function (o) {
    var h = normalizaNomeOlt(o.hostname);
    return h.indexOf(alvo) >= 0 || alvo.indexOf(h) >= 0 || (partes.length > 1 && partes.every(function (x) { return h.indexOf(x) >= 0; }));
  });
  return parcial.length === 1 ? { id: parcial[0].id, hostname: parcial[0].hostname } : null;
}

function textoCurto(v, max) {
  if (v == null) return null;
  var s = String(v).trim();
  return s ? s.slice(0, max) : null;
}
function numeroOuNulo(v) {
  if (v == null || v === "") return null;
  var n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isFinite(n) ? n : null;
}

// Fica so com o que o mapa precisa. Tudo o mais do detalhe (nome, endereco, CPF/CNPJ, plano...) e descartado aqui.
function limparDetalhe(json, linhaBusca) {
  var j = json || {};
  var linha = linhaBusca || {};
  var g = j.gpon_client || {};
  var st = g.onu_status || {};
  var co = (j.coordinates && j.coordinates.client) || {};
  return {
    contract: textoCurto(linha.erp_id, 20) || "",
    serial: textoCurto(linha.serial_number || linha.short_serial_number || g.serial_number, 60),
    int6: textoCurto(linha.gpon_client_id, 20),
    olt: textoCurto(linha.olt_hostname, 120) || "",
    ponlink: textoCurto(linha.ponlink || g.ponlink, 20) || "",
    signalRx: numeroOuNulo(st.rx_power),
    onuStatus: textoCurto(st.status, 40),
    lastInform: textoCurto(g.acs_last_inform, 40),
    lat: numeroOuNulo(co.lat),
    lng: numeroOuNulo(co.lng),
    readAt: new Date().toISOString(),
  };
}

// GET dentro da aba do AutoISP (func serializada: nao enxerga nada deste arquivo, so os args).
async function pegarNoAutoIsp(abaId, url) {
  var r = await chrome.scripting.executeScript({
    target: { tabId: abaId },
    args: [url],
    func: async (u) => {
      try {
        const resposta = await fetch(u, { method: "GET", headers: { accept: "application/json" }, credentials: "include" });
        if (!resposta.ok) return { erro: "AutoISP HTTP " + resposta.status };
        return { json: await resposta.json() };
      } catch (e) { return { erro: String((e && e.message) || e) }; }
    },
  }).catch(function (e) { return [{ result: { erro: String((e && e.message) || e) } }]; });
  var res = r && r[0] && r[0].result;
  return res || { erro: "Sem resposta da aba do AutoISP" };
}

async function oltsDoAutoIsp(abaId) {
  if (CACHE_OLTS_REDE.lista.length && Date.now() - CACHE_OLTS_REDE.quando < 30 * 60 * 1000) return { lista: CACHE_OLTS_REDE.lista };
  var r = await pegarNoAutoIsp(abaId, "/olts/get_all_for_select");
  if (r.erro) return { erro: r.erro };
  var lista = normalizaOlts(r.json);
  if (lista.length) CACHE_OLTS_REDE = { lista: lista, quando: Date.now() };
  return { lista: lista };
}

// Executa as tarefas com no maximo `limite` ao mesmo tempo.
async function emFilaRede(tarefas, limite) {
  var resultados = new Array(tarefas.length);
  var proximo = 0;
  async function trabalhador() {
    while (proximo < tarefas.length) {
      var i = proximo++;
      resultados[i] = await tarefas[i]();
    }
  }
  var n = Math.max(1, Math.min(limite, tarefas.length));
  var lista = [];
  for (var k = 0; k < n; k++) lista.push(trabalhador());
  await Promise.all(lista);
  return resultados;
}

async function lerUmaPon(abaId, olts, pedido) {
  var olt = acharOlt(olts, pedido.olt);
  if (!olt) return { found: 0, clients: [], error: "A conta do AutoISP nao enxerga a OLT " + pedido.olt };
  var linhas = [];
  var ultimoErro = null;
  var variantes = variantesPon(pedido.ponlink);
  for (var v = 0; v < variantes.length; v++) {
    var busca = await pegarNoAutoIsp(abaId, urlBuscaPon(olt.id, variantes[v]));
    if (busca.erro) { ultimoErro = busca.erro; continue; }
    if (Array.isArray(busca.json) && busca.json.length) { linhas = busca.json; break; }
  }
  if (!linhas.length) return { found: 0, clients: [], error: ultimoErro };
  var amostra = linhas.filter(function (l) { return l && /^\d{1,12}$/.test(String(l.gpon_client_id)) && textoCurto(l.erp_id, 20); }).slice(0, 100);
  var falhas = 0;
  var clients = await emFilaRede(amostra.map(function (linha) {
    return async function () {
      var d = await pegarNoAutoIsp(abaId, "/gpon_clients/" + String(linha.gpon_client_id) + "/detailed_info");
      var c;
      if (d.erro) { falhas += 1; c = limparDetalhe({}, linha); } else c = limparDetalhe(d.json, linha);
      c.olt = c.olt || olt.hostname;
      c.ponlink = c.ponlink || variantes[0];
      return c;
    };
  }), 3);
  return { found: linhas.length, clients: clients, error: falhas ? falhas + " cliente(s) sem detalhe no AutoISP" : null };
}

async function lerPonsPendentes() {
  var registro = { quando: Date.now(), pedidos: 0, lidos: 0, erros: [] };
  var guardar = async function () { await chrome.storage.local.set({ ultimaPon: registro }); return registro; };
  var abas = await chrome.tabs.query({ url: "https://auto.alloha.com/*" });
  var aba = abas[0];
  if (!aba) { registro.erros.push(MSG_SEM_ABA_AUTOISP); return guardar(); }
  var auth = await autenticacao();
  if (!auth) { registro.erros.push("Entre com seu usuário do JH RedeFlow no popup"); return guardar(); }
  var r = await fetch(apiBaseRede() + "/api/integrations/autoisp/pons-pendentes", { headers: auth.headers });
  var corpo = await r.json().catch(function () { return {}; });
  if (!r.ok) { registro.erros.push((corpo && corpo.message) || "HTTP " + r.status); return guardar(); }
  var itens = Array.isArray(corpo.itens) ? corpo.itens : [];
  registro.pedidos = itens.length;
  if (!itens.length) return guardar();
  var oltsRes = await oltsDoAutoIsp(aba.id);
  for (var i = 0; i < itens.length; i++) {
    var pedido = itens[i];
    var rotulo = pedido.olt + " " + pedido.ponlink;
    var lido = oltsRes.erro
      ? { found: 0, clients: [], error: oltsRes.erro }
      : await lerUmaPon(aba.id, oltsRes.lista, pedido);
    var corpoEnvio = { requestId: pedido.id, olt: pedido.olt, ponlink: pedido.ponlink, found: lido.found, error: lido.error || null, clients: lido.clients };
    try {
      var envio = await fetch(apiBaseRede() + "/api/integrations/autoisp/pon", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, auth.headers), body: JSON.stringify(corpoEnvio) });
      if (envio.ok) registro.lidos += 1;
      else { var e = await envio.json().catch(function () { return {}; }); registro.erros.push(rotulo + ": " + ((e && e.message) || "HTTP " + envio.status)); }
    } catch (err) { registro.erros.push(rotulo + ": " + String((err && err.message) || err)); }
    if (lido.error) registro.erros.push(rotulo + ": " + lido.error);
  }
  return guardar();
}
