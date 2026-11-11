/* JH RedeFlow · Identificador no WhatsApp Web.
   Os mesarios usam o mesmo numero de WhatsApp; cada um usa o proprio Chrome com o proprio login na extensao.
   Ao enviar (Enter ou botao Enviar), a extensao poe o nome de quem esta mandando no comeco da mensagem:
     *Matheus Terra:*
     Tecnico a caminho da CTO.
   Ninguem precisa digitar nada. Liga/desliga, nome e "so em grupos" ficam no popup da extensao.
   - Cola so o identificador no comeco (o resto do texto, mencoes @ e formatacao ficam como estao).
   - Com mencao @ (1.9.2): o identificador entra pelo editor do WhatsApp (wa-page.js), sem desfazer a mencao.
   - Nao mexe em cards de acionamento nem em informativos (o sistema le esses textos).
   - Mensagem que ja comeca com o identificador nao ganha outro. Nada e enviado sozinho: so quando a pessoa envia. */
(function () {
  if (window.__rfIdentificador) return;
  window.__rfIdentificador = true;

  let cfg = { ativo: true, nome: "", escopo: "todas" };
  let nomeSessao = "";
  let nomeFixo = ""; // primeiro nome do ultimo login: continua valendo se o login cair
  let cargoSessao = "";
  let cargoFixo = ""; // cargo do ultimo login (ex.: Mesario), guardado do mesmo jeito
  const carregar = async () => {
    const { waIdentificador, sessao, nomeFixo: fixo, cargoFixo: cargoGuardado } = await chrome.storage.local.get(["waIdentificador", "sessao", "nomeFixo", "cargoFixo"]);
    cfg = { ...cfg, ...(waIdentificador || {}) };
    nomeSessao = sessao?.nome || "";
    nomeFixo = fixo || "";
    cargoSessao = String(sessao?.cargo || "").trim();
    cargoFixo = cargoGuardado || "";
    if (!cargoFixo && cargoSessao) { cargoFixo = cargoSessao; void chrome.storage.local.set({ cargoFixo }); }
    // Logado de antes da 1.7.1 (sem nome guardado): guarda agora, enquanto o login ainda vale.
    if (!nomeFixo && sessao?.nome) { const p = String(sessao.nome).trim().split(/\s+/)[0] || ""; if (p) { nomeFixo = p[0].toUpperCase() + p.slice(1).toLowerCase(); void chrome.storage.local.set({ nomeFixo }); } }
  };
  void carregar();
  chrome.storage.onChanged.addListener((mudancas, area) => { if (area === "local" && (mudancas.waIdentificador || mudancas.sessao || mudancas.nomeFixo || mudancas.cargoFixo)) void carregar(); });

  // So o primeiro nome do cadastro no sistema: "Matheus Terra Farias" -> "Matheus".
  const primeiroNome = (nome) => { const p = String(nome || "").trim().split(/\s+/)[0] || ""; return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ""; };
  const nomeAtual = () => (cfg.nome || "").trim() || primeiroNome(nomeSessao) || nomeFixo;
  // *Cargo - Nome:* (ex.: *Mesario - Matheus:*). Cargo: o digitado no popup, senao o do login (ou o guardado).
  const cargoAtual = () => (cfg.cargo || "").trim() || cargoSessao || cargoFixo;
  const prefixo = () => (cargoAtual() ? `*${cargoAtual()} - ${nomeAtual()}:*` : `*${nomeAtual()}:*`);

  const caixa = () => document.querySelector('#main footer div[contenteditable="true"]');
  const botaoEnviar = () => {
    const icone = document.querySelector('#main footer [data-icon="send"], #main footer [data-icon="wds-ic-send-filled"], #main footer button[aria-label="Enviar"], #main footer button[aria-label="Send"]');
    return icone ? icone.closest("button, [role='button']") || icone : null;
  };
  // Conversa de grupo? (melhor esforco: icone de grupo ou "dados do grupo" no topo da conversa)
  const ehGrupo = () => {
    const topo = document.querySelector("#main header");
    if (!topo) return false;
    if (topo.querySelector('[data-icon*="group"]')) return true;
    return /dados do grupo|group info|clique para mostrar dados do grupo/i.test(topo.textContent || "");
  };
  // Texto que o sistema le (card de acionamento, informativo): nao recebe identificador.
  const ehTextoDoSistema = (texto) => /VALIDAR COM NOC|INFORMATIVO DE ACIONAMENTO|ACIONAMENTO DE EVENTO|BDESK\s*:|TAREFA\s+OFFICE\s*TRACK/i.test(texto);

  function deveIdentificar(cx) {
    if (!cfg.ativo || !nomeAtual() || !cx) return false;
    if (cfg.escopo === "grupos" && !ehGrupo()) return false;
    const texto = (cx.innerText || "").trim();
    if (!texto) return false;
    if (texto.startsWith(prefixo()) || texto.startsWith(prefixo().replace(/\*/g, ""))) return false;
    return !ehTextoDoSistema(texto);
  }

  // Poe o cursor no comeco da caixa e cola "*Nome:*" + quebra de linha (a colagem mantem a quebra).
  function colocarIdentificador(cx) {
    cx.focus();
    const selecao = window.getSelection();
    const inicio = document.createRange();
    let primeiro = cx;
    while (primeiro.firstChild) primeiro = primeiro.firstChild;
    inicio.setStart(primeiro, 0);
    inicio.collapse(true);
    selecao.removeAllRanges();
    selecao.addRange(inicio);
    const texto = `${prefixo()}\n`;
    try {
      const dados = new DataTransfer();
      dados.setData("text/plain", texto);
      cx.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dados, bubbles: true, cancelable: true }));
    } catch (_) { /* cai no jeito abaixo */ }
  }
  // Mensagem com mencao @: pede a ponte da pagina (wa-page.js) para por o identificador no editor do WhatsApp sem
  // desfazer a mencao. Responde { feito: false } para texto comum ou se a ponte nao responder em 300 ms.
  let pedidoN = 0;
  function prefixarPelaPagina(texto) {
    return new Promise((resolver) => {
      const id = `ident-${Date.now()}-${++pedidoN}`;
      const fim = (r) => { document.removeEventListener("jhwa:res", ouvir); clearTimeout(limite); resolver(r); };
      const ouvir = (e) => { let r; try { r = JSON.parse(e.detail || "{}"); } catch (_) { return; } if (r.id === id) fim(r.ok && r.res ? r.res : { feito: false }); };
      const limite = setTimeout(() => fim({ feito: false }), 300);
      document.addEventListener("jhwa:res", ouvir);
      document.dispatchEvent(new CustomEvent("jhwa:req", { detail: JSON.stringify({ id, acao: "prefixar", args: { texto } }) }));
    });
  }

  // O WhatsApp so mostra o texto colado um pouco depois: conferir na hora fazia o nome entrar duas vezes.
  const jaTemIdentificador = (cx) => (cx.innerText || "").trim().startsWith(prefixo());

  let liberado = false; // envio feito por nos depois de colocar o identificador
  let preparando = false; // identificador sendo colocado: outro Enter nesse meio tempo e ignorado
  function identificarEEnviar(evento) {
    const cx = caixa();
    if (preparando) { evento.preventDefault(); evento.stopImmediatePropagation(); return; }
    if (liberado || !deveIdentificar(cx)) return;
    evento.preventDefault();
    evento.stopImmediatePropagation();
    preparando = true;
    void prefixarPelaPagina(prefixo()).then((r) => setTimeout(() => {
      // O editor aceitou: nao cola de novo (o nome sairia duas vezes).
      const pelaPagina = Boolean(r && r.feito);
      if (!pelaPagina) {
        colocarIdentificador(cx);
        // Colagem nao pegou (outra versao do WhatsApp): escreve direto no comeco, uma vez so.
        setTimeout(() => { if (!jaTemIdentificador(cx)) document.execCommand("insertText", false, `${prefixo()} `); }, 150);
      }
      enviarDepois(cx, pelaPagina ? 120 : 320);
    }, 40));
  }

  function enviarDepois(cx, espera) {
    setTimeout(() => {
      const botao = botaoEnviar();
      liberado = true;
      try {
        if (botao) botao.click();
        else cx.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      } finally {
        preparando = false;
        setTimeout(() => { liberado = false; }, 300);
      }
    }, espera);
  }

  // Enter (sem Shift) na caixa de digitar da conversa.
  document.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter" || evento.shiftKey || evento.ctrlKey || evento.altKey || evento.metaKey || evento.isComposing) return;
    if (!evento.target?.closest?.('#main footer div[contenteditable="true"]')) return;
    identificarEEnviar(evento);
  }, true);

  // Clique no botao Enviar.
  document.addEventListener("click", (evento) => {
    const botao = botaoEnviar();
    if (!botao || !(evento.target === botao || botao.contains(evento.target))) return;
    identificarEEnviar(evento);
  }, true);
  // Popup -> "Escolher tema do WhatsApp": abre a janela de temas (temas.js roda neste mesmo mundo da extensao).
  chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
    if (msg?.tipo !== "waAbrirTemas") return;
    const temas = window.jhTemas;
    if (temas?.abrir) { temas.abrir(); responder({ ok: true, atual: temas.atual() }); }
    else responder({ ok: false });
  });
})();
