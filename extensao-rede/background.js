/* JH RedeFlow – Coletor OFS. Extensao propria da Rede (separada da extensao do JH Agendamentos).
   Na aba do OFS ja logada: escolhe o dia, a alocacao, atualiza a grade e clica em Acoes → Exportar; le o CSV gerado
   (blob da propria pagina) e envia ao JH RedeFlow (POST /api/integrations/ofs/export), que atualiza o Painel diario
   e o Status OFS / Data Fim dos chamados. So captura o download que ela mesma pediu — exportacoes manuais no OFS
   continuam baixando normalmente. */

const API_BASE = "https://jh-redeflow-api.onrender.com";
const API_URL = `${API_BASE}/api/integrations/ofs/export`;
const LOGIN_URL = `${API_BASE}/api/integrations/ofs/login`;
const FECH_PENDENTES_URL = `${API_BASE}/api/integrations/ofs/fechamentos/pendentes`;
const FECH_URL = `${API_BASE}/api/integrations/ofs/fechamentos`;
const OFS_MATCH = "https://alloha.fs.ocs.oraclecloud.com/*";
const ALARME_HOJE = "rf-coleta-hoje";
const ALARME_ONTEM = "rf-coleta-dia-anterior";
const ALARME_FECH = "rf-fechamentos";
const OFS_ORIGEM = "https://alloha.fs.ocs.oraclecloud.com/";
const FECH_POR_CICLO = 12; // atividades abertas por ciclo
const FECH_ESPERA_MS = 60 * 60_000; // a mesma ordem so e tentada de novo depois de 1 h
const JANELA_CAPTURA_MS = 90_000;
const LIMITE_AVISO_FALHAS = 3;
const PADRAO = { token: "", intervaloMin: 60, horaDiaAnterior: "07:00", alocacaoId: "", ativo: true, fechamentoMin: 10, clusterMin: 60 };

// ---------- datas no fuso de Sao Paulo ----------
const fmtSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const hojeSP = () => fmtSP.format(new Date());
const somarDias = (iso, dias) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
const diaBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

async function config() {
  return { ...PADRAO, ...(await chrome.storage.sync.get(Object.keys(PADRAO))) };
}

// ---------- login com o usuario do JH RedeFlow ----------
// A sessao (30 dias, so vale para enviar o export) fica no storage local desta maquina; a senha nunca e guardada.
async function sessaoAtual() {
  const { sessao } = await chrome.storage.local.get("sessao");
  if (!sessao?.token) return null;
  if (sessao.expiraEm && Date.parse(sessao.expiraEm) <= Date.now()) { await chrome.storage.local.remove("sessao"); return null; }
  return sessao;
}

// Cabecalho de autenticacao: usuario logado; sem login, o token de maquina antigo (Avancado), se houver.
async function autenticacao() {
  const sessao = await sessaoAtual();
  if (sessao) return { headers: { Authorization: `Bearer ${sessao.token}` }, sessao };
  const { token } = await config();
  if (token) return { headers: { "x-redeflow-ofs-token": token }, sessao: null };
  return null;
}

async function entrar(email, senha) {
  try {
    const r = await fetch(LOGIN_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: senha }) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body?.token) return { ok: false, erro: body?.message || `HTTP ${r.status}` };
    const sessao = { token: body.token, expiraEm: body.expiresAt, nome: body.user?.name || email, email: body.user?.email || email };
    await chrome.storage.local.set({ sessao });
    atualizarSelo();
    return { ok: true, nome: sessao.nome, email: sessao.email, expiraEm: sessao.expiraEm };
  } catch (e) {
    return { ok: false, erro: `Sem conexão com o RedeFlow (${e?.message || e})` };
  }
}

async function maquinaId() {
  const { maquina } = await chrome.storage.local.get("maquina");
  if (maquina) return maquina;
  const id = `rede-${crypto.randomUUID().slice(0, 8)}`;
  await chrome.storage.local.set({ maquina: id });
  return id;
}

