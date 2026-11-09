import { useEffect, useState } from "react";
import { Download, Puzzle } from "lucide-react";
import { api, downloadExtensionZip } from "../api";

// Configuracoes -> Extensao do Chrome: baixa o .zip da versao atual (montado pelo servidor) e mostra como instalar
// nos computadores (mesarios). Atualizar = baixar de novo, trocar a pasta e clicar em Recarregar.
export function ExtensionDownloadCard() {
  const [info, setInfo] = useState<{ version: string; fileName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => { api.extensionInfo().then(setInfo).catch(() => setInfo(null)); }, []);

  async function download() {
    setBusy(true);
    setMessage(null);
    try {
      const { blob, fileName } = await downloadExtensionZip();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = info?.fileName || fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setMessage({ text: `Baixado: ${info?.fileName || fileName}. Siga os passos abaixo no computador do mesário.`, error: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Não foi possível baixar a extensão.", error: true });
    } finally { setBusy(false); }
  }

  return (
    <section className="panel ext-card" aria-labelledby="ext-card-title">
      <div className="ext-card-head">
        <span className="ext-card-icon"><Puzzle size={20} aria-hidden="true" /></span>
        <div>
          <h2 id="ext-card-title">Extensão do Chrome</h2>
          <p>Coleta do OFS, identificador de quem enviou no WhatsApp, temas e ferramentas do WhatsApp Web.{info ? ` Versão atual: ${info.version}.` : ""}</p>
        </div>
        <button className="primary-button compact" type="button" onClick={() => void download()} disabled={busy}>
          <Download size={16} aria-hidden="true" /> {busy ? "Preparando..." : "Baixar extensão (.zip)"}
        </button>
      </div>
      {message && <p className={message.error ? "form-error" : "save-message"} role={message.error ? "alert" : "status"}>{message.text}</p>}
      <ol className="ext-steps">
        <li><strong>Extraia o .zip</strong> numa pasta fixa do computador (ex.: Documentos). Não apague essa pasta depois: o Chrome usa ela.</li>
        <li>No Chrome, abra <code>chrome://extensions</code> e ligue o <strong>Modo do desenvolvedor</strong> (canto superior direito).</li>
        <li>Clique em <strong>Carregar sem compactação</strong> e escolha a pasta <code>jh-redeflow-extensao</code>.</li>
        <li>Fixe a extensão na barra (ícone de quebra-cabeça), abra e <strong>entre com o login do sistema</strong>. Na aba WhatsApp, confira o nome que vai nas mensagens.</li>
        <li>Abra ou recarregue o <strong>WhatsApp Web</strong>.</li>
      </ol>
      <p className="ext-update"><strong>Para atualizar:</strong> baixe de novo, substitua os arquivos da mesma pasta e clique em <strong>Recarregar</strong> na extensão em <code>chrome://extensions</code>.</p>
    </section>
  );
}
