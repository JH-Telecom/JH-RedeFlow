/* JH RedeFlow – Coletor OFS. Extensao propria da Rede (separada da extensao do JH Agendamentos).
   Na aba do OFS ja logada: escolhe o dia, a alocacao, atualiza a grade e clica em Acoes → Exportar; le o CSV gerado
   (blob da propria pagina) e envia ao JH RedeFlow (POST /api/integrations/ofs/export), que atualiza o Painel diario
   e o Status OFS / Data Fim dos chamados. So captura o download que ela mesma pediu — exportacoes manuais no OFS
   continuam baixando normalmente. */

const API_URL = "https://jh-redeflow-api.onrender.com/api/integrations/ofs/export";
const OFS_MATCH = "https://alloha.fs.ocs.oraclecloud.com/*";
const ALARME_HOJE = "rf-coleta-hoje";
const ALARME_ONTEM = "rf-coleta-dia-anterior";
const JANELA_CAPTURA_MS = 90_000;
const LIMITE_AVISO_FALHAS = 3;
const PADRAO = { token: "", intervaloMin: 60, horaDiaAnterior: "07:00", alocacaoId: "", ativo: true };

// ---------- datas no fuso de Sao Paulo ----------
const fmtSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const hojeSP = () => fmtSP.format(new Date());
const somarDias = (iso, dias) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
const diaBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

async function config() {
  return { ...PADRAO, ...(await chrome.storage.sync.get(Object.keys(PADRAO))) };
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
  if (!cfg.token) return set("!", "#dc2626", "configure o token do RedeFlow");
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
  const { token } = await config();
  if (!token) return { ok: false, erro: "Token do RedeFlow não configurado" };
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-redeflow-ofs-token": token },
      body: JSON.stringify({ csv, nome: nome || `ofs-${data}.csv`, maquina: await maquinaId(), data }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: body?.message || `HTTP ${r.status}` };
    return { ok: true, atividades: body?.painel?.records ?? null, cruzados: body?.d0?.matchedCalls ?? null, atualizados: body?.d0?.updatedCalls ?? null, aviso: body?.d0Error || null };
  } catch (e) {
    return { ok: false, erro: `Sem conexão com o RedeFlow (${e?.message || e})` };
  }
}

// ---------- automacao na pagina do OFS (injetada com chrome.scripting) ----------
// Precisa ser autocontida: roda dentro da aba do OFS, sem acesso ao escopo da extensao.
function acaoNaPagina({ alvo, alocacaoId, exportar }) {
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
  const abas = await chrome.tabs.query({ url: OFS_MATCH });
  return abas.find((aba) => aba.active) || abas[0] || null;
}

async function rodarNaPagina(tabId, args) {
  const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId }, func: acaoNaPagina, args: [args] });
  return result || { ok: false, erro: "A aba do OFS não respondeu" };
}

// Exporta um dia (hoje por padrao). O envio acontece quando o download chega (chrome.downloads.onCreated).
async function exportarDia(data, automatico) {
  const cfg = await config();
  if (!cfg.token) return registrar({ ok: false, data, automatico, erro: "Configure o token do RedeFlow no popup" });
  const aba = await abaDoOfs();
  if (!aba) return registrar({ ok: false, data, automatico, erro: "Nenhuma aba do OFS aberta (abra o Console de Alocação e faça login)" });
  const { captura } = await chrome.storage.local.get("captura");
  if (captura && Date.now() < captura.ate) return { ok: false, erro: `Já há uma exportação em andamento (${diaBR(captura.data)})` };
  await chrome.storage.local.set({ captura: { ate: Date.now() + JANELA_CAPTURA_MS, data, tabId: aba.id, automatico } });
  atualizarSelo();
  let res;
  try { res = await rodarNaPagina(aba.id, { alvo: data, alocacaoId: cfg.alocacaoId.trim(), exportar: true }); }
  catch (e) { res = { ok: false, erro: e?.message || String(e) }; }
  if (!res.ok) {
    await chrome.storage.local.remove("captura");
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
  let res = csv ? await enviarCsv(csv, item.filename?.split(/[\\/]/).pop(), captura.data) : { ok: false, erro: "Não consegui ler o CSV exportado" };
  await registrar({ ...res, data: captura.data, automatico: captura.automatico });
  await voltarParaHoje(captura.tabId, captura.data);
});

// Exportacao que nunca virou download (ex.: OFS demorou ou mudou o menu)
async function conferirCapturaVencida() {
  const { captura } = await chrome.storage.local.get("captura");
  if (!captura || Date.now() <= captura.ate) return;
  await chrome.storage.local.remove("captura");
  await registrar({ ok: false, data: captura.data, automatico: captura.automatico, erro: "O OFS não gerou o arquivo a tempo (90 s)" });
  await voltarParaHoje(captura.tabId, captura.data);
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
  chrome.alarms.create("rf-vigia", { periodInMinutes: 1 });
  atualizarSelo();
}

chrome.alarms.onAlarm.addListener(async (alarme) => {
  if (alarme.name === "rf-vigia") return conferirCapturaVencida();
  const cfg = await config();
  if (!cfg.ativo) return;
  if (alarme.name === ALARME_HOJE) await exportarDia(hojeSP(), true);
  if (alarme.name === ALARME_ONTEM) {
    await exportarDia(somarDias(hojeSP(), -1), true);
    const quando = proximaHora(cfg.horaDiaAnterior);
    if (quando) chrome.alarms.create(ALARME_ONTEM, { when: quando });
  }
});

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "sync" && Object.keys(mudancas).some((chave) => chave in PADRAO)) agendar();
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
    testarToken: async () => {
      const { token } = await config();
      if (!token) return { ok: false, erro: "Preencha o token" };
      try {
        const r = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json", "x-redeflow-ofs-token": token }, body: "{}" });
        if (r.status === 400) return { ok: true };
        if (r.status === 401) return { ok: false, erro: "Token recusado pelo RedeFlow" };
        if (r.status === 503) return { ok: false, erro: "O RedeFlow está sem o token configurado no servidor" };
        return { ok: false, erro: `Resposta inesperada (HTTP ${r.status})` };
      } catch (e) { return { ok: false, erro: `Sem conexão com o RedeFlow (${e?.message || e})` }; }
    },
    proximas: async () => ({ hoje: (await chrome.alarms.get(ALARME_HOJE))?.scheduledTime || null, ontem: (await chrome.alarms.get(ALARME_ONTEM))?.scheduledTime || null }),
  };
  const tarefa = tarefas[msg?.tipo];
  if (!tarefa) return false;
  Promise.resolve(tarefa()).then(responder, (e) => responder({ ok: false, erro: e?.message || String(e) }));
  return true;
});