// ---------- selo do icone ----------
async function atualizarSelo() {
  const cfg = await config();
  const { ultimoEnvio, captura } = await chrome.storage.local.get(["ultimoEnvio", "captura"]);
  const set = (text, color, title) => {
    chrome.action.setBadgeText({ text });
    if (color) chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setTitle({ title: `JH RedeFlow – Coletor OFS${title ? ` — ${title}` : ""}` });
  };
  if (!(await autenticacao())) return set("!", "#dc2626", "entre com seu usuário do JH RedeFlow");
  if (!cfg.ativo) return set("OFF", "#6b7280", "coleta automática desligada");
  if (captura && Date.now() < captura.ate) return set("...", "#2563eb", `exportando ${diaBR(captura.data)}`);
  if (!ultimoEnvio) return set("", null, "nenhum envio ainda");
  set(ultimoEnvio.ok ? "✓" : "!", ultimoEnvio.ok ? "#16a34a" : "#dc2626", ultimoEnvio.ok ? `último envio ${new Date(ultimoEnvio.quando).toLocaleTimeString("pt-BR")}` : ultimoEnvio.erro);
}

async function registrar(resultado) {
  const registro = { quando: Date.now(), ...resultado };
  const { historico = [], falhasSeguidas = 0 } = await chrome.storage.local.get(["historico", "falhasSeguidas"]);
  const falhas = registro.ok ? 0 : falhasSeguidas + 1;
  await chrome.storage.local.set({ ultimoEnvio: registro, historico: [registro, ...historico].slice(0, 15), falhasSeguidas: falhas });
  if (!registro.ok && registro.automatico && (falhas === LIMITE_AVISO_FALHAS || (falhas > LIMITE_AVISO_FALHAS && (falhas - LIMITE_AVISO_FALHAS) % 10 === 0))) {
    chrome.notifications.create("rf-falha", {
      type: "basic", iconUrl: "icons/icon128.png", priority: 2,
      title: "JH RedeFlow – coleta do OFS falhando",
      message: `${falhas} tentativas seguidas sem enviar (${registro.erro || "erro"}). Confira a aba do OFS e o login.`,
    });
  }
  atualizarSelo();
  return registro;
}

// ---------- envio ao RedeFlow ----------
async function enviarCsv(csv, nome, data) {
  const auth = await autenticacao();
  if (!auth) return { ok: false, erro: "Entre com seu usuário do JH RedeFlow no popup" };
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth.headers },
      body: JSON.stringify({ csv, nome: nome || `ofs-${data}.csv`, maquina: await maquinaId(), data }),
    });
    const body = await r.json().catch(() => ({}));
    // Sessao vencida, usuario desativado ou sem permissao: sai para o popup pedir login de novo.
    if (auth.sessao && (r.status === 401 || r.status === 403)) await chrome.storage.local.remove("sessao");
    if (!r.ok) return { ok: false, erro: body?.message || `HTTP ${r.status}` };
    return { ok: true, atividades: body?.painel?.records ?? null, cruzados: body?.d0?.matchedCalls ?? null, atualizados: body?.d0?.updatedCalls ?? null, aviso: body?.d0Error || null };
  } catch (e) {
    return { ok: false, erro: `Sem conexão com o RedeFlow (${e?.message || e})` };
  }
}

