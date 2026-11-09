/* JH · WhatsApp 0.8.0–0.8.1 (05/11, etapa 4 antecipada — docs/plano-whatsapp.md): TEMAS.
   Temas nossos (nomes/cores próprios), WhatsApp Claro/Escuro (= visual normal), "Criar tema"/"Personalizar" (cores +
   imagem de fundo opcional reduzida, salvos em "Meus temas"). Um <style> só, trocado inteiro ao aplicar — nada de
   vigiar a tela. O tema vale também pro painel flutuante, o botão/menu JH e as janelas. Salvo por computador
   (chrome.storage.local "temaJH"). As cores do WhatsApp são sobrepostas pelas variáveis de cor dele + os blocos fixos
   (#side, #main, header, footer, balões .message-in/.message-out); o que escapar a gente ajusta pelo print. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // c: app (fundo de fora da janela), lista, hover, sel, cab (cabeçalhos), card (conversa na lista), borda, fundo (área
  //    da conversa), inB/outB (balões), tx, mu, ln (linhas), inp (caixas), ac/ac2 (destaque/degradê), brilho (sombra da janela)
  const TEMAS = [
    { id: "wa-claro", nome: "WhatsApp Claro", desc: "O visual normal do WhatsApp", cat: "claro", nativo: true, c: { escuro: false, app: "#f0f2f5", lista: "#ffffff", cab: "#f0f2f5", fundo: "#efeae2", inB: "#ffffff", outB: "#d9fdd3", ac: "#00a884", tx: "#111b21" } },
    { id: "wa-escuro", nome: "WhatsApp Escuro", desc: "O visual normal do WhatsApp", cat: "escuro", nativo: true, c: { escuro: true, app: "#0b141a", lista: "#111b21", cab: "#202c33", fundo: "#0b141a", inB: "#202c33", outB: "#005c4b", ac: "#00a884", tx: "#e9edef" } },
    { id: "jh-azul", nome: "JH Azul", desc: "As cores da JH Telecom, claro", cat: "claro", c: { escuro: false,
      app: "radial-gradient(900px 520px at 0% 0%,rgba(37,99,235,.28),transparent 60%),radial-gradient(900px 620px at 100% 100%,rgba(14,165,233,.22),transparent 60%),#dfe7f5",
      lista: "#ffffff", hover: "#f1f5fd", sel: "#e3ecfd", cab: "#ffffff", card: "#f6f8fc", borda: "#e3e9f4", fundo: "#eef3fb", inB: "#ffffff", outB: "#dbe7ff",
      tx: "#0b1324", mu: "#5b6b85", ln: "#e3e9f4", inp: "#f1f5f9", ac: "#2563eb", ac2: "#0ea5e9", brilho: "0 0 0 1px rgba(37,99,235,.18),0 24px 70px rgba(30,64,175,.18)" } },
    { id: "ardosia", nome: "Ardósia", desc: "Cinza-azulado escuro, sóbrio", cat: "escuro", c: { escuro: true,
      app: "radial-gradient(900px 520px at 0% 0%,rgba(100,116,139,.28),transparent 60%),radial-gradient(900px 620px at 100% 100%,rgba(71,85,105,.3),transparent 60%),#060a14",
      lista: "#111827", hover: "#1a2333", sel: "#243046", cab: "#111827", card: "#172031", borda: "#223047", fundo: "#0f172a", inB: "#1e293b", outB: "#475569",
      tx: "#e2e8f0", mu: "#94a3b8", ln: "#223047", inp: "#0f172a", ac: "#64748b", ac2: "#94a3b8", brilho: "0 0 0 1px rgba(148,163,184,.22),0 30px 80px rgba(0,0,0,.6)" } },
    { id: "neon", nome: "Neon Escuro", desc: "Preto com brilho ciano e roxo", cat: "escuro", neon: true, c: { escuro: true,
      app: "radial-gradient(800px 520px at 0% 0%,rgba(34,211,238,.30),transparent 60%),radial-gradient(900px 620px at 100% 100%,rgba(217,70,239,.30),transparent 60%),#010208",
      lista: "#05070e", hover: "#0a1322", sel: "#0b1d2b", cab: "#05070e", card: "#080d19", borda: "rgba(34,211,238,.20)", fundo: "radial-gradient(circle at 15% 10%,#082030,#03050b 55%),#03050b",
      inB: "#0a1424", outB: "linear-gradient(135deg,#06b6d4,#a855f7)", tx: "#e0fbff", mu: "#67d4e6", ln: "#11213a", inp: "#08101e", ac: "#22d3ee", ac2: "#d946ef",
      brilho: "0 0 0 1px rgba(34,211,238,.55),0 0 28px rgba(34,211,238,.35),0 0 90px rgba(217,70,239,.25)" } },
    { id: "nevoa", nome: "Névoa Roxa", desc: "Roxos em degradê, noite profunda", cat: "escuro", c: { escuro: true,
      app: "radial-gradient(900px 520px at 0% 0%,rgba(124,58,237,.38),transparent 60%),radial-gradient(900px 620px at 100% 100%,rgba(192,38,211,.28),transparent 60%),#0d0618",
      lista: "#1a0e2e", hover: "#26163f", sel: "#332052", cab: "#1a0e2e", card: "#22143a", borda: "#34205a", fundo: "linear-gradient(160deg,#1e1035,#3b1d5e)", inB: "#3b2363", outB: "#7c3aed",
      tx: "#f1eaff", mu: "#c4b5fd", ln: "#34205a", inp: "#140a24", ac: "#8b5cf6", ac2: "#c026d3", brilho: "0 0 0 1px rgba(167,139,250,.35),0 30px 80px rgba(0,0,0,.55),0 0 60px rgba(124,58,237,.25)" } },
    { id: "aurora", nome: "Aurora", desc: "Holográfico escuro, janela com brilho roxo", cat: "artistico", c: { escuro: true,
      app: "radial-gradient(1100px 600px at 0% 0%,rgba(99,102,241,.38),transparent 60%),radial-gradient(1000px 700px at 100% 100%,rgba(168,85,247,.38),transparent 60%),#05050f",
      lista: "#0f0d2a", hover: "#17143a", sel: "#221d55", cab: "#0f0d2a", card: "#141137", borda: "#211d4d", fundo: "#0c0a24", inB: "#1a1740", outB: "linear-gradient(135deg,#6366f1,#8b5cf6)",
      tx: "#e8e6ff", mu: "#a5a3d6", ln: "#221e4d", inp: "#17143a", ac: "#7c6cf6", ac2: "#a855f7", brilho: "0 0 0 1px rgba(139,92,246,.38),0 30px 80px rgba(0,0,0,.55),0 0 60px rgba(99,102,241,.25)" } },
    { id: "flor", nome: "Flor", desc: "Rosa claro com pétalas no fundo", cat: "claro", c: { escuro: false,
      app: "radial-gradient(900px 520px at 0% 0%,rgba(236,72,153,.25),transparent 60%),radial-gradient(900px 620px at 100% 100%,rgba(251,146,60,.18),transparent 60%),#fbe3ec",
      lista: "#fffafc", hover: "#ffeef4", sel: "#fde2ec", cab: "#fffafc", card: "#fff3f7", borda: "#fbd9e5", fundo: "#fff0f5",
      padrao: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cg fill='%23f9a8d4' fill-opacity='.45'%3E%3Ccircle cx='12' cy='14' r='4'/%3E%3Ccircle cx='52' cy='44' r='3'/%3E%3Ccircle cx='30' cy='66' r='2.5'/%3E%3C/g%3E%3C/svg%3E\")",
      inB: "#ffffff", outB: "#fbcfe1", tx: "#6b1238", mu: "#a85a7c", ln: "#fbd9e5", inp: "#ffffff", ac: "#ec4899", ac2: "#f97316", brilho: "0 0 0 1px rgba(236,72,153,.2),0 24px 70px rgba(190,24,93,.15)" } },
  ];
  let EST = { id: null, meus: [] }; // null = nenhum tema (WhatsApp como o usuário deixou)
  const todos = () => [...TEMAS, ...(EST.meus || [])];
  const achar = (id) => todos().find((t) => t.id === id) || null;
  const ehCor = (v) => /^#|^rgb/.test(String(v || ""));
  const corSolida = (v, d) => (ehCor(v) ? v : d); // degradê não serve pra borda/texto

  // ---------- cores (helpers) ----------
  const CTX = document.createElement("canvas").getContext("2d");
  function rgba(v) { // qualquer cor CSS → [r,g,b,a] (null se não for cor)
    if (v == null) return null; const s = String(v).trim(); if (!s || s.length > 80 || /gradient|url\(|var\(/.test(s)) return null;
    CTX.fillStyle = "#010203"; CTX.fillStyle = s; const f = CTX.fillStyle;
    if (f === "#010203" && !/^#010203$/i.test(s)) return null;
    if (f[0] === "#") return [parseInt(f.slice(1, 3), 16), parseInt(f.slice(3, 5), 16), parseInt(f.slice(5, 7), 16), 1];
    const m = f.match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2], m[3] == null ? 1 : +m[3]] : null;
  }
  const str = (c) => (c[3] >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${+c[3].toFixed(3)})`);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3]];
  const alfa = (v, a) => { const c = rgba(v) || [99, 102, 241, 1]; return str([c[0], c[1], c[2], a]); };
  function hsl(c) { const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(h * 60 + 360) % 360, s, l]; }

  // ---------- MOTOR: recolore TODAS as variáveis de cor do WhatsApp ----------
  // O WhatsApp novo pinta quase tudo por variáveis CSS (nomes mudam a cada versão). Em vez de adivinhar nomes, lê todas
  // as variáveis de cor que a página tem (com o nosso tema desligado), vê se o WhatsApp está claro ou escuro e troca
  // cada uma pelo papel dela: fundo (escala da lista do tema), texto (escala do texto do tema) ou verde/destaque (cor do
  // tema). Funciona com o WhatsApp no claro ou no escuro, sem precisar trocar o modo dele.
  let CACHE = { n: -1, nomes: null };
  function lerVars() {
    const nFolhas = document.styleSheets.length;
    const nomes = CACHE.n === nFolhas ? CACHE.nomes : new Set();
    if (CACHE.n !== nFolhas) {
    try { const cs = getComputedStyle(document.body); for (let i = 0; i < cs.length; i++) if (cs[i].startsWith("--")) nomes.add(cs[i]); } catch (_) {}
    for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch (_) { continue; }
      const andar = (lista) => { for (const r of lista) { if (r.style) for (let i = 0; i < r.style.length; i++) if (r.style[i].startsWith("--")) nomes.add(r.style[i]); if (r.cssRules) andar(r.cssRules); } };
      try { andar(rs); } catch (_) {} }
    CACHE = { n: nFolhas, nomes }; }
    const cs = getComputedStyle(document.body), out = [];
    for (const n of nomes) { if (/^--(j[a-z0-9]*|bg|tx|mu|mu2|ln|ln2|soft|hov|az|crit|alt)$/.test(n)) continue; const c = rgba(cs.getPropertyValue(n)); if (c && c[3] > 0) out.push([n, c]); }
    return out;
  }
  function waEscuro() {
    let el = document.querySelector("#pane-side") || document.querySelector("#side") || document.body;
    while (el) { const c = rgba(getComputedStyle(el).backgroundColor); if (c && c[3] > 0.5) return hsl(c)[2] < 0.45; el = el.parentElement; }
    return document.body.classList.contains("dark") || document.documentElement.classList.contains("dark");
  }
  function motor(t) {
    const c = t.c, base = rgba(c.lista), tx = rgba(c.tx), mu = rgba(c.mu || c.tx), ac = rgba(corSolida(c.ac, "#6366f1")), escTema = !!c.escuro;
    const inB = rgba(c.inB), outB = rgba(c.outB) || mix(ac, base, escTema ? 0.55 : 0.75), fundo = rgba(c.fundo) || base, cab = rgba(c.cab) || base;
    const escWA = waEscuro(), vars = lerVars(), linhas = [];
    // 0.9.2: os cinzas viram tons do próprio tema (puxados pra cor de destaque), não cinza puro
    const tinta = mix(tx, ac, escTema ? 0.3 : 0.6);
    for (const [n, cor] of vars) {
      let nova; const [h, s, l] = hsl(cor), a = cor[3];
      if (/outgoing/.test(n)) nova = outB;
      else if (/incoming/.test(n)) nova = inB;
      else if (/conversation-panel-background|chat-background|wallpaper/.test(n)) nova = fundo;
      else if (/panel-header|header-background|compose-panel|compose-input/.test(n)) nova = /input/.test(n) ? rgba(c.inp) || cab : cab;
      else if (s > 0.28 && h >= 85 && h <= 185) { // verdes/verde-água do WhatsApp → destaque do tema
        const fundoLado = escWA ? l < 0.32 : l > 0.82;
        nova = fundoLado ? mix(ac, base, escTema ? 0.62 : 0.82) : ac;
      } else if (s > 0.45) continue; // vermelho, azul de link, amarelo: deixa
      else { // neutros
        const fundoLado = escWA ? l < 0.5 : l > 0.5;
        if (fundoLado) { const k = escWA ? l / 0.5 : (1 - l) / 0.5; nova = mix(base, tinta, Math.min(0.2, k * 0.26)); }
        else { const k = escWA ? (1 - l) / 0.5 : l / 0.5; nova = k < 0.25 ? tx : mix(tx, mu, Math.min(1, (k - 0.25) / 0.5)); if (k > 0.8) nova = mix(mu, base, 0.25); }
      }
      if (nova) linhas.push(`${n}:${str([nova[0], nova[1], nova[2], a * (nova[3] ?? 1)])}!important`);
    }
    return linhas.join(";");
  }

  // ---------- CSS do tema ----------
  function css(t) {
    const c = t.c || {};
    if (t.nativo) return `/* ${t.id} */`; // WhatsApp normal
    const tx = c.tx, mu = c.mu || tx, ln = c.ln || "rgba(127,127,127,.2)", ac = corSolida(c.ac, "#6366f1"), ac2 = corSolida(c.ac2, ac);
    const card = c.card || c.hover || c.lista, borda = c.borda || ln, grad = `linear-gradient(135deg,${ac},${ac2})`;
    const app = c.app && !ehCor(c.app) ? c.app : `radial-gradient(900px 520px at 0% 0%,${alfa(ac, 0.3)},transparent 60%),radial-gradient(900px 620px at 100% 100%,${alfa(ac2, 0.28)},transparent 60%),${c.escuro ? "#06060e" : corSolida(c.app, "#e9edf5")}`;
    const brilho = c.brilho || (c.escuro ? `0 0 0 1px ${alfa(ac, 0.35)},0 30px 80px rgba(0,0,0,.55)` : `0 0 0 1px ${alfa(ac, 0.2)},0 24px 70px rgba(15,23,42,.16)`);
    const fundoImg = c.img ? `url("${c.img}") center/cover no-repeat` : c.fundo;
    return `
