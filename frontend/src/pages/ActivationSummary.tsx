import { useState, type ReactNode } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import { api, type ActivationSummaryData } from "../api";
import { SkeletonRows } from "../components/Skeleton";
import { readDataCache, writeDataCache } from "../lib/data-cache";
import { usePeriodicLoad } from "../lib/screen-cache";

// Aba "Resumo" dos Acionamentos (23/11/2026): o que chegou hoje pelos grupos e o que aconteceu com cada card, e a
// lista dos cards dos ultimos 7 dias que vieram com dado faltando (sem OS, sem OLT) para corrigir a leitura.
const CACHE_KEY = "tela:acionamentos-resumo";
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function ActivationSummary({ tabs }: { tabs: ReactNode }) {
  const [data, setData] = useState<ActivationSummaryData | undefined>(() => readDataCache<ActivationSummaryData>(CACHE_KEY));
  const [error, setError] = useState("");
  async function load() {
    try { const result = await api.activationSummary(); setData(result); writeDataCache(CACHE_KEY, result); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar o resumo."); }
  }
  usePeriodicLoad(CACHE_KEY, load, 5 * 60_000);
  const today = data?.today;
  const tiles = today ? [
    { label: "Cards recebidos", value: today.received },
    { label: "Aceitos", value: today.accepted },
    { label: "Pendentes", value: today.pending },
    { label: "Recusados", value: today.refused },
    { label: "Barrados", value: today.blocked, hint: `${today.blockedSameCall} com chamado já aberto · ${today.blockedDuplicate} repetidos · ${today.blockedClosing} relatórios de encerramento` },
    { label: "Região pela IA", value: today.aiRegion, hint: today.received ? `${Math.round((today.aiRegion / today.received) * 100)}% dos cards de hoje` : undefined },
  ] : [];
  return (
    <>
      <div className="page-heading">
        <div><span className="section-kicker">MESARIOS</span><h1>Resumo dos cards</h1><p>O que chegou hoje pelos grupos e os cards dos últimos 7 dias que vieram com dado faltando.</p></div>
        <div className="page-actions">{tabs}<button className="secondary-button compact" onClick={() => void load()}><Activity size={15} /> Atualizar</button></div>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <section className="panel activation-panel as-panel">
        <h2 className="as-title">Hoje</h2>
        {!today ? <SkeletonRows rows={1} columns={6} label="Carregando resumo..." /> : (
          <div className="as-tiles">
            {tiles.map((tile) => <div className="as-tile" key={tile.label}><small>{tile.label}</small><strong>{tile.value}</strong>{tile.hint && <span>{tile.hint}</span>}</div>)}
          </div>
        )}
      </section>
      <section className="panel activation-panel as-panel">
        <h2 className="as-title"><AlertTriangle size={16} aria-hidden="true" /> Leitura incompleta <span className="as-count">{data?.problemCount ?? 0}</span></h2>
        <p className="as-hint">Cards dos últimos 7 dias em que o sistema não achou a OS ou a OLT (backbone não precisa de OLT). Se um formato se repetir aqui, dá para ajustar a leitura.</p>
        {!data ? <SkeletonRows rows={3} columns={4} label="Carregando..." /> : data.problems.length === 0 ? <div className="empty-state">Nenhum card com leitura incompleta.</div> : (
          <div className="as-list">
            {data.problems.map((problem) => (
              <div className="as-row" key={problem.id}>
                <div className="as-row-main"><strong>{problem.type || "Sem tipo"}</strong><span>{problem.preview || "(sem texto)"}</span></div>
                <div className="as-row-meta">
                  {problem.missing.map((item) => <span className="as-badge" key={item}>sem {item}</span>)}
                  <span className="as-status">{problem.status} · {when(problem.receivedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