// ---------- automacao na pagina do OFS (injetada com chrome.scripting) ----------
// Precisa ser autocontida: roda dentro da aba do OFS, sem acesso ao escopo da extensao.
function acaoNaPagina({ alvo, alocacaoId, exportar, abrirConsole }) {
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const porTexto = (texto) => Array.from(document.querySelectorAll('button, a, [role="menuitem"], [role="button"]')).find((el) => (el.textContent || "").trim() === texto);
  const MESES = { janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5, julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11 };
  const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // "Sábado, Outubro 10º, 2026" → 2026-10-10
  const lerData = (texto) => {
    const m = String(texto || "").match(/,\s*([A-Za-zÀ-ÿ]+)\s+(\d{1,2})[ºª]?\s*,\s*(\d{4})/);
    const mes = m ? MESES[semAcento(m[1])] : undefined;
    return mes === undefined ? null : `${m[3]}-${String(mes + 1).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`;
  };

  async function irParaData() {
    const botao = document.querySelector('[data-ofsc-id="toolbar-date-button-value"]');
    if (!botao) return { erro: "Não achei o seletor de data do OFS" };
    const texto = () => (botao.getAttribute("title") || botao.textContent || "").trim();
    let atual = lerData(texto());
    if (!atual) return { erro: `Não consegui ler a data exibida no OFS ("${texto()}")` };
    const proximo = document.querySelector('[data-ofsc-id="dc__top_panel__date_picker__popup--button-next"]');
    const anterior = document.querySelector('[data-ofsc-id="dc__top_panel__date_picker__popup--button-previous"]');
    let cliques = 0;
    while (atual !== alvo && cliques < 45) {
      const seta = atual < alvo ? proximo : anterior;
      if (!seta) return { erro: "Não achei as setas de data do OFS" };
      seta.click();
      cliques += 1;
      await esperar(400);
      atual = lerData(texto());
      if (!atual) return { erro: "A data do OFS parou de ser lida durante a troca" };
    }
    if (atual !== alvo) return { erro: `Não consegui chegar em ${alvo} (parei em ${atual})` };
    if (cliques) await esperar(1200);
    return { cliques };
  }

  async function fluxo() {
    // Aba fixada (clusters/fechamentos) pode estar numa atividade: volta para o Console de Alocacao.
    if (abrirConsole && !document.querySelector(".edt-item")) {
      const link = Array.from(document.querySelectorAll('a, button, [role="link"], [role="menuitem"]')).find((el) => (el.textContent || "").trim() === "Console de Alocação");
      if (!link) return { ok: false, erro: "Não achei o Console de Alocação na aba fixada do OFS" };
      link.click();
      for (let i = 0; i < 40 && !document.querySelector(".edt-item"); i += 1) await esperar(500);
      if (!document.querySelector(".edt-item")) return { ok: false, erro: "O Console de Alocação não abriu na aba fixada" };
      await esperar(1500);
    }
    const data = await irParaData();
    if (data.erro) return { ok: false, erro: data.erro };
    let alocacao = null;
    if (alocacaoId) {
      const item = document.querySelector(`.edt-item[data-id="${CSS.escape(alocacaoId)}"]`);
      alocacao = item ? item.querySelector(":scope > .edt-row button.edt-label") : null;
      if (!alocacao) return { ok: false, erro: `Não achei a alocação ${alocacaoId} na árvore do OFS` };
    } else {
      const selecionada = document.querySelector(".edt-row.edt-selected");
      alocacao = selecionada ? selecionada.querySelector("button.edt-label") : null;
    }
    if (alocacao) { alocacao.click(); await esperar(1500); }
    const relogio = document.querySelector(".oj-ux-ico-clock");
    const atualizar = relogio ? relogio.closest('button, a, [role="button"], [tabindex]') || relogio : null;
    if (atualizar) { atualizar.click(); await esperar(1500); }
    if (!exportar) return { ok: true, cliques: data.cliques };
    const acoes = porTexto("Ações");
    if (!acoes) return { ok: false, erro: 'Não achei o botão "Ações" (o layout do OFS pode ter mudado)' };
    acoes.click();
    await esperar(700);
    const exportarItem = porTexto("Exportar");
    if (!exportarItem) return { ok: false, erro: 'Achei "Ações", mas não "Exportar"' };
    exportarItem.click();
    return { ok: true, cliques: data.cliques };
  }
  return fluxo();
}

async function abaDoOfs() {
  // A aba fixada dos fechamentos nao entra na exportacao.
  const { abaFechamento } = await chrome.storage.local.get("abaFechamento");
  const abas = (await chrome.tabs.query({ url: OFS_MATCH })).filter((aba) => aba.id !== abaFechamento);
  return abas.find((aba) => aba.active) || abas[0] || null;
}

async function rodarNaPagina(tabId, args) {
  const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId }, func: acaoNaPagina, args: [args] });
  return result || { ok: false, erro: "A aba do OFS não respondeu" };
}

// Exporta um dia (hoje por padrao). O envio acontece quando o download chega (chrome.downloads.onCreated).
// Com `cluster` ({ id, nome }), exporta o balde do cluster na aba fixada e manda para /ofs/cluster.
async function exportarDia(data, automatico, cluster) {
  const cfg = await config();
  if (!(await autenticacao())) return cluster ? { ok: false, erro: "Sem login" } : registrar({ ok: false, data, automatico, erro: "Entre com seu usuário do JH RedeFlow no popup" });
  const aba = cluster ? await abaDeFechamento() : await abaDoOfs();
  if (!aba) return registrar({ ok: false, data, automatico, erro: "Nenhuma aba do OFS aberta (abra o Console de Alocação e faça login)" });
  const { captura } = await chrome.storage.local.get("captura");
  if (captura && Date.now() < captura.ate) return { ok: false, erro: `Já há uma exportação em andamento (${diaBR(captura.data)})` };
  await chrome.storage.local.set({ captura: { ate: Date.now() + JANELA_CAPTURA_MS, data, tabId: aba.id, automatico, balde: cluster?.nome } });
  if (!cluster) atualizarSelo();
  let res;
  try {
    if (cluster && !(await ofsPronto(aba.id))) throw new Error("O OFS não carregou na aba fixada (confira o login)");
    res = await rodarNaPagina(aba.id, { alvo: data, alocacaoId: cluster ? cluster.id : cfg.alocacaoId.trim(), exportar: true, abrirConsole: Boolean(cluster) });
  } catch (e) { res = { ok: false, erro: e?.message || String(e) }; }
  if (!res.ok) {
    await chrome.storage.local.remove("captura");
    if (cluster) return { ok: false, erro: res.erro };
    await voltarParaHoje(aba.id, data);
    return registrar({ ok: false, data, automatico, erro: res.erro });
  }
  return { ok: true, pendente: true };
}

