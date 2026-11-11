import { Link } from "react-router-dom";
import { COMPANY, copyrightYears } from "../lib/company";

// Aviso de direitos autorais + links legais. Aparece no login, no rodape do menu lateral e nas paginas legais.
export function CopyrightNotice({ className = "" }: { className?: string }) {
  return (
    <footer className={`copyright-notice ${className}`.trim()}>
      <p>© {copyrightYears()} {COMPANY.copyrightHolder}. Todos os direitos reservados.</p>
      <nav aria-label="Documentos legais">
        <Link to="/privacidade">Privacidade</Link>
        <Link to="/termos">Termos</Link>
        <Link to="/licencas">Licenças</Link>
        <Link to="/status">Status do sistema</Link>
      </nav>
    </footer>
  );
}
