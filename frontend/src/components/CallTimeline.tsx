import { slaLimits } from "../lib/sla";
import { useEffect, useState } from "react";
import { api, type Call, type CallAuditLog } from "../api";

// Linha do tempo do chamado: quanto tempo ficou em cada etapa (aguardando tecnico, cada status de atendimento),
// da abertura ate a Data Fim (ou ate agora, se ainda aberto). Usa as datas do chamado e as trocas de status do
// historico (quando a pessoa pode ver a auditoria). A linha pontilhada marca o prazo de 6h.

type Segment = { label: string; from: number; to: number; tone: string };
const TONE: Record<string, string> = { "Aguardando técnico": "wait", Atribuido: "assigned", Atrelado: "assigned", Deslocamento: "travel", "Em campo": "field", Baixar: "assigned" };
const fmt = (minutes: number) => (minutes < 60 ? `${Math.round(minutes)} min` : minutes < 2880 ? `${Math.floor(minutes / 60)}h${String(Math.round(minutes % 60)).padStart(2, "0")}` : `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`);
const when = (ms: number) => new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function buildSegments(call: Call, logs: CallAuditLog[], now = Date.now()): Segment[] {
  const opened = Date.parse(call.openedAt);
  const closed = ["Finalizado", "Cancelado"].includes(call.status);
  const end = closed && call.executedAt ? Date.parse(call.executedAt) : now;
  if (!Number.isFinite(opened) || !Number.isFinite(end) || end <= opened) return [];
  const assigned = call.assignedAt ? Date.parse(call.assignedAt) : NaN;
  // Trocas de status dentro da janela, em ordem.
  const changes = logs
    .filter((log) => log.field === "status" && Number.isFinite(Date.parse(log.createdAt)))
    .map((log) => ({ at: Date.parse(log.createdAt), to: log.newValue.split(" (")[0] }))
    .filter((change) => change.at > opened && change.at < end)
    .sort((a, b) => a.at - b.at);
  const segments: Segment[] = [];
  const firstWork = Number.isFinite(assigned) && assigned > opened && assigned < end ? assigned : changes.find((change) => change.to !== "Aberto")?.at;
  segments.push({ label: "Aguardando técnico", from: opened, to: firstWork ?? end, tone: "wait" });
  if (firstWork) {
    let current = { label: changes.filter((change) => change.at <= firstWork).pop()?.to || "Atribuido", from: firstWork };
    if (current.label === "Aberto") current.label = "Atribuido";
    for (const change of changes.filter((item) => item.at > firstWork)) {
      if (["Finalizado", "Cancelado", "Aberto"].includes(change.to) || change.to === current.label) continue;
      segments.push({ label: current.label, from: current.from, to: change.at, tone: TONE[current.label] || "assigned" });
      current = { label: change.to, from: change.at };
    }
    segments.push({ label: current.label, from: current.from, to: end, tone: TONE[current.label] || "assigned" });
  }
  return segments.filter((segment) => segment.to > segment.from);
}

export function CallTimeline({ call }: { call: Call }) {
  const [logs, setLogs] = useState<CallAuditLog[]>([]);
  useEffect(() => { let active = true; api.auditLogs(call.id).then((data) => { if (active) setLogs(data.logs); }).catch(() => undefined); return () => { active = false; }; }, [call.id]);
  const segments = buildSegments(call, logs);
  if (!segments.length) return null;
  const start = segments[0].from;
  const end = segments[segments.length - 1].to;
  const span = end - start;
  const limits = slaLimits(call.type);
  const deadline = start + limits.onTimeMinutes * 60_000;
  const closed = ["Finalizado", "Cancelado"].includes(call.status);
  const totals = new Map<string, number>();
  for (const segment of segments) totals.set(segment.label, (totals.get(segment.label) || 0) + (segment.to - segment.from) / 60_000);
  return (
    <section className="panel ct-panel" aria-label="Linha do tempo do chamado">
      <div className="ct-head">
        <strong>Linha do tempo</strong>
        <span>{closed ? "Total" : "Até agora"}: <b>{fmt(span / 60_000)}</b>{span > limits.onTimeMinutes * 60_000 ? ` · passou do prazo de ${limits.label}` : ""}</span>
      </div>
      <div className="ct-bar" role="img" aria-label={segments.map((segment) => `${segment.label}: ${fmt((segment.to - segment.from) / 60_000)}`).join("; ")}>
        {segments.map((segment, index) => <i key={index} className={`is-${segment.tone}`} style={{ flexGrow: segment.to - segment.from }} title={`${segment.label}: ${fmt((segment.to - segment.from) / 60_000)} (${when(segment.from)} → ${when(segment.to)})`} />)}
        {deadline < end && <span className="ct-deadline" style={{ left: `${((deadline - start) / span) * 100}%` }} title={`Prazo de 6h: ${when(deadline)}`} />}
      </div>
      <ul className="ct-legend">
        {[...totals.entries()].map(([label, minutes]) => <li key={label}><i className={`is-${TONE[label] || "assigned"}`} aria-hidden="true" />{label === "Atribuido" ? "Atribuído" : label} <b>{fmt(minutes)}</b></li>)}
      </ul>
    </section>
  );
}