// Depois de exportar um dia anterior, devolve a tela do OFS para hoje (sem exportar).
async function voltarParaHoje(tabId, dataExportada) {
  if (dataExportada === hojeSP()) return;
  const { alocacaoId } = await config();
  try { await rodarNaPagina(tabId, { alvo: hojeSP(), alocacaoId: alocacaoId.trim(), exportar: false }); } catch (_) { /* aba fechada */ }
}

async function lerBlobNaAba(tabId, url) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (blobUrl) => { try { return await (await fetch(blobUrl)).text(); } catch (_) { return null; } },
    args: [url],
  });
  return result;
}

chrome.downloads.onCreated.addListener(async (item) => {
  const { captura } = await chrome.storage.local.get("captura");
  if (!captura || Date.now() > captura.ate) return; // nao fomos nos que pedimos: deixa o Chrome baixar normal
  const doOfs = (u) => String(u || "").includes("alloha.fs.ocs.oraclecloud.com");
  if (!doOfs(item.url) && !doOfs(item.referrer) && !String(item.url || "").startsWith("blob:https://alloha.fs.ocs.oraclecloud.com")) return;
  await chrome.storage.local.remove("captura");
  chrome.downloads.cancel(item.id).catch(() => {});
  let csv = null;
  try {
    csv = item.url.startsWith("blob:") ? await lerBlobNaAba(captura.tabId, item.url) : await (await fetch(item.url, { credentials: "include" })).text();
  } catch (_) { /* tratado abaixo */ }
  if (captura.balde) {
    // Balde de cluster: so marca o cluster das ordens (nao mexe no Painel nem no "Último envio").
    const res = csv ? await enviarCluster(csv, captura.balde) : { ok: false, erro: "Não consegui ler o CSV exportado" };
    await chrome.storage.local.set({ ultimoClusterEnvio: { ...res, balde: captura.balde, quando: Date.now() } });
    return;
  }
  let res = csv ? await enviarCsv(csv, item.filename?.split(/[\\/]/).pop(), captura.data) : { ok: false, erro: "Não consegui ler o CSV exportado" };
  await registrar({ ...res, data: captura.data, automatico: captura.automatico });
  await voltarParaHoje(captura.tabId, captura.data);
});

// Exportacao que nunca virou download (ex.: OFS demorou ou mudou o menu)
async function conferirCapturaVencida() {
  const { captura } = await chrome.storage.local.get("captura");
  if (!captura || Date.now() <= captura.ate) return;
  await chrome.storage.local.remove("captura");
  if (captura.balde) { await chrome.storage.local.set({ ultimoClusterEnvio: { ok: false, erro: "O OFS não gerou o arquivo a tempo (90 s)", balde: captura.balde, quando: Date.now() } }); return; }
  await registrar({ ok: false, data: captura.data, automatico: captura.automatico, erro: "O OFS não gerou o arquivo a tempo (90 s)" });
  await voltarParaHoje(captura.tabId, captura.data);
}

// ---------- fechamentos (Motivo, Submotivo e Tipo do Cabo do formulario "Fechamento") ----------
// Nao vem no CSV. Numa aba propria do OFS (fixada, em segundo plano), pesquisa cada ordem, abre a atividade
// concluida e le as propriedades 725 (Motivo de Fechamento), 916 (Submotivo) e 1062 (Tipo do Cabo). So leitura.

