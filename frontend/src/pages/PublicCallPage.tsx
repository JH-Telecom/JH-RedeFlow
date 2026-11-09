import { useEffect, useState } from "react";
import { CircleCheck, Clock, Eye, MapPin, MessageSquareText, RefreshCw, Router, TriangleAlert } from "lucide-react";
import faviconUrl from "../../image/favicon.ico";
import { api, type PublicView } from "../api";
import { CopyrightNotice } from "../components/Copyright";
import { withMentions } from "../components/MentionTextarea";

// Consulta do chamado pelo link do informativo (setor Casa Cliente): so leitura, so este chamado, sem login.
// Atualiza sozinha a cada 1 minuto. O link expira 7 dias depois do encerramento.
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "–");
const CLOSED = ["Finalizado", "Cancelado", "Baixar", "GIGA+"];

function statusTone(state: PublicView["state"], status?: string) {
  if (state === "recusado" || status === "Cancelado") return "is-muted";
  if (state === "aguardando") return "is-waiting";
  if (status && CLOSED.includes(status)) return "is-done";
  return "is-active";
}

export function PublicCallPage({ token }: { token: string }) {
  const [data, setData] = useState<PublicView | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    document.title = "Consulta de chamado · JH Telecom - Rede";
    let active = true;
    const load = () => api.publicView(token)
      .then((result) => { if (active) { setData(result); setError(""); setUpdatedAt(Date.now()); } })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar o chamado."); });
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [token]);

  const state = data?.state;
  const call = data?.call;
  const statusLabel = !data ? "" : state === "aguardando" ? "Aguardando aceite da equipe de Rede" : state === "recusado" ? "Acionamento não aceito pela equipe de Rede" : call!.status;

  return (
    <div className="pv-page">
      <header className="pv-header">
        <div className="pv-brand"><img src={faviconUrl} alt="" /><div><strong>JH Telecom · Rede</strong><small>Consulta de chamado</small></div></div>
        <span className="pv-readonly"><Eye size={14} aria-hidden="true" /> Somente leitura</span>
      </header>
      <main id="conteudo" className="pv-main">
        {error && !data ? (
          <section className="panel pv-message" role="alert"><TriangleAlert size={22} aria-hidden="true" /><div><h1>Não foi possível abrir</h1><p>{error}</p></div></section>
        ) : !data ? (
          <section className="panel pv-message" role="status"><RefreshCw size={20} aria-hidden="true" /><p>Carregando o chamado...</p></section>
        ) : (
          <>
            <section className={`panel pv-status ${statusTone(data.state, call?.status)}`}>
              <div>
                <span className="pv-kicker">{data.card.tipo || "Acionamento"}{data.card.evento ? ` · ${data.card.evento}` : ""}</span>
                <h1>{call ? `Chamado ${call.orderNumber}` : `OfficeTrack ${data.card.officeTrack || "–"}`}</h1>
                <p className="pv-status-line">{state === "chamado" && call && CLOSED.includes(call.status) ? <CircleCheck size={16} aria-hidden="true" /> : <Clock size={16} aria-hidden="true" />} {statusLabel}{call?.ofsStatus ? ` · OFS: ${call.ofsStatus}` : ""}</p>
              </div>
              <dl className="pv-facts">
                <div><dt>Recebido</dt><dd>{when(data.card.recebidoEm)}</dd></div>
                {call && <div><dt>Técnico</dt><dd>{call.technicianName || "Ainda sem técnico"}</dd></div>}
                {call && <div><dt>Fim</dt><dd>{call.executedAt ? when(call.executedAt) : "Em andamento"}</dd></div>}
                {state === "recusado" && <div><dt>Decisão</dt><dd>{when(data.decidedAt)}</dd></div>}
              </dl>
            </section>

            <div className="pv-grid">
              <section className="panel pv-card" aria-labelledby="pv-rede">
                <h2 id="pv-rede"><Router size={16} aria-hidden="true" /> Rede</h2>
                <dl className="pv-list">
                  <div><dt>OLT</dt><dd>{call?.olt || data.card.olt || "–"}</dd></div>
                  <div><dt>Placa/PON</dt><dd>{data.card.placaPon || call?.slotPon || "–"}</dd></div>
                  <div><dt>Afetação</dt><dd>{data.card.afetacao ?? "–"}</dd></div>
                  <div><dt>BDESK</dt><dd>{data.card.bdesk || "–"}</dd></div>
                  <div><dt>OfficeTrack</dt><dd>{data.card.officeTrack || "–"}</dd></div>
                  {call && <div><dt>Região</dt><dd>{[call.bairro, call.region].filter(Boolean).join(" · ") || "–"}</dd></div>}
                  {call?.result && <div><dt>Resultado</dt><dd>{call.result}</dd></div>}
                </dl>
              </section>
              <section className="panel pv-card" aria-labelledby="pv-enderecos">
                <h2 id="pv-enderecos"><MapPin size={16} aria-hidden="true" /> Endereços afetados</h2>
                {data.card.enderecos.length ? <ul className="pv-addresses">{data.card.enderecos.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="pv-empty">Sem endereços no card.</p>}
              </section>
            </div>

            {call && (
              <div className="pv-grid">
                <section className="panel pv-card" aria-labelledby="pv-timeline">
                  <h2 id="pv-timeline"><Clock size={16} aria-hidden="true" /> Linha do tempo</h2>
                  <ol className="pv-timeline">{(data.timeline || []).map((item, index) => <li key={`${item.at}-${index}`}><time>{when(item.at)}</time><span>{item.text}</span></li>)}</ol>
                </section>
                <section className="panel pv-card" aria-labelledby="pv-obs">
                  <h2 id="pv-obs"><MessageSquareText size={16} aria-hidden="true" /> Observações da equipe</h2>
                  {data.observations?.length ? (
                    <ul className="pv-observations">{data.observations.map((item, index) => <li key={`${item.createdAt}-${index}`}><p>{withMentions(item.text)}</p><small>{item.userName} · {when(item.createdAt)}</small></li>)}</ul>
                  ) : <p className="pv-empty">Nenhuma observação ainda.</p>}
                </section>
              </div>
            )}
            <p className="pv-footnote">Atualiza sozinha a cada minuto{updatedAt ? ` · última atualização às ${new Date(updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}. Este link mostra só este chamado e vale até 7 dias depois do encerramento.</p>
          </>
        )}
        <CopyrightNotice className="legal-links" />
      </main>
    </div>
  );
}
