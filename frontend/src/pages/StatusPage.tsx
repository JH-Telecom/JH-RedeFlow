import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, CircleHelp, CircleX, Database, HardDriveDownload, MessageCircle, RefreshCw, Server, TriangleAlert, Truck } from "lucide-react";
import { api, type SystemStatus, type SystemStatusLevel } from "../api";
import faviconUrl from "../../image/favicon.ico";

// Status do sistema (aberta sem login): servidor, banco, coleta do OFS, WhatsApp e backup. Atualiza a cada 1 min
// (so com a aba visivel); o servidor guarda o resultado 1 min, entao varias pessoas com a pagina aberta nao somam.
// Se o servidor nao responde, mostra "fora do ar" sem depender dele.
const ICONS: Record<string, typeof Server> = { server: Server, database: Database, ofs: Truck, whatsapp: MessageCircle, backup: HardDriveDownload };
const LEVEL: Record<SystemStatusLevel, { label: string; icon: typeof CircleCheck }> = {
  ok: { label: "Funcionando", icon: CircleCheck },
  warn: { label: "Atenção", icon: TriangleAlert },
  down: { label: "Fora do ar", icon: CircleX },
  unknown: { label: "Sem informação", icon: CircleHelp },
};
const HEADLINE: Record<SystemStatusLevel, string> = { ok: "Tudo funcionando", warn: "Funcionando, com pontos de atenção", down: "Há parte do sistema fora do ar", unknown: "Sem informação" };

const OFFLINE: SystemStatus = {
  status: "down",
  checkedAt: new Date().toISOString(),
  components: [
    { key: "server", label: "Servidor (API)", status: "down", detail: "O servidor não respondeu. Login, filas e acionamentos ficam fora do ar até ele voltar. Ele costuma voltar sozinho em alguns minutos (por exemplo, durante uma atualização).", checkedAt: new Date().toISOString() },
    { key: "database", label: "Banco de dados", status: "unknown", detail: "Sem como consultar enquanto o servidor estiver fora.", checkedAt: new Date().toISOString() },
    { key: "ofs", label: "Coleta do OFS (extensão)", status: "unknown", detail: "Sem como consultar enquanto o servidor estiver fora.", checkedAt: new Date().toISOString() },
    { key: "whatsapp", label: "WhatsApp (acionamentos e avisos)", status: "unknown", detail: "Sem como consultar enquanto o servidor estiver fora.", checkedAt: new Date().toISOString() },
  ],
};

export function StatusPage() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastLoad, setLastLoad] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    try { setData(await api.systemStatus()); }
    catch { setData({ ...OFFLINE, checkedAt: new Date().toISOString() }); }
    finally { setLoading(false); setLastLoad(new Date()); }
  }
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const overall = data?.status ?? "unknown";
  const OverallIcon = LEVEL[overall].icon;
  return (
    <div className="st-page">
      <header className="st-header">
        <Link to="/" className="st-brand"><img src={faviconUrl} alt="" /> JH RedeFlow</Link>
        <Link to="/" className="st-back">Voltar ao sistema</Link>
      </header>
      <main className="st-main">
        <h1>Status do sistema</h1>
        <section className={`st-banner is-${overall}`} aria-live="polite">
          <OverallIcon size={26} aria-hidden="true" />
          <div>
            <strong>{data ? HEADLINE[overall] : "Consultando..."}</strong>
            <span>{lastLoad ? `Atualizado às ${lastLoad.toLocaleTimeString("pt-BR")} · confere de novo a cada 1 min` : "Consultando o servidor..."}</span>
          </div>
          <button type="button" className="secondary-button compact" onClick={() => void load()} disabled={loading}><RefreshCw size={14} aria-hidden="true" />{loading ? "Atualizando..." : "Atualizar"}</button>
        </section>
        <ul className="st-list">
          {(data?.components ?? []).map((item) => {
            const Icon = ICONS[item.key] ?? Server;
            const Level = LEVEL[item.status];
            return (
              <li key={item.key} className={`st-item is-${item.status}`}>
                <span className="st-item-icon" aria-hidden="true"><Icon size={20} /></span>
                <div className="st-item-text">
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                </div>
                <span className={`st-level is-${item.status}`}><Level.icon size={14} aria-hidden="true" />{Level.label}</span>
              </li>
            );
          })}
        </ul>
        <p className="st-note">Esta página abre sem login, para dar para conferir mesmo quando o login não funciona. Ela mostra só a situação de cada parte, sem dados de chamados.</p>
      </main>
    </div>
  );
}