// Roda no mundo da pagina (precisa do $app do OFS). Autocontida.
async function lerFechamentoNaPagina(ordem) {
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const ate = async (fn, ms) => { const fim = Date.now() + ms; while (Date.now() < fim) { const v = fn(); if (v) return v; await esperar(250); } return null; };
  if (typeof $app === "undefined" || !$app.model) return { ordem, erro: "OFS ainda carregando" };
  // Guarda a resposta da pesquisa do OFS: ela traz o status de cada atividade da ordem, na ordem da lista.
  if (!window.__rfBusca) {
    window.__rfBusca = { seq: 0, texto: "" };
    const abrir = XMLHttpRequest.prototype.open, mandar = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (_metodo, url) { this.__rfUrl = String(url); return abrir.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      if ((this.__rfUrl || "").includes("m=search")) this.addEventListener("load", () => { window.__rfBusca = { seq: window.__rfBusca.seq + 1, texto: this.responseText }; });
      return mandar.apply(this, arguments);
    };
  }
  const campoAberto = () => [...document.querySelectorAll("input.search-bar-input")].find((i) => !i.classList.contains("global-search-bar-input-button") && i.offsetParent !== null);
  const antes = window.__rfBusca.seq;
  if (!campoAberto()) document.querySelector("input.global-search-bar-input-button")?.click();
  const campo = await ate(campoAberto, 5000);
  if (!campo) return { ordem, erro: "Não achei a pesquisa do OFS" };
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(campo, ordem);
  campo.dispatchEvent(new Event("input", { bubbles: true }));
  for (const tipo of ["keydown", "keypress", "keyup"]) campo.dispatchEvent(new KeyboardEvent(tipo, { key: "Enter", keyCode: 13, which: 13, bubbles: true }));
  if (!(await ate(() => window.__rfBusca.seq > antes, 12000))) return { ordem, erro: "A pesquisa do OFS não respondeu" };
  let grupos = [];
  try { grupos = JSON.parse(window.__rfBusca.texto); } catch (_) { return { ordem, erro: "Resposta da pesquisa ilegível" }; }
  const linhas = (grupos.find((g) => g.key === "appt_number")?.value?.rows) || [];
  if (!linhas.length) return { ordem, naoEncontrada: true };
  // A mesma ordem pode ter varias atividades (ex.: uma suspensa e outra concluida): usa a concluida mais recente.
  const concluidas = linhas.map((linha, i) => ({ ...linha, i })).filter((linha) => linha.astatus === "complete").sort((a, b) => String(b.end_time).localeCompare(String(a.end_time)));
  if (!concluidas.length) return { ordem, semConcluida: true };
  const alvo = concluidas[0];
  const itens = await ate(() => { const l = [...document.querySelectorAll(".global-search-found-item")].filter((el) => el.offsetParent !== null && (el.textContent || "").includes(ordem)); return l.length >= linhas.length ? l : null; }, 6000);
  if (!itens) return { ordem, erro: "Os resultados da pesquisa não apareceram" };
  itens[alvo.i].click();
  const p = await ate(() => { try { return $app.model().activityService().getAll().map((a) => a._properties || {}).find((x) => String(x.aid) === String(alvo.aid)); } catch (_) { return null; } }, 15000);
  if (!p) return { ordem, erro: "A atividade não abriu" };
  // 725 e 916 sao listas no OFS: a atividade guarda a chave (ex.: "13", "CTO_SEM_SINAL_EVENTO_PRODUTIVO") e a tela
  // mostra o texto ("Realizado nova fusão na CTO/CEO", "CTO sem sinal"). Traduz pela lista do proprio OFS.
  const rotulo = (id, valor) => {
    if (valor == null || valor === "") return null;
    try { return $app.model().attributeService().getEntity(id)?._description?.enum?.[valor]?.text || String(valor); } catch (_) { return String(valor); }
  };
  return { ordem, aid: String(p.aid), motivo: rotulo(725, p["725"]), submotivo: rotulo(916, p["916"]), tipoCabo: rotulo(1062, p["1062"]) };
}

async function abaDeFechamento() {
  const { abaFechamento } = await chrome.storage.local.get("abaFechamento");
  if (abaFechamento) {
    try { const aba = await chrome.tabs.get(abaFechamento); if (String(aba?.url || aba?.pendingUrl || "").startsWith(OFS_ORIGEM)) return aba; } catch (_) { /* aba fechada */ }
  }
  const aba = await chrome.tabs.create({ url: OFS_ORIGEM, active: false, pinned: true });
  await chrome.storage.local.set({ abaFechamento: aba.id });
  return aba;
}

