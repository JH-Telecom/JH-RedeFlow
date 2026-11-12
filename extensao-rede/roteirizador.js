/* Roteirizador da madrugada (1.10.0, 12/11/2026). Das 00:00 as 06:00 (Sao Paulo), a cada 15 min, pergunta ao RedeFlow
   quais ordens mover (chamados sem tecnico -> tecnico de plantao da regiao) e move cada uma na aba do OFS, pelo mesmo
   caminho do "Mover" da extensao JH Telecom 2.1.1: busca a OS pendente de hoje -> Mover -> tecnico -> Continuar ->
   "Reordenacao de Prioridade - BackOffice" -> Mover -> confere pela pesquisa que ficou com o tecnico.
   Nunca chuta: so move ordem PENDENTE que esta num balde (CLUSTER_/BKI_); com uma pessoa, so registra e pula.
   Modo teste (ligado por padrao na tela Roteirizador): faz tudo ate escolher o tecnico e clica Ignorar. */

const ROTA_PENDENTES_URL = `${API_BASE}/api/integrations/ofs/roteirizador/pendentes`;
const ROTA_RESULTADO_URL = `${API_BASE}/api/integrations/ofs/roteirizador/resultado`;
const ALARME_ROTA = "rf-roteirizador";
const ROTA_MIN = 15;
const fmtHoraSP = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" });
const madrugadaSP = () => { const h = Number(fmtHoraSP.format(new Date())) % 24; return h >= 0 && h < 6; };

chrome.alarms.get(ALARME_ROTA).then((a) => { if (!a) chrome.alarms.create(ALARME_ROTA, { periodInMinutes: ROTA_MIN, delayInMinutes: 3 }); });
chrome.alarms.onAlarm.addListener((alarme) => { if (alarme.name === ALARME_ROTA) void roteirizar(true); });

async function registrarRota(registro) {
  const r = { quando: Date.now(), ...registro };
  await chrome.storage.local.set({ ultimoRoteiro: r });
  return r;
}

async function roteirizar(automatico) {
  if (automatico && !madrugadaSP()) return { ok: true, fora: true };
  const cfg = await config();
  if (!cfg.ativo || (await semPermissaoDeColeta())) return { ok: false, erro: "Coleta desligada ou perfil sem permissão" };
  const auth = await autenticacao();
  if (!auth) return registrarRota({ ok: false, erro: "Entre com seu usuário do JH RedeFlow no popup" });
  const { roteando } = await chrome.storage.local.get("roteando");
  if (roteando && Date.now() < roteando) return { ok: false, erro: "O roteirizador já está rodando" };
  let lista;
  try {
    // Pelo botao "Rodar agora": fora da madrugada o servidor so manda a lista se estiver no modo teste.
    const r = await fetch(automatico ? ROTA_PENDENTES_URL : `${ROTA_PENDENTES_URL}?forcar=1`, { headers: auth.headers });
    lista = await r.json().catch(() => ({}));
    if (!r.ok) return registrarRota({ ok: false, erro: lista?.message || `HTTP ${r.status}` });
  } catch (e) { return registrarRota({ ok: false, erro: `Sem conexão com o RedeFlow (${e?.message || e})` }); }
  const ordens = Array.isArray(lista.ordens) ? lista.ordens : [];
  if (!lista.ativo || !ordens.length) return registrarRota({ ok: true, ativo: Boolean(lista.ativo), janela: Boolean(lista.janela), itens: [] });
  const aba = await abaDoOfs();
  if (!aba) return registrarRota({ ok: false, erro: "Nenhuma aba do OFS aberta (abra o Console de Alocação e faça login)" });
  // A coleta (export) usa a mesma aba: espera ela terminar e segura a aba enquanto move.
  if (!(await esperarCapturaLivre(120_000))) return registrarRota({ ok: false, erro: "A aba do OFS ficou ocupada com a coleta; fica para o próximo ciclo" });
  await chrome.storage.local.set({ roteando: Date.now() + 12 * 60_000 });
  const itens = [];
  let falhasSeguidas = 0;
  try {
    for (const o of ordens) {
      let res;
      try {
        const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId: aba.id }, world: "MAIN", func: roteirizarNaPagina, args: [{ os: o.os, tecnico: o.tecnico, simular: Boolean(lista.teste) }] });
        res = result || { ok: false, erro: "A aba do OFS não respondeu" };
      } catch (e) { res = { ok: false, erro: e?.message || String(e) }; }
      const resultado = res.pular ? "Pulada" : !res.ok ? "Erro" : lista.teste ? "Teste" : "Movida";
      const mensagem = String(res.pular || res.erro || res.aviso || res.conferencia || "").slice(0, 500);
      itens.push({ callId: o.callId, os: o.os, tecnicoId: o.tecnicoId, resultado, mensagem });
      falhasSeguidas = resultado === "Erro" ? falhasSeguidas + 1 : 0;
      if (falhasSeguidas >= 2) break; // OFS deslogado/fora do Console: para e tenta no proximo ciclo
    }
  } finally { await chrome.storage.local.remove("roteando"); }
  try {
    await fetch(ROTA_RESULTADO_URL, { method: "POST", headers: { "Content-Type": "application/json", ...auth.headers }, body: JSON.stringify({ maquina: await maquinaId().catch(() => undefined), itens }) });
  } catch (_) { /* o resultado fica no popup; o servidor ve no proximo ciclo */ }
  return registrarRota({ ok: itens.every((i) => i.resultado !== "Erro"), teste: Boolean(lista.teste), itens });
}

