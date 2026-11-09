/* JH RedeFlow 1.5.0 (09/11/2026): modulo de WhatsApp Web trazido da extensao JH Telecom 2.1.1 (JH Agendamentos).
   Na Rede ficam: temas e modo escuro, tela de carregamento, privacidade (desfocar), agendar mensagem, mensagens
   agendadas, respostas rapidas, conversar sem contato e o visual enxuto. Ficam DESLIGADOS (dependem do site do
   JH Agendamentos aberto): painel do cliente, Minha fila, nome do cliente na lista e a faixa de mensagens prontas
   de agendamento. Preferencias (respostas rapidas) ficam no proprio Chrome (chrome.storage). */
/* JH · WhatsApp 0.5.0 (05/11, etapa 1 do docs/plano-whatsapp.md): base nova sem varrer a tela — a conversa aberta
   vem da ponte wa-page.js (módulos internos do WhatsApp); botão JH no topo da lista com o menu de ferramentas e
   "Conversar sem contato". Saíram (travavam): nomes/filtros na lista, mini cartão no hover, vigia da lista.
   (texto antigo:) JH · WhatsApp (teste). No WhatsApp Web: painel do JH Agendamentos à direita, nome do cliente no lugar do número,
   filtros e "Minha fila", mensagens prontas (só PREENCHEM — a atendente revisa e aperta Enter; nada é enviado sozinho).
   Tudo vem da aba do JH Agendamentos aberta (sem banco, sem login). 0.3.0 (03/11): visual limpo (cinza/branco, cor só
   no crítico), efeitos discretos, ligação só com ícone, "Abrir no sistema" na aba já aberta, Minha fila. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const br = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
  const brCurta = (iso) => (iso ? String(iso).slice(8, 10) + "/" + String(iso).slice(5, 7) : "—");
  const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "");
  const nomeBonito = (n) => String(n || "").trim().split(/\s+/).map((w, i) => (i && /^(da|de|do|das|dos|e)$/i.test(w) ? w.toLowerCase() : cap(w))).join(" ");
  const primeiroNome = (n) => cap(String(n || "").trim().split(/\s+/)[0] || "");
  const nomeCurto = (n) => { const p = String(n || "").trim().split(/\s+/).filter((w) => !/^(da|de|do|das|dos|e)$/i.test(w)); return p.length > 1 ? `${cap(p[0])} ${cap(p[1])}` : cap(p[0] || ""); };
  const chaveTel = (d) => { d = String(d || "").replace(/\D/g, ""); if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); return d.length < 10 ? "" : d.slice(0, 2) + d.slice(-8); };
  const fmtNum = (d) => { d = String(d || "").replace(/\D/g, ""); if (d.startsWith("55") && d.length >= 12) d = d.slice(2); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; };
  const send = (msg) => new Promise((ok) => { try { chrome.runtime.sendMessage({ ...msg, wa: true }, (r) => ok(chrome.runtime.lastError ? null : r)); } catch (_) { ok(null); } });

  let OPC = { faixa: false, nomesLista: false, priv: false, tema: true, painel: false, enxuto: true, mini: false, flut: true, pos: null, escuro: null, grupos: "JH,Reparo,Ativação,Ativacao,Escritório,CARD,Supervisor,Rede" };
  const aplicarOpc = () => {
    const h = document.documentElement;
    h.classList.toggle("jh-tema", !!OPC.tema);
    // 05/11: flutuante (padrão) não espreme o WhatsApp — a conversa usa a tela toda
    h.classList.toggle("jh-com-painel", !OPC.flut && !!OPC.painel && !OPC.mini);
    h.classList.toggle("jh-com-mini", !OPC.flut && !!OPC.painel && !!OPC.mini);
    h.classList.toggle("jh-enxuto", !!OPC.enxuto);
    const pv = OPC.pv || (OPC.priv ? { rec: true, nom: true, fot: true, chat: true } : {});
    for (const k of ["rec", "nom", "fot", "chat"]) h.classList.toggle("jh-pv-" + k, !!pv[k]);
    if (PAINEL) { PAINEL.style.display = OPC.painel ? "" : "none"; PAINEL.classList.toggle("mini", !!OPC.mini); PAINEL.classList.toggle("flut", !!OPC.flut); posicionar(); }
    aplicarEscuro();
    barraMensagens();
  };
  const SO_AGENDAMENTOS = { faixa: false, nomesLista: false, painel: false };
  const salvar = (mud) => { OPC = { ...OPC, ...mud, ...SO_AGENDAMENTOS }; chrome.storage.local.set({ opcoes: OPC }); aplicarOpc(); };
  chrome.storage.local.get("opcoes").then(({ opcoes }) => { OPC = { ...OPC, ...(opcoes || {}), ...SO_AGENDAMENTOS }; aplicarOpc(); });
  chrome.storage.onChanged.addListener((c) => { if (c.opcoes) { OPC = { ...OPC, ...(c.opcoes.newValue || {}), ...SO_AGENDAMENTOS }; aplicarOpc(); } });
  function aplicarEscuro() { const te = document.documentElement.dataset.jhTemaEscuro, alvo = te ? te === "1" : OPC.escuro; if ((alvo === true || alvo === false) && document.body.classList.contains("dark") !== alvo) document.body.classList.toggle("dark", alvo); } // 0.8.0: tema escolhido manda
  const escuroAgora = () => document.body.classList.contains("dark");

  const IC = {
    lua: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    att: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/></svg>',
    fechar: '<svg viewBox="0 0 24 24"><path d="M13 5l7 7-7 7M4 5l7 7-7 7"/></svg>',
    abrir: '<svg viewBox="0 0 24 24"><path d="M11 5l-7 7 7 7M20 5l-7 7 7 7"/></svg>',
    ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  };

  let PAINEL = null, ATUAL = { tel: "", c: null }, ABA = "cliente";
  // ---------- 05/11: painel flutuante (arrasta pela barra de cima; recolhido vira uma bolinha com o resumo) ----------
  function posicionar() {
    if (!PAINEL || !OPC.flut) { if (PAINEL) { PAINEL.style.left = ""; PAINEL.style.top = ""; } return; }
    const w = PAINEL.offsetWidth || 350, h = PAINEL.offsetHeight || 60;
    const p = OPC.pos || { x: innerWidth - 380, y: 84 };
    const x = Math.max(8, Math.min(innerWidth - w - 8, p.x)), y = Math.max(8, Math.min(innerHeight - Math.min(h, 120) - 8, p.y));
    PAINEL.style.left = x + "px"; PAINEL.style.top = y + "px";
  }
  addEventListener("resize", () => posicionar());
  function arrastavel(alca, aoClicar) {
    alca.addEventListener("mousedown", (e) => {
      if (!OPC.flut || e.button !== 0 || e.target.closest("button:not(.jh-mini-sit), input, a")) return;
      const r = PAINEL.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, x0 = e.clientX, y0 = e.clientY;
      let mexeu = false;
      const mv = (ev) => { if (!mexeu && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return; mexeu = true; PAINEL.classList.add("arrastando");
        PAINEL.style.left = Math.max(8, Math.min(innerWidth - PAINEL.offsetWidth - 8, ev.clientX - dx)) + "px"; PAINEL.style.top = Math.max(8, Math.min(innerHeight - 60, ev.clientY - dy)) + "px"; };
      const up = () => { removeEventListener("mousemove", mv, true); removeEventListener("mouseup", up, true); PAINEL.classList.remove("arrastando");
        if (mexeu) salvar({ pos: { x: parseInt(PAINEL.style.left), y: parseInt(PAINEL.style.top) } }); else if (aoClicar) aoClicar(); };
      addEventListener("mousemove", mv, true); addEventListener("mouseup", up, true); e.preventDefault();
    });
  }
  function criarPainel() {
    if (PAINEL && document.body.contains(PAINEL)) return;
    PAINEL = document.createElement("aside");
    PAINEL.id = "jh-painel";
    PAINEL.innerHTML = `
      <div class="jh-h"><span class="jh-marca" title="Abrir">JH</span><span class="jh-tt">JH Agendamentos</span><span class="jh-ct" id="jh-ct"></span>
        <button class="jh-ib" data-a="att" title="Atualizar">${IC.att}</button><button class="jh-ib" data-a="mini" title="Recolher">${IC.fechar}</button></div>
      <div class="jh-abas"><button data-aba="cliente" class="on">Cliente</button><button data-aba="fila">Minha fila <span id="jh-nfila"></span></button><button data-aba="campo">Campo hoje <span id="jh-ncampo"></span></button></div>
      <div class="jh-b" id="jh-b"></div>
      <div class="jh-mini-sit" id="jh-mini-sit" title="Abrir o painel">${IC.abrir}<span id="jh-mini-txt"></span></div>
      <div class="jh-toast" id="jh-toast"></div>`;
    document.body.appendChild(PAINEL);
    PAINEL.querySelector('[data-a="att"]').onclick = async () => { esqueleto(); await send({ tipo: "atualizar" }); NOMES_EM = 0; ultimaChave = ""; ULT_TIT = "\u0000"; if (ABA === "fila") minhaFila(); };
    PAINEL.querySelector('[data-a="mini"]').onclick = () => salvar({ mini: true });
    PAINEL.querySelector(".jh-marca").onclick = () => { if (OPC.mini) salvar({ mini: false }); };
    // flutuante: arrasta pela barra; a bolinha (recolhido) arrasta e, num clique, abre de novo
    arrastavel(PAINEL.querySelector(".jh-h"));
    const bol = PAINEL.querySelector("#jh-mini-sit"); arrastavel(bol, () => salvar({ mini: false }));
    bol.onclick = () => { if (!OPC.flut) salvar({ mini: false }); };
    PAINEL.querySelectorAll(".jh-abas button").forEach((b) => (b.onclick = () => trocarAba(b.dataset.aba)));
    vazio("Abra uma conversa.");
    aplicarOpc();
  }
  function trocarAba(a) {
    if (ABA !== a) { const cx = document.getElementById("jh-b"); if (cx && ABA === "fila") FILA_SCROLL = cx.scrollTop; if (cx && ABA === "campo") CAMPO_SCROLL = cx.scrollTop; }
    ABA = a;
    PAINEL.querySelectorAll(".jh-abas button").forEach((b) => b.classList.toggle("on", b.dataset.aba === a));
    if (a === "fila") minhaFila(); else if (a === "campo") campoHoje(); else if (ULTIMO_R) desenhar(ULTIMO_R);
    else { vazio("Abra uma conversa."); ultimaChave = "\u0000"; pagina("ativa").then(conversaMudou, () => {}); }
    barraMensagens();
  }
  const corpo = (html) => { const b = document.getElementById("jh-b"); if (!b) return; b.innerHTML = `<div class="jh-in">${html}</div>`; };
  const vazio = (txt) => corpo(`<div class="jh-vazio">${txt}</div>`);
  const esqueleto = () => corpo(`<div class="jh-sk"><i style="width:70%;height:18px"></i><i style="width:45%"></i><i style="width:60%;margin-top:18px"></i><i></i><i></i><i style="width:80%"></i><i style="margin-top:18px"></i><i></i><i style="width:55%"></i></div>`);
  function toast(txt) { if (!PAINEL || !OPC.painel || OPC.mini || PAINEL.style.display === "none") return toastG(txt); const t = document.getElementById("jh-toast"); if (!t) return; t.textContent = txt; t.classList.remove("on"); void t.offsetWidth; t.classList.add("on"); }

  function telefoneAberto() {
    const main = document.getElementById("main"); if (!main) return "";
    const el = main.querySelector('[data-id*="@c.us"]'); const m = el && (el.getAttribute("data-id") || "").match(/(\d{10,15})@c\.us/); if (m) return m[1];
    const tit = main.querySelector("header [data-jh-tel]")?.getAttribute("data-jh-tel") || main.querySelector("header span[dir='auto']")?.textContent || "";
    const t = tit.replace(/\D/g, ""); return t.length >= 10 ? t : "";
  }
  const tituloAberto = () => document.querySelector("#main header span[dir='auto']")?.textContent?.trim() || "";

  const ehQuebra = (c) => ["Confirmado", "Revertido"].includes(c.status) && c.data_confirmada && c.data_confirmada < hojeIso();
  function situacao(c) {
    if (ehQuebra(c)) return { txt: "Quebra", crit: true, det: `${c.status.toLowerCase()} p/ ${brCurta(c.data_confirmada)}, não atendido` };
    if (c.status === "Confirmado") return { txt: "Confirmado", det: `p/ ${brCurta(c.data_confirmada)}${c.atendente_nome ? " · " + primeiroNome(c.atendente_nome) : ""}` };
    if (c.status) return { txt: c.status, det: `${brCurta(c.atualizado_em)}${c.atendente_nome ? " · " + primeiroNome(c.atendente_nome) : ""}` };
    return { txt: "Sem status", det: "ainda não tratado" };
  }
  function prazo(c) {
    const ab = new Date(String(c.abertura).replace(" ", "T")); if (isNaN(ab)) return null;
    const h = /ATIVA|ENDERE/i.test(c.fila || "") ? 48 : 24, idade = (Date.now() - ab) / 3600e3, p = Math.min(1, idade / h);
    return { h, idade, p, venc: idade > h, perto: !(idade > h) && p > 0.75, txt: idade > h ? `venceu há ${Math.floor(idade - h)}h` : `faltam ${Math.ceil(h - idade)}h` };
  }
  // etiqueta de status igual às filas do sistema (mesmos nomes e cores; Confirmado/Revertido vencido = QUEBRA)
  const stBadge = (x) => { const s = x.quebra ? "QUEBRA" : x.status || ""; const cls = s ? "s-" + s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-") : "gray"; return `<span class="jh-st ${cls}">${esc(s || "Sem status")}</span>`; };
  const linha = (k, v) => `<div class="jh-row"><span>${k}</span><b>${v}</b></div>`;

  let ULTIMO_R = null;
  function desenhar(r) {
    ULTIMO_R = r;
    const ct = document.getElementById("jh-ct");
    if (ABA !== "cliente") return;
    if (!r) return vazio("Sem resposta da extensão. Recarregue a página (F5).");
    if (r.semSite) { if (ct) ct.textContent = ""; return vazio(`Abra o <b>JH Agendamentos</b> numa aba deste navegador — o painel usa os dados que o site já carregou.<br><a class="jh-lk" href="https://agendamentos-jh.vercel.app/" target="_blank" rel="noopener">Abrir o sistema</a>`); }
    if (!r.ok) return vazio(esc(r.erro || "Erro"));
    const c = r.chamado;
    ATUAL.c = c; ATUAL.site = r.site || null; ATUAL.atendente = r.atendente;
    miniSit(c); barraMensagens();
    if (ct) ct.textContent = c ? `contrato ${c.contrato}` : "";
    if (!c) return vazio(`Esse telefone não está no backlog de hoje.<br><span class="jh-mu">${esc(fmtNum(ATUAL.tel))}</span>`);
    const st = situacao(c), pz = prazo(c), site = r.site || {}, l = site.campo;
    const sinal = site.sinal ? `${esc(site.sinal.rotulo || site.sinal.status)}${site.sinal.rx != null ? ` · ${String(site.sinal.rx).replace(".", ",")} dBm` : ""}` : "";
    const sinalCrit = site.sinal && /critical|loss|los|down|power/i.test(site.sinal.status);
    const campoHtml = l
      ? linha("Técnico", esc(nomeBonito(l.tecnico) || "—")) + linha("Status", `<em class="${/n[aã]o conclu/i.test(l.status) ? "jh-crit" : ""}">${esc(l.status || "—")}</em>`)
        + linha("Período", `${esc(l.periodo || "—")}${l.posRota ? ` · ${l.posRota}ª de ${l.rotaTotal || "?"}` : ""}${l.inicio ? ` · iniciou ${esc(String(l.inicio).slice(-5))}` : ""}`)
        + (l.posRota ? `<div class="jh-rota">${Array.from({ length: Math.min(l.rotaTotal || l.posRota, 14) }, (_, i) => `<i class="${i + 1 < l.posRota ? "f" : i + 1 === l.posRota ? "a" : ""}"></i>`).join("")}</div>` : "")
        + (l.endereco ? linha("Endereço", esc(l.endereco)) : "")
      : `<div class="jh-mu jh-pad">${site.ok === false ? "Abra o JH Agendamentos numa aba pra ver o campo." : site.temCampo ? "Não está na planilha de campo de hoje." : "O sistema ainda está lendo a planilha de campo."}</div>`;
    const abert = String(c.abertura || "");
    // 05/11 (0.9.0): junção dos modelos A + B — cartão do prazo em cima, etiquetas, 4 blocos, campo hoje
    const ini = nomeCurto(c.cliente).split(" ").map((w) => w[0] || "").join("").slice(0, 2).toUpperCase() || "?";
    const tempo = pz ? (pz.venc ? `${Math.floor(pz.idade - pz.h)}h` : (() => { const m = Math.max(0, Math.round((pz.h - pz.idade) * 60)); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}min` : `${m}min`; })()) : "";
    const chips = [
      st.crit ? `<span class="jh-chip c-crit">${esc(st.txt)}</span>` : "",
      site.rep ? `<span class="jh-chip c-crit">${esc(site.rep)}${site.max ? " · " + esc(site.max) : ""}</span>` : "",
      c.data_confirmada && !st.crit ? `<span class="jh-chip c-ac">Confirmado p/ ${brCurta(c.data_confirmada)}</span>` : "",
      st.det && !st.crit ? `<span class="jh-chip">${esc(st.det)}</span>` : "",
    ].join("");
    const bloco = (k, v, cls = "") => `<div><small>${k}</small><b class="${cls}">${v}</b></div>`;
    corpo(`
      <div class="jh-hero ${pz ? (pz.venc ? "venc" : pz.perto ? "perto" : "") : ""}">
        <div class="jh-hero-a"><span class="jh-av">${esc(ini)}</span><div><b>${esc(nomeBonito(c.cliente) || "—")}</b><small>${esc(cap(c.fila || ""))} · ${esc(nomeBonito(c.bairro) || "—")}</small></div></div>
        <div class="jh-hero-r"><div class="jh-big">${pz ? `${tempo}<span>${pz.venc ? "vencida" : "pra vencer"}</span>` : "<span>sem prazo</span>"}</div><span class="jh-hst">${esc(st.txt)}</span></div>
        ${pz ? `<div class="jh-pg"><i style="--w:${Math.round(pz.p * 100)}%"></i></div>` : ""}
      </div>
      ${chips ? `<div class="jh-chips2">${chips}</div>` : ""}
      <div class="jh-blocos">
        ${bloco("OS", `<span class="jh-cp" data-cp="${esc(c.numero_os || "")}" title="Copiar">${esc(c.numero_os || "—")}</span>`)}
        ${bloco("Contrato", `<span class="jh-cp" data-cp="${esc(c.contrato)}" title="Copiar">${esc(c.contrato)}</span>`)}
        ${bloco("Agenda", `${brCurta(c.data_agendamento)}${l && l.periodo ? " · " + esc(cap(l.periodo)) : ""}`)}
        ${sinal ? bloco("Sinal", sinal, sinalCrit ? "jh-crit" : "") : bloco("Abertura", `${brCurta(abert)} ${esc(abert.slice(11, 16))}`)}
      </div>
      <div class="jh-sec"><div class="jh-k">Campo hoje</div>${campoHtml}</div>
      ${(r.outras || []).length ? `<div class="jh-sec"><div class="jh-k">Outras OS abertas</div>${r.outras.map((o) => linha(esc(cap(o.fila || "—")), `OS ${esc(o.os || "—")}${o.status ? " · " + esc(o.status) : ""}`)).join("")}</div>` : ""}
      ${(r.telefones || []).length ? `<div class="jh-sec"><div class="jh-k">Contato alternativo</div>${r.telefones.map((t) => `<button class="jh-tel" data-tel="${esc(t.k)}"><span>${esc(t.txt)}</span><em>abrir conversa</em></button>`).join("")}</div>` : ""}
      ${c.observacao ? `<div class="jh-sec"><div class="jh-k">Observação</div><details class="jh-obs"><summary>${esc(String(c.observacao).split("\n")[0].slice(0, 80))}</summary><div>${esc(c.observacao)}</div></details></div>` : ""}
      <div class="jh-bts"><button class="jh-cpos" data-cp="${esc(c.numero_os || "")}">Copiar OS</button><button class="jh-abrir" id="jh-abrir">Abrir no sistema ${IC.ext}</button></div>`);
    const cpos = document.querySelector("#jh-b .jh-cpos"); if (cpos) cpos.onclick = () => { if (cpos.dataset.cp) { navigator.clipboard.writeText(cpos.dataset.cp); toast("OS copiada"); } };
    document.querySelectorAll("#jh-b .jh-cp").forEach((e) => (e.onclick = () => { if (e.dataset.cp) { navigator.clipboard.writeText(e.dataset.cp); toast("Copiado"); } }));
    document.querySelectorAll("#jh-b .jh-tel").forEach((b) => (b.onclick = () => { const k = b.dataset.tel; abrirConversa(`${k.slice(0, 2)}9${k.slice(2)}`); }));
    const ab = document.getElementById("jh-abrir"); if (ab) ab.onclick = () => send({ tipo: "abrirSistema", chave: c.chave });
  }
  function miniSit(c) {
    const el = document.getElementById("jh-mini-txt"); if (!el) return;
    const st = c ? situacao(c) : null;
    el.innerHTML = c ? `<b>${esc(nomeCurto(c.cliente))}</b><em class="${st.crit ? "jh-crit" : ""}">${esc(st.txt)}${c.numero_os ? " · OS " + esc(c.numero_os) : ""}</em>` : ATUAL.tel ? `<em>fora do backlog</em>` : `<em>abra uma conversa</em>`;
  }


  // ---------- abrir conversa SEM recarregar (03/11) ----------
  // 1º pela caixa "Pesquisar" do WhatsApp; 2º o truque do usuário: manda o número na conversa "Você" e clica em
  // "Conversar com…"; 3º (último recurso) o link que recarrega a página.
  const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
  const esperar = async (fn, ms = 3000) => { const fim = Date.now() + ms; while (Date.now() < fim) { const v = fn(); if (v) return v; await dorme(150); } return null; };
  function clicar(el) {
    if (!el) return;
    const r = el.getBoundingClientRect(), xy = { clientX: r.left + Math.min(40, r.width / 2), clientY: r.top + r.height / 2 };
    const ops = { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, ...xy };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...ops, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mousedown", ops));
    el.dispatchEvent(new PointerEvent("pointerup", { ...ops, buttons: 0, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { ...ops, buttons: 0 }));
    el.dispatchEvent(new MouseEvent("click", { ...ops, buttons: 0 }));
  }
  function escrever(box, txt) {
    box.focus();
    if (box.isContentEditable) { document.execCommand("selectAll", false, null); document.execCommand("insertText", false, txt); }
    else { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(box, txt); box.dispatchEvent(new Event("input", { bubbles: true })); }
  }
  const caixaBusca = () => document.querySelector('#side [contenteditable="true"], #side input[type="text"], #side input[role="textbox"], #side [role="textbox"]');
  function limparBusca() {
    const box = caixaBusca(); if (!box) return;
    escrever(box, "");
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
  }
  async function pesquisarEAbrir(dig, achar) {
    const box = caixaBusca(); if (!box) return false;
    const antes = document.getElementById("main"), fim8 = dig.slice(-8);
    escrever(box, dig);
    // 03/11: o resultado da pesquisa aparece numa lista própria (fora do #pane-side) — procura em todo o lado esquerdo
    const linhas = () => [...document.querySelectorAll('#side [role="listitem"], #side [role="row"], #side [role="option"], #pane-side [role="listitem"], #pane-side [role="row"], [aria-label*="esultado"] [role="listitem"], [aria-label*="esultado"] [role="row"]')]
      .filter((r) => r.querySelector("span[title]") && !r.closest("#main, #jh-painel"));
    const row = await esperar(() => {
      const l = linhas();
      return (achar && l.find(achar)) || l.find((r) => (r.querySelector("span[title]").getAttribute("title") || "").replace(/\D/g, "").endsWith(fim8))
        || l.find((r) => (r.textContent || "").replace(/\D/g, "").includes(fim8)) || (l.length === 1 ? l[0] : null);
    }, 3000);
    // 03/11: o clique simulado nem sempre abria — tenta Enter na pesquisa (abre o 1º resultado) e, se não, clica no
    // nome do contato, depois na linha
    // abriu = trocou a área da conversa OU o título do topo (o WhatsApp às vezes reaproveita o #main)
    const titAntes = tituloAberto();
    const mudou = () => { const m = document.getElementById("main"); return m && (m !== antes || tituloAberto() !== titAntes); };
    let abriu = null;
    if (row) {
      const ehPrimeiro = linhas()[0] === row;
      if (ehPrimeiro) { box.focus(); for (const t of ["keydown", "keyup"]) box.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true })); abriu = await esperar(mudou, 900); }
      // 03/11 (estrutura que o usuário mandou): quem abre a conversa é o bloco com tabindex="0" e aria-selected dentro da
      // linha — foca nele e aperta Enter; depois clica nele, no "cell-frame-container" e no nome
      const foco = row.querySelector('[tabindex="0"][aria-selected]') || [...row.querySelectorAll('[tabindex="0"]')].pop();
      if (!abriu && foco) { foco.focus(); for (const t of ["keydown", "keyup"]) foco.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true })); abriu = await esperar(mudou, 900); }
      for (const alvo of [foco, row.querySelector('[data-testid="cell-frame-container"]'), row.querySelector('[data-testid="cell-frame-title"]'), row.querySelector("span[title]")]) {
        if (abriu || !alvo) continue;
        clicar(alvo); abriu = await esperar(mudou, 900);
      }
    }
    limparBusca();
    return !!abriu;
  }
  function meuNumero() {
    try { for (const k of ["last-wid-md", "last-wid"]) { const v = String(localStorage.getItem(k) || "").replace(/"/g, ""); const m = v.match(/^(\d{10,15})/); if (m) return m[1]; } } catch (_) {}
    return "";
  }
  async function viaVoce(dig) {
    const eu = meuNumero(); if (!eu) return false;
    // a sua própria conversa aparece como "Seu nome (você)" / "Mensagem para você mesmo" — acha por isso no resultado
    const ehVoce = (r) => /\((voc[eê]|you)\)|mensagem para voc[eê]|message yourself/i.test(r.textContent || "");
    if (!(await pesquisarEAbrir(eu.replace(/^55/, ""), ehVoce)) && !(await pesquisarEAbrir("você", ehVoce))) return false;
    const cx = await esperar(() => document.querySelector('#main footer div[contenteditable="true"]'), 3000); if (!cx) return false;
    escrever(cx, dig);
    await dorme(200);
    const env = document.querySelector('#main footer button[aria-label="Enviar"], #main footer [data-icon="send"], #main footer [data-icon="wds-ic-send-filled"]');
    if (env) clicar(env.closest("button") || env); else cx.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    const lk = await esperar(() => { const m = [...document.querySelectorAll("#main [data-id]")].pop(); return m && [...m.querySelectorAll("a, [role='button'], span")].reverse().find((e) => e.textContent.replace(/\D/g, "") === dig && (e.tagName === "A" || e.getAttribute("role") === "button" || getComputedStyle(e).cursor === "pointer")); }, 5000);
    if (!lk) return false;
    clicar(lk);
    const it = await esperar(() => [...document.querySelectorAll("li, [role='button'], [role='menuitem'], div, span")].find((e) => /^Conversar com/i.test(e.textContent.trim()) && e.offsetParent && e.children.length <= 3), 3000);
    if (!it) return false;
    clicar(it.closest("li, [role='button'], [role='menuitem']") || it);
    return true;
  }
  async function abrirConversa(num) {
    let d = String(num || "").replace(/\D/g, ""); if (!d) return toast("Sem telefone no cadastro");
    const local = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
    toast("Abrindo conversa…");
    // 0.5.0: direto pelo WhatsApp por dentro (sem busca, sem recarregar); se não der, os jeitos antigos
    // 05/11: sem busca, sem "Você" e SEM recarregar (o wa.me recarregava o WhatsApp só pra dizer que o número não existe)
    try { await pagina("abrir", { tel: local }); return true; }
    catch (e) {
      if (/sem_whatsapp/.test(e.message)) toast(`O número ${fmtNum(local)} não tem WhatsApp`);
      else toast("Não consegui abrir essa conversa — tente pelo Conversar sem contato");
      return false;
    }
  }

  // ---------- 0.12.0: MINHA FILA nova + aba CAMPO HOJE (mesmo visual) ----------
  // Os dados vêm de 1 pedido só (minhaFila, com o status do OFS da planilha que o site já leu); filtros/busca são locais.
  let FILA_DADOS = null, FILA_EM = 0, FILA_SCROLL = 0, CAMPO_SCROLL = 0, FILA_ULT = "", FILA_F = "todos", FILA_Q = "", CAMPO_F = "todos", CONV = {}, CONV_EM = 0, FILA_ON_EM = 0;
  const caixaB = () => document.getElementById("jh-b");
  const semAc = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const iniciais = (n) => nomeCurto(n).split(" ").map((w) => w[0] || "").join("").slice(0, 2).toUpperCase() || "?";
  const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const stSlug = (st) => String(st).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "-");
  const ofsTipo = (s) => (/n[aã]o\s*conclu/i.test(s) ? "nc" : /conclu/i.test(s) ? "ok" : /rota|desloc|caminho|inici|execu|andamento/i.test(s) ? "rota" : "pen");
  const ofsRot = { nc: "Não concluída", ok: "Concluída", rota: "Em rota", pen: "Pendente" };
  const horaDe = (t) => { const m = String(t || "").match(/(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : ""; };
  function stDe(x) { return x.quebra ? "Quebra" : x.status || "Sem status"; }
  function prazoDe(x) {
    const h = /ATIVA|ENDERE/i.test(x.fila || "") ? 48 : 24, venc = x.resta < 0, p = Math.max(0, Math.min(1, 1 - x.resta / (h * 3600e3)));
    const hoje = x.vence && new Date(x.vence).toDateString() === new Date().toDateString();
    const amanha = x.vence && new Date(x.vence).toDateString() === new Date(Date.now() + 864e5).toDateString();
    const r = Math.abs(x.resta), txt = venc ? `+${Math.floor(r / 3600e3)}h` : r < 3600e3 ? `${Math.max(1, Math.round(r / 6e4))}min` : `${Math.floor(r / 3600e3)}h`;
    const sub = x.quebra ? (x.conf ? `confirmado ${brCurta(x.conf)}` : "") : venc ? "" : x.vence ? (hoje ? `até ${hhmm(x.vence)}` : amanha ? `amanhã ${hhmm(x.vence)}` : `${brCurta(new Date(x.vence).toISOString())} ${hhmm(x.vence)}`) : "";
    return { txt, sub, p, venc, hoje: !venc && hoje, cor: venc ? "crit" : hoje ? "alt" : "mu" };
  }
  async function dadosFila(forcar) {
    if (!forcar && FILA_DADOS && Date.now() - FILA_EM < 20000) return FILA_DADOS;
    const r = await send({ tipo: "minhaFila" }); FILA_EM = Date.now(); FILA_DADOS = r;
    const l = (r && r.lista) || [], tels = l.map((x) => x.tel).filter(Boolean).slice(0, 25);
    if (PONTE && tels.length && Date.now() - CONV_EM > 60000) { // "✓ conversou" e online: pergunta pro WhatsApp (ponte), no máx. 1x/min
      CONV_EM = Date.now();
      pagina("conversei", { tels }, 8000).then((c) => { CONV = c || {}; reFila(); }, () => {});
      pagina("presenca", { tels }, 8000).then((o) => { for (const [t, on] of Object.entries(o || {})) ONLINE[chaveTel(t)] = !!on; reFila(); }, () => {});
    }
    return r;
  }
  const reFila = () => { if (ABA === "fila") minhaFila(true); else if (ABA === "campo") campoHoje(true); };
  function itemFila(x) {
    const st = stDe(x), pz = prazoDe(x), on = ONLINE[chaveTel(x.tel)], cv = CONV[x.tel] || CONV[String(x.tel).replace(/^55/, "")];
    const o = x.campo ? ofsTipo(x.campo.status) : "";
    const ofs = x.campo ? `<span class="jh-ofs"><b class="o-${o}">${ofsRot[o]}</b>${esc(primeiroNome(x.campo.tecnico) || "")}${(o === "nc" || o === "ok") && horaDe(x.campo.fim || x.campo.inicio) ? " · " + horaDe(x.campo.fim || x.campo.inicio) : x.campo.posRota ? ` · ${x.campo.posRota}ª de ${x.campo.rotaTotal || "?"}` : ""}</span>` : "";
    return `<button class="jh-f2${FILA_ULT && x.tel === FILA_ULT ? " ult" : ""}" data-tel="${esc(x.tel)}"><span class="jh-f2-av">${esc(iniciais(x.cliente))}${on ? "<i></i>" : ""}</span>
      <span class="jh-f2-tx"><b>${esc(nomeBonito(nomeCurto(x.cliente)))}</b><span class="jh-f2-tg"><i>${esc(filaCurta(x.fila))}</i><i class="s-${stSlug(st)}">${esc(st)}</i></span>${ofs}${cv ? `<span class="jh-f2-cv">✓ conversou ${hhmm(cv)}</span>` : ""}</span>
      <span class="jh-f2-r"><em class="c-${pz.cor}">${pz.txt}</em>${pz.sub ? `<small>${pz.sub}</small>` : ""}<span class="jh-f2-pz"><i class="c-${pz.cor}" style="width:${Math.round(pz.p * 100)}%"></i></span></span></button>`;
  }
  async function minhaFila(soRedesenhar) {
    const r = soRedesenhar ? FILA_DADOS : (FILA_DADOS ? (desenharFila(FILA_DADOS), await dadosFila(true)) : (esqueleto(), await dadosFila(true)));
    if (ABA !== "fila") return;
    desenharFila(r);
  }
  function desenharFila(r) {
    const n = document.getElementById("jh-nfila"), nc = document.getElementById("jh-ncampo");
    if (!r || r.semSite) { if (n) n.textContent = ""; return vazio("Abra o <b>JH Agendamentos</b> numa aba pra ver a sua fila."); }
    const l = r.lista || [];
    if (n) n.textContent = l.length || ""; if (nc) nc.textContent = l.filter((x) => x.campo).length || "";
    if (ABA !== "fila") return;
    if (!l.length) return vazio("Nada reservado pra você hoje.");
    const atn = (x) => x.quebra || (x.campo && ofsTipo(x.campo.status) === "nc");
    const cont = { todos: l.length, quebra: l.filter((x) => x.quebra).length, venc: l.filter((x) => x.resta < 0).length, campo: l.filter((x) => x.campo).length, semst: l.filter((x) => !x.status && !x.quebra).length, msg: l.filter((x) => x.status === "Mensagem" && !x.quebra).length };
    const hojeN = l.filter((x) => prazoDe(x).hoje).length;
    const FL = [["todos", "Todos"], ["quebra", "Quebra"], ["venc", "Vencidas"], ["campo", "Em campo"], ["semst", "Sem status"], ["msg", "Mensagem"]];
    const passa = (x) => (FILA_F === "todos" || (FILA_F === "quebra" && x.quebra) || (FILA_F === "venc" && x.resta < 0) || (FILA_F === "campo" && x.campo) || (FILA_F === "semst" && !x.status && !x.quebra) || (FILA_F === "msg" && x.status === "Mensagem" && !x.quebra))
      && (!FILA_Q || semAc(`${x.cliente} ${x.contrato} ${x.os}`).includes(semAc(FILA_Q)));
    const vis = l.filter(passa), g = { a: [], v: [], h: [], d: [] };
    for (const x of vis) (atn(x) ? g.a : x.resta < 0 ? g.v : prazoDe(x).hoje ? g.h : g.d).push(x);
    const sec = (t, arr) => (arr.length ? `<div class="jh-f2-sec"><span>${t}</span><span>${arr.length}</span></div>${arr.map(itemFila).join("")}` : "");
    const lista = (sec("Precisa de atenção", g.a) + sec("Vencidas", g.v) + sec("Vencem hoje", g.h) + sec("Demais", g.d)) || `<div class="jh-mu jh-pad">Nenhum cliente com esse filtro.</div>`;
    const cx = caixaB(), sc = cx ? cx.scrollTop : 0, ja = !!document.querySelector("#jh-b .jh-f2-lista");
    if (!ja) corpo(`<div class="jh-f2-res"><div><b>${l.length}</b><small>na fila</small></div><div class="c"><b>${cont.quebra}</b><small>quebra</small></div><div class="c"><b>${cont.venc}</b><small>vencidas</small></div><div class="a"><b>${hojeN}</b><small>vencem hoje</small></div></div>
      <label class="jh-f2-bs">${IC2.busca}<input placeholder="Buscar nome, contrato ou OS" value="${esc(FILA_Q)}"></label><div class="jh-f2-flt"></div><div class="jh-f2-lista"></div>`);
    const res = document.querySelector("#jh-b .jh-f2-res"); if (ja && res) res.innerHTML = `<div><b>${l.length}</b><small>na fila</small></div><div class="c"><b>${cont.quebra}</b><small>quebra</small></div><div class="c"><b>${cont.venc}</b><small>vencidas</small></div><div class="a"><b>${hojeN}</b><small>vencem hoje</small></div>`;
    document.querySelector("#jh-b .jh-f2-flt").innerHTML = FL.map(([k, t]) => `<button data-f="${k}" class="${FILA_F === k ? "on" : ""}">${t}<i>${cont[k]}</i></button>`).join("");
    const ls = document.querySelector("#jh-b .jh-f2-lista"); if (ls.innerHTML !== lista) ls.innerHTML = lista;
    document.querySelectorAll("#jh-b .jh-f2-flt [data-f]").forEach((b) => (b.onclick = () => { FILA_F = b.dataset.f; desenharFila(FILA_DADOS); }));
    const inp = document.querySelector("#jh-b .jh-f2-bs input"); if (!ja) inp.oninput = () => { FILA_Q = inp.value; desenharFila(FILA_DADOS); };
    ligarItens("fila");
    if (!ja) requestAnimationFrame(() => { const b2 = caixaB(); if (b2) b2.scrollTop = FILA_SCROLL; }); else if (cx) cx.scrollTop = sc;
  }
  function ligarItens(aba) {
    document.querySelectorAll("#jh-b [data-tel]").forEach((b) => {
      b.onclick = async (e) => {
        const acao = e.target.closest("[data-acao]")?.dataset.acao;
        const cx = caixaB(); if (aba === "fila") FILA_SCROLL = cx ? cx.scrollTop : 0; else CAMPO_SCROLL = cx ? cx.scrollTop : 0;
        FILA_ULT = b.dataset.tel;
        if (!b.dataset.tel) return toast("Esse cliente não tem telefone no backlog");
        if (await abrirConversa(b.dataset.tel)) {
          trocarAba("cliente");
          if (acao === "caminho") { const fim = Date.now() + 5000; const t = setInterval(() => { if (ATUAL.c && document.querySelector('#main footer div[contenteditable="true"]')) { clearInterval(t); usar("caminho"); } else if (Date.now() > fim) clearInterval(t); }, 250); }
        }
      };
    });
  }
  async function campoHoje(soRedesenhar) {
    const r = soRedesenhar ? FILA_DADOS : (FILA_DADOS ? (desenharCampo(FILA_DADOS), await dadosFila(true)) : (esqueleto(), await dadosFila(true)));
    if (ABA !== "campo") return;
    desenharCampo(r);
  }
  function desenharCampo(r) {
    if (!r || r.semSite) return vazio("Abra o <b>JH Agendamentos</b> numa aba pra ver o campo.");
    if (ABA !== "campo") return;
    if (r.temCampo === false) return vazio("O sistema ainda está lendo a planilha de campo. Tente de novo em instantes.");
    const l = (r.lista || []).filter((x) => x.campo).map((x) => ({ ...x, o: ofsTipo(x.campo.status) }));
    const nc = document.getElementById("jh-ncampo"); if (nc) nc.textContent = l.length || "";
    if (!l.length) return vazio("Nenhum cliente da sua fila está na planilha de campo hoje.");
    const ct = { rota: l.filter((x) => x.o === "rota").length, ok: l.filter((x) => x.o === "ok").length, nc: l.filter((x) => x.o === "nc").length };
    const FL = [["todos", "Todos"], ["rota", "Em rota"], ["nc", "Não concluídas"], ["ok", "Concluídas"]];
    const vis = l.filter((x) => CAMPO_F === "todos" || x.o === CAMPO_F || (CAMPO_F === "rota" && x.o === "pen"));
    const it = (x) => {
      const c = x.campo, per = /MANH/i.test(c.periodo) ? "manhã" : /TARDE/i.test(c.periodo) ? "tarde" : "";
      const rota = c.posRota ? `<span class="jh-c2-rota">${Array.from({ length: Math.min(c.rotaTotal || c.posRota, 12) }, (_, i) => `<i class="${i + 1 < c.posRota ? "f" : i + 1 === c.posRota ? "a" : ""}"></i>`).join("")}</span>` : "";
      const dir = x.o === "ok" ? `<em class="o-ok">✓ Concluída</em>${horaDe(c.fim) ? `<small>${horaDe(c.fim)}</small>` : ""}`
        : x.o === "nc" ? `<em class="o-nc">Não concluída</em><span class="jh-c2-bt" data-acao="abrir">Abrir conversa</span>`
        : `<em class="o-rota">${c.posRota ? `${c.posRota}ª de ${c.rotaTotal || "?"}` : ofsRot[x.o]}</em><span class="jh-c2-bt" data-acao="caminho">↪ A caminho</span>`;
      return `<button class="jh-c2 k-${x.o}${FILA_ULT && x.tel === FILA_ULT ? " ult" : ""}" data-tel="${esc(x.tel)}"><span class="jh-c2-st"></span><span class="jh-c2-tx"><b>${esc(nomeBonito(nomeCurto(x.cliente)))}</b><small>${esc(filaCurta(x.fila))} · ${esc(primeiroNome(c.tecnico) || "—")}${per ? " · " + per : ""}</small>${rota}</span><span class="jh-c2-r">${dir}</span></button>`;
    };
    const sec = (t, arr) => (arr.length ? `<div class="jh-f2-sec"><span>${t}</span><span>${arr.length}</span></div>${arr.map(it).join("")}` : "");
    const cx = caixaB(), sc = cx ? cx.scrollTop : 0, ja = !!document.querySelector("#jh-b .jh-c2-lista");
    const resumo = `<div><b>${l.length}</b><small>em campo</small></div><div class="a"><b>${ct.rota}</b><small>em rota</small></div><div class="o"><b>${ct.ok}</b><small>concluídas</small></div><div class="c"><b>${ct.nc}</b><small>não concl.</small></div>`;
    if (!ja) corpo(`<div class="jh-f2-res">${resumo}</div><div class="jh-f2-flt"></div><div class="jh-c2-lista"></div>`); else document.querySelector("#jh-b .jh-f2-res").innerHTML = resumo;
    document.querySelector("#jh-b .jh-f2-flt").innerHTML = FL.map(([k, t]) => `<button data-f="${k}" class="${CAMPO_F === k ? "on" : ""}">${t}</button>`).join("");
    const html = (sec("Precisa de atenção", vis.filter((x) => x.o === "nc")) + sec("Em rota agora", vis.filter((x) => x.o === "rota")) + sec("Pendentes", vis.filter((x) => x.o === "pen")) + sec("Concluídas", vis.filter((x) => x.o === "ok"))) || `<div class="jh-mu jh-pad">Nenhum cliente com esse filtro.</div>`;
    const ls = document.querySelector("#jh-b .jh-c2-lista"); if (ls.innerHTML !== html) ls.innerHTML = html;
    document.querySelectorAll("#jh-b .jh-f2-flt [data-f]").forEach((b) => (b.onclick = () => { CAMPO_F = b.dataset.f; desenharCampo(FILA_DADOS); }));
    ligarItens("campo");
    if (!ja) requestAnimationFrame(() => { const b2 = caixaB(); if (b2) b2.scrollTop = CAMPO_SCROLL; }); else if (cx) cx.scrollTop = sc;
  }
  // atualiza sozinho a cada 2 min enquanto a aba estiver aberta (mesmo ritmo da planilha de campo)
  setInterval(() => { if (!document.hidden && PAINEL && OPC.painel && !OPC.mini && (ABA === "fila" || ABA === "campo")) (ABA === "fila" ? minhaFila : campoHoje)(); }, 120000);

  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };
  const ULT_ALEAT = {};
  function texto(tipo) {
    const c = ATUAL.c || {}, l = ATUAL.site?.campo || {}, nome = primeiroNome(c.cliente), eu = primeiroNome(ATUAL.atendente);
    const fila = String(c.fila || "visita").toLowerCase();
    const perRaw = String(l.periodo || "").toUpperCase(), per = /MANH/.test(perRaw) ? "manhã" : /TARDE/.test(perRaw) ? "tarde" : "";
    const nm = nome ? `, *${nome}*` : "";
    // 05/11 (0.10.0): textos novos (Giga+ Fibra); saíram Confirmar agenda, Reagendar e Protocolo
    if (tipo === "periodo") return `Olá${nm}! 😊 Para agendarmos a sua visita de *${fila}*, qual período fica melhor pra você?\n\n🌅 *Manhã:* das 8h às 12h\n☀️ *Tarde:* das 12h às 18h\n\nÉ só responder *manhã* ou *tarde*.`;
    if (tipo === "manha" || tipo === "tarde") {
      const iso = ATUAL.site?.campo ? hojeIso() : (c.data_confirmada || c.data_agendamento || "");
      const dia = !iso ? "" : iso.slice(0, 10) === hojeIso() ? `hoje (${brCurta(iso)})` : brCurta(iso);
      const faixaH = tipo === "manha" ? "das 8h às 12h" : "das 12h às 18h";
      return `✅ Prontinho${nm}! Sua visita está agendada para *${dia ? dia + ", " : ""}no período da ${tipo === "manha" ? "manhã" : "tarde"}, ${faixaH}*.\n\nPeço que tenha um responsável maior de idade no local.\n\n⚠️ Se o atendimento anterior se estender, pode haver um pequeno atraso, mas faremos o possível para chegar dentro do período. Obrigado pela compreensão!`;
    }
    if (tipo === "caminho") return `Olá${nm}! 😊 Seu atendimento está *programado para hoje* e já está na rota do nosso técnico${per ? `, no período da *${per}*` : ""}.\n\nPeço que tenha alguém maior de idade no local para recebê-lo. Qualquer dúvida, é só chamar por aqui!`;
    if (tipo === "endereco") {
      const ab = nome ? `*${nome}*, para` : "Para";
      const end = l.endereco ? `${l.endereco}${c.bairro ? " – " + nomeBonito(c.bairro) : ""}` : "";
      return end
        ? `${ab} o técnico chegar certinho, pode confirmar o endereço?\n\n📍 *${end}*\n\nEstá correto? Se puder, mande também a *localização fixa* (não em tempo real) e um ponto de referência. 🙏`
        : `${ab} o técnico chegar certinho, pode me passar o endereço completo, com número${c.bairro ? " (bairro " + nomeBonito(c.bairro) + ")" : ""} e um ponto de referência? Se puder, mande também a *localização fixa* (não em tempo real). 🙏`;
    }
    // "Mensagem pro cliente" (mesmos modelos do Remanejamento)
    if (/^mc-/.test(tipo)) {
      let modelo = tipo.slice(3);
      if (modelo === "Aleatório") { // 0.11.0: sorteia entre os 4 e nunca repete o último que saiu nesta conversa
        const ops = ["Conversacional", "Premium", "Direto", "Formal"].filter((x) => x !== ULT_ALEAT[ultimaChave]);
        modelo = ops[Math.floor(Math.random() * ops.length)]; ULT_ALEAT[ultimaChave] = modelo;
      }
      const cli = `*${l.cliente || nomeBonito(c.cliente) || "cliente"}*`, at = `*${l.tipo || c.fila || "visita"}*`, ln = "\n━━━━━━━━━━━━━━\n", sd = saudacao(), at2 = eu;
      const bases = {
        Conversacional: `${sd}, ${cli}! 👋\n\nSou ${at2}, da Giga+ Fibra.\n\nEstou acompanhando seu serviço de ${at}.${ln}`,
        Premium: `${sd}, ${cli}!\n\nMeu nome é ${at2}.\nAcompanho seu serviço de ${at}.${ln}`,
        Direto: `${sd}, ${cli}.\n\n${at2}, da Giga+ Fibra.\nConfirmação do serviço: ${at}${ln}`,
        Formal: `${sd}, ${cli}.\n\nMeu nome é ${at2}.\nContato sobre o serviço de ${at}.${ln}`,
      };
      const me = /ENDERE/i.test(l.tipo || c.fila || "") ? "\nVocê ainda possui o modem instalado atualmente?" : "";
      // 05/11 (0.10.0): sem o endereço (foi pro "Confirmar endereço")
      return (bases[modelo] || bases.Conversacional) + `Terá alguém no local para receber o técnico?${me}\n\n> É necessário um responsável maior de idade no local.`;
    }
    return "";
  }
  // 03/11: escrever com insertText perdia as quebras de linha — agora "cola" o texto (o WhatsApp mantém as linhas);
  // se a colagem não pegar, cai pro jeito antigo
  function colocarTexto(cx, txt) {
    cx.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    try {
      const dt = new DataTransfer(); dt.setData("text/plain", txt);
      cx.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    } catch (_) {}
    setTimeout(() => { if (!cx.innerText.trim()) document.execCommand("insertText", false, txt); }, 80);
  }
  function preencher(tipo, bt) {
    const cx = document.querySelector('#main footer div[contenteditable="true"]');
    if (!cx) return toast("Abra a conversa primeiro");
    colocarTexto(cx, texto(tipo));
    if (bt) { bt.classList.add("ok"); setTimeout(() => bt.classList.remove("ok"), 900); }
  }
  // ---------- corretor rápido (sem IA): abreviações comuns, maiúsculas, espaços e ponto final ----------
  const ABREV = { vc: "você", vcs: "vocês", q: "que", tbm: "também", tb: "também", tmb: "também", pq: "porque", td: "tudo", hj: "hoje", msg: "mensagem", obg: "obrigado", blz: "beleza", "ñ": "não", cmg: "comigo", ctz: "certeza", qnd: "quando", qdo: "quando", mt: "muito", mto: "muito", dps: "depois", agr: "agora", aq: "aqui", oq: "o que", pfv: "por favor", pf: "por favor", vlw: "obrigado", tds: "todos", ngm: "ninguém", qq: "qualquer", fds: "fim de semana", amnh: "amanhã", amn: "amanhã" };
  function corrigir(t) {
    t = t.replace(/[^\S\n]+/g, " ").replace(/ *\n */g, "\n");
    t = t.replace(/(^|[^\p{L}])(\p{L}+)(?=$|[^\p{L}])/gu, (m, a, w) => { const r = ABREV[w.toLowerCase()]; if (!r) return m; return a + (w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase() ? r[0].toUpperCase() + r.slice(1) : r); });
    t = t.replace(/\s+([,.!?;:])/g, "$1").replace(/([,;:])(?=[^\s\d])/g, "$1 ").replace(/([.!?])(?=[^\s\d.!?)"'])/g, "$1 ");
    t = t.replace(/(^|[.!?]\s+|\n)(\p{Ll})/gu, (m, a, l) => a + l.toUpperCase());
    t = t.replace(/ +$/gm, "");
    if (/[\p{L}\d]$/u.test(t.trim())) t = t.trim() + ".";
    return t;
  }
  function corrigirTexto(bt) {
    const cx = document.querySelector('#main footer div[contenteditable="true"]');
    const t = cx ? cx.innerText.replace(/\n$/, "") : "";
    if (!t.trim()) return toast("Digite a mensagem primeiro");
    const novo = corrigir(t);
    if (novo === t) return toast("Já está certinho");
    colocarTexto(cx, novo);
    bt.classList.add("ok"); setTimeout(() => bt.classList.remove("ok"), 900);
  }
  // 05/11 (0.9.0): FAIXA de mensagens prontas em cima da caixa de digitar. Caixinha nossa, por cima (fixed) — não entra
  // na árvore do WhatsApp. Só se reposiciona quando a conversa muda, a janela muda de tamanho ou a caixa de digitar
  // cresce (evento de digitação dentro do rodapé). Dá pra desligar no × ou no menu JH → "Faixa de mensagens".
  const MSGS = { periodo: "Qual período?", manha: "Agendado · manhã", tarde: "Agendado · tarde",
    caminho: "Técnico a caminho", endereco: "Confirmar endereço",
    "mc-Conversacional": "Conversacional", "mc-Premium": "Premium", "mc-Direto": "Direto", "mc-Formal": "Formal", "mc-Aleatório": "Aleatório" };
  const GRUPOS_MSG = [["Agenda", ["periodo", "manha", "tarde"]], ["Campo", ["caminho", "endereco"]], ["Mensagem pro cliente", ["mc-Conversacional", "mc-Premium", "mc-Direto", "mc-Formal", "mc-Aleatório"]]];
  const MAX_FIXAS = 6, FIXAS_PADRAO = ["periodo", "caminho", "endereco"];
  function sugestoes() {
    const c = ATUAL.c, l = ATUAL.site && ATUAL.site.campo, per = String((l && l.periodo) || "").toUpperCase();
    const agPer = /MANH/.test(per) ? "manha" : /TARDE/.test(per) ? "tarde" : null;
    // 0.11.0: só as que a atendente fixou (até 6, salvas no login); sem sugestão automática
    const fixas = (PREFS.faixa_fixas || []).filter((k) => MSGS[k]);
    return { lista: (fixas.length ? fixas : FIXAS_PADRAO).slice(0, MAX_FIXAS), agPer: null, fixas: true };
  }
  let RO_FX = null, FT_OBS = null, rafFx = 0, FX_COR = null;
  // 0.9.2: a faixa usa a mesma cor e o mesmo arredondado da caixa de digitar (lido uma vez por conversa/tema)
  function corFaixa(f, ft) {
    let el = ft.querySelector('[contenteditable="true"]');
    while (el && el !== ft) {
      const cs = getComputedStyle(el), m = cs.backgroundColor.match(/[\d.]+/g);
      if (m && (m[3] == null || +m[3] > 0.5) && parseFloat(cs.borderTopLeftRadius) >= 8) { FX_COR = cs.backgroundColor; f.style.background = `rgba(${m[0]},${m[1]},${m[2]},.93)`; f.style.borderRadius = cs.borderTopLeftRadius; f.style.borderColor = "transparent"; return; }
      el = el.parentElement;
    }
    FX_COR = "-";
  }
  addEventListener("jhtema", () => { FX_COR = null; FT_OBS = null; const f = document.getElementById("jh-faixa"); if (f) { f.style.background = ""; f.style.borderRadius = ""; f.style.borderColor = ""; } posFaixa(); });
  function posFaixa() {
    const f = document.getElementById("jh-faixa"); if (!f || !f.classList.contains("on")) return;
    const ft = document.querySelector("#main footer"); if (!ft) { f.style.display = "none"; return; }
    // 05/11 (0.9.1): segue o tamanho da caixa de digitar (cresce/encolhe ao colar ou apagar texto) — 1 observador só no rodapé
    if (ft !== FT_OBS) { FX_COR = null; try { RO_FX && RO_FX.disconnect(); RO_FX = new ResizeObserver(() => { if (!rafFx) rafFx = requestAnimationFrame(() => { rafFx = 0; posFaixa(); }); }); RO_FX.observe(ft); FT_OBS = ft; } catch (_) {} }
    const r = ft.getBoundingClientRect(); if (!r.width) { f.style.display = "none"; return; }
    if (!FX_COR) corFaixa(f, ft);
    f.style.display = ""; f.style.left = r.left + 12 + "px"; f.style.width = Math.max(240, r.width - 24) + "px"; f.style.bottom = innerHeight - r.top + 4 + "px";
  }
  function fecharMaisMsg() { document.getElementById("jh-faixa-pop")?.remove(); document.removeEventListener("mousedown", foraMais, true); }
  function foraMais(e) { if (!e.target.closest("#jh-faixa-pop, #jh-faixa")) fecharMaisMsg(); }
  // ---------- 0.10.0: preferências por login (respostas rápidas + mensagens fixadas) ----------
  const RESP_PADRAO = [{ txt: "Um momento, verificando", enviar: false }, { txt: "Cliente indo atender", enviar: false }, { txt: "Pode informar", enviar: false }];
  let PREFS = { respostas: RESP_PADRAO, faixa_fixas: [] };
  chrome.storage.local.get("prefsJH").then(({ prefsJH }) => { if (prefsJH) PREFS = { ...PREFS, ...prefsJH }; });
  (async () => { // lê do login 1x ao abrir o WhatsApp (a cópia local cobre internet oscilando)
    const r = await send({ tipo: "prefsLer" });
    if (!r || !r.ok) return;
    const l = r.prefs || {};
    PREFS = { respostas: Array.isArray(l.respostas) && l.respostas.length ? l.respostas : RESP_PADRAO, faixa_fixas: Array.isArray(l.faixa_fixas) ? l.faixa_fixas : [] };
    chrome.storage.local.set({ prefsJH: PREFS }); const f = document.getElementById("jh-faixa"); if (f) f.dataset.k = ""; barraMensagens();
  })();
  async function salvarPrefs(mud) {
    PREFS = { ...PREFS, ...mud }; chrome.storage.local.set({ prefsJH: PREFS });
    const r = await send({ tipo: "prefsSalvar", ...mud });
    if (!r || !r.ok) toast(r && r.semLogin ? "Entre no JH pela extensão pra salvar no seu login" : "Não consegui salvar no login (ficou salvo neste computador)");
    return !!(r && r.ok);
  }
  // mensagens já usadas hoje em cada conversa (✓) — só no navegador, zera no outro dia
  let USADAS = { dia: "", m: {} };
  chrome.storage.local.get("usadasJH").then(({ usadasJH }) => { if (usadasJH && usadasJH.dia === hojeIso()) USADAS = usadasJH; });
  const usadas = () => (USADAS.dia === hojeIso() ? USADAS.m[ultimaChave] || [] : []);
  function marcarUsada(k) {
    if (USADAS.dia !== hojeIso()) USADAS = { dia: hojeIso(), m: {} };
    const l = USADAS.m[ultimaChave] || (USADAS.m[ultimaChave] = []); if (!l.includes(k)) l.push(k);
    chrome.storage.local.set({ usadasJH: USADAS });
    document.querySelectorAll(`#jh-faixa [data-m="${CSS.escape(k)}"], #jh-faixa-pop [data-m="${CSS.escape(k)}"]`).forEach((b) => b.classList.add("usada"));
  }
  const usar = (k, b) => { preencher(k, b); marcarUsada(k); };
  // prévia do texto ao passar o mouse
  function dica(b, k) {
    let t = document.getElementById("jh-fx-tip"); if (!t) { t = document.createElement("div"); t.id = "jh-fx-tip"; document.body.appendChild(t); }
    t.textContent = k === "mc-Aleatório" ? "Sorteia um dos 4 estilos (Conversacional, Premium, Direto ou Formal), sem repetir o último que saiu nesta conversa." : texto(k) || ""; if (!t.textContent) return;
    const r = b.getBoundingClientRect(); t.style.display = "block";
    const w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px"; t.style.top = Math.max(8, r.top - h - 8) + "px";
  }
  const semDica = () => { const t = document.getElementById("jh-fx-tip"); if (t) t.style.display = "none"; };
  function ligarDicas(raiz) { raiz.querySelectorAll("[data-m]").forEach((b) => { b.onmouseenter = () => dica(b, b.dataset.m); b.onmouseleave = semDica; }); }
  const RECOLHIDAS = new Set(); // conversas em que a faixa foi recolhida (até recarregar)

  function maisMsg(f) {
    if (document.getElementById("jh-faixa-pop")) return fecharMaisMsg();
    const p = document.createElement("div"); p.id = "jh-faixa-pop";
    const desenhar = () => {
      const fx = (PREFS.faixa_fixas || []).length ? PREFS.faixa_fixas : FIXAS_PADRAO, agPer = null, us = usadas();
      p.innerHTML = `<div class="jh-fp-h"><b>Mensagens prontas</b><button data-corr title="Corrige a mensagem digitada: vc → você, maiúsculas, pontuação">✓ Corrigir texto</button></div>`
        + `<div class="jh-fp-dica">📌 Fixe até ${MAX_FIXAS} pra aparecerem na faixa · ${fx.length || FIXAS_PADRAO.length}/${MAX_FIXAS}${fx.length ? ` · <a data-limpa>voltar ao padrão</a>` : " (padrão)"}</div>`
        + GRUPOS_MSG.map(([g, ks]) => `<div class="jh-fp-g">${g}</div><div class="jh-fp-c">${ks.map((k) => `<span class="jh-fp-it"><button data-m="${k}" class="${k === agPer ? "sug" : ""}${us.includes(k) ? " usada" : ""}">${esc(MSGS[k])}</button><i data-pin="${k}" class="${fx.includes(k) ? "on" : ""}" title="${fx.includes(k) ? "Desafixar" : "Fixar na faixa"}">📌</i></span>`).join("")}</div>`).join("");
      p.querySelectorAll("[data-m]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); semDica(); usar(b.dataset.m, b); setTimeout(fecharMaisMsg, 250); }));
      p.querySelector("[data-corr]").onclick = (e) => { e.preventDefault(); corrigirTexto(e.currentTarget); };
      p.querySelectorAll("[data-pin]").forEach((i) => (i.onclick = async (e) => {
        e.preventDefault(); const k = i.dataset.pin; let l = [...((PREFS.faixa_fixas || []).length ? PREFS.faixa_fixas : FIXAS_PADRAO)];
        if (l.includes(k)) { l = l.filter((x) => x !== k); if (!l.length) return toast("Deixe pelo menos 1 fixada"); } else { if (l.length >= MAX_FIXAS) return toast(`Já tem ${MAX_FIXAS} fixadas — desafixe uma`); l.push(k); }
        await salvarPrefs({ faixa_fixas: l }); f.dataset.k = ""; barraMensagens(); desenhar();
      }));
      const lp = p.querySelector("[data-limpa]"); if (lp) lp.onclick = async () => { await salvarPrefs({ faixa_fixas: [] }); f.dataset.k = ""; barraMensagens(); desenhar(); };
      ligarDicas(p);
    };
    desenhar();
    const r = f.getBoundingClientRect();
    p.style.left = r.left + "px"; p.style.width = Math.min(440, r.width) + "px"; p.style.bottom = innerHeight - r.top + 6 + "px";
    p.addEventListener("mousedown", (e) => { if (!e.target.closest("a")) e.preventDefault(); });
    document.body.appendChild(p);
    setTimeout(() => document.addEventListener("mousedown", foraMais, true), 0);
  }
  function barraMensagens() {
    PAINEL?.querySelector(".jh-barra")?.remove(); // barra antiga dentro do painel
    let f = document.getElementById("jh-faixa");
    const mostrar = OPC.faixa !== false && !!ATUAL.c && !!document.querySelector("#main footer");
    const rec = RECOLHIDAS.has(ultimaChave);
    document.documentElement.classList.toggle("jh-com-faixa", mostrar && !rec);
    if (!mostrar) { if (f) f.classList.remove("on"); fecharMaisMsg(); semDica(); return; }
    if (!f) {
      f = document.createElement("div"); f.id = "jh-faixa";
      f.addEventListener("mousedown", (e) => e.preventDefault()); // não tira o foco da caixa de digitar
      document.body.appendChild(f);
    }
    const { lista, agPer, fixas } = sugestoes(), us = usadas();
    const chave = lista.join(",") + "|" + agPer + "|" + us.join(",") + "|" + rec;
    if (f.dataset.k !== chave) {
      f.dataset.k = chave;
      f.classList.toggle("rec", rec);
      f.innerHTML = `<button class="jh-fx-mk" data-rec title="${rec ? "Mostrar a faixa nesta conversa" : "Mensagens prontas do JH"}">JH</button>`
        + (rec ? "" : lista.map((k) => `<button data-m="${k}" class="${k === agPer && !fixas ? "sug" : ""}${us.includes(k) ? " usada" : ""}">${esc(MSGS[k])}</button>`).join("")
          + `<button class="jh-fx-ag" data-ag title="Agendar uma mensagem pra esta conversa">⏰ Agendar</button><button class="jh-fx-mais" data-mais>+ mais</button><span class="jh-fx-fim"><button class="jh-fx-x" data-esc title="Recolher só nesta conversa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button><button class="jh-fx-x" data-x title="Desligar a faixa (religa no menu JH)">${IC2.x}</button></span>`);
      f.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { semDica(); usar(b.dataset.m, b); }));
      ligarDicas(f);
      f.querySelector("[data-rec]").onclick = () => { if (RECOLHIDAS.has(ultimaChave)) RECOLHIDAS.delete(ultimaChave); barraMensagens(); };
      if (!rec) {
        f.querySelector("[data-mais]").onclick = () => maisMsg(f);
        f.querySelector("[data-ag]").onclick = () => { fecharMaisMsg(); semDica(); modalAgendar(); };
        f.querySelector("[data-esc]").onclick = () => { RECOLHIDAS.add(ultimaChave); fecharMaisMsg(); semDica(); barraMensagens(); };
        f.querySelector("[data-x]").onclick = () => { salvar({ faixa: false }); toast("Faixa desligada — religue no menu JH"); };
      }
    }
    f.classList.add("on"); posFaixa();
  }
  addEventListener("resize", () => { posFaixa(); fecharMaisMsg(); });
  document.addEventListener("input", (e) => { if (e.target.closest && e.target.closest("#main footer")) setTimeout(posFaixa, 120); }, true); // reserva, caso o observador falhe

  function trocarTitulo() {
    if (!OPC.tema) { document.querySelectorAll(".jh-nome-app").forEach((e) => e.remove()); document.querySelectorAll("[data-jh-titulo]").forEach((e) => e.removeAttribute("data-jh-titulo")); return; }
    if (document.querySelector(".jh-nome-app")) return;
    // 03/11: PESADO antes — varria TODOS os div/span/svg da página (inclusive as mensagens da conversa) lendo o texto
    // de cada um, a cada 10 s. Agora olha só títulos/rótulos do topo, no máx. a cada 30 s, e desiste depois de 5 tentativas
    if (Date.now() - (trocarTitulo.t || 0) < 30000 || (trocarTitulo.n || 0) >= 5) return;
    trocarTitulo.t = Date.now(); trocarTitulo.n = (trocarTitulo.n || 0) + 1;
    const cand = [...document.querySelectorAll('h1, [aria-label="WhatsApp"], [title="WhatsApp"], #side header span, header [data-icon*="wordmark"]')].filter((e) => {
      if (e.closest("#main, #jh-painel, #pane-side")) return false;
      const t = (e.getAttribute("aria-label") || e.getAttribute("title") || (e.childElementCount <= 2 ? e.textContent : "") || "").trim();
      if (t !== "WhatsApp" && !/wordmark/.test(e.getAttribute("data-icon") || "")) return false;
      const r = e.getBoundingClientRect(); return r.width > 40 && r.top < 90 && r.left > 50 && r.left < 600;
    });
    if (!cand.length) return;
    const alvo = cand.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0];
    alvo.setAttribute("data-jh-titulo", "1");
    const n = document.createElement("span"); n.className = "jh-nome-app"; n.textContent = "JH Telecom";
    alvo.parentNode.insertBefore(n, alvo);
    trocarTitulo.n = 0;
  }

  let NOMES = {}, NOMES_EM = 0, FILTRO = "";
  let carregarNomes = async function () {
    if (Date.now() - NOMES_EM < 2 * 60000) return;
    NOMES_EM = Date.now();
    const r = await send({ tipo: "nomes" }); if (r?.ok) NOMES = r.nomes || {};
  }
  const infoTel = (txt) => { const d = String(txt || "").replace(/\D/g, ""); return d.length >= 10 ? NOMES[chaveTel(d)] || null : null; };
  const setAttr = (el, k, v) => { if (v == null) { if (el.hasAttribute(k)) el.removeAttribute(k); } else if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
  function nomesNaLista() {
    const palavras = String(OPC.grupos || "").split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
    for (const row of document.querySelectorAll('#pane-side [role="listitem"], #pane-side [role="row"]')) {
      const sp = row.querySelector("span[title]"); if (!sp) continue;
      const tit = sp.getAttribute("title") || "";
      const inf = /^\+?[\d\s()-]{10,}$/.test(tit) ? infoTel(tit) : null;
      const st = inf ? (inf.sit === "QUEBRA" ? "quebra" : inf.sit === "SEM STATUS" ? "semst" : "bk") : "";
      if (inf && OPC.tema !== false) {
        setAttr(sp, "data-jh-nome", nomeCurto(inf.nome));
        setAttr(sp, "data-jh-num", (st === "quebra" ? "Quebra · " : "") + fmtNum(tit).replace(/^\(\d\d\) /, ""));
        setAttr(sp, "data-jh-q", st === "quebra" ? "1" : null);
        setAttr(sp, "data-jh-tel", tit);
      } else { setAttr(sp, "data-jh-nome", null); setAttr(sp, "data-jh-num", null); setAttr(sp, "data-jh-q", null); }
      setAttr(sp, "data-jh-grupo", !inf && OPC.tema !== false && palavras.some((p) => tit.toLowerCase().includes(p)) ? "1" : null);
      setAttr(row, "data-jh-st", st);
      const fora = !!FILTRO && !(FILTRO === "bk" ? !!st : st === FILTRO);
      if (row.classList.contains("jh-fora-filtro") !== fora) row.classList.toggle("jh-fora-filtro", fora);
    }
    const hs = document.querySelector("#main header span[dir='auto']");
    if (hs) {
      const tel = hs.getAttribute("data-jh-tel") || hs.textContent || "";
      const inf = OPC.tema !== false ? infoTel(tel) : null;
      setAttr(hs, "data-jh-nome2", inf ? `${nomeBonito(inf.nome)}\n${fmtNum(tel)}` : null);
      if (inf) setAttr(hs, "data-jh-tel", tel);
    }
  }
  function filtros() {
    if (!PAINEL) return;
    let box = PAINEL.querySelector(".jh-chips");
    if (!box) {
      box = document.createElement("div"); box.className = "jh-chips";
      box.innerHTML = `<button data-f="bk">Backlog <b></b></button><button data-f="quebra">Quebra <b></b></button><button data-f="semst">Sem status <b></b></button>`;
      box.querySelectorAll("button").forEach((b) => (b.onclick = (e) => { e.preventDefault(); FILTRO = FILTRO === b.dataset.f ? "" : b.dataset.f; atualizarChips(); nomesNaLista(); }));
      PAINEL.insertBefore(box, PAINEL.querySelector("#jh-b"));
    }
    atualizarChips();
  }
  function atualizarChips() {
    const rows = [...document.querySelectorAll("#pane-side [data-jh-st]")].map((r) => r.getAttribute("data-jh-st"));
    const n = { bk: rows.filter(Boolean).length, quebra: rows.filter((s) => s === "quebra").length, semst: rows.filter((s) => s === "semst").length };
    document.querySelectorAll(".jh-chips button").forEach((b) => { if (b.classList.contains("on") !== (FILTRO === b.dataset.f)) b.classList.toggle("on", FILTRO === b.dataset.f); const t = String(n[b.dataset.f] || ""); const e = b.querySelector("b"); if (e.textContent !== t) e.textContent = t; });
  }

  function enxugar() {
    const marcar = (el, sim) => setAttr(el, "data-jh-esc", sim ? "1" : null);
    document.querySelectorAll('[aria-label="Status"], [aria-label="Canais"], [aria-label="Comunidades"]').forEach((el) => {
      let b = el.closest("button, [role='button']") || el;
      if (b.getBoundingClientRect().left >= 80) return;
      while (b.parentElement && b.parentElement.children.length <= 2 && b.parentElement.getBoundingClientRect().width < 90) b = b.parentElement;
      marcar(b, !!OPC.enxuto);
    });
    document.querySelectorAll("#main header button, #main header [role='button']").forEach((b) => {
      const t = `${b.getAttribute("aria-label") || ""} ${b.getAttribute("title") || ""} ${b.textContent || ""}`;
      if (/v[ií]deo|Adicionar [àa] lista/i.test(t)) marcar(b, !!OPC.enxuto);
      else if (/liga|chamada|ligar/i.test(t)) b.querySelectorAll("span").forEach((sp) => { if (!sp.querySelector("svg") && !sp.hasAttribute("data-icon") && sp.textContent.trim()) setAttr(sp, "data-jh-txt", OPC.enxuto ? "1" : null); });
    });
  }

  let ultimaChave = "", ROLANDO = 0, TICK = 0, ULT_MAIN = null, ULT_TIT = "";
  addEventListener("wheel", () => (ROLANDO = Date.now()), { capture: true, passive: true });
  addEventListener("scroll", () => (ROLANDO = Date.now()), { capture: true, passive: true });
  async function checar() {
    if (document.hidden || Date.now() - ROLANDO < 1200) return;
    TICK++;
    criarPainel();
    if (TICK % 2 === 0) { aplicarEscuro(); filtros(); nomesNaLista(); }
    if (TICK % 4 === 0) { trocarTitulo(); carregarNomes(); enxugar(); }
    if (!OPC.painel) return;
    const main = document.getElementById("main"), tit = tituloAberto();
    if (main === ULT_MAIN && tit === ULT_TIT && (ATUAL.tel || TICK % 3)) return;
    ULT_MAIN = main; ULT_TIT = tit;
    const tel = telefoneAberto(), chave = tel || tit;
    if (chave === ultimaChave) return;
    ultimaChave = chave; ATUAL = { tel, c: null }; ULTIMO_R = null;
    miniSit(null); barraMensagens();
    const ct = document.getElementById("jh-ct"); if (ct) ct.textContent = "";
    if (ABA !== "cliente") return;
    if (!main) return vazio("Abra uma conversa.");
    if (!tel) return vazio("Não consegui ver o número dessa conversa.<br><span class=\"jh-mu\">Pode ser um grupo ou um contato com número oculto.</span>");
    esqueleto();
    const r = await send({ tipo: "cliente", tel });
    if (ultimaChave === chave) desenhar(r);
  }
  // ================= 0.5.0 (05/11): base nova — sem varrer a tela =================
  // A conversa aberta vem da ponte no mundo da página (wa-page.js, módulos internos do WhatsApp). Nada de
  // MutationObserver na lista, nada de checagem a cada 1,5 s: o painel só trabalha quando a conversa muda.
  let SEQ = 0; const ESPERA = new Map();
  document.addEventListener("jhwa:res", (e) => { let r; try { r = JSON.parse(e.detail || "{}"); } catch (_) { return; } const f = ESPERA.get(r.id); if (f) { ESPERA.delete(r.id); f(r); } });
  function pagina(acao, args, ms = 6000) {
    return new Promise((ok, falha) => {
      const id = "j" + (++SEQ) + "-" + Date.now();
      const t = setTimeout(() => { ESPERA.delete(id); falha(new Error("sem resposta")); }, ms);
      ESPERA.set(id, (r) => { clearTimeout(t); r.ok ? ok(r.res) : falha(new Error(r.erro || "erro")); });
      document.dispatchEvent(new CustomEvent("jhwa:req", { detail: JSON.stringify({ id, acao, args }) }));
    });
  }
  let PONTE = false;
  async function conversaMudou(r) {
    criarPainel();
    const tel = (r && r.tel) || "", chave = (r && r.id) || "";
    if (chave === ultimaChave) return;
    ultimaChave = chave; ATUAL = { tel, c: null }; ULTIMO_R = null;
    miniSit(null); barraMensagens();
    setTimeout(esconderLista, 400); setTimeout(esconderLista, 1500);
    if (tel) setTimeout(async () => { try { const r = await pagina("presenca", { tels: [tel] }, 6000); for (const [t, on] of Object.entries(r || {})) ONLINE[chaveTel(t)] = !!on; marcarTopoOnline(); } catch (_) {} }, 600);
    const ct = document.getElementById("jh-ct"); if (ct) ct.textContent = "";
    // 05/11: busca o cliente mesmo se a aba aberta for a Minha fila (fica guardado e aparece ao voltar pra Cliente)
    const naAba = OPC.painel && ABA === "cliente";
    if (!chave) return naAba && vazio("Abra uma conversa.");
    if (r.grupo) return naAba && vazio("Isso é um grupo — o painel mostra cliente só em conversa individual.");
    if (!tel) return naAba && vazio("Não consegui ver o número dessa conversa.<br><span class=\"jh-mu\">Pode ser um contato com número oculto.</span>");
    if (naAba) esqueleto();
    const resp = await send({ tipo: "cliente", tel });
    if (ultimaChave === chave) desenhar(resp);
  }
  document.addEventListener("jhwa:chat", (e) => { let r; try { r = JSON.parse(e.detail || "{}"); } catch (_) { return; } PONTE = true; conversaMudou(r); });
  document.addEventListener("jhwa:pronto", (e) => { let r = {}; try { r = JSON.parse(e.detail || "{}"); } catch (_) {} if (r.ok) PONTE = true; });
  // plano B: se a ponte não responder (WhatsApp mudou por dentro), olha só o topo da conversa aberta a cada 2 s
  // (barato: um querySelector no #main, sem tocar na lista)
  setTimeout(() => {
    if (PONTE) return;
    setInterval(() => {
      if (PONTE || document.hidden) return;
      const tel = telefoneAberto(), tit = tituloAberto(), chave = tel || tit;
      if (chave && chave !== ultimaChave) conversaMudou({ id: chave, tel, nome: tit, grupo: false });
    }, 2000);
  }, 25000);
  // painel e botão entram assim que o WhatsApp desenhar a tela; depois só confere se continuam lá (a cada 4 s)
  setInterval(() => { if (document.getElementById("app") && document.querySelector("#side, #pane-side")) { criarPainel(); aplicarEscuro(); botaoJH(); esconderLista(); ligarLista(); carregarNomes(); } }, 4000);

  // ---------- 0.9.2: esconde o botão "Adicionar à lista" do topo da conversa (é do WhatsApp; só some da vista) ----------
  function esconderLista() {
    const h = document.querySelector("#main header"); if (!h) return;
    for (const b of h.querySelectorAll('button, [role="button"]')) {
      const t = (b.getAttribute("aria-label") || b.textContent || "").trim();
      if (/^(adicionar (à|a) lista|add to list)/i.test(t) && b.style.display !== "none") b.style.display = "none";
    }
  }

  // ---------- 0.9.2: NOME DO CLIENTE na lista de conversas + ONLINE ----------
  // Leve: um observador só na lista (#pane-side), que acorda no máximo ~3x por segundo; olha só as linhas que o
  // WhatsApp desenhou (as visíveis, ~20) e pula as que não mudaram. Desliga no menu JH → "Nome do cliente na lista".
  let LISTA_EL = null, LISTA_OBS = null, tLista = 0, NOMES_V = 0, ONLINE = {}, LISTA_MS = 0;
  const _carregar = carregarNomes;
  carregarNomes = async function () { const antes = NOMES; await _carregar(); if (NOMES !== antes) { NOMES_V++; agendarLista(); } };
  function agendarLista() { if (!tLista) tLista = setTimeout(nomesLista, 300); }
  function ligarLista() {
    const el = document.getElementById("pane-side"); if (!el || el === LISTA_EL) return;
    LISTA_OBS && LISTA_OBS.disconnect(); LISTA_EL = el;
    LISTA_OBS = new MutationObserver(agendarLista);
    LISTA_OBS.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["title"] });
    agendarLista();
  }
  const filaCurta = (f) => { const t = String(f || ""); return /ENDERE/i.test(t) ? "Mud. Endereço" : /C[OÔ]MODO/i.test(t) ? "Mud. Cômodo" : /UPGRADE/i.test(t) ? "Upgrade" : /ATIVA/i.test(t) ? "Ativação" : /REPARO/i.test(t) ? "Reparo" : cap(t); };
  function avatarDe(row) { // o quadradinho redondo da foto (com ou sem foto)
    // 0.11.1: só caixa de verdade (div em bloco/flex) — um span "inline" fazia a bolinha cair no canto de cima
    for (const el of row.querySelectorAll("div")) { const w = el.offsetWidth, h = el.offsetHeight; if (w >= 36 && w <= 60 && Math.abs(w - h) <= 2 && getComputedStyle(el).display !== "inline") return el; }
    return null;
  }
  function nomesLista() {
    tLista = 0; const t0 = performance.now(), ligado = OPC.nomesLista !== false, tels = [];
    for (const row of document.querySelectorAll('#pane-side [role="listitem"], #pane-side [role="row"]')) {
      const sp = row.querySelector("span[title]"); if (!sp) continue;
      if (!sp.hasAttribute("data-jh-nm")) sp.setAttribute("data-jh-nm", "");
      const tit = sp.getAttribute("title") || "";
      const inf = ligado && /^\+?[\d\s()-]{10,}$/.test(tit) ? infoTel(tit) : null;
      const on = !!(inf && ONLINE[chaveTel(tit)]);
      const chave = inf ? `${tit}|${NOMES_V}|${on}` : "";
      const temTags = !inf || (sp.nextElementSibling && sp.nextElementSibling.classList.contains("jh-tags"));
      if ((sp.getAttribute("data-jh-k") || "") === chave && temTags) { if (inf) tels.push(tit); continue; }
      setAttr(sp, "data-jh-k", chave || null);
      if (inf) {
        tels.push(tit);
        setAttr(sp, "data-jh-nome", nomeCurto(inf.nome)); setAttr(sp, "data-jh-num", null); setAttr(sp, "data-jh-q", null); setAttr(sp, "data-jh-on", null);
        // 0.11.0: selinhos (serviço + status) logo depois do nome; bolinha verde na foto quando online
        let tg = sp.nextElementSibling && sp.nextElementSibling.classList.contains("jh-tags") ? sp.nextElementSibling : null;
        if (!tg) { tg = document.createElement("span"); tg.className = "jh-tags"; sp.after(tg); }
        const st = inf.sit === "QUEBRA" ? "Quebra" : inf.sit === "SEM STATUS" ? "Sem status" : cap(inf.sit);
        tg.innerHTML = `<i class="jh-tg-f">${esc(filaCurta(inf.fila))}</i><i class="jh-tg-s s-${esc(st.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "-"))}">${esc(st)}</i>`;
        const av = avatarDe(row); if (av) setAttr(av, "data-jh-av-on", on ? "1" : null);
      } else {
        setAttr(sp, "data-jh-nome", null); setAttr(sp, "data-jh-num", null); setAttr(sp, "data-jh-q", null); setAttr(sp, "data-jh-on", null);
        const tg = sp.nextElementSibling && sp.nextElementSibling.classList.contains("jh-tags") ? sp.nextElementSibling : null; if (tg) tg.remove();
        const av = row.querySelector("[data-jh-av-on]"); if (av) av.removeAttribute("data-jh-av-on");
      }
    }
    LISTA_MS = performance.now() - t0; window.__jhListaMs = LISTA_MS; // tempo gasto (pra conferir que é leve)
    pedirOnline(tels);
  }
  // online: pergunta pro WhatsApp (ponte) só dos clientes do backlog que estão na tela, no máximo a cada 30 s
  let ONLINE_EM = 0;
  async function pedirOnline(tels) {
    if (!PONTE || !tels.length || Date.now() - ONLINE_EM < 30000) return;
    ONLINE_EM = Date.now();
    const ds = [...new Set(tels.map((t) => String(t).replace(/\D/g, "")))].slice(0, 25);
    try { const r = await pagina("presenca", { tels: ds }, 8000); let mudou = false; for (const [t, on] of Object.entries(r || {})) { const k = chaveTel(t); if (!!ONLINE[k] !== !!on) { ONLINE[k] = !!on; mudou = true; } } if (mudou) agendarLista(); marcarTopoOnline(); } catch (_) {}
  }
  setInterval(() => { if (!document.hidden && OPC.nomesLista !== false) agendarLista(); }, 31000); // reconfere o online
  document.addEventListener("jhwa:online", (e) => { let r; try { r = JSON.parse(e.detail || "{}"); } catch (_) { return; } const k = chaveTel(r.tel); if (!k || !!ONLINE[k] === !!r.on) return; ONLINE[k] = !!r.on; agendarLista(); marcarTopoOnline(); });
  function marcarTopoOnline() {
    const hs = document.querySelector("#main header span[dir='auto']"); if (!hs) return;
    setAttr(hs, "data-jh-online", ATUAL.tel && ONLINE[chaveTel(ATUAL.tel)] ? "1" : null);
  }



  // ---------- 0.12.0: aviso que aparece mesmo com o painel recolhido/escondido ----------
  function toastG(txt) {
    let t = document.getElementById("jh-toast-g"); if (!t) { t = document.createElement("div"); t.id = "jh-toast-g"; document.body.appendChild(t); }
    t.textContent = txt; t.classList.remove("on"); void t.offsetWidth; t.classList.add("on");
    clearTimeout(toastG.t); toastG.t = setTimeout(() => t.classList.remove("on"), 3200);
  }

  // ---------- 0.12.0: AGENDAR MENSAGEM ----------
  // Fica salvo neste computador (é ele que precisa estar com o WhatsApp aberto). Na hora: abre a conversa pela ponte,
  // escreve e aperta enviar, como a atendente faria. Passou mais de 5 min da hora (WhatsApp fechado) → não envia
  // sozinho: avisa "não saíram" e pergunta.
  let AGS = [], AG_ENVIANDO = false, AG_AVISO = false;
  const salvarAgs = () => { AGS = AGS.filter((a) => a.status !== "env" || Date.now() - (a.enviadaEm || 0) < 2 * 864e5); chrome.storage.local.set({ agendadasJH: AGS }); };
  chrome.storage.local.get("agendadasJH").then(({ agendadasJH }) => { AGS = Array.isArray(agendadasJH) ? agendadasJH : []; setTimeout(checarAgs, 8000); });
  chrome.storage.onChanged.addListener((ch) => { if (ch.agendadasJH && !AG_ENVIANDO) AGS = ch.agendadasJH.newValue || []; });
  const pendentes = () => AGS.filter((a) => a.status === "pend");
  const diaRot = (ms) => { const d = new Date(ms), h = new Date(); const am = new Date(Date.now() + 864e5); return d.toDateString() === h.toDateString() ? "hoje" : d.toDateString() === am.toDateString() ? "amanhã" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };
  function modalAgendar(ed) {
    const tel = ed ? ed.tel : ATUAL.tel;
    if (!tel) return toastG("Abra a conversa de um contato pra agendar");
    const nome = ed ? ed.nome : ATUAL.c ? nomeBonito(nomeCurto(ATUAL.c.cliente)) : tituloAberto() || fmtNum(tel);
    const cx = document.querySelector('#main footer div[contenteditable="true"]');
    let txt = ed ? ed.txt : (cx ? cx.innerText.replace(/\n$/, "").trim() : "");
    const agora = new Date(), dt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, hm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const em = (h, m, dias = 0) => { const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(h, m, 0, 0); return d; };
    const RAP = [["30m", "Daqui 30 min", () => new Date(Date.now() + 30 * 6e4)], ["1h", "Daqui 1h", () => new Date(Date.now() + 60 * 6e4)]];
    if (agora.getHours() < 12) RAP.push(["h13", "Hoje 13h", () => em(13, 0)]); else if (agora.getHours() < 17) RAP.push(["h18", "Hoje 18h", () => em(18, 0)]);
    RAP.push(["a8", "Amanhã 8h", () => em(8, 0, 1)]);
    let quando = ed ? new Date(ed.quando) : RAP[RAP.length - 1][2](), rapSel = ed ? "" : RAP[RAP.length - 1][0];
    fecharModal();
    const m = document.createElement("div"); m.id = "jh-modal";
    m.innerHTML = `<div class="jh-mo jh-ag-mo"><div class="jh-moh"><i>${IC2.rel}</i><div><b>${ed ? "Editar mensagem agendada" : "Agendar mensagem"}</b><small>Para: ${esc(nome)} · ${esc(fmtNum(tel))}</small></div><button class="jh-ib2" data-x title="Fechar">${IC2.x}</button></div>
      <div class="jh-mob"><label class="jh-fl"><span>Mensagem</span><textarea placeholder="Escreva a mensagem" maxlength="4000">${esc(txt)}</textarea></label>
        <div class="jh-fl"><span>Quando</span><div class="jh-ag-rap">${RAP.map(([k, t]) => `<button data-r="${k}">${t}</button>`).join("")}</div></div>
        <div class="jh-ag-dh"><input type="date" class="jht-in"><input type="time" class="jht-in"></div><div class="jh-ag-res"></div></div>
      <div class="jh-mof"><button class="jh-bt2" data-x>Cancelar</button><button class="jh-bt2 pri" data-ok>${ed ? "Salvar" : "Agendar"}</button></div></div>`;
    document.body.appendChild(m);
    const [di, hi] = m.querySelectorAll("input"), ta = m.querySelector("textarea"), res = m.querySelector(".jh-ag-res");
    const mostrar = () => { di.value = dt(quando); hi.value = hm(quando); m.querySelectorAll("[data-r]").forEach((b) => b.classList.toggle("on", b.dataset.r === rapSel));
      const passou = quando.getTime() < Date.now() + 30000;
      res.innerHTML = passou ? `<b class="jh-crit">Esse horário já passou.</b>` : `Sai <b>${diaRot(quando.getTime())}${diaRot(quando.getTime()).length > 5 ? "" : ` (${String(quando.getDate()).padStart(2, "0")}/${String(quando.getMonth() + 1).padStart(2, "0")})`} às ${hm(quando)}</b>. O WhatsApp precisa estar aberto neste computador.`; };
    m.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { rapSel = b.dataset.r; quando = RAP.find((r) => r[0] === rapSel)[2](); mostrar(); }));
    const manual = () => { const [y, mo, d] = di.value.split("-").map(Number), [h, mi] = hi.value.split(":").map(Number); if (y && h >= 0) { quando = new Date(y, mo - 1, d, h, mi || 0); rapSel = ""; mostrar(); } };
    di.onchange = manual; hi.onchange = manual;
    m.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => m.remove()));
    m.querySelector("[data-ok]").onclick = () => {
      const t = ta.value.trim(); if (!t) return ta.focus();
      if (quando.getTime() < Date.now() + 30000) return toastG("Escolha um horário no futuro");
      if (ed) Object.assign(ed, { txt: t, quando: quando.getTime(), status: "pend" }); else AGS.push({ id: "ag" + Date.now(), tel, nome, txt: t, quando: quando.getTime(), status: "pend" });
      salvarAgs(); m.remove();
      if (!ed && cx && cx.innerText.trim() === t) { cx.focus(); document.execCommand("selectAll", false, null); document.execCommand("delete", false, null); }
      toastG(`⏰ Agendada pra ${diaRot(quando.getTime())} às ${hm(quando)}`);
    };
    m.onclick = (e) => { if (e.target === m) m.remove(); };
    mostrar(); ta.focus();
  }
  async function enviarAg(a) {
    if (AG_ENVIANDO) return false; AG_ENVIANDO = true;
    try {
      if (!(await abrirConversa(a.tel))) { a.status = "erro"; salvarAgs(); toastG(`Não consegui abrir a conversa de ${a.nome} pra enviar a agendada`); return false; }
      const cx = await esperar(() => document.querySelector('#main footer div[contenteditable="true"]'), 4000); if (!cx) throw new Error("sem caixa");
      await dorme(500); colocarTexto(cx, a.txt); await dorme(450);
      const bt = document.querySelector('#main footer [data-icon="send"], #main footer [data-icon="wds-ic-send-filled"], #main footer button[aria-label="Enviar"]');
      const b = bt && (bt.closest("button, [role='button']") || bt);
      if (b) b.click(); else cx.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      a.status = "env"; a.enviadaEm = Date.now(); salvarAgs();
      toastG(`✓ Mensagem agendada enviada · ${a.nome} · ${hhmm(a.quando)}`);
      return true;
    } catch (_) { a.status = "erro"; salvarAgs(); toastG(`A mensagem agendada de ${a.nome} não saiu — veja em Mensagens agendadas`); return false; }
    finally { AG_ENVIANDO = false; }
  }
  async function checarAgs() {
    if (AG_ENVIANDO || !PONTE) return;
    const agora = Date.now(); let mudou = false;
    for (const a of AGS) if (a.status === "pend" && a.quando <= agora && agora - a.quando > 5 * 6e4) { a.status = "perdida"; mudou = true; }
    if (mudou) salvarAgs();
    const vez = AGS.find((a) => a.status === "pend" && a.quando <= agora);
    if (vez) await enviarAg(vez);
    const perd = AGS.filter((a) => a.status === "perdida");
    if (perd.length && !AG_AVISO && !document.getElementById("jh-modal")) avisoPerdidas(perd);
  }
  setInterval(checarAgs, 15000);
  function avisoPerdidas(perd) {
    AG_AVISO = true;
    const m = document.createElement("div"); m.id = "jh-modal";
    m.innerHTML = `<div class="jh-mo jh-ag-av"><div class="jh-moh"><i>${IC2.rel}</i><div><b>${perd.length === 1 ? "1 mensagem agendada não saiu" : `${perd.length} mensagens agendadas não saíram`}</b><small>O WhatsApp estava fechado na hora marcada (${perd.map((a) => hhmm(a.quando)).join(", ")}). Nada é enviado atrasado sem você confirmar.</small></div></div>
      <div class="jh-mof"><button class="jh-bt2" data-d>Descartar</button><button class="jh-bt2" data-v>Ver</button><button class="jh-bt2 pri" data-e>Enviar agora</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector("[data-d]").onclick = () => { for (const a of perd) a.status = "descartada"; AGS = AGS.filter((a) => a.status !== "descartada"); salvarAgs(); m.remove(); AG_AVISO = false; };
    m.querySelector("[data-v]").onclick = () => { m.remove(); AG_AVISO = false; modalAgendadas(); };
    m.querySelector("[data-e]").onclick = async () => { m.remove(); for (const a of perd) { await enviarAg(a); await dorme(800); } AG_AVISO = false; };
  }
  function modalAgendadas() {
    fecharModal();
    const m = document.createElement("div"); m.id = "jh-modal";
    const desenhar = () => {
      const hoje = new Date().toDateString(), am = new Date(Date.now() + 864e5).toDateString();
      const ord = [...AGS].sort((a, b) => a.quando - b.quando), pend = ord.filter((a) => a.status === "pend");
      const grupos = [["Não saíram", ord.filter((a) => a.status === "perdida" || a.status === "erro")], ["Hoje", pend.filter((a) => new Date(a.quando).toDateString() === hoje)], ["Amanhã", pend.filter((a) => new Date(a.quando).toDateString() === am)],
        ["Depois", pend.filter((a) => ![hoje, am].includes(new Date(a.quando).toDateString()))], ["Enviadas", ord.filter((a) => a.status === "env").reverse()]];
      const li = (a) => `<div class="jh-ag-li${a.status === "env" ? " env" : ""}" data-id="${a.id}"><div class="h"><b>${hhmm(a.quando)}</b><small>${diaRot(a.quando)}</small></div><div class="t"><b>${esc(a.nome)}</b><small>${esc(a.txt.replace(/\s+/g, " ").slice(0, 90))}</small></div>
        <div class="a">${a.status === "env" ? `<span class="ok">✓ enviada</span>` : `<button data-ed>Editar</button><button data-ja>Enviar já</button><button data-del title="Cancelar">✕</button>`}</div></div>`;
      m.innerHTML = `<div class="jh-mo jh-ag-lista"><div class="jh-moh"><i>${IC2.cal}</i><div><b>Mensagens agendadas</b><small>${pend.length} programada${pend.length === 1 ? "" : "s"} · salvas neste computador</small></div><button class="jh-ib2" data-x title="Fechar">${IC2.x}</button></div>
        <div class="jh-mob">${grupos.filter(([, l]) => l.length).map(([t, l]) => `<div class="jh-pv-sec">${t}</div>${l.map(li).join("")}`).join("") || `<div class="jh-vazio">Nenhuma mensagem agendada.<br><small>Use o ⏰ da faixa ou "Agendar mensagem" no menu JH.</small></div>`}</div>
        <div class="jh-mof"><button class="jh-bt2" data-novo>+ Agendar nesta conversa</button><button class="jh-bt2 pri" data-x>Fechar</button></div></div>`;
      m.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => m.remove()));
      m.querySelector("[data-novo]").onclick = () => modalAgendar();
      m.querySelectorAll(".jh-ag-li").forEach((l) => {
        const a = AGS.find((x) => x.id === l.dataset.id); if (!a) return;
        l.querySelector("[data-ed]")?.addEventListener("click", () => modalAgendar(a));
        l.querySelector("[data-del]")?.addEventListener("click", () => { AGS = AGS.filter((x) => x !== a); salvarAgs(); desenhar(); });
        l.querySelector("[data-ja]")?.addEventListener("click", async () => { m.remove(); await enviarAg(a); });
      });
    };
    desenhar(); m.onclick = (e) => { if (e.target === m) m.remove(); };
    document.body.appendChild(m);
  }

  // ---------- 0.12.1: menus/janelas do WhatsApp abertos → nada nosso fica por cima ----------
  // Depois de um clique ou tecla, confere se abriu menu, janela ou painel de emoji do WhatsApp; enquanto estiver aberto,
  // o WhatsApp sobe pra cima de tudo (faixa e painel flutuante ficam atrás) e confere de novo a cada 0,4 s até fechar.
  const POPUP_SEL = '[role="application"] li, [role="menu"], [role="dialog"], [data-animate-dropdown-item], #expressions-panel-container, [data-testid="emoji-panel"], [data-testid="media-picker"]';
  let POP_ANTES = new Set(); // o que já estava aberto antes do clique não conta (algo fixo do WhatsApp não esconde a faixa pra sempre)
  const popupsVisiveis = () => [...document.querySelectorAll(POPUP_SEL)].filter((el) => !el.closest("#jh-modal, #jh-menu, #jh-painel, #jh-faixa, #jh-faixa-pop") && el.getClientRects().length);
  function popupAberto() { return popupsVisiveis().some((el) => !POP_ANTES.has(el)); }
  let POP_IV = null;
  function conferirPopup() {
    const ab = popupAberto(); document.documentElement.classList.toggle("jh-pop", ab);
    if (ab && !POP_IV) POP_IV = setInterval(() => { if (!popupAberto()) { document.documentElement.classList.remove("jh-pop"); clearInterval(POP_IV); POP_IV = null; } }, 400);
  }
  const agendarPopup = (e) => { if (e.target && e.target.closest && e.target.closest("#jh-modal, #jh-menu, #jh-faixa, #jh-faixa-pop, #jh-painel")) return; if (!POP_IV) POP_ANTES = new Set(popupsVisiveis()); [120, 400].forEach((ms) => setTimeout(conferirPopup, ms)); };
  document.addEventListener("pointerdown", agendarPopup, true);
  document.addEventListener("contextmenu", agendarPopup, true);
  document.addEventListener("keydown", agendarPopup, true);

  // ---------- 0.12.1: o degradê atrás da setinha da mensagem (aparece com o mouse) na cor do balão ----------
  // Procura, só na mensagem embaixo do mouse, qualquer elemento pequeno com degradê e pinta com a cor do próprio balão.
  // 2.1.0: sem piscar — pinta na hora e fica de olho na mensagem embaixo do mouse por 1,5 s; quando o WhatsApp cria o
  // degradê, o observador pinta antes de a tela ser desenhada (o preto não chega a aparecer).
  let GRAD_EL = null, GRAD_OBS = null, GRAD_FIM = 0;
  function pintarGrad(msg) {
    for (const el of msg.querySelectorAll("div, span")) {
      if (el.dataset.jhGrad || el.offsetWidth > 160) continue;
      const bi = getComputedStyle(el).backgroundImage; if (!bi || bi.indexOf("gradient") < 0) continue;
      let p = el.parentElement, cor = "";
      while (p && p !== msg.parentElement) { const bc = getComputedStyle(p).backgroundColor; const m = bc.match(/[\d.]+/g); if (m && (m[3] == null || +m[3] > 0.6)) { cor = bc; break; } p = p.parentElement; }
      if (!cor) continue;
      el.style.setProperty("background-image", `linear-gradient(to right, transparent, ${cor} 45%)`, "important"); el.dataset.jhGrad = "1";
    }
  }
  document.addEventListener("mouseover", (e) => {
    if (!document.documentElement.dataset.jhTema) return;
    const msg = e.target.closest && e.target.closest('#main [role="row"], #main .message-in, #main .message-out'); if (!msg || msg === GRAD_EL) return;
    if (GRAD_OBS) GRAD_OBS.disconnect(); clearTimeout(GRAD_FIM);
    GRAD_EL = msg; pintarGrad(msg);
    GRAD_OBS = new MutationObserver(() => pintarGrad(msg));
    GRAD_OBS.observe(msg, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    GRAD_FIM = setTimeout(() => { if (GRAD_OBS) GRAD_OBS.disconnect(); GRAD_OBS = null; GRAD_EL = null; }, 1500);
  }, true);

  // ---------- 0.12.0: foto/vídeo em tela cheia → painel, faixa e botão saem da frente; voltam ao fechar ----------
  let MIDIA_IV = null;
  function visualizadorAberto() {
    if (document.querySelector('[data-animate-media-viewer], [data-testid="media-viewer"], [data-testid="media-viewer-modal"]')) return true;
    let el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    while (el && el !== document.body) {
      if (el.id === "app" || el.closest("#jh-painel, #jh-modal, #jh-menu, #jh-faixa")) return false;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" && el.offsetWidth >= innerWidth * 0.97 && el.offsetHeight >= innerHeight * 0.95 && el.querySelector("img, video, canvas")) return true;
      el = el.parentElement;
    }
    return false;
  }
  function conferirMidia() {
    const ab = visualizadorAberto();
    document.documentElement.classList.toggle("jh-midia", ab);
    if (ab && !MIDIA_IV) MIDIA_IV = setInterval(() => { if (!visualizadorAberto()) { document.documentElement.classList.remove("jh-midia"); clearInterval(MIDIA_IV); MIDIA_IV = null; } }, 500);
  }
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("#main, #app") && !e.target.closest("#jh-painel, #jh-faixa, #jh-modal")) [250, 700, 1400].forEach((ms) => setTimeout(conferirMidia, ms)); }, true);

  // ---------- 0.10.0: RESPOSTAS RÁPIDAS no menu da mensagem (↩) ----------
  // Quando o menu de uma mensagem abre (seta ou botão direito), copia o item "Responder" do próprio WhatsApp e cria um
  // item pra cada resposta. Clicar: aciona o "Responder" de verdade (cita a mensagem) e escreve o texto; se a resposta
  // estiver marcada "enviar direto", aperta o enviar. Só age quando um menu de mensagem abre — nada fica vigiando.
  function abriuMenuMsg(e) { if (e.target.closest && e.target.closest("#main [role='row'], #main .message-in, #main .message-out, #main [data-id]")) [90, 250, 500].forEach((ms) => setTimeout(injetarResp, ms)); }
  document.addEventListener("pointerdown", abriuMenuMsg, true);
  document.addEventListener("contextmenu", abriuMenuMsg, true);
  function injetarResp() {
    const itens = [...document.querySelectorAll('li, [role="menuitem"], [role="application"] [role="button"]')].filter((el) => el.offsetParent && !el.closest("#jh-menu, #jh-modal, #jh-painel, #jh-faixa"));
    // 0.10.1: só o texto que aparece (os ícones do WhatsApp têm um nome escondido, ex. "reply", que atrapalhava)
    const rot = (el) => textoVisivel(el).trim().replace(/^[^\p{L}]+/u, "");
    const resp = itens.find((el) => /^responder$/i.test(rot(el)));
    if (!resp || !resp.parentElement || resp.parentElement.querySelector("[data-jh-rr]")) return;
    const depois = itens.find((el) => /^responder em particular$/i.test(rot(el)) && el.parentElement === resp.parentElement) || resp;
    let ref = depois;
    (PREFS.respostas || []).filter((r) => r && String(r.txt || "").trim()).slice(0, 12).forEach((r, i) => {
      const cl = resp.cloneNode(true); cl.setAttribute("data-jh-rr", "1"); if (i === 0) cl.classList.add("jh-rr-1");
      cl.removeAttribute("aria-label"); cl.querySelectorAll("[aria-label]").forEach((x) => x.removeAttribute("aria-label"));
      const rotulo = r.txt.trim().length > 34 ? r.txt.trim().slice(0, 33) + "…" : r.txt.trim();
      const tn = noDeTexto(cl, /responder/i);
      if (tn) { tn.nodeValue = tn.nodeValue.replace(/responder/i, rotulo); } else { const sp = document.createElement("span"); sp.textContent = rotulo; cl.appendChild(sp); }
      if (r.enviar) { const tag = document.createElement("span"); tag.className = "jh-rr-env"; tag.textContent = "envia"; (tn && tn.parentNode ? tn.parentNode : cl).appendChild(tag); }
      cl.title = r.txt.trim() + (r.enviar ? "\n(envia direto)" : "");
      cl.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); responderCom(resp, r); }, true);
      ref.after(cl); ref = cl;
    });
    // 0.12.0: "Agendar mensagem" no menu da mensagem
    const ag = resp.cloneNode(true); ag.setAttribute("data-jh-rr", "1"); ag.removeAttribute("aria-label"); ag.querySelectorAll("[aria-label]").forEach((x) => x.removeAttribute("aria-label"));
    const tna = noDeTexto(ag, /responder/i); if (tna) tna.nodeValue = tna.nodeValue.replace(/responder/i, "⏰ Agendar mensagem");
    ag.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); document.body.click(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); setTimeout(() => modalAgendar(), 150); }, true);
    ref.after(ag);
  }
  // texto sem o que fica dentro dos ícones (svg)
  function textoVisivel(el) { let t = ""; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (!n.parentElement || !n.parentElement.closest("svg")) t += n.nodeValue; return t; }
  function noDeTexto(el, re) { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (!(n.parentElement && n.parentElement.closest("svg")) && re.test(n.nodeValue)) return n; return null; }
  function responderCom(itemResponder, r) {
    try { itemResponder.click(); } catch (_) {}
    setTimeout(() => {
      const cx = document.querySelector('#main footer div[contenteditable="true"]'); if (!cx) return toast("Não achei a caixa de digitar");
      colocarTexto(cx, r.txt.trim());
      if (r.enviar) setTimeout(() => {
        const bt = document.querySelector('#main footer [data-icon="send"], #main footer [data-icon="wds-ic-send-filled"], #main footer button[aria-label="Enviar"]');
        const b = bt && (bt.closest("button, [role='button']") || bt);
        if (b) b.click(); else cx.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      }, 300);
    }, 220);
  }
  // janela pra configurar (salva no login)
  function modalRespostas() {
    fecharModal();
    let lista = (PREFS.respostas || RESP_PADRAO).map((r) => ({ txt: r.txt || "", enviar: !!r.enviar }));
    const m = document.createElement("div"); m.id = "jh-modal";
    const desenhar = () => {
      m.innerHTML = `<div class="jh-mo jh-rr-mo">
        <div class="jh-moh"><i>${IC2.msg}</i><div><b>Respostas rápidas</b><small>Aparecem no menu de cada mensagem (a setinha ou o botão direito). Clicou: responde a mensagem com o texto. Fica salvo no seu login.</small></div><button class="jh-ib2" data-x title="Fechar">${IC2.x}</button></div>
        <div class="jh-mob"><div class="jh-rr-lista">${lista.map((r, i) => `<div class="jh-rr-l" draggable="true" data-i="${i}"><span class="jh-rr-ar" title="Arraste pra mudar a ordem">⋮⋮</span><input class="jht-in" data-t="${i}" value="${esc(r.txt)}" placeholder="Texto da resposta" maxlength="300"><label class="jh-rr-ck" title="Envia sozinho, sem precisar apertar Enter"><input type="checkbox" data-e="${i}" ${r.enviar ? "checked" : ""}> enviar direto</label><button class="jh-ib2" data-d="${i}" title="Apagar">${IC2.x}</button></div>`).join("") || '<div class="jh-mu">Nenhuma resposta. Adicione uma.</div>'}</div>
          <div class="jh-rr-acoes"><button class="jh-bt2" data-add>+ Adicionar resposta</button><button class="jh-bt2" data-pad>Voltar às 3 iniciais</button></div></div>
        <div class="jh-mof"><button class="jh-bt2" data-x>Cancelar</button><button class="jh-bt2 pri" data-ok>Salvar</button></div></div>`;
      m.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => m.remove()));
      m.querySelectorAll("[data-t]").forEach((i) => (i.oninput = () => (lista[+i.dataset.t].txt = i.value)));
      m.querySelectorAll("[data-e]").forEach((i) => (i.onchange = () => (lista[+i.dataset.e].enviar = i.checked)));
      m.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { lista.splice(+b.dataset.d, 1); desenhar(); }));
      m.querySelector("[data-add]").onclick = () => { if (lista.length >= 12) return toast("Máximo de 12 respostas"); lista.push({ txt: "", enviar: false }); desenhar(); m.querySelector(`[data-t="${lista.length - 1}"]`)?.focus(); };
      m.querySelector("[data-pad]").onclick = () => { lista = RESP_PADRAO.map((r) => ({ ...r })); desenhar(); };
      let de = -1;
      m.querySelectorAll(".jh-rr-l").forEach((l) => {
        l.ondragstart = (e) => { if (e.target.tagName === "INPUT") return e.preventDefault(); de = +l.dataset.i; l.classList.add("arr"); };
        l.ondragend = () => l.classList.remove("arr");
        l.ondragover = (e) => { e.preventDefault(); l.classList.add("sobre"); };
        l.ondragleave = () => l.classList.remove("sobre");
        l.ondrop = (e) => { e.preventDefault(); const para = +l.dataset.i; if (de < 0 || de === para) return; const [x] = lista.splice(de, 1); lista.splice(para, 0, x); de = -1; desenhar(); };
      });
      m.querySelector("[data-ok]").onclick = async (e) => {
        const limpa = lista.map((r) => ({ txt: String(r.txt || "").trim(), enviar: !!r.enviar })).filter((r) => r.txt);
        e.currentTarget.disabled = true;
        const ok = await salvarPrefs({ respostas: limpa.length ? limpa : RESP_PADRAO });
        m.remove(); if (ok) toast("Respostas salvas no seu login");
      };
    };
    desenhar(); m.onclick = (e) => { if (e.target === m) m.remove(); };
    document.body.appendChild(m);
  }

  // 0.10.2: passar o mouse DESBORRA — marca o item embaixo do mouse (conversa da lista, mensagem, topo, painel) e o
  // CSS tira o desfoque dele. Não depende do :hover (que perdia pras regras de desfoque e pras camadas do WhatsApp).
  let REV = null;
  document.addEventListener("mouseover", (e) => {
    if (!/jh-pv-/.test(document.documentElement.className)) { if (REV) { REV.classList.remove("jh-rev"); REV = null; } return; }
    const alvo = e.target.closest && e.target.closest('#pane-side [role="listitem"], #pane-side [role="row"], #main [role="row"], #main .message-in, #main .message-out, #main header, #jh-painel');
    if (alvo === REV) return;
    if (REV) REV.classList.remove("jh-rev");
    REV = alvo || null; if (REV) REV.classList.add("jh-rev");
  }, true);
  document.addEventListener("mouseleave", () => { if (REV) { REV.classList.remove("jh-rev"); REV = null; } });

  // ---------- 0.10.0: janela de PRIVACIDADE (só visual — desfoca; passar o mouse mostra) ----------
  const PVL = () => [["rec", "Ocultar mensagens recentes", "Desfoca a última mensagem que aparece na lista de conversas", IC2.msg],
    ["nom", "Ocultar nomes dos contatos", "Desfoca os nomes na lista, no topo da conversa e no painel do cliente", IC2.fila],
    ["fot", "Ocultar fotos dos contatos", "Desfoca as fotos de perfil na lista e no topo da conversa", IC2.painel],
    ["chat", "Ocultar mensagens da conversa", "Desfoca todas as mensagens dentro da conversa aberta", IC2.priv]];
  function modalPrivacidade() {
    fecharModal();
    const m = document.createElement("div"); m.id = "jh-modal";
    const desenhar = () => {
      const pv = OPC.pv || {}, n = PVL().filter(([k]) => pv[k]).length;
      m.innerHTML = `<div class="jh-mo jh-pv-mo">
        <div class="jh-moh"><i>${IC2.priv}</i><div><b>Privacidade</b><small>Esconde o que aparece na tela pra quem olha de perto. Passe o mouse em cima pra ver.</small></div><button class="jh-ib2" data-x title="Fechar">${IC2.x}</button></div>
        <div class="jh-mob">
          <div class="jh-pv-sec">Na tela</div>
          <div class="jh-cx">${PVL().map(([k, t, d, ic]) => `<button class="jh-ft" data-pv="${k}"><i>${ic}</i><span><b>${t}</b><small>${d}</small></span><s class="jh-sw${pv[k] ? " on" : ""}"></s></button>`).join("")}</div>
          <div class="jh-pv-sec">Online e confirmação de leitura</div>
          <div class="jh-pv-wa"><div><b>Isso é do próprio WhatsApp</b><small>Esconder o "visto por último e online" e o tique azul fica nas configurações do WhatsApp (quem esconde também deixa de ver o dos outros).</small></div><button class="jh-bt2" data-wa>Abrir privacidade do WhatsApp</button></div>
        </div>
        <div class="jh-mof"><span class="jh-pv-n">${n ? `${n} de 4 ligadas` : "Nada desfocado"}</span><button class="jh-bt2 pri" data-x>Pronto</button></div></div>`;
      m.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => m.remove()));
      m.querySelectorAll("[data-pv]").forEach((b) => (b.onclick = () => { const pv2 = { ...(OPC.pv || {}) }; pv2[b.dataset.pv] = !pv2[b.dataset.pv]; salvar({ pv: pv2, priv: false }); desenhar(); }));
      m.querySelector("[data-wa]").onclick = () => { m.remove(); abrirPrivacidadeWA(); };
    };
    desenhar(); m.onclick = (e) => { if (e.target === m) m.remove(); };
    document.body.appendChild(m);
  }
  async function abrirPrivacidadeWA() {
    const cfg = document.querySelector('[aria-label="Configurações"], [aria-label="Settings"], [data-icon="settings-refreshed"], [data-icon="settings"]');
    const b = cfg && (cfg.closest("button, [role='button']") || cfg);
    if (!b) return toast("Abra: Configurações do WhatsApp → Privacidade");
    b.click();
    const item = await esperar(() => [...document.querySelectorAll("#app [role='button'], #app button, #app div[tabindex]")].find((el) => /^privacidade$/i.test((el.textContent || "").trim().split("\n")[0]) || /^privacidade/i.test(el.getAttribute("aria-label") || "")), 2500);
    if (item) item.click(); else toast("Clique em Privacidade nas configurações do WhatsApp");
  }

  // ---------- botão JH no topo da lista + menu de ferramentas ----------
  const IC2 = {
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/></svg>',
    jh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4v10a4 4 0 0 1-4 4"/><path d="M13 4v16M21 4v16M13 12h8"/></svg>',
    num: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/></svg>',
    painel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>',
    fila: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    tema: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6c0-4.9-4.5-8.6-10-8.6z"/></svg>',
    opc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>',
    priv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    rel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    busca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  };
  function botaoJH() {
    if (document.getElementById("jh-bt")) return;
    const b = document.createElement("button");
    b.id = "jh-bt"; b.type = "button"; b.title = "Ferramentas JH"; b.innerHTML = `<span>JH</span>`;
    b.onclick = (e) => { e.stopPropagation(); abrirMenu(); };
    // ao lado do "Nova conversa" (+) do topo da lista; se não achar, fica flutuando no canto da lista
    const alvo = document.querySelector('#side header [aria-label="Nova conversa"], [aria-label="Nova conversa"], [aria-label="New chat"], [data-icon="new-chat-outline"], [data-icon="plus-rounded"]');
    const bt = alvo && (alvo.closest("button, [role='button']") || alvo);
    // 05/11: ficava empilhado em cima do "+" — sobe até o bloco do "+" que divide a linha com o "⋮" e entra antes dele
    let el = bt;
    while (el && el.parentElement && el.parentElement.querySelectorAll("button, [role='button']").length < 2 && el.parentElement !== document.body) el = el.parentElement;
    if (el && el.parentElement && el.parentElement !== document.body) { b.classList.add("no-topo"); el.parentElement.insertBefore(b, el); }
    else { b.classList.add("flutua"); document.body.appendChild(b); }
  }
  // 0.12.0: JH Ferramentas novo — cards por seção, ajustes juntos (painel Flutuante/Fixo/Oculto, faixa, nomes), rodapé com o login
  const CARDS = [
    { id: "numero", ic: "num", nome: "Conversar sem contato", desc: "Abrir um número sem salvar na agenda" },
    { id: "agendar", ic: "rel", nome: "Agendar mensagem", desc: "Programar pra sair num dia e hora" },
    { id: "agendadas", ic: "cal", nome: "Mensagens agendadas", desc: "Ver, editar ou cancelar", bdg: () => pendentes().length },
    { id: "respostas", ic: "msg", nome: "Respostas rápidas", desc: "As do menu da mensagem (↩)" },
    { id: "priv", ic: "priv", nome: "Privacidade", desc: "Desfocar o que aparece na tela" },
  ];
  const AJUSTES = [
  ];
  function fecharMenu() { document.getElementById("jh-menu")?.remove(); document.getElementById("jh-menu-fd")?.remove(); document.removeEventListener("mousedown", foraMenu, true); }
  function foraMenu(e) { if (!e.target.closest("#jh-menu, #jh-bt, #jh-menu-fd")) fecharMenu(); }
  function abrirMenu() {
    if (document.getElementById("jh-menu")) return fecharMenu();
    const m = document.createElement("div"); m.id = "jh-menu"; m.className = "v2";
    const modo = () => (!OPC.painel ? "oculto" : OPC.flut === false ? "fixo" : "flut");
    const desenhar = (q) => {
      const ok = (t) => !q || semAc(t).includes(q);
      const cs = CARDS.filter((c) => ok(c.nome + " " + c.desc)), temaOk = ok("temas visual cores tema"), painelOk = false, aj = AJUSTES.filter((a) => ok(a.nome + " " + a.desc));
      m.querySelector(".jh-m2-corpo").innerHTML = (cs.length ? `<div class="jh-m2-sec">Atendimento</div><div class="jh-m2-gr">${cs.map((c) => { const n = c.bdg ? c.bdg() : 0; return `<button class="jh-m2-c" data-f="${c.id}"><i>${IC2[c.ic]}</i><b>${esc(c.nome)}</b><small>${esc(c.desc)}</small>${n ? `<em>${n}</em>` : ""}</button>`; }).join("")}</div>` : "")
        + (temaOk || painelOk || aj.length ? `<div class="jh-m2-sec">Visual</div><div class="jh-m2-vis">${temaOk ? `<button class="jh-m2-c tema" data-f="temas"><i>${IC2.tema}</i><b>Temas</b><small>Em uso: <strong>${esc(window.jhTemas ? window.jhTemas.atual() : "—")}</strong></small></button>` : ""}
          <div class="jh-m2-aj">${painelOk ? `<div class="jh-m2-ar"><i>${IC2.painel}</i><span><b>Painel do cliente</b><small>Como ele aparece na tela</small></span><span class="jh-m2-seg">${[["flut", "Flutuante"], ["fixo", "Fixo"], ["oculto", "Oculto"]].map(([k, t]) => `<button data-modo="${k}" class="${modo() === k ? "on" : ""}">${t}</button>`).join("")}</span></div>` : ""}
          ${aj.map((a) => `<button class="jh-m2-ar" data-f="${a.id}"><i>${IC2[a.ic]}</i><span><b>${esc(a.nome)}</b><small>${esc(a.desc)}</small></span><s class="jh-sw${a.liga() ? " on" : ""}"></s></button>`).join("")}</div></div>` : "")
        || '<div class="jh-mu jh-pad">Nada com esse nome.</div>';
      m.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { const f = b.dataset.f; if (f === "faixa" || f === "nomes") { usarFerramenta(f); desenhar(q); } else { fecharMenu(); usarFerramenta(f); } }));
      m.querySelectorAll("[data-modo]").forEach((b) => (b.onclick = () => {
        const k = b.dataset.modo;
        if (k === "oculto") salvar({ painel: false }); else { salvar({ painel: true, flut: k === "flut", mini: false }); ultimaChave = "\u0000"; pagina("ativa").then(conversaMudou, () => {}); }
        desenhar(q);
      }));
    };
    m.innerHTML = `<div class="jh-m2-h"><span class="jh-m2-lg">JH</span><div><b>JH Ferramentas</b><small>Tudo da extensão num lugar só</small></div><button class="jh-ib2" data-x title="Fechar">${IC2.x}</button></div>
      <div class="jh-mb"><label class="jh-busca">${IC2.busca}<input placeholder="Buscar ferramenta ou ajuste" autocomplete="off"><kbd>/</kbd></label></div>
      <div class="jh-m2-corpo"></div>
      <div class="jh-m2-f"><span class="jh-m2-u"><i class="av">?</i><span class="nm">…</span></span><span>Esc fecha · v${chrome.runtime.getManifest().version}</span></div>`;
    const fd = document.createElement("div"); fd.id = "jh-menu-fd"; fd.onclick = fecharMenu; document.body.appendChild(fd);
    document.body.appendChild(m);
    desenhar("");
    const inp = m.querySelector("input"); inp.focus();
    inp.oninput = () => desenhar(semAc(inp.value).trim());
    m.querySelector("[data-x]").onclick = fecharMenu;
    chrome.storage.local.get("sessao").then(({ sessao }) => {
      const u = m.querySelector(".jh-m2-u"); if (!u) return;
      const ok = sessao && sessao.nome && (sessao.expira || 0) > Date.now() - 864e5;
      u.querySelector(".av").textContent = ok ? iniciais(sessao.nome) : "!";
      u.querySelector(".nm").innerHTML = ok ? `${esc(nomeBonito(nomeCurto(sessao.nome)))} · <i class="dot"></i> conectada ao JH` : `<i class="dot off"></i> sem login — entre pela extensão`;
    });
    setTimeout(() => document.addEventListener("mousedown", foraMenu, true), 0);
  }
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { fecharMenu(); fecharModal(); }
    if (e.key === "/" && document.getElementById("jh-menu") && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); document.querySelector("#jh-menu input")?.focus(); }
  }, true);
  function usarFerramenta(f) {
    if (f === "numero") return modalNumero();
    if (f === "fixo") { salvar({ flut: OPC.flut === false, mini: false }); toast(OPC.flut ? "Painel flutuante" : "Painel fixo no canto"); return; }
    if (f === "faixa") { salvar({ faixa: OPC.faixa === false }); toast(OPC.faixa ? "Faixa de mensagens ligada" : "Faixa de mensagens desligada"); return; }
    if (f === "nomes") { salvar({ nomesLista: OPC.nomesLista === false }); NOMES_V++; agendarLista(); toast(OPC.nomesLista ? "Nome do cliente na lista ligado" : "Nome do cliente na lista desligado"); return; }
    if (f === "priv") return modalPrivacidade();
    if (f === "respostas") return modalRespostas();
    if (f === "agendar") return modalAgendar();
    if (f === "agendadas") return modalAgendadas();
    if (f === "temas") { fecharModal(); return window.jhTemas && window.jhTemas.abrir(); }
    if (f === "painel") {
      salvar({ painel: !OPC.painel, mini: false }); toast(OPC.painel ? "Painel ligado" : "Painel desligado");
      if (OPC.painel) { ultimaChave = "\u0000"; pagina("ativa").then(conversaMudou, () => {}); }
      return;
    }
    if (f === "fila") { if (!OPC.painel) salvar({ painel: true, mini: false }); else if (OPC.mini) salvar({ mini: false }); trocarAba("fila"); }
  }

  // ---------- Conversar sem contato ----------
  function fecharModal() { document.getElementById("jh-modal")?.remove(); }
  async function modalNumero() {
    fecharModal();
    const { recentes = [] } = await chrome.storage.local.get("recentes");
    const m = document.createElement("div"); m.id = "jh-modal";
    m.innerHTML = `<div class="jh-mo">
      <div class="jh-moh"><i>${IC2.num}</i><div><b>Conversar sem contato</b><small>Digite o número com DDD. A conversa abre sem o contato entrar na sua agenda.</small></div><button class="jh-ib2" data-x title="Fechar">${IC2.x}</button></div>
      <div class="jh-mob">
        <label class="jh-fl"><span>Número com DDI e DDD</span><span class="jh-tel-in"><select id="jh-ddi"><option value="55">BR +55</option><option value="1">EUA +1</option><option value="351">PT +351</option><option value="54">AR +54</option><option value="595">PY +595</option></select><input id="jh-num" inputmode="tel" placeholder="Digite o número (só números)" autocomplete="off"></span></label>
        <div id="jh-num-cli" class="jh-num-cli"></div>
        <label class="jh-fl"><span>Mensagem (opcional)</span><textarea id="jh-num-msg" rows="3" placeholder="Já deixe a mensagem escrita, se quiser"></textarea></label>
        <div class="jh-rec"><span>Usados recentemente</span><div>${recentes.length ? recentes.map((n) => `<button data-rec="${esc(n)}">${esc(fmtNum(n))}</button>`).join("") : '<small class="jh-mu">Os números que você usar aparecem aqui</small>'}</div></div>
      </div>
      <div class="jh-mof"><button class="jh-bt2" data-x>Cancelar</button><button class="jh-bt2 pri" id="jh-num-ok" disabled>Abrir conversa</button></div></div>`;
    document.body.appendChild(m);
    const num = m.querySelector("#jh-num"), ok = m.querySelector("#jh-num-ok"), ddi = m.querySelector("#jh-ddi"), cli = m.querySelector("#jh-num-cli");
    const digitos = () => num.value.replace(/\D/g, "").replace(new RegExp("^" + ddi.value + "(?=\\d{10,})"), "");
    let tCli = 0;
    const validar = () => {
      const d = digitos(), valido = ddi.value === "55" ? d.length >= 10 && d.length <= 11 : d.length >= 6;
      ok.disabled = !valido;
      clearTimeout(tCli); cli.innerHTML = "";
      if (valido && ddi.value === "55") tCli = setTimeout(async () => {
        const r = await send({ tipo: "cliente", tel: "55" + d });
        if (digitos() !== d) return;
        const c = r && r.chamado;
        cli.innerHTML = c ? `<b>${esc(nomeBonito(c.cliente))}</b> · contrato ${esc(c.contrato)} · ${esc(cap(c.fila || ""))}${c.status ? " · " + esc(c.status) : ""}` : r && r.semSite ? '<span class="jh-mu">Abra o JH Agendamentos pra ver se é cliente do backlog.</span>' : '<span class="jh-mu">Não está no backlog de hoje.</span>';
      }, 350);
    };
    num.oninput = validar; ddi.onchange = validar;
    m.querySelectorAll("[data-rec]").forEach((b) => (b.onclick = () => { const v = b.dataset.rec; ddi.value = v.startsWith("55") ? "55" : ddi.value; num.value = v.startsWith("55") ? v.slice(2) : v; validar(); num.focus(); }));
    m.querySelectorAll("[data-x]").forEach((b) => (b.onclick = fecharModal));
    m.onclick = (e) => { if (e.target === m) fecharModal(); };
    num.onkeydown = (e) => { if (e.key === "Enter" && !ok.disabled) ok.click(); };
    ok.onclick = async () => {
      const d = digitos(), cheio = ddi.value + d, msg = m.querySelector("#jh-num-msg").value;
      ok.disabled = true; ok.textContent = "Abrindo…";
      const nova = [cheio, ...recentes.filter((x) => x !== cheio)].slice(0, 6);
      chrome.storage.local.set({ recentes: nova });
      fecharModal();
      const foi = ddi.value === "55" ? await abrirConversa(cheio) : await pagina("abrir", { tel: cheio }).then(() => true, (e) => { toast(/sem_whatsapp/.test(e.message) ? "Esse número não tem WhatsApp" : "Não consegui abrir essa conversa"); return false; });
      if (!foi) return;
      if (msg.trim()) { const cx = await esperar(() => document.querySelector('#main footer div[contenteditable="true"]'), 6000); if (cx) colocarTexto(cx, msg); }
      return foi;
    };
    setTimeout(() => num.focus(), 50);
  }
})();
