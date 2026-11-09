/* JH RedeFlow · ponte com o sistema (paginas do JH RedeFlow).
   Deixa a pagina Configuracoes -> Extensao do Chrome saber a versao instalada neste Chrome e, depois que ela
   grava a versao nova na pasta da extensao, pedir para a extensao se recarregar (le os arquivos novos da pasta).
   Conversa so por window.postMessage com a propria pagina (mesma origem); nao le nada do sistema. */
(function () {
  if (window.__rfPonte) return;
  window.__rfPonte = true;
  const responder = (dados) => window.postMessage({ fonte: "jh-redeflow-extensao", ...dados }, window.location.origin);
  const versao = () => chrome.runtime.getManifest().version;
  window.addEventListener("message", (evento) => {
    if (evento.source !== window || evento.origin !== window.location.origin) return;
    const msg = evento.data;
    if (!msg || msg.fonte !== "jh-redeflow-sistema") return;
    if (msg.tipo === "versaoExtensao") responder({ tipo: "versao", versao: versao() });
    if (msg.tipo === "recarregarExtensao") {
      responder({ tipo: "recarregando", versaoAnterior: versao() });
      chrome.runtime.sendMessage({ tipo: "recarregarExtensao" }).catch(() => {});
    }
  });
  responder({ tipo: "versao", versao: versao() });
})();