async function ofsPronto(tabId) {
  const fim = Date.now() + 90_000;
  while (Date.now() < fim) {
    try {
      const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: () => typeof $app !== "undefined" && Boolean(document.querySelector("input.global-search-bar-input-button")) });
      if (result) return true;
    } catch (_) { /* ainda carregando */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function registrarFechamento(resultado) {
  const registro = { quando: Date.now(), ...resultado };
  await chrome.storage.local.set({ ultimoFechamento: registro });
  return registro;
}

async function coletarFechamentos(automatico) {
  const auth = await autenticacao();
  if (!auth) return registrarFechamento({ ok: false, erro: "Entre com seu usuário do JH RedeFlow no popup" });
  const { fechRodando, captura } = await chrome.storage.local.get(["fechRodando", "captura"]);
  if (fechRodando && Date.now() < fechRodando) return { ok: false, erro: "Leitura de fechamentos já em andamento" };
  if (automatico && captura && Date.now() < captura.ate) return { ok: false, erro: "Exportação em andamento; fica para o próximo ciclo" };
  await chrome.storage.local.set({ fechRodando: Date.now() + 10 * 60_000 });
  try {
    const r = await fetch(FECH_PENDENTES_URL, { headers: auth.headers });
    const corpo = await r.json().catch(() => ({}));
    if (auth.sessao && (r.status === 401 || r.status === 403)) await chrome.storage.local.remove("sessao");
    if (!r.ok) return registrarFechamento({ ok: false, erro: corpo?.message || `HTTP ${r.status}` });
    const ordens = Array.isArray(corpo.ordens) ? corpo.ordens : [];
    // Chamados que o RedeFlow finalizou sozinho (OFS concluido + Data Fim + tecnico + fechamento lido).
    const finalizados = Array.isArray(corpo.finalizados) ? [...corpo.finalizados] : [];
    const { fechTentativas = {} } = await chrome.storage.local.get("fechTentativas");
    for (const [ordem, quando] of Object.entries(fechTentativas)) if (Date.now() - quando > 86_400_000) delete fechTentativas[ordem];
    const fila = ordens.filter((ordem) => !fechTentativas[ordem] || Date.now() - fechTentativas[ordem] > FECH_ESPERA_MS).slice(0, FECH_POR_CICLO);
    if (!fila.length) return registrarFechamento({ ok: true, lidos: 0, atualizados: 0, finalizados, pendentes: ordens.length });

    const aba = await abaDeFechamento();
    if (!(await ofsPronto(aba.id))) return registrarFechamento({ ok: false, erro: "O OFS não carregou na aba de fechamentos (confira o login)" });
    const itens = [];
    // Ordens que nao trouxeram fechamento, com o motivo, para mostrar no popup.
    const falhas = [];
    let semConcluida = 0;
    let erros = 0;
    for (const ordem of fila) {
      let res;
      try { [{ result: res } = {}] = await chrome.scripting.executeScript({ target: { tabId: aba.id }, world: "MAIN", func: lerFechamentoNaPagina, args: [ordem] }); }
      catch (e) { res = { ordem, erro: e?.message || String(e) }; }
      fechTentativas[ordem] = Date.now();
      if (res?.motivo || res?.submotivo || res?.tipoCabo) itens.push({ ordem, motivo: res.motivo, submotivo: res.submotivo, tipoCabo: res.tipoCabo });
      else if (res?.semConcluida || res?.naoEncontrada) { semConcluida += 1; falhas.push({ ordem, tipo: "aviso", motivo: res.naoEncontrada ? "Não encontrada na pesquisa do OFS" : "Nenhuma atividade concluída no OFS ainda" }); }
      else { erros += 1; falhas.push({ ordem, tipo: "erro", motivo: res?.erro || (res?.aid ? `Atividade ${res.aid} concluída, mas sem Motivo, Submotivo e Tipo do cabo preenchidos` : "Sem resposta da aba do OFS") }); }
    }
    await chrome.storage.local.set({ fechTentativas });
    let atualizados = 0;
    if (itens.length) {
      const envio = await fetch(FECH_URL, { method: "POST", headers: { "Content-Type": "application/json", ...auth.headers }, body: JSON.stringify({ itens }) });
      const resposta = await envio.json().catch(() => ({}));
      if (!envio.ok) return registrarFechamento({ ok: false, erro: resposta?.message || `HTTP ${envio.status}`, lidos: fila.length, falhas });
      atualizados = resposta.atualizados ?? 0;
      finalizados.push(...(resposta.finalizados || []));
      for (const ordem of resposta.semChamado || []) falhas.push({ ordem, tipo: "erro", motivo: "Lida no OFS, mas não achei o chamado no RedeFlow (ou há mais de um com essa ordem)" });
    }
    return registrarFechamento({ ok: true, lidos: fila.length, comDados: itens.length, atualizados, finalizados, semConcluida, erros, falhas, pendentes: ordens.length });
  } catch (e) {
    return registrarFechamento({ ok: false, erro: `Sem conexão com o RedeFlow (${e?.message || e})` });
  } finally {
    await chrome.storage.local.remove("fechRodando");
  }
}

// ---------- clusters (baldes CLUSTER_C08/C09/C11/C12) ----------
// Exporta cada balde de cluster na aba fixada e manda ao RedeFlow, que marca o cluster das ordens que estao no
// balde e aprende Workzone -> cluster (as ordens ja atribuidas recebem o cluster pela Workzone no export principal).
const CLUSTER_URL = `${API_BASE}/api/integrations/ofs/cluster`;
const ALARME_CLUSTERS = "rf-clusters";
// data-id na arvore do OFS (Console de Alocacao) -> C.8 Sao Paulo, C.9 ABC, C.11 Alto Tiete, C.12 Guarulhos.
const CLUSTERS = [
  { id: "5066", nome: "CLUSTER_C08" },
  { id: "5399", nome: "CLUSTER_C09" },
  { id: "5063", nome: "CLUSTER_C11" },
  { id: "5064", nome: "CLUSTER_C12" },
];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function enviarCluster(csv, balde) {
  const auth = await autenticacao();
  if (!auth) return { ok: false, erro: "Sem login" };
  try {
    const r = await fetch(CLUSTER_URL, { method: "POST", headers: { "Content-Type": "application/json", ...auth.headers }, body: JSON.stringify({ csv, balde, nome: `${balde}.csv` }) });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: corpo?.message || `HTTP ${r.status}` };
    return { ok: true, linhas: corpo.rows ?? 0, chamados: corpo.matchedCalls ?? 0, novos: corpo.updatedCalls ?? 0, workzones: corpo.learnedWorkzones ?? 0 };
  } catch (e) {
    return { ok: false, erro: `Sem conexão com o RedeFlow (${e?.message || e})` };
  }
}

