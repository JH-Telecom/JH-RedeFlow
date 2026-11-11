import { useEffect, useMemo, useState } from "react";
import { CircleCheck, CloudUpload, Copy, RefreshCw, TriangleAlert } from "lucide-react";
import { api, type BackupStatus } from "../api";
import { formatBytes } from "./DbUsageCard";

// Configuracoes -> Backup do banco. O Supabase gratuito nao guarda backup: todo dia a partir das 03:00 o servidor
// manda uma copia compactada de todas as tabelas para um Apps Script na conta Google da pessoa, que guarda no Drive.
// O segredo e gerado aqui (fica guardado neste navegador para o codigo e o Render baterem) e vai no codigo do
// script e em BACKUP_DRIVE_SECRET no Render.
const SECRET_KEY = "jh-backup-segredo";
function newSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function storedSecret() {
  try {
    const saved = window.localStorage.getItem(SECRET_KEY);
    if (saved && saved.length >= 32) return saved;
    const fresh = newSecret();
    window.localStorage.setItem(SECRET_KEY, fresh);
    return fresh;
  } catch { return newSecret(); }
}
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="secondary-button compact" onClick={() => { void navigator.clipboard.writeText(text).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1800); }); }}>
      <Copy size={14} aria-hidden="true" />{done ? "Copiado" : label}
    </button>
  );
}

export function BackupCard() {
  const [data, setData] = useState<BackupStatus | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const secret = useMemo(storedSecret, []);

  async function load() {
    try { setData(await api.backupStatus()); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar os backups."); }
  }
  useEffect(() => { void load(); }, []);

  async function runNow() {
    setBusy(true); setMessage(""); setError("");
    try { const result = await api.runBackup(); setMessage(result.summary); }
    catch (err) { setError(err instanceof Error ? err.message : "O backup falhou."); }
    finally { setBusy(false); void load(); }
  }

  const last = data?.history[0];
  const lastOk = data?.history.find((item) => item.ok);
  const script = data ? data.scriptTemplate.replace("__SEGREDO__", secret) : "";
  const setupOpen = showSetup || (data !== null && !data.configured);

  return (
    <section className="panel dbu-card bkp-card" aria-labelledby="bkp-title">
      <div className="ext-card-head">
        <span className="ext-card-icon"><CloudUpload size={20} aria-hidden="true" /></span>
        <div>
          <h2 id="bkp-title">Backup do banco (Google Drive)</h2>
          <p>O Supabase gratuito não guarda backup. Todo dia a partir das {String(data?.hour ?? 3).padStart(2, "0")}:00 o sistema manda uma cópia de todas as tabelas para a pasta <strong>JH RedeFlow - Backups</strong> do seu Google Drive e guarda os últimos {data?.retentionDays ?? 90} dias.</p>
        </div>
        <button className="primary-button compact" type="button" onClick={() => void runNow()} disabled={busy || !data?.configured}><RefreshCw size={14} aria-hidden="true" />{busy ? "Fazendo backup..." : "Fazer backup agora"}</button>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {message && <div className="save-message" role="status">{message}</div>}

      {data && (
        <div className="bkp-status">
          <span className={`dbu-mode ${data.configured ? (last && !last.ok ? "is-warn" : "is-ok") : "is-warn"}`}>
            {data.configured && (!last || last.ok) ? <CircleCheck size={14} aria-hidden="true" /> : <TriangleAlert size={14} aria-hidden="true" />}
            {data.configured ? (last && !last.ok ? "Último backup falhou" : "Ativo") : "Não configurado"}
          </span>
          <span className="dbu-note">
            {lastOk ? `Último backup certo: ${when(lastOk.createdAt)}${lastOk.gzipBytes ? ` · ${formatBytes(lastOk.gzipBytes)}` : ""}` : "Nenhum backup feito ainda."}
          </span>
          {data.configured && <button type="button" className="bkp-link" onClick={() => setShowSetup((value) => !value)}>{showSetup ? "Esconder passo a passo" : "Ver passo a passo"}</button>}
        </div>
      )}

      {data && setupOpen && (
        <ol className="bkp-steps">
          <li>
            <strong>Crie o script.</strong> Entre em <a href="https://script.google.com" target="_blank" rel="noreferrer">script.google.com</a> com a conta Google que vai guardar os backups, clique em <em>Novo projeto</em>, apague o que estiver lá e cole este código:
            <div className="bkp-code-head"><span className="dbu-note">O código já leva o segredo deste sistema.</span><CopyButton text={script} label="Copiar código" /></div>
            <pre className="bkp-code" tabIndex={0}>{script}</pre>
          </li>
          <li><strong>Publique.</strong> Clique em <em>Implantar → Nova implantação</em>, escolha o tipo <em>App da Web</em>, deixe <em>Executar como: Eu</em> e <em>Quem pode acessar: Qualquer pessoa</em>, clique em <em>Implantar</em> e autorize o acesso ao Drive. Copie o <em>URL do app da Web</em> (termina em <code>/exec</code>).</li>
          <li>
            <strong>Ligue no Render.</strong> No serviço da API, em <em>Environment</em>, crie duas variáveis e salve (o servidor reinicia sozinho):
            <div className="bkp-env"><code>BACKUP_DRIVE_URL</code><span>o link copiado no passo 2</span></div>
            <div className="bkp-env"><code>BACKUP_DRIVE_SECRET</code><code className="bkp-secret">{secret}</code><CopyButton text={secret} label="Copiar segredo" /></div>
          </li>
          <li><strong>Teste.</strong> Volte aqui e clique em <em>Fazer backup agora</em>. O arquivo aparece no Drive em alguns segundos.</li>
        </ol>
      )}

      {data && data.history.length > 0 && (
        <>
          <h3 className="dbu-sub">Últimos backups</h3>
          <ul className="bkp-history">
            {data.history.slice(0, 10).map((item) => (
              <li key={item.createdAt} className={item.ok ? "is-ok" : "is-fail"}>
                {item.ok ? <CircleCheck size={14} aria-hidden="true" /> : <TriangleAlert size={14} aria-hidden="true" />}
                <span className="bkp-when">{when(item.createdAt)}</span>
                <span>{item.summary}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="dbu-note">Para restaurar, o arquivo <code>.json.gz</code> do Drive tem todas as tabelas e a lista de logins (sem senhas: numa restauração cada pessoa redefine a senha).</p>
    </section>
  );
}
