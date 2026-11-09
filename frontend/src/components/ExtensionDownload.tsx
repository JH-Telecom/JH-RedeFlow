import { useEffect, useState } from "react";
import { Download, FolderSync, Puzzle } from "lucide-react";
import { api, downloadExtensionZip } from "../api";
import { askInstalledVersion, canUpdateFolder, forgetFolder, reloadInstalledExtension, updateExtensionFolder } from "../lib/extension-updater";

// Configuracoes -> Extensao do Chrome.
// - "Atualizar a extensao deste Chrome": grava a versao nova direto na pasta da extensao (Chrome/Edge) e manda a
//   extensao se recarregar. Na primeira vez escolhe a pasta; depois o sistema lembra.
// - "Baixar .zip": para instalar num computador novo (passo a passo abaixo).
export function ExtensionDownloadCard() {
  const [info, setInfo] = useState<{ version: string; fileName: string } | null>(null);
  const [installed, setInstalled] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState<"" | "zip" | "pasta">("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    api.extensionInfo().then(setInfo).catch(() => setInfo(null));
    askInstalledVersion().then(setInstalled);
  }, []);

  async function download() {
    setBusy("zip");
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
    } finally { setBusy(""); }
  }

  async function updateFolder() {
    setBusy("pasta");
    setMessage(null);
    try {
      const result = await updateExtensionFolder();
      const reloaded = await reloadInstalledExtension();
      setMessage({
        text: `Pasta "${result.folder}" atualizada${result.from ? ` da versão ${result.from}` : ""} para a ${result.to} (${result.files} arquivos). ${reloaded ? "A extensão foi recarregada sozinha. Recarregue a aba do WhatsApp Web." : "Agora clique em Recarregar na extensão em chrome://extensions e recarregue o WhatsApp Web."}`,
        error: false,
      });
      if (reloaded) setInstalled(result.to);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      // Fechou a janela de escolher a pasta: nao e erro.
      if (/abort|cancel/i.test(text)) setMessage(null);
      else setMessage({ text, error: true });
    } finally { setBusy(""); }
  }

  const outdated = Boolean(info && installed && installed !== info.version);
  return (
    <section className="panel ext-card" aria-labelledby="ext-card-title">
      <div className="ext-card-head">
        <span className="ext-card-icon"><Puzzle size={20} aria-hidden="true" /></span>
        <div>
          <h2 id="ext-card-title">Extensão do Chrome</h2>
          <p>Coleta do OFS, identificador de quem enviou no WhatsApp, temas e ferramentas do WhatsApp Web.</p>
          <p className="ext-versions">
            <span>Versão atual: <strong>{info?.version || "–"}</strong></span>
            <span className={outdated ? "ext-badge is-old" : installed ? "ext-badge is-ok" : "ext-badge"}>
              {installed === undefined ? "Procurando a extensão neste Chrome..." : installed ? `Neste Chrome: ${installed}${outdated ? " (desatualizada)" : " (em dia)"}` : "Não encontrei a extensão neste Chrome (ou é anterior à 1.7)"}
            </span>
          </p>
        </div>
        <div className="ext-actions">
          {canUpdateFolder() && (
            <button className="primary-button compact" type="button" onClick={() => void updateFolder()} disabled={Boolean(busy)}>
              <FolderSync size={16} aria-hidden="true" /> {busy === "pasta" ? "Atualizando..." : "Atualizar a extensão deste Chrome"}
            </button>
          )}
          <button className="secondary-button compact" type="button" onClick={() => void download()} disabled={Boolean(busy)}>
            <Download size={16} aria-hidden="true" /> {busy === "zip" ? "Preparando..." : "Baixar .zip"}
          </button>
        </div>
      </div>
      {message && <p className={message.error ? "form-error" : "save-message"} role={message.error ? "alert" : "status"}>{message.text}</p>}
      {canUpdateFolder() && (
        <p className="ext-update"><strong>Atualizar:</strong> clique em "Atualizar a extensão deste Chrome". Na primeira vez escolha a pasta <code>jh-redeflow-extensao</code> e permita editar; nas próximas o sistema já lembra a pasta. <button className="link-button" type="button" onClick={() => { void forgetFolder(); setMessage({ text: "Pasta esquecida. Na próxima atualização o sistema pede a pasta de novo.", error: false }); }}>Escolher outra pasta</button></p>
      )}
      <details className="ext-install">
        <summary>Instalar num computador novo</summary>
        <ol className="ext-steps">
          <li>Clique em <strong>Baixar .zip</strong> e <strong>extraia</strong> numa pasta fixa do computador (ex.: Documentos). Não apague essa pasta depois: o Chrome usa ela.</li>
          <li>No Chrome, abra <code>chrome://extensions</code> e ligue o <strong>Modo do desenvolvedor</strong> (canto superior direito).</li>
          <li>Clique em <strong>Carregar sem compactação</strong> e escolha a pasta <code>jh-redeflow-extensao</code>.</li>
          <li>Fixe a extensão na barra (ícone de quebra-cabeça), abra e <strong>entre com o login do sistema</strong>.</li>
          <li>Abra ou recarregue o <strong>WhatsApp Web</strong>.</li>
        </ol>
      </details>
    </section>
  );
}