async function esperarCapturaLivre(ms) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const { captura } = await chrome.storage.local.get("captura");
    if (!captura || Date.now() > captura.ate) return true;
    await dormir(1000);
  }
  return false;
}

async function coletarClusters(automatico) {
  const registrarClusters = async (resultado) => { const registro = { quando: Date.now(), ...resultado }; await chrome.storage.local.set({ ultimoCluster: registro }); return registro; };
  if (!(await autenticacao())) return registrarClusters({ ok: false, erro: "Entre com seu usuário do JH RedeFlow no popup" });
  const { fechRodando } = await chrome.storage.local.get("fechRodando");
  if (fechRodando && Date.now() < fechRodando) return { ok: false, erro: "A aba fixada do OFS está ocupada; fica para o próximo ciclo" };
  await chrome.storage.local.set({ fechRodando: Date.now() + 10 * 60_000 });
  const resultados = [];
  try {
    for (const cluster of CLUSTERS) {
      if (!(await esperarCapturaLivre(120_000))) { resultados.push({ balde: cluster.nome, ok: false, erro: "Outra exportação não terminou" }); continue; }
      await chrome.storage.local.remove("ultimoClusterEnvio");
      const inicio = await exportarDia(hojeSP(), automatico, cluster);
      if (!inicio?.ok) { resultados.push({ balde: cluster.nome, ok: false, erro: inicio?.erro || "Não exportou" }); continue; }
      await esperarCapturaLivre(JANELA_CAPTURA_MS + 5000);
      let envio = null;
      for (let i = 0; i < 30 && !envio; i += 1) {
        const { ultimoClusterEnvio } = await chrome.storage.local.get("ultimoClusterEnvio");
        if (ultimoClusterEnvio?.balde === cluster.nome) envio = ultimoClusterEnvio; else await dormir(1000);
      }
      resultados.push(envio || { balde: cluster.nome, ok: false, erro: "O envio do balde não respondeu" });
    }
  } finally {
    await chrome.storage.local.remove("fechRodando");
  }
  return registrarClusters({ ok: resultados.length > 0 && resultados.every((item) => item.ok), resultados });
}

// ---------- agendamento ----------
function proximaHora(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const agora = new Date();
  const alvo = new Date(agora);
  alvo.setHours(h, m, 0, 0);
  if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
  return alvo.getTime();
}

