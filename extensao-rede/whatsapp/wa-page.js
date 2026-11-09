/* JH · WhatsApp 0.5.0 (05/11) — ponte no MUNDO DA PÁGINA (world MAIN, document_start).
   Base nova pra não travar: em vez de vasculhar a tela (MutationObserver/varreduras), pergunta direto pros módulos
   internos do WhatsApp Web (window.require: WAWebChatCollection, WAWebCmd, WAWebWidFactory…). Escrito do zero —
   técnica conhecida (mesma ideia da biblioteca aberta WA-JS). Não envia mensagem, não mexe na segurança do WhatsApp,
   não fala com servidor nenhum: só responde ao content script da extensão (wa.js) por eventos no document, com JSON.
   Eventos: "jhwa:req" {id, acao, args} → "jhwa:res" {id, ok, res|erro} · "jhwa:chat" (conversa aberta mudou) ·
   "jhwa:pronto" (módulos achados). Se o WhatsApp mudar o nome de algum módulo, cada função tenta alternativas e,
   se nada servir, devolve erro — o wa.js então usa o jeito antigo (busca) como plano B. */
(function () {
  if (window.__jhwa) return;
  window.__jhwa = true;
  const req = (n) => { try { return typeof window.require === "function" ? window.require(n) : null; } catch (_) { return null; } };
  const emitir = (nome, obj) => document.dispatchEvent(new CustomEvent(nome, { detail: JSON.stringify(obj || {}) }));

  const colecao = () => { const m = req("WAWebChatCollection"); return m && (m.ChatCollection || m.default || m); };
  const pronto = () => { const c = colecao(); return !!(c && (typeof c.getActive === "function" || Array.isArray(c.models) || typeof c.find === "function")); };

  // telefone (só dígitos, com DDI) de uma conversa individual; grupo/canal → ""
  function telDe(chat) {
    try {
      const id = chat && chat.id; if (!id) return "";
      const srv = id.server || String(id._serialized || "").split("@")[1] || "";
      if (srv === "c.us" || srv === "s.whatsapp.net") return String(id.user || "").replace(/\D/g, "");
      if (srv === "lid") { // contas migradas pro LID: o telefone fica no contato
        const pn = (chat.contact && (chat.contact.phoneNumber || chat.contact.__x_phoneNumber)) || chat.__x_phoneNumber || null;
        if (pn) return String(pn.user || String(pn._serialized || "").split("@")[0] || "").replace(/\D/g, "");
      }
    } catch (_) {}
    return "";
  }
  function ativa() {
    const c = colecao(); if (!c) return null;
    try { if (typeof c.getActive === "function") return c.getActive() || null; } catch (_) {}
    try { const ms = c.models || c._models || []; return ms.find((x) => x && (x.active || x.__x_active)) || null; } catch (_) {}
    return null;
  }
  function resumo(chat) {
    if (!chat) return { tel: "", nome: "", grupo: false, id: "" };
    const id = String((chat.id && chat.id._serialized) || "");
    const nome = chat.formattedTitle || chat.__x_formattedTitle || chat.name || (chat.contact && (chat.contact.name || chat.contact.pushname)) || "";
    return { id, tel: telDe(chat), nome: String(nome || ""), grupo: /@g\.us$/.test(id) };
  }

  // avisa o content script quando a conversa aberta muda — evento da coleção quando existir; senão uma checagem
  // barata (só compara o id da conversa ativa, nada de DOM) a cada 700 ms
  let ULT = null;
  function talvezMudou() { const r = resumo(ativa()); if (r.id !== ULT) { ULT = r.id; emitir("jhwa:chat", r); } }
  function ligarVigia() {
    const c = colecao();
    let comEvento = false;
    try { if (c && typeof c.on === "function") { c.on("change:active", () => setTimeout(talvezMudou, 0)); comEvento = true; } } catch (_) {}
    setInterval(talvezMudou, comEvento ? 3000 : 700);
    talvezMudou();
  }

  // abrir a conversa de um número SEM recarregar a página e sem usar a caixa de busca
  async function abrirChat(tel) {
    const d = String(tel || "").replace(/\D/g, ""); if (d.length < 10) throw new Error("número inválido");
    const num = d.length <= 11 ? "55" + d : d;
    const WF = req("WAWebWidFactory"); if (!WF || typeof WF.createWid !== "function") throw new Error("sem WidFactory");
    let wid = WF.createWid(num + "@c.us");
    // 05/11: pergunta pro WhatsApp se o número existe ANTES de abrir — sem WhatsApp → avisa, não recarrega a página.
    // Se a consulta não estiver disponível nessa versão do WA, segue sem ela.
    const QE = req("WAWebQueryExistsJob");
    for (const f of ["queryWidExists", "queryExists", "queryPhoneExists"]) {
      if (!QE || typeof QE[f] !== "function") continue;
      let r; try { r = await QE[f](wid); } catch (_) { continue; }
      if (r === null || r === false || (r && r.wid === null)) throw new Error("sem_whatsapp");
      if (r && r.wid) wid = r.wid; // o WA devolve o número certo (ex.: com/sem o 9)
      break;
    }
    let chat = null;
    const FC = req("WAWebFindChatAction");
    for (const f of ["findOrCreateLatestChat", "findOrCreateChat", "findChat"]) {
      if (chat || !FC || typeof FC[f] !== "function") continue;
      try { const r = await FC[f](wid); chat = (r && (r.chat || r)) || null; } catch (_) {}
    }
    if (!chat) { const c = colecao(); try { chat = (c && (c.get ? c.get(wid) : null)) || null; } catch (_) {} }
    if (!chat) throw new Error("conversa não encontrada");
    const CM = req("WAWebCmd"), Cmd = CM && (CM.Cmd || CM.default || CM);
    if (!Cmd) throw new Error("sem Cmd");
    for (const f of ["openChatBottom", "openChatAt", "openChatFromUnread"]) {
      if (typeof Cmd[f] !== "function") continue;
      for (const arg of [{ chat }, chat]) { try { await Cmd[f](arg); if (resumo(ativa()).id === String(chat.id && chat.id._serialized)) return resumo(chat); } catch (_) {} }
    }
    await new Promise((r) => setTimeout(r, 400));
    if (resumo(ativa()).id === String(chat.id && chat.id._serialized)) return resumo(chat);
    throw new Error("não abriu");
  }

  // 0.9.2: online dos clientes — usa a "presença" que o próprio WhatsApp mantém por conversa (a mesma que mostra
  // "online" no topo). Inscreve só os números pedidos (no máx. 25, os da tela) e avisa quando mudar.
  const VIG = new Set();
  const estaOnline = (p) => { try { const cs = p.chatstate || p.__x_chatstate; const tp = cs && (cs.type || cs.__x_type); return !!(p.isOnline || p.__x_isOnline || tp === "available" || tp === "typing" || tp === "recording"); } catch (_) { return false; } };
  // 0.10.0: contatos migrados pro "LID" não acham a conversa pelo número@c.us — procura também pelo telefone do contato
  const k8 = (d) => { d = String(d || "").replace(/\D/g, ""); if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); return d.length < 10 ? "" : d.slice(0, 2) + d.slice(-8); };
  let MAPA = null, MAPA_EM = 0;
  function chatPorTel(C, WF, num) {
    try { const c = C.get(WF.createWid(num + "@c.us")); if (c) return c; } catch (_) {}
    if (!MAPA || Date.now() - MAPA_EM > 60000) {
      MAPA = new Map(); MAPA_EM = Date.now();
      let ms = []; try { ms = typeof C.getModelsArray === "function" ? C.getModelsArray() : C.models || C._models || []; } catch (_) {}
      for (const ch of ms) { const k = k8(telDe(ch)); if (k && !MAPA.has(k)) MAPA.set(k, ch); }
    }
    return MAPA.get(k8(num)) || null;
  }
  function presencaDe(chat) {
    let p = null; try { p = chat.presence || chat.__x_presence || null; } catch (_) {}
    if (p) return p;
    try { const PM = req("WAWebPresenceCollection"), col = PM && (PM.PresenceCollection || PM.default || PM); if (col) p = (col.get && col.get(chat.id)) || (col.gadd && col.gadd(chat.id)) || (col.find && col.find(chat.id)) || null; } catch (_) {}
    return p && typeof p.then !== "function" ? p : null;
  }
  async function presenca(tels) {
    const WF = req("WAWebWidFactory"), C = colecao(), out = {};
    if (!WF || !C) return out;
    for (const t of (tels || []).slice(0, 25)) {
      const d = String(t || "").replace(/\D/g, ""); if (d.length < 10) continue;
      const num = d.length <= 11 ? "55" + d : d;
      const chat = chatPorTel(C, WF, num);
      if (!chat) continue;
      const p = presencaDe(chat);
      if (!p) continue;
      const id = String(chat.id && chat.id._serialized);
      if (!VIG.has(id)) {
        VIG.add(id);
        try { if (typeof p.subscribe === "function") await p.subscribe(); } catch (_) {}
        try { if (typeof p.on === "function") { let ult = estaOnline(p); const av = () => { const o = estaOnline(p); if (o !== ult) { ult = o; emitir("jhwa:online", { tel: num, on: o }); } }; p.on("change", av); const cs = p.chatstate || p.__x_chatstate; if (cs && typeof cs.on === "function") cs.on("change", av); } } catch (_) {}
      }
      out[num] = estaOnline(p);
    }
    return out;
  }

  // 0.12.0: "✓ conversou HH:MM" na Minha fila — última mensagem que EU mandei hoje pra cada número (só as já carregadas)
  function conversei(tels) {
    const WF = req("WAWebWidFactory"), C = colecao(), out = {}; if (!WF || !C) return out;
    const ini = new Date(); ini.setHours(0, 0, 0, 0); const desde = ini.getTime() / 1000;
    for (const t of (tels || []).slice(0, 40)) {
      const d = String(t || "").replace(/\D/g, ""); if (d.length < 10) continue;
      const chat = chatPorTel(C, WF, d.length <= 11 ? "55" + d : d); if (!chat) continue;
      let ms = []; try { const m = chat.msgs || chat.__x_msgs; ms = m ? (typeof m.getModelsArray === "function" ? m.getModelsArray() : m.models || m._models || []) : []; } catch (_) {}
      let ult = 0; for (const m of ms) { try { const eu = m.id && (m.id.fromMe || (m.__x_id && m.__x_id.fromMe)); const ts = +(m.t || m.__x_t || 0); if (eu && ts >= desde && ts > ult) ult = ts; } catch (_) {} }
      if (ult) out[t] = ult * 1000;
    }
    return out;
  }

  const ACOES = {
    conversei: async (a) => conversei(a && a.tels),
    presenca: async (a) => presenca(a && a.tels),
    ativa: async () => resumo(ativa()),
    abrir: async (a) => abrirChat(a && a.tel),
    meuNumero: async () => { try { const m = req("WAWebUserPrefsMeUser"); const w = m && (m.getMaybeMeUser ? m.getMaybeMeUser() : m.getMeUser ? m.getMeUser() : null); return String((w && w.user) || ""); } catch (_) { return ""; } },
  };
  document.addEventListener("jhwa:req", async (e) => {
    let p; try { p = JSON.parse(e.detail || "{}"); } catch (_) { return; }
    if (!p || !p.id || !ACOES[p.acao]) return;
    try { emitir("jhwa:res", { id: p.id, ok: true, res: await ACOES[p.acao](p.args || {}) }); }
    catch (err) { emitir("jhwa:res", { id: p.id, ok: false, erro: String((err && err.message) || err) }); }
  });

  // espera o WhatsApp carregar os módulos (até 3 min), depois liga o vigia
  let n = 0;
  const t = setInterval(() => {
    n++;
    if (pronto()) { clearInterval(t); emitir("jhwa:pronto", { ok: true }); ligarVigia(); }
    else if (n > 360) { clearInterval(t); emitir("jhwa:pronto", { ok: false }); }
  }, 500);
})();
