import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

const CHECK_INTERVAL_MS = 60_000;

// Confere /version.json (gerado no build). Se o servidor ja tiver outra versao, bloqueia a tela ate o usuario
// atualizar: assim ninguem continua trabalhando numa versao antiga do sistema.
export function UpdateNotice() {
  const [outdated, setOutdated] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let stopped = false;
    async function check() {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { build?: string };
        if (data.build && data.build !== __APP_BUILD__) setOutdated(true);
      } catch {
        // Sem rede: tenta de novo no proximo ciclo.
      }
    }
    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  if (!outdated) return null;
  return (
    <div className="update-notice-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="update-notice-title" aria-describedby="update-notice-text">
      <div className="update-notice">
        <span className="update-notice-icon"><RefreshCw size={22} /></span>
        <span className="section-kicker">ATUALIZAÇÃO OBRIGATÓRIA</span>
        <h2 id="update-notice-title">Nova versão do sistema</h2>
        <p id="update-notice-text">O sistema foi atualizado. Clique em Atualizar para carregar a versão nova e não continuar trabalhando na anterior.</p>
        <button type="button" className="primary-button" autoFocus disabled={reloading} onClick={() => { setReloading(true); window.location.reload(); }}>
          <RefreshCw size={16} /> {reloading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>
    </div>
  );
}