// Roda DENTRO da aba do OFS (world MAIN: enxerga o knockout da pagina). Adaptado do moverNaPagina (JH Telecom 2.1.1),
// caminho de UMA OS sem escolher posicao (fica onde o OFS colocar).
async function roteirizarNaPagina(p) {
  const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
  const espera = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await dorme(250); } return null; };
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  const clicar = (el) => { ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((t) => el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))); };
  const vis = (e) => e && e.offsetParent !== null;
  const d = new Date(), hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const os = String(p.os || "").replace(/\D/g, "");
  if (!os || !p.tecnico) return { ok: false, erro: "OS ou técnico não informado" };
  const ko = window.require && window.require("knockout");
  if (!ko) return { ok: false, erro: "Não consegui acessar o OFS (a aba está logada?)" };
  const ignorar = async () => { const b = [...document.querySelectorAll("button.button")].find((bt) => /Ignorar/i.test(bt.textContent) && bt.offsetParent); if (b) { b.click(); await espera(() => !document.querySelector(".ko\\:visuals\\:move-activities"), 5000); } };
  await ignorar(); // janela de Mover esquecida aberta atrapalha

  const RX_CAB = /^\s*([^,]{3,80}),\s*\d{2}\/\d{2}\/\d{2,4}\s*$/;
  const cabs = () => [...document.querySelectorAll("body *")].filter((e) => e.childElementCount <= 4 && RX_CAB.test(e.textContent || "") && ![...e.children].some((c) => RX_CAB.test(c.textContent || "")));
  const marcarCabVelho = () => cabs().forEach((e) => { e.dataset.jhVelho = "1"; });
  const tecKo = () => {
    try {
      const st = [...document.querySelectorAll('[data-label="astatus"]')].find((x) => !x.dataset.jhVelho && x.offsetParent);
      if (!st) return "";
      for (let e = st; e; e = e.parentElement) {
        const dd = ko.dataFor(e); if (!dd) continue;
        for (const o of [dd, dd._properties, dd.activity, dd.model, dd.entity].filter(Boolean)) {
          for (const k of ["pname", "resource_name", "resourceName", "pidName", "provider_name"]) { const v = typeof o[k] === "function" ? o[k]() : o[k]; if (v && typeof v === "string") return v.trim(); }
        }
      }
    } catch (_) {}
    return "";
  };
  const tecDaTela = () => { const e = cabs().find((x) => x.offsetParent); return e ? e.textContent.match(RX_CAB)[1].trim() : tecKo(); };
  const mesmoTec = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
  const ehBalde = (nome) => /^(CLUSTER|BKI)_/i.test(String(nome).trim()) || /_/.test(String(nome));
  const vmBusca = () => { for (const el of document.querySelectorAll("input")) { const dd = ko.dataFor(el); if (dd && typeof dd.performImmediateSearch === "function" && typeof dd.searchValue === "function") return dd; } return null; };
  const barra = () => document.querySelector("input.global-search-bar-input-button") || [...document.querySelectorAll("input")].find((i) => i.offsetParent && /Pesquisa em atividades/i.test(i.placeholder || ""));
  const buscar = async () => {
    let vm = vmBusca();
    if (!vm) { const b = barra(); if (b) { clicar(b); b.focus(); vm = await espera(vmBusca, 5000); } }
    if (!vm) return false;
    document.querySelectorAll(".global-search-found-item").forEach((x) => x.remove());
    vm.searchValue(os); vm._initSearchRequest();
    if (!(await espera(() => document.querySelector(".global-search-found-item"), 12000))) return null;
    await dorme(500);
    return true;
  };
  const stDe = (it) => { try { const dd = ko.dataFor(it), pr = dd && (dd._properties || dd); const v = pr && (pr.astatus ?? pr.status); return String(typeof v === "function" ? v() : v || "").toLowerCase(); } catch (_) { return ""; } };
  const candidatas = () => [...document.querySelectorAll(".global-search-found-item")].filter((it) => it.querySelector(".activity-icon")?.getAttribute("par_date") === hoje && (it.querySelector(".activity-title")?.textContent || "").includes(`|${os}|`));
  const BALDE_GERAL = "9001";
  const voltarConsole = async () => {
    try {
      const temArvore = () => [...document.querySelectorAll(".edt-item")].some((e) => e.offsetParent);
      if (!temArvore()) {
        const bt = [...document.querySelectorAll("a,button,[role=button],[title],[aria-label]")].find((b) => b.offsetParent && /Console de Aloca/i.test(b.getAttribute("title") || b.getAttribute("aria-label") || ""));
        if (bt) { clicar(bt); await espera(temArvore, 10000); await dorme(500); }
      }
      const item = document.querySelector(`.edt-item[data-id="${BALDE_GERAL}"] > .edt-row button.edt-label`);
      if (item) { item.click(); await dorme(900); }
      const ic = document.querySelector(".oj-ux-ico-clock"), rel = ic && (ic.closest('button, a, [role="button"], [tabindex]') || ic);
      if (rel) rel.click();
    } catch (_) {}
  };

  // 1) pesquisa e abre a OS PENDENTE de hoje
  const achouBusca = await buscar();
  if (achouBusca === false) return { ok: false, erro: "A barra de busca do OFS não abriu (a aba está logada?)" };
  if (!achouBusca) return { ok: false, erro: "A busca do OFS não trouxe resultado" };
  let cand = candidatas();
  if (!cand.length) return { pular: `Não achei a OS ${os} de hoje no OFS` };
  const st0 = cand.map(stDe);
  if (st0.some(Boolean)) {
    cand = cand.filter((_, i) => !st0[i] || st0[i] === "pending").sort((a, b) => (stDe(b) === "pending") - (stDe(a) === "pending"));
    if (!cand.length) return { pular: `A OS ${os} não está pendente no OFS (${st0.join(", ")})` };
  }
  document.querySelectorAll('[data-label="astatus"]').forEach((x) => { x.dataset.jhVelho = "1"; }); marcarCabVelho();
  clicar(cand[0].querySelector(".activity-title") || cand[0]);
  const st = await espera(() => [...document.querySelectorAll('[data-label="astatus"]')].find((x) => !x.dataset.jhVelho && x.offsetParent), 10000);
  if (!st || norm(st.textContent) !== "PENDENTE") { await voltarConsole(); return { pular: `A OS ${os} não está pendente no OFS${st ? ` (${st.textContent.trim()})` : ""}` }; }

  // 2) so mexe se estiver num balde
  const tecOfs = await espera(tecDaTela, 4000);
  if (!tecOfs) { await voltarConsole(); return { ok: false, erro: `Não consegui ler com quem a OS ${os} está no OFS — não movi` }; }
  if (!ehBalde(tecOfs)) { await voltarConsole(); return { pular: mesmoTec(tecOfs, p.tecnico) ? `Já está com ${tecOfs} no OFS` : `No OFS a OS ${os} está com ${tecOfs} — não mexi` }; }

  // 3) Mover -> tecnico
  const btMover = await espera(() => document.querySelector('a[data-label="move_activity"]'));
  if (!btMover) { await voltarConsole(); return { ok: false, erro: "Não achei o botão Mover" }; }
  clicar(btMover);
  const pop = await espera(() => document.querySelector(".ko\\:visuals\\:move-activities"), 15000);
  if (!pop) { await voltarConsole(); return { ok: false, erro: "A janela de Mover não abriu" }; }
  const inp = await espera(() => pop.querySelector("input"), 8000);
  let e = inp, c = null; while (e && !(c = ko.contextFor(e))) e = e.parentElement;
  if (!c || typeof c.$data.searchKey !== "function") { await ignorar(); await voltarConsole(); return { ok: false, erro: "Não consegui usar a busca de técnico do Mover" }; }
  const params = c.$parents.find((o) => o && typeof o.searchAll === "function");
  const nomes = () => [...pop.querySelectorAll(".column-main-info .resource-main-info .resource-name")].map((r) => norm(r.textContent));
  if (params && !params.searchAll()) { params.searchAll(true); await espera(() => nomes().length, 4000); }
  c.$data.searchKey(String(p.tecnico));
  const alvo = norm(p.tecnico);
  const idx = await espera(() => { const l = [...pop.querySelectorAll(".column-main-info .resource-main-info")]; const i = l.findIndex((r) => norm(r.querySelector(".resource-name")?.textContent) === alvo); return i >= 0 ? i + 1 : null; }, 8000);
  if (!idx) { await ignorar(); await voltarConsole(); return { ok: false, erro: `Não achei o técnico "${p.tecnico}" no Mover do OFS (o nome tem que ser igual ao do OFS)` }; }
  const seta = pop.querySelectorAll(".column-field-details .resource-field-details")[idx - 1];
  if (!seta) { await ignorar(); await voltarConsole(); return { ok: false, erro: "Não achei a setinha do técnico" }; }
  clicar(seta);
  const cont = await espera(() => document.querySelector(".ordered-activities-container"));
  if (!cont) { await ignorar(); await voltarConsole(); return { ok: false, erro: "A rota do técnico não abriu" }; }
  { let ant = -1; for (let t = 0; t < 20; t++) { const n = cont.querySelectorAll(".activity-item").length; if (n && n === ant) break; ant = n; await dorme(150); } }
  if ([...document.querySelectorAll(".not-ordered-activities-container .activity-item")].some((x) => x.textContent.includes(`|${os}|`))) {
    await ignorar(); await voltarConsole(); return { ok: false, erro: `A OS ${os} ficaria em "Não ordenado" na rota de ${p.tecnico} — não movi` };
  }
  const itensRota = [...cont.children].filter((x) => x.classList.contains("activity-item"));
  const pos = itensRota.findIndex((x) => x.textContent.includes(`|${os}|`));

  // 4) modo teste: para aqui e clica Ignorar
  if (p.simular) { await dorme(1500); await ignorar(); await voltarConsole(); return { ok: true, aviso: `TESTE (nada foi movido): iria para ${p.tecnico}${pos >= 0 ? `, ${pos + 1}ª de ${itensRota.length} na rota` : ""}` }; }

  // 5) Continuar -> motivo -> Mover
  const btCont = [...document.querySelectorAll("button.button.submit")].find((b) => vis(b) && /Continuar/i.test(b.textContent));
  if (!btCont || btCont.disabled) { await ignorar(); await voltarConsole(); return { ok: false, erro: "Botão Continuar indisponível" }; }
  btCont.click();
  const lb = await espera(() => [...document.querySelectorAll("label.oj-radio-label")].find((l) => vis(l) && /Reordena/i.test(l.textContent)));
  if (!lb) { await ignorar(); await voltarConsole(); return { ok: false, erro: "Não apareceu o motivo de movimentação" }; }
  const rb = document.getElementById(lb.getAttribute("for")); (rb || lb).click();
  const btFimDe = () => [...document.querySelectorAll("button.button.submit, button")].find((b) => vis(b) && /^\s*Mover\s*$/i.test(b.textContent) && !b.disabled);
  const btFim = await espera(btFimDe, 6000);
  if (!btFim) { await ignorar(); await voltarConsole(); return { ok: false, erro: "Botão Mover final não liberou" }; }
  marcarCabVelho();
  btFim.click();
  const aberta = () => [...document.querySelectorAll(".ordered-activities-container, label.oj-radio-label")].some(vis);
  let fechou = await espera(() => !aberta(), 5000);
  if (!fechou) { const b2 = btFimDe(); if (b2) b2.click(); fechou = await espera(() => !aberta(), 12000); }
  if (!fechou) return { ok: false, erro: "Cliquei em Mover, mas a janela não fechou — confira no OFS" };

  // 6) confere pela pesquisa (traz a ordem do zero, ja com o tecnico atualizado)
  await voltarConsole();
  let conferencia = "não consegui abrir a ordem pela pesquisa pra conferir — confira no OFS";
  if (await buscar()) {
    const cc = candidatas().sort((x, y) => (stDe(y) === "pending") - (stDe(x) === "pending"));
    if (cc.length) {
      document.querySelectorAll('[data-label="astatus"]').forEach((x) => { x.dataset.jhVelho = "1"; });
      clicar(cc[0].querySelector(".activity-title") || cc[0]);
      const t0 = Date.now();
      await espera(() => [...document.querySelectorAll('[data-label="astatus"]')].some((x) => x.offsetParent && (!x.dataset.jhVelho || Date.now() - t0 > 3000)) && tecDaTela(), 12000);
      const t = await espera(() => { const n = tecDaTela(); return n && mesmoTec(n, p.tecnico) ? n : null; }, 8000) || tecDaTela();
      conferencia = !t ? "não consegui ler o técnico na tela da ordem — confira no OFS" : mesmoTec(t, p.tecnico) ? `conferido no OFS: está com ${t}` : `no OFS aparece com ${t}, não com ${p.tecnico} — confira`;
    }
  }
  await voltarConsole();
  return { ok: true, conferencia };
}