async function agendar() {
  const cfg = await config();
  await chrome.alarms.clear(ALARME_HOJE);
  await chrome.alarms.clear(ALARME_ONTEM);
  if (cfg.ativo && +cfg.intervaloMin > 0) chrome.alarms.create(ALARME_HOJE, { periodInMinutes: Math.max(15, +cfg.intervaloMin), delayInMinutes: 1 });
  const quando = cfg.ativo ? proximaHora(cfg.horaDiaAnterior) : null;
  if (quando) chrome.alarms.create(ALARME_ONTEM, { when: quando });
  await chrome.alarms.clear(ALARME_FECH);
  await chrome.alarms.clear(ALARME_CLUSTERS);
  if (cfg.ativo && +cfg.clusterMin > 0) chrome.alarms.create(ALARME_CLUSTERS, { periodInMinutes: Math.max(30, +cfg.clusterMin), delayInMinutes: 4 });
  if (cfg.ativo && +cfg.fechamentoMin > 0) chrome.alarms.create(ALARME_FECH, { periodInMinutes: Math.max(5, +cfg.fechamentoMin), delayInMinutes: 2 });
  chrome.alarms.create("rf-vigia", { periodInMinutes: 1 });
  atualizarSelo();
}

chrome.alarms.onAlarm.addListener(async (alarme) => {
  if (alarme.name === "rf-vigia") return conferirCapturaVencida();
  const cfg = await config();
  if (!cfg.ativo) return;
  if (alarme.name === ALARME_FECH) return coletarFechamentos(true);
  if (alarme.name === ALARME_CLUSTERS) return coletarClusters(true);
  if (alarme.name === ALARME_HOJE) await exportarDia(hojeSP(), true);
  if (alarme.name === ALARME_ONTEM) {
    await exportarDia(somarDias(hojeSP(), -1), true);
    const quando = proximaHora(cfg.horaDiaAnterior);
    if (quando) chrome.alarms.create(ALARME_ONTEM, { when: quando });
  }
});

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "sync" && Object.keys(mudancas).some((chave) => chave in PADRAO)) agendar();
  if (area === "local" && mudancas.sessao) atualizarSelo();
});
chrome.runtime.onInstalled.addListener(() => agendar());
chrome.runtime.onStartup.addListener(() => agendar());
// O Chrome pode apagar alarmes ao atualizar a extensao: recria se sumiram quando o service worker acorda.
chrome.alarms.get(ALARME_HOJE).then((alarme) => { if (!alarme) agendar(); });

// ---------- mensagens do popup ----------
chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  const tarefas = {
    exportar: () => exportarDia(msg.data || hojeSP(), false),
    enviarArquivo: async () => registrar({ ...(await enviarCsv(msg.csv, msg.nome, msg.data)), data: msg.data, automatico: false }),
    entrar: () => entrar(String(msg.email || "").trim(), String(msg.senha || "")),
    sair: async () => { await chrome.storage.local.remove("sessao"); atualizarSelo(); return { ok: true }; },
    sessao: async () => { const s = await sessaoAtual(); return s ? { nome: s.nome, email: s.email, expiraEm: s.expiraEm } : null; },
    testarConexao: async () => {
      const auth = await autenticacao();
      if (!auth) return { ok: false, erro: "Entre com seu usuário primeiro" };
      try {
        const r = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json", ...auth.headers }, body: "{}" });
        if (r.status === 400) return { ok: true };
        const body = await r.json().catch(() => ({}));
        if (auth.sessao && (r.status === 401 || r.status === 403)) await chrome.storage.local.remove("sessao");
        if (r.status === 401 || r.status === 403 || r.status === 503) return { ok: false, erro: body?.message || `Acesso recusado (HTTP ${r.status})` };
        return { ok: false, erro: `Resposta inesperada (HTTP ${r.status})` };
      } catch (e) { return { ok: false, erro: `Sem conexão com o RedeFlow (${e?.message || e})` }; }
    },
    proximas: async () => ({ hoje: (await chrome.alarms.get(ALARME_HOJE))?.scheduledTime || null, ontem: (await chrome.alarms.get(ALARME_ONTEM))?.scheduledTime || null, fechamentos: (await chrome.alarms.get(ALARME_FECH))?.scheduledTime || null, clusters: (await chrome.alarms.get(ALARME_CLUSTERS))?.scheduledTime || null }),
    fechamentos: () => coletarFechamentos(false),
    clusters: () => coletarClusters(false),
  };
  const tarefa = tarefas[msg?.tipo];
  if (!tarefa) return false;
  Promise.resolve(tarefa()).then(responder, (e) => responder({ ok: false, erro: e?.message || String(e) }));
  return true;
});
