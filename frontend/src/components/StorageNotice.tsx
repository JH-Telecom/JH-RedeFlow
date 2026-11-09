import { Cookie } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

// Aviso de armazenamento (LGPD/cookies). O sistema so usa armazenamento essencial (sessao, tema, filtros), que
// nao depende de consentimento; o aviso informa isso uma vez e some depois de "Entendi".
const STORAGE_KEY = "jh-redeflow:storage-notice";
const NOTICE_VERSION = "2026-11-09";

function alreadySeen() {
  try { return localStorage.getItem(STORAGE_KEY) === NOTICE_VERSION; } catch { return false; }
}

export function StorageNotice() {
  const [visible, setVisible] = useState(() => !alreadySeen());
  if (!visible) return null;
  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, NOTICE_VERSION); } catch { /* sem armazenamento: some so nesta visita */ }
    setVisible(false);
  }
  return (
    <section className="storage-notice panel" role="region" aria-label="Aviso de armazenamento">
      <Cookie size={18} aria-hidden="true" />
      <p>
        Este sistema guarda no seu navegador só o essencial: sessão, tema e filtros das telas. <strong>Não usamos cookies de rastreamento nem de publicidade.</strong>{" "}
        <Link to="/privacidade">Política de Privacidade</Link>
      </p>
      <button className="primary-button compact" type="button" onClick={dismiss}>Entendi</button>
    </section>
  );
}
