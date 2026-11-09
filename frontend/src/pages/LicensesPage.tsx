import { useEffect, useState } from "react";
import { COMPANY, copyrightYears } from "../lib/company";
import { LegalLayout } from "./LegalPages";

// Licencas de terceiros: bibliotecas e fontes usadas pelo sistema, com autor, licenca e o texto da licenca
// (o aviso de copyright que MIT, ISC, BSD e Apache-2.0 pedem para acompanhar o software).
// A lista vem de src/lib/third-party-licenses.json, gerado por scripts/generate-licenses.mjs; carrega so nesta pagina.
type LicenseEntry = { name: string; version: string; license: string; author: string | null; url: string | null; text: string | null };
type LicenseFile = { generatedAt: string; frontend: LicenseEntry[]; backend: LicenseEntry[]; fonts: LicenseEntry[] };

function LicenseList({ title, description, items }: { title: string; description: string; items: LicenseEntry[] }) {
  return (
    <>
      <h2>{title}</h2>
      <p>{description}</p>
      <ul className="license-list">
        {items.map((item) => (
          <li key={`${item.name}@${item.version}`}>
            <div className="license-head">
              <strong>{item.url ? <a href={item.url} target="_blank" rel="noreferrer noopener">{item.name}</a> : item.name}</strong>
              <span className="license-version">{item.version}</span>
              <span className="license-badge">{item.license}</span>
            </div>
            {item.author && <small>{item.author}</small>}
            {item.text && (
              <details>
                <summary>Ver texto da licença</summary>
                <pre>{item.text}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function LicensesPage() {
  const [data, setData] = useState<LicenseFile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    import("../lib/third-party-licenses.json")
      .then((module) => setData(module.default as LicenseFile))
      .catch(() => setError("Não foi possível carregar a lista de licenças."));
  }, []);
  return (
    <LegalLayout hideResponsible title="Licenças e direitos autorais" intro={`© ${copyrightYears()} ${COMPANY.copyrightHolder}. Todos os direitos reservados. O sistema é software proprietário e usa as bibliotecas e fontes de código aberto abaixo, cada uma com a sua licença. Os direitos de cada uma continuam com os respectivos autores.`}>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Carregando a lista...</p>}
      {data && (
        <>
          <LicenseList title="No site (vai junto para o navegador)" description="Bibliotecas incluídas nas telas do sistema, inclusive as que elas usam por dentro." items={data.frontend} />
          <LicenseList title="No servidor" description="Bibliotecas que rodam só no servidor da aplicação." items={data.backend} />
          <LicenseList title="Fontes" description="Carregadas do Google Fonts, sob a SIL Open Font License 1.1." items={data.fonts} />
          <h2>Marca</h2>
          <p>A marca, o nome e a logo JH Telecom pertencem aos seus titulares.</p>
          <p className="license-generated">Lista gerada em {data.generatedAt.split("-").reverse().join("/")}.</p>
        </>
      )}
    </LegalLayout>
  );
}
