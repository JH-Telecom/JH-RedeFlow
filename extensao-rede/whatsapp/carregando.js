/* JH · WhatsApp 0.11.0 (05/11): TELA DE CARREGAMENTO da JH. Roda no começo da página (document_start) e cobre a tela
   de "abrindo" do WhatsApp (que o tema deixava torta, com o logo virando blocos) com uma tela nas cores do tema.
   Só aparece quando há um tema nosso aplicado; some sozinha quando a lista de conversas (ou o QR de login) aparecer. */
(function () {
  chrome.storage.local.get(["temaJH", "temaSplash"]).then(({ temaJH, temaSplash }) => {
    const sp = temaSplash;
    if (!temaJH || !temaJH.id || !sp || sp.id !== temaJH.id) return; // sem tema nosso: tela normal do WhatsApp
    const el = document.createElement("div"); el.id = "jh-carregando";
    el.innerHTML = `<style>
      #jh-carregando{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:${sp.app};transition:opacity .35s ease;font-family:Inter,"Segoe UI",system-ui,sans-serif}
      #jh-carregando .c{display:flex;flex-direction:column;align-items:center;gap:18px;color:${sp.tx}}
      #jh-carregando .m{width:76px;height:76px;border-radius:24px;background:linear-gradient(135deg,${sp.ac},${sp.ac2});display:flex;align-items:center;justify-content:center;color:#fff;font:800 26px Inter,sans-serif;letter-spacing:-.02em;box-shadow:0 18px 48px ${sp.sombra};animation:jhPul 1.6s ease-in-out infinite}
      #jh-carregando b{font-size:17px;font-weight:600}#jh-carregando small{font-size:12.5px;opacity:.65;margin-top:-10px}
      #jh-carregando .bar{width:180px;height:4px;border-radius:99px;background:${sp.trilho};overflow:hidden}
      #jh-carregando .bar i{display:block;width:40%;height:100%;border-radius:99px;background:linear-gradient(90deg,${sp.ac},${sp.ac2});animation:jhBar 1.2s ease-in-out infinite}
      @keyframes jhBar{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}
      @keyframes jhPul{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
    </style><div class="c"><div class="m">JH</div><b>Abrindo o WhatsApp…</b><small>JH Telecom</small><div class="bar"><i></i></div></div>`;
    const pôr = () => (document.body ? document.body.appendChild(el) : document.documentElement.appendChild(el));
    pôr();
    const t0 = Date.now();
    const tirar = () => { el.style.opacity = "0"; setTimeout(() => el.remove(), 400); clearInterval(iv); };
    const iv = setInterval(() => {
      if (!el.isConnected) pôr();
      const pronto = document.querySelector("#pane-side, #side") || document.querySelector("canvas[aria-label], [data-ref], [data-testid='qrcode']");
      if (pronto || Date.now() - t0 > 45000) tirar();
    }, 250);
  });
})();