/* tema JH: ${t.id} */
html,body,body.dark,html.dark,#app,#app>div{${motor(t)}}
/* janela flutuante (todos os temas): espaço em volta, cantos redondos, brilho */
html,body{background:${app}!important;background-attachment:fixed!important}
#app{position:fixed!important;top:22px!important;bottom:22px!important;left:30px!important;right:30px!important;width:auto!important;height:auto!important;
  border-radius:22px!important;overflow:hidden!important;box-shadow:${brilho}!important;background:${c.lista}!important}
#app>div,#app>div>div{max-width:100%!important;max-height:100%!important;margin:0!important;border-radius:0!important}
#app>div>div{width:100%!important;height:100%!important;top:0!important;left:0!important}
#side,#pane-side,[data-testid='chat-list']{background:${c.lista}!important;color:${tx}!important}
#side{border-right:1px solid ${ln}!important}
#side header,#main header{background:${c.cab}!important;color:${tx}!important;border-color:${ln}!important}
#main header span[title],#main header span[dir]{color:${tx}!important}
#main,[data-testid='conversation-panel-wrapper']{background:${fundoImg}!important}
${c.img || /gradient/.test(c.fundo || "") ? "#main>div,#main [role='application']{background:transparent!important}" : ""}
#main [data-asset-chat-background-light],#main [data-asset-chat-background-dark]{${c.padrao ? `background-image:${c.padrao}!important;opacity:1!important;filter:none!important` : "opacity:.06!important"}}
#main footer{background:transparent!important;border:0!important}
#main footer [contenteditable='true'],#side [contenteditable='true'],#side input{color:${tx}!important}
/* conversas em cards */
#pane-side [role='listitem']>div,#pane-side [role='row']>div{margin:4px 10px!important;border-radius:14px!important;background:${card}!important;border:1px solid ${borda}!important;box-sizing:border-box!important;transition:background .12s,border-color .12s}
#pane-side [role='listitem']:hover>div,#pane-side [role='row']:hover>div{background:${c.hover || card}!important;border-color:${alfa(ac, 0.45)}!important}
#pane-side [aria-selected='true']{background:transparent!important}
#pane-side [aria-selected='true']>div,#pane-side [role='listitem'] [aria-selected='true']{background:${c.sel || card}!important;border-color:${alfa(ac, 0.7)}!important}
#pane-side [role='listitem'] span[title],#pane-side [role='row'] span[title]{color:${tx}!important}
#pane-side [role='listitem'] *,#pane-side [role='row'] *{border-bottom-color:transparent!important}
/* contador de não lidas e abas em pílula */
#pane-side span[aria-label*='não lida'],#pane-side span[aria-label*='unread']{background:${grad}!important;color:#fff!important}
#side [role='tab'],#side [role='tablist'] button{border-radius:99px!important}
#side [role='tab'][aria-selected='true'],#side button[aria-pressed='true']{background:${grad}!important;color:#fff!important;border-radius:99px!important;box-shadow:0 4px 14px ${alfa(ac, 0.35)}!important}
#side [role='tab'][aria-selected='true'] *,#side button[aria-pressed='true'] *{color:#fff!important}
/* balões */
.message-out [class*='copyable-area'],.message-out>div>div{background:${c.outB}!important}
.message-in [class*='copyable-area'],.message-in>div>div{background:${c.inB}!important}
${/gradient/.test(c.outB || "") || c.escuro ? `.message-out span[dir],.message-out .copyable-text,.message-out [data-pre-plain-text] span{color:#fff!important}` : ""}
${t.neon ? `#pane-side span[title]{text-shadow:0 0 10px ${alfa(ac, 0.45)}}#main header span[title]{text-shadow:0 0 12px ${alfa(ac, 0.6)}}
#pane-side [role='listitem']:hover>div{box-shadow:0 0 18px ${alfa(ac, 0.25)},inset 0 0 0 1px ${alfa(ac, 0.5)}!important}
.message-in [class*='copyable-area']{box-shadow:inset 0 0 0 1px ${alfa(ac, 0.35)},0 0 14px ${alfa(ac, 0.15)}!important}
.message-out [class*='copyable-area']{box-shadow:0 0 16px ${alfa(ac2, 0.35)}!important}` : ""}
/* 0.12.1: o degradê da setinha agora é tratado no wa.js (pinta com a cor do balão ao passar o mouse) */
/* painel fixo no canto dentro da moldura do tema */
html.jh-com-painel #app{right:calc(30px + 352px)!important;width:auto!important}
html.jh-com-mini #app{right:calc(30px + 60px)!important;width:auto!important}
html.jh-com-painel #jh-painel,html.jh-com-mini #jh-painel{top:22px!important;bottom:22px!important;right:30px!important;height:auto!important;border-radius:22px!important;border:0!important;box-shadow:${brilho}!important}
/* 0.10.1: seleção de texto sempre visível (o motor recoloria a do WhatsApp quase igual ao fundo) */
::selection{background-color:${alfa(ac, c.escuro ? 0.45 : 0.3)}!important}
/* painel flutuante, botão e janelas da JH */
html[data-jh-tema] body #jh-painel{--bg:${c.lista};--tx:${tx};--mu:${mu};--mu2:${mu};--ln:${ln};--ln2:${ln};--soft:${c.hover || c.lista};--hov:${c.hover || c.lista};--az:${ac};--g1:${ac};--g2:${ac2}}
#jh-painel.flut{box-shadow:${brilho}!important}
html[data-jh-tema] body :is(#jh-bt,#jh-menu,#jh-modal,#jh-faixa,#jh-faixa-pop){--jv1:${ac};--jv2:${ac2};--jbg:${c.lista};--jbg2:${c.cab};--jtx:${tx};--jmu:${mu};--jln:${ln};--jfoco:${ac};--jsel:${c.hover || c.lista}}`;
  }
  let ST = null;
  function aplicar(id) {
    const t = achar(id);
    if (!ST) { ST = document.createElement("style"); ST.id = "jh-tema-css"; }
    const d = document.documentElement.dataset;
    if (!t || t.nativo) { ST.remove(); delete d.jhTema; delete d.jhTemaClaro; if (t) { d.jhTemaEscuro = t.c.escuro ? "1" : "0"; document.body.classList.toggle("dark", !!t.c.escuro); } else delete d.jhTemaEscuro; setTimeout(() => dispatchEvent(new Event("jhtema")), 50); return; }
    delete d.jhTemaEscuro; // o wa.js (aplicarEscuro) só força o modo nos temas "WhatsApp Claro/Escuro"
    ST.disabled = true; // lê as cores originais do WhatsApp com o tema desligado
    const txt = css(t);
    ST.textContent = txt; ST.disabled = false;
    setTimeout(() => dispatchEvent(new Event("jhtema")), 50); // a faixa de mensagens copia a cor nova da caixa de digitar
    if (!ST.isConnected) (document.head || document.documentElement).appendChild(ST);
    document.documentElement.dataset.jhTema = t.id;
    document.documentElement.dataset.jhTemaClaro = t.c && t.c.escuro ? "0" : "1"; // selinhos da lista usam as cores do claro
    try { const c = t.c, ac = corSolida(c.ac, "#6366f1"), ac2 = corSolida(c.ac2, ac);
      chrome.storage.local.set({ temaSplash: { id: t.id, app: c.app && !ehCor(c.app) ? c.app : corSolida(c.app, c.lista), tx: c.tx, ac, ac2, sombra: alfa(ac, 0.35), trilho: alfa(c.tx, 0.12) } }); } catch (_) {}
  }
  const guardar = () => chrome.storage.local.set({ temaJH: EST });
  chrome.storage.local.get("temaJH").then(({ temaJH }) => { EST = { ...EST, ...(temaJH || {}) }; aplicar(EST.id); });
  chrome.storage.onChanged.addListener((ch) => { if (ch.temaJH) { EST = { ...EST, ...(ch.temaJH.newValue || {}) }; aplicar(EST.id); } });
  // o WhatsApp carrega as folhas aos poucos e troca claro/escuro: reaplica nessas horas (nada de vigiar a tela toda)
  [3000, 8000, 15000, 30000].forEach((ms) => setTimeout(() => aplicar(EST.id), ms));
  let tDark = null, ultDark = document.body.classList.contains("dark");
  new MutationObserver(() => { const d = document.body.classList.contains("dark"); if (d === ultDark) return; ultDark = d; clearTimeout(tDark); tDark = setTimeout(() => aplicar(EST.id), 300); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  // ---------- janela Temas ----------
  const CATS = [["todos", "Todos"], ["escuro", "Escuros"], ["claro", "Claros"], ["artistico", "Artísticos"], ["meus", "Meus temas"]];
  let CAT = "todos";
  const mini = (t) => { const c = t.c || {}; const bg = (v, d) => v || d;
    return `<div class="jht-mini" style="background:${bg(c.app, c.lista)}"><div class="jht-l" style="background:${c.lista};border-color:${corSolida(c.ln, "transparent")}"><i style="background:${corSolida(c.ac, "#999")}"></i><b style="background:${corSolida(c.mu || c.tx, "#999")}"></b><i style="background:${corSolida(c.mu || c.tx, "#999")};opacity:.5"></i><b style="background:${corSolida(c.mu || c.tx, "#999")};opacity:.5"></b></div>
      <div class="jht-c" style="background:${c.img ? `url('${c.img}') center/cover` : c.fundo}"><span style="background:${c.inB}"></span><span class="o" style="background:${c.outB}"></span><span style="background:${c.inB};width:40%"></span><span class="o" style="background:${c.outB};width:55%"></span><em style="background:${c.cab}"><u style="background:${corSolida(c.ac, "#999")}"></u></em></div></div>`; };
  function abrir() {
    document.getElementById("jh-modal")?.remove();
    const m = document.createElement("div"); m.id = "jh-modal";
    const desenhar = () => {
      const lista = todos().filter((t) => CAT === "todos" ? !t.meu : CAT === "meus" ? t.meu : t.cat === CAT);
      const n = (k) => (k === "todos" ? TEMAS.length : k === "meus" ? (EST.meus || []).length : TEMAS.filter((t) => t.cat === k).length);
      m.innerHTML = `<div class="jh-mo jht">
        <div class="jh-moh"><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6c0-4.9-4.5-8.6-10-8.6z"/></svg></i>
          <div><b>Temas</b><small>Deixe o WhatsApp com a sua cara</small></div><button class="jh-bt2 pri jht-criar" data-criar>+ Criar tema</button><button class="jh-ib2" data-x title="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
        <div class="jht-corpo"><nav>${CATS.map(([k, l]) => `<button class="${CAT === k ? "on" : ""}" data-cat="${k}">${l}<i>${n(k)}</i></button>`).join("")}</nav>
          <div class="jht-grade">${lista.length ? lista.map((t) => `<div class="jht-card${EST.id === t.id ? " on" : ""}">${mini(t)}<div class="jht-tx"><b>${esc(t.nome)}${EST.id === t.id ? ' <em>EM USO</em>' : ""}</b><small>${esc(t.desc || "")}</small></div>
            <div class="jht-bts"><button class="jh-bt2 pri" data-ap="${t.id}">Aplicar</button>${t.nativo ? "" : `<button class="jh-bt2" data-pers="${t.id}">${t.meu ? "Editar" : "Personalizar"}</button>`}${t.meu ? `<button class="jh-bt2" data-del="${t.id}" title="Apagar">✕</button>` : ""}</div></div>`).join("")
            : `<div class="jht-vz">${CAT === "meus" ? "Você ainda não criou nenhum tema.<br><button class='jh-bt2 pri' data-criar>+ Criar tema</button>" : "Nada aqui."}</div>`}</div></div></div>`;
      m.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => m.remove()));
      m.querySelectorAll("[data-cat]").forEach((b) => (b.onclick = () => { CAT = b.dataset.cat; desenhar(); }));
      m.querySelectorAll("[data-ap]").forEach((b) => (b.onclick = () => { EST.id = b.dataset.ap; guardar(); aplicar(EST.id); desenhar(); }));
      m.querySelectorAll("[data-pers]").forEach((b) => (b.onclick = () => editor(achar(b.dataset.pers))));
      m.querySelectorAll("[data-criar]").forEach((b) => (b.onclick = () => editor(null)));
      m.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { EST.meus = (EST.meus || []).filter((t) => t.id !== b.dataset.del); if (EST.id === b.dataset.del) EST.id = null; guardar(); aplicar(EST.id); desenhar(); }));
    };
    desenhar();
    m.onclick = (e) => { if (e.target === m) m.remove(); };
    document.body.appendChild(m);
  }

  // ---------- Criar / Personalizar ----------
  const CAMPOS = [["fundo", "Fundo da conversa"], ["lista", "Lista de conversas"], ["cab", "Cabeçalhos e caixa de digitar"], ["inB", "Balão recebido"], ["outB", "Balão enviado"], ["tx", "Texto"], ["ac", "Destaque"]];
  async function reduzir(file) {
    const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), cv = document.createElement("canvas");
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k); cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.8); // ~150–300 KB
  }
  function editor(base) {
    const b = JSON.parse(JSON.stringify(base || achar("jh-azul")));
    const novo = !base || !base.meu;
    const t = { ...b, id: novo ? "meu-" + Date.now() : b.id, nome: novo ? (base ? base.nome + " (meu)" : "Meu tema") : b.nome, desc: "Tema personalizado", cat: b.c && b.c.escuro ? "escuro" : "claro", meu: true, nativo: false, neon: !!b.neon };
    const c = t.c = { ...b.c };
    for (const [k] of CAMPOS) if (!ehCor(c[k])) c[k] = k === "outB" ? corSolida(c.ac, "#2563eb") : k === "fundo" ? corSolida(c.lista, "#eef3fb") : "#888888";
    document.getElementById("jh-modal")?.remove();
    const m = document.createElement("div"); m.id = "jh-modal";
    const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : "#888888");
    m.innerHTML = `<div class="jh-mo jht-ed">
      <div class="jh-moh"><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></i><div><b>${novo ? "Criar tema" : "Editar tema"}</b><small>Escolha as cores e, se quiser, uma imagem de fundo. Fica salvo em "Meus temas".</small></div><button class="jh-ib2" data-x title="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
      <div class="jh-mob jht-edb"><div class="jht-edf">
        <label class="jh-fl"><span>Nome</span><input class="jht-in" id="jht-nome" value="${esc(t.nome)}"></label>
        <label class="jht-sw"><input type="checkbox" id="jht-esc" ${c.escuro ? "checked" : ""}> Tema escuro (liga o modo escuro do WhatsApp)</label>
        <div class="jht-cores">${CAMPOS.map(([k, l]) => `<label><input type="color" data-k="${k}" value="${hex(c[k])}"><span>${l}</span></label>`).join("")}</div>
        <div class="jh-fl"><span>Imagem de fundo (opcional)</span><div class="jht-img"><button class="jh-bt2" data-img>Escolher imagem</button><button class="jh-bt2" data-semimg ${c.img ? "" : "hidden"}>Tirar</button><input type="file" accept="image/*" hidden></div><small class="jh-mu">Ela é reduzida antes de salvar pra não pesar o WhatsApp.</small></div>
      </div><div class="jht-prev" id="jht-prev"></div></div>
      <div class="jh-mof"><button class="jh-bt2" data-x>Cancelar</button><button class="jh-bt2 pri" data-ok>Salvar e aplicar</button></div></div>`;
    document.body.appendChild(m);
    const prev = () => { c.app = c.app && ehCor(c.app) ? c.app : c.fundo; c.hover = c.hover && ehCor(c.hover) ? c.hover : c.lista; c.sel = c.sel && ehCor(c.sel) ? c.sel : c.lista; c.inp = c.inp && ehCor(c.inp) ? c.inp : c.lista; c.inT = c.tx; c.outT = "#ffffff"; c.mu = c.mu && ehCor(c.mu) ? c.mu : c.tx; m.querySelector("#jht-prev").innerHTML = mini(t); };
    prev();
    m.querySelectorAll("input[type=color]").forEach((i) => (i.oninput = () => { c[i.dataset.k] = i.value; if (i.dataset.k === "lista") { c.hover = c.sel = c.inp = i.value; } prev(); }));
    m.querySelector("#jht-esc").onchange = (e) => { c.escuro = e.target.checked; t.cat = c.escuro ? "escuro" : "claro"; };
    const fi = m.querySelector("input[type=file]");
    m.querySelector("[data-img]").onclick = () => fi.click();
    fi.onchange = async () => { const f = fi.files[0]; if (!f) return; try { c.img = await reduzir(f); m.querySelector("[data-semimg]").hidden = false; prev(); } catch (_) {} };
    m.querySelector("[data-semimg]").onclick = (e) => { delete c.img; e.currentTarget.hidden = true; prev(); };
    m.querySelectorAll("[data-x]").forEach((x) => (x.onclick = () => m.remove()));
    m.querySelector("[data-ok]").onclick = async () => {
      t.nome = m.querySelector("#jht-nome").value.trim() || "Meu tema";
      EST.meus = [...(EST.meus || []).filter((x) => x.id !== t.id), t];
      EST.id = t.id;
      try { await chrome.storage.local.set({ temaJH: EST }); } catch (e) { delete c.img; EST.meus = [...EST.meus.filter((x) => x.id !== t.id), t]; await chrome.storage.local.set({ temaJH: EST }); }
      aplicar(EST.id); m.remove(); CAT = "meus"; abrir();
    };
  }

  window.jhTemas = { abrir, aplicar, atual: () => { const t = achar(EST.id); return t ? t.nome : "WhatsApp normal"; } };
})();
