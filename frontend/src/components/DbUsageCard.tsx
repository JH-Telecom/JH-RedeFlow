import { useEffect, useState } from "react";
import { CircleCheck, Database, RefreshCw, TriangleAlert } from "lucide-react";
import { api, type DbUsageReport } from "../api";

// Configuracoes -> Trafego do banco (Supabase). O plano gratuito da 5 GB por mes de trafego de saida; o projeto
// antigo estourou e foi bloqueado. Mostra a estimativa dos ultimos 30 dias, o gasto por dia e o que mais consome.
// Perto do limite o servidor entra sozinho em modo economia (consulta o banco menos vezes).
const MODE: Record<DbUsageReport["mode"], { label: string; tone: string; text: string }> = {
  normal: { label: "Normal", tone: "is-ok", text: "Consumo dentro do limite." },
  economia: { label: "Modo economia", tone: "is-warn", text: "Passou de 60% do limite: o sistema consulta o banco 3x menos." },
  economia_forte: { label: "Economia forte", tone: "is-danger", text: "Passou de 85% do limite: o sistema consulta o banco 10x menos. Telas podem demorar mais para mostrar mudanças." },
};

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  return `${Math.round(bytes / 1024).toLocaleString("pt-BR")} KB`;
}
const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

export function DbUsageCard() {
  const [data, setData] = useState<DbUsageReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try { setData(await api.dbUsage()); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar o consumo do banco."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const mode = data ? MODE[data.mode] : null;
  // A escala sempre inclui o limite por dia, para a linha tracejada aparecer mesmo com dias baixos.
  const max = data ? Math.max(1, data.limitBytes / 30, ...data.daily.map((item) => item.bytes)) : 1;
  const dailyLimit = data ? data.limitBytes / 30 : 0; // limite do mes dividido por 30
  const hovered = data && hover !== null ? data.daily[hover] : null;
  const ModeIcon = data?.mode === "normal" ? CircleCheck : TriangleAlert;

  return (
    <section className="panel dbu-card" aria-labelledby="dbu-title">
      <div className="ext-card-head">
        <span className="ext-card-icon"><Database size={20} aria-hidden="true" /></span>
        <div>
          <h2 id="dbu-title">Tráfego do banco (Supabase)</h2>
          <p>Estimativa do que sai do banco nos últimos 30 dias. O plano gratuito permite {data ? formatBytes(data.limitBytes) : "5 GB"} por mês; perto disso o sistema entra sozinho em modo economia.</p>
        </div>
        <button className="secondary-button compact" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} aria-hidden="true" />{loading ? "Atualizando..." : "Atualizar"}</button>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {data && !data.supabase && <p className="dbu-note">Ambiente sem Supabase (dados de demonstração): nada é medido aqui.</p>}
      {data && mode && (
        <>
          <div className="dbu-hero">
            <div>
              <span className="dbu-kicker">Últimos 30 dias</span>
              <strong className="dbu-total">{formatBytes(data.last30DaysBytes)} <small>de {formatBytes(data.limitBytes)} ({data.percent.toLocaleString("pt-BR")}%)</small></strong>
            </div>
            <span className={`dbu-mode ${mode.tone}`}><ModeIcon size={14} aria-hidden="true" />{mode.label}</span>
          </div>
          <div className="dbu-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, data.percent)} aria-label="Uso do limite mensal">
            <span className={mode.tone} style={{ width: `${Math.min(100, data.percent)}%` }} />
            <i style={{ left: "60%" }} title="60%: modo economia" />
            <i style={{ left: "85%" }} title="85%: economia forte" />
          </div>
          <p className="dbu-note">{mode.text} Hoje: {formatBytes(data.today.bytes)} em {data.today.requests.toLocaleString("pt-BR")} consultas. Neste ritmo, 30 dias dariam {formatBytes(data.projected30DaysBytes)}.{data.trackedDays < 30 ? ` Medição começou há ${data.trackedDays} dia(s).` : ""}</p>

          <div className="dbu-chart-head">
            <h3>Por dia</h3>
            <span className="dbu-tip" aria-live="polite">{hovered ? `${dayLabel(hovered.day)}: ${formatBytes(hovered.bytes)} · ${hovered.requests.toLocaleString("pt-BR")} consultas` : `Linha tracejada: ${formatBytes(dailyLimit)} por dia (limite ÷ 30)`}</span>
          </div>
          <div className="dbu-chart" onMouseLeave={() => setHover(null)}>
            <div className="dbu-limit-line" style={{ bottom: `${(dailyLimit / max) * 100}%` }} />
            {data.daily.map((item, index) => (
              <button type="button" key={item.day} className={`dbu-bar${hover === index ? " is-hover" : ""}`} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} onBlur={() => setHover(null)} aria-label={`${dayLabel(item.day)}: ${formatBytes(item.bytes)}, ${item.requests} consultas`}>
                <span style={{ height: item.bytes ? `max(2px, ${(item.bytes / max) * 100}%)` : 0 }} />
              </button>
            ))}
          </div>
          <div className="dbu-axis"><span>{dayLabel(data.daily[0].day)}</span><span>hoje</span></div>

          <h3 className="dbu-sub">O que mais consome (30 dias)</h3>
          {data.topTargets.length ? (
            <table className="dbu-table">
              <thead><tr><th>Tabela / função</th><th>Tráfego</th><th>Consultas</th></tr></thead>
              <tbody>{data.topTargets.map((target) => <tr key={target.name}><td>{target.name}</td><td>{formatBytes(target.bytes)}</td><td>{target.requests.toLocaleString("pt-BR")}</td></tr>)}</tbody>
            </table>
          ) : <p className="dbu-note">Ainda sem medição.</p>}
          <p className="dbu-note">É uma estimativa para mais (conta o tamanho sem compressão). O número oficial fica no painel do Supabase, em Usage → Egress.</p>
        </>
      )}
    </section>
  );
}
