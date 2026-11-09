import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CircleHelp, MessageCircle, RefreshCw, XCircle } from "lucide-react";
import { api, type IntegrationHealth, type HealthStatus, type StuckReason } from "../api";
import { Panel } from "../components/charts";
import { Pager, usePaged } from "../components/Pager";

// Integracao OFS: semaforo da coleta (export, fechamentos, clusters, falhas), fila dos chamados concluidos no OFS
// que nao finalizaram aqui (com o motivo) e o historico do que a extensao fez. Atualiza sozinho a cada minuto.

const STATUS: Record<HealthStatus, { label: string; icon: typeof CheckCircle2 }> = {
  ok: { label: "OK", icon: CheckCircle2 },
  warn: { label: "Atenção", icon: AlertTriangle },
  critical: { label: "Parado", icon: XCircle },
  unknown: { label: "Sem dados", icon: CircleHelp },
};
const KIND_LABEL: Record<string, string> = { export: "Export", closing: "Fechamentos", cluster: "Clusters", extension: "Extensão", sla_alert: "Aviso de prazo", daily_report: "Resumo diário", integration_alert: "Coleta parada", escalation: "Escalonamento", daily_reset: "Limpeza diária" };
const spDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–");
const waiting = (minutes: number | null) => (minutes === null ? "–" : minutes < 60 ? `${minutes} min` : minutes < 2880 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` : `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`);

export function IntegrationHealthPage() {
  const [data, setData] = useState<IntegrationHealth | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState<StuckReason | "all">("all");
  const [openEvent, setOpenEvent] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.integrationHealth()); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar o painel."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const interval = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(interval); }, [load]);

  const reasonCounts = useMemo(() => {
    const counts = new Map<StuckReason, number>();
    for (const call of data?.stuck ?? []) for (const item of call.reasons) counts.set(item, (counts.get(item) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);
  const stuck = (data?.stuck ?? []).filter((call) => reason === "all" || call.reasons.includes(reason));
  const pagedStuck = usePaged(stuck, stuck.length);

  return (
    <div className="dv-dashboard ih-page">
      <div className="page-heading dv-heading">
        <div>
          <span className="section-kicker">ADMINISTRAÇÃO</span>
          <h1>Integração OFS</h1>
          <p>Se a coleta do OFS está funcionando e quais chamados concluídos no OFS ainda não finalizaram aqui, com o motivo.</p>
        </div>
        <button className="secondary-button compact" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? "ih-spin" : ""} /> {loading ? "Atualizando..." : "Atualizar"}</button>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {!data ? (!error && <div className="dv-empty" role="status">Carregando...</div>) : <>
        <div className="ih-checks">
          {data.checks.map((check) => {
            const { label, icon: Icon } = STATUS[check.status];
            return (
              <article key={check.key} className={`panel ih-check is-${check.status}`}>
                <header><span className="ih-badge"><Icon size={14} aria-hidden="true" />{label}</span><h2>{check.label}</h2></header>
                <p>{check.detail}</p>
                {check.lastAt && <small>Último certo: {spDateTime(check.lastAt)}</small>}
              </article>
            );
          })}
          <article className={`panel ih-check is-${data.whatsapp.configured ? "ok" : "unknown"}`}>
            <header><span className="ih-badge"><MessageCircle size={14} aria-hidden="true" />{data.whatsapp.configured ? "Ligado" : "Desligado"}</span><h2>Avisos no WhatsApp</h2></header>
            {data.whatsapp.configured
              ? <p>Avisa {data.whatsapp.chat} quando um chamado entra na última 1h do prazo de 6h, quando um chamado é escalado (sem técnico há 5h, ou sem observação há 2h) e quando a coleta do OFS fica mais de 2h parada (e quando volta).{data.whatsapp.alerts[0] ? ` Último: ${data.whatsapp.alerts[0].summary} (${spDateTime(data.whatsapp.alerts[0].createdAt)}).` : " Nenhum aviso enviado ainda."}</p>
              : <p>Para ligar, configure no Render: <code>WUZAPI_API_URL</code>, <code>WUZAPI_USER_TOKEN</code> e <code>WUZAPI_ALERT_CHAT</code> (ID do grupo ou número). O aviso no sino já funciona sem isso.</p>}
          </article>
        </div>
        {data.d0 && data.d0.rowCount > 0 && <p className="ih-d0">Base D-0 atual: <strong>{data.d0.fileName || "sem nome"}</strong> · {data.d0.rowCount} linhas · {spDateTime(data.d0.uploadedAt)}{data.d0.uploadedBy ? ` · ${data.d0.uploadedBy}` : ""}</p>}

        <Panel kicker="FILA" title="Concluídos no OFS que ainda não finalizaram aqui" aside={<span className="sa-aside">{data.stuck.length} chamado(s)</span>}>
          {!data.stuck.length ? <div className="dv-empty">Nenhum chamado parado: tudo o que concluiu no OFS já finalizou aqui.</div> : <>
            <div className="ih-reasons" role="group" aria-label="Filtrar por motivo">
              <button type="button" className={reason === "all" ? "is-active" : ""} aria-pressed={reason === "all"} onClick={() => setReason("all")}>Todos <b>{data.stuck.length}</b></button>
              {reasonCounts.map(([item, count]) => <button key={item} type="button" className={reason === item ? "is-active" : ""} aria-pressed={reason === item} onClick={() => setReason(item)}>{data.reasonLabels[item]} <b>{count}</b></button>)}
            </div>
            <div className="sa-table-wrap">
              <table className="sa-table ih-table">
                <thead><tr><th>Ordem</th><th>Técnico</th><th>Status aqui</th><th>Data Fim (OFS)</th><th>Esperando</th><th>O que falta</th></tr></thead>
                <tbody>
                  {pagedStuck.pageItems.map((call) => (
                    <tr key={call.id}>
                      <td><Link to={`/chamados/${call.id}`} className="rp-order">{call.orderNumber}</Link>{call.region && <small>{call.region}</small>}</td>
                      <td>{call.technicianName || <span className="ih-missing">Sem técnico</span>}</td>
                      <td>{call.status}<small>OFS: {call.ofsStatus || "–"}</small></td>
                      <td>{spDateTime(call.executedAt)}</td>
                      <td>{waiting(call.waitingMinutes)}</td>
                      <td><span className="ih-chips">{call.reasons.map((item) => <span key={item} className={`ih-chip${item === "pronto" ? " is-ready" : ""}`}>{data.reasonLabels[item]}</span>)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table><Pager {...pagedStuck} noun={["chamado", "chamados"]} />
            </div>
            <p className="ih-hint">Sem técnico: atribua no chamado. Ordem em mais de um chamado: cancele o repetido. Fechamento não lido ou em código: a extensão lê de novo no próximo ciclo; se continuar, confira a atividade no OFS. "Pronto" finaliza sozinho no próximo ciclo da extensão.</p>
          </>}
        </Panel>

        <Panel kicker="HISTÓRICO" title="O que a coleta fez (últimas 72 h)" aside={<span className="sa-aside">{data.events.length} registro(s)</span>}>
          {!data.events.length ? <div className="dv-empty">Nada registrado ainda. Os registros começam no próximo ciclo da extensão (v1.3.4 manda também os erros do navegador).</div> : (
            <ul className="ih-events">
              {data.events.map((event) => {
                const falhas = Array.isArray(event.details?.falhas) ? event.details.falhas as { ordem: string; tipo?: string; motivo: string }[] : [];
                return (
                  <li key={event.id} className={event.ok ? "is-ok" : "is-fail"}>
                    <span className="ih-event-icon" aria-label={event.ok ? "certo" : "falha"}>{event.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}</span>
                    <span className="ih-event-kind">{KIND_LABEL[event.kind] || event.kind}</span>
                    <span className="ih-event-text">
                      {event.summary}
                      {falhas.length > 0 && <button type="button" className="link-button" onClick={() => setOpenEvent(openEvent === event.id ? null : event.id)}>{openEvent === event.id ? "esconder" : `${falhas.length} ordem(ns)`}</button>}
                      {openEvent === event.id && <ul className="ih-falhas">{falhas.map((item, index) => <li key={`${item.ordem}-${index}`}><b>{item.ordem}</b> {item.motivo}</li>)}</ul>}
                    </span>
                    <time>{spDateTime(event.createdAt)}</time>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </>}
    </div>
  );
}
