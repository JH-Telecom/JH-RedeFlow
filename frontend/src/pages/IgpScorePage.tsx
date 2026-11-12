import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { Award, CheckCircle2, Download, FileSpreadsheet, Gauge, ListChecks, Lock, Percent, Save, Upload, XCircle } from "lucide-react";
import { api, type IgpReconciliation, type IgpRules, type IgpScoreData, type IgpScoredIndicator, type Role, type User } from "../api";
import { KpiTile, Panel } from "../components/charts";

// Pontuacao do IGP ACESSO (12/11/2026): igual a aba "IGP ACESSO" da planilha da Giga, calculada com os numeros das outras
// abas dela. Importa o "JH (NN).xlsx" (acumulado no mes), mostra a pontuacao por cluster, a regua de faixas, a evolucao
// e a conciliacao (ordens so na Giga, so no sistema e com fechamento diferente).
const fmtValue = (value: number | null, unit: "pct" | "h") => (value === null ? "—" : unit === "h" ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h` : `${(value * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const monthLabel = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const STATUS: Record<IgpScoredIndicator["status"], { label: string; className: string }> = {
  meta: { label: "Meta 100%", className: "is-hit" }, minimo: { label: "Meta mínima", className: "is-min" }, abaixo: { label: "Abaixo", className: "is-miss" }, travado: { label: "Travado", className: "is-locked" }, "sem-dado": { label: "Sem dado", className: "is-empty" },
};
function toCsv(rows: (string | number | null | undefined)[][]) {
  const esc = (value: unknown) => { const text = value === null || value === undefined ? "" : String(value); return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
  const url = URL.createObjectURL(new Blob([`﻿${rows.map((row) => row.map(esc).join(";")).join("\n")}`], { type: "text/csv;charset=utf-8" }));
  return url;
}
function download(name: string, rows: (string | number | null | undefined)[][]) {
  const link = document.createElement("a"); link.href = toCsv(rows); link.download = name; link.click();
}

function RulesEditor({ rules, onSaved }: { rules: IgpRules; onSaved: () => void }) {
  const [draft, setDraft] = useState<IgpRules>(rules);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setDraft(rules), [rules]);
  const setIndicator = (index: number, field: "weight" | "minWeight" | "target" | "minimum", raw: string) => {
    const value = Number(raw.replace(",", "."));
    if (!Number.isFinite(value)) return;
    const unit = draft.indicators[index].unit;
    const stored = (field === "target" || field === "minimum") && unit === "pct" ? value / 100 : value;
    setDraft({ ...draft, indicators: draft.indicators.map((item, i) => (i === index ? { ...item, [field]: stored } : item)) });
  };
  const shown = (value: number, unit: "pct" | "h", field: string) => ((field === "target" || field === "minimum") && unit === "pct" ? +(value * 100).toFixed(4) : value);
  async function save() {
    setSaving(true); setMessage("");
    try { await api.saveIgpRules(draft); setMessage("Regras salvas."); onSaved(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }
  return (
    <div className="isc-rules">
      <div className="isc-table-wrap">
        <table className="isc-table">
          <thead><tr><th scope="col">Indicador</th><th scope="col">Peso 100%</th><th scope="col">Peso mínimo</th><th scope="col">Meta 100%</th><th scope="col">Meta mínima</th></tr></thead>
          <tbody>
            {draft.indicators.map((item, index) => (
              <tr key={item.key}>
                <th scope="row">{item.label}<small>{item.unit === "pct" ? "em %" : "em horas"} · {item.direction === "lower" ? "menor melhor" : "maior melhor"}</small></th>
                {(["weight", "minWeight", "target", "minimum"] as const).map((field) => (
                  <td key={field}><input type="number" step="any" aria-label={`${field} de ${item.label}`} value={shown(item[field], item.unit, field)} onChange={(event) => setIndicator(index, field, event.target.value)} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="isc-check"><input type="checkbox" checked={draft.applyRedesGate} onChange={(event) => setDraft({ ...draft, applyRedesGate: event.target.checked })} /> Aplicar a condição do grupo Redes (realizado do grupo ≥ {Math.round(draft.redesGate * 100)}%)</label>
      <div className="isc-rules-foot">
        <button type="button" className="primary-button compact" onClick={() => void save()} disabled={saving}><Save size={14} aria-hidden="true" />{saving ? "Salvando…" : "Salvar regras"}</button>
        {message && <span role="status">{message}</span>}
      </div>
    </div>
  );
}

export function IgpScorePage({ user }: { user: User & { role: Role } }) {
  const canImport = user.role.permissions.includes("imports.create");
  const canEditRules = user.role.permissions.includes("settings.manage");
  const [data, setData] = useState<IgpScoreData | null>(null);
  const [rec, setRec] = useState<IgpReconciliation | null>(null);
  const [month, setMonth] = useState<string | undefined>();
  const [cluster, setCluster] = useState<string | undefined>();
  const [tab, setTab] = useState<"giga" | "sistema" | "horario">("giga");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load(nextMonth = month, nextCluster = cluster) {
    try {
      const next = await api.igpScore(nextMonth, nextCluster);
      setData(next); setError("");
      if (next.month && next.cluster) setRec(await api.igpReconciliation(next.month, next.cluster)); else setRec(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar a pontuação."); }
  }
  useEffect(() => { void load(); }, []);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true); setNotice(""); setError("");
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      let binary = ""; for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
      const result = await api.importGiga(file.name, btoa(binary));
      setNotice(`${file.name}: ${result.import.ordersCount} ordens de rede (até ${fmtDate(result.import.closedUntil)}), ${result.import.matchedCount} encontradas no sistema, ${result.updatedCalls} chamados atualizados com cluster e horários da Giga.`);
      setMonth(result.import.month); await load(result.import.month, cluster);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível importar a planilha."); }
    finally { setImporting(false); }
  }

  const score = data?.score;
  const groups = score ? [...new Set(score.indicators.map((item) => item.group))] : [];
  const bandTone = score ? (score.band.bonus > 0 ? "good" : score.band.bonus === 0 ? "warning" : "critical") : "default";
  return (
    <div className="dv-dashboard isc-page">
      <div className="page-heading dv-heading">
        <div>
          <span className="section-kicker">IGP · GIGA</span>
          <h1>Pontuação IGP</h1>
          <p>O nosso controle do IGP ACESSO, com as mesmas regras da planilha da Giga: pesos, metas, condições dos grupos e faixa de bonificação. Os números vêm da planilha "JH (NN).xlsx" importada.</p>
        </div>
        <div className="igp-filter-controls">
          {data && data.months.length > 0 && <label className="igp-month-picker">Mês<select value={data.month ?? ""} onChange={(event) => { setMonth(event.target.value); void load(event.target.value, cluster); }}>{data.months.map((item) => <option key={item} value={item}>{monthLabel(item)}</option>)}</select></label>}
          {data && data.clusters.length > 0 && <label className="igp-area-picker">Cluster<select value={data.cluster ?? ""} onChange={(event) => { setCluster(event.target.value); void load(month, event.target.value); }}>{data.clusters.map((item) => <option key={item} value={item}>{item}{item === data.mainCluster ? " (nosso)" : ""}</option>)}</select></label>}
          {canImport && <>
            <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(event) => void onFile(event)} />
            <button type="button" className="primary-button compact" onClick={() => fileRef.current?.click()} disabled={importing}><Upload size={15} aria-hidden="true" />{importing ? "Importando…" : "Importar planilha da Giga"}</button>
          </>}
        </div>
      </div>
      {error && <div className="dv-empty is-error" role="alert">{error}</div>}
      {notice && <p className="isc-notice" role="status">{notice}</p>}
      {data && !data.latest && !error && <div className="dv-empty"><FileSpreadsheet size={20} aria-hidden="true" /> Nenhuma planilha da Giga importada ainda. {canImport ? "Clique em \"Importar planilha da Giga\" e escolha o \"JH (NN).xlsx\" do mês." : "Peça para quem cuida das importações subir o \"JH (NN).xlsx\" do mês."}</div>}
      {!data && !error && <div className="dv-empty" role="status">Calculando a pontuação…</div>}

      {data?.latest && score && <>
        <p className="isc-source">Planilha <b>{data.latest.fileName}</b> · ordens fechadas até <b>{fmtDate(data.latest.closedUntil)}</b> · importada {fmtDate(data.latest.importedAt)}{data.latest.importedBy ? ` por ${data.latest.importedBy}` : ""}</p>
        <div className="dv-kpi-grid">
          <KpiTile label="Pontuação IGP" value={`${score.total.toLocaleString("pt-BR")} pts`} note={`${score.basePoints} de ${score.maxPoints} + ${score.accelerator} do acelerador`} icon={Gauge} tone={bandTone} />
          <KpiTile label="Faixa" value={score.band.band} note={`a partir de ${score.band.minPoints} pontos`} icon={Award} tone={bandTone} />
          <KpiTile label="Bonificação" value={`${score.band.bonus > 0 ? "+" : ""}${(score.band.bonus * 100).toLocaleString("pt-BR")}%`} note="pela régua de pontuação" icon={Percent} tone={bandTone} />
          <KpiTile label="Indicadores pontuando" value={`${score.scoring} de ${score.indicators.filter((item) => item.group !== "Acelerador").length}`} note={`${score.indicators.filter((item) => item.status === "travado").length} travado(s) por condição do grupo`} icon={ListChecks} />
        </div>

        <Panel kicker={`${data.cluster} · ${monthLabel(data.month!)}`} title="Cálculo e pontuação" aside={<button type="button" className="secondary-button compact" onClick={() => download(`igp-${data.cluster}-${data.month}.csv`, [["Grupo", "Indicador", "Realizado", "Detalhe", "Meta 100%", "Meta mínima", "Pontos", "Peso 100%", "Situação"], ...score.indicators.map((item) => [item.group, item.label, fmtValue(item.value, item.unit), item.detail, fmtValue(item.target, item.unit), fmtValue(item.minimum, item.unit), item.points, item.weight, STATUS[item.status].label])])}><Download size={14} aria-hidden="true" />CSV</button>}>
          <div className="isc-table-wrap">
            <table className="isc-table">
              <thead><tr><th scope="col">Grupo</th><th scope="col">Indicador</th><th scope="col">Realizado</th><th scope="col">Meta 100%</th><th scope="col">Meta mínima</th><th scope="col">Condição do grupo</th><th scope="col">Pontos</th><th scope="col">Situação</th></tr></thead>
              <tbody>
                {groups.map((group) => score.indicators.filter((item) => item.group === group).map((item, index, list) => (
                  <tr key={item.key} className={index === 0 ? "is-group-start" : ""}>
                    {index === 0 && <th scope="rowgroup" rowSpan={list.length} className="isc-group">{group}</th>}
                    <th scope="row">{item.label}<small>{item.detail}</small>{item.parts?.map((part) => <small key={part.label}>{part.label}: {fmtValue(part.value, item.unit)} ({part.detail})</small>)}</th>
                    <td><strong>{fmtValue(item.value, item.unit)}</strong>{item.gap !== null && item.status !== "meta" && <small>faltam {item.unit === "h" ? fmtValue(item.gap, "h") : `${(item.gap * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`} p/ meta</small>}</td>
                    <td>{fmtValue(item.target, item.unit)}</td>
                    <td>{fmtValue(item.minimum, item.unit)}</td>
                    <td>{item.gate ? <span className={`isc-gate ${item.gate.ok ? "is-ok" : "is-fail"}`}>{item.gate.ok ? <CheckCircle2 size={13} aria-hidden="true" /> : <XCircle size={13} aria-hidden="true" />}{item.gate.label}</span> : "—"}</td>
                    <td><strong>{item.points}</strong><small>de {item.weight} (mín. {item.minWeight})</small></td>
                    <td><span className={`isc-status ${STATUS[item.status].className}`}>{item.status === "travado" && <Lock size={12} aria-hidden="true" />}{STATUS[item.status].label}</span></td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          <p className="dv-footnote">Redes = BDESK e FIELD do cluster (Backbone/NOC TX fora). IRT projetado pelos dias úteis do mês. As condições de grupo seguem as premissas gerais da Giga; a do grupo Redes ainda precisa ser confirmada com a Giga (hoje só aparece, não trava).</p>
        </Panel>

        <div className="dv-grid dv-grid-split">
          <Panel kicker="RÉGUA" title="Faixas de bonificação">
            <ol className="isc-bands">
              {data.rules?.bands.slice().sort((a, b) => b.minPoints - a.minPoints).map((band) => (
                <li key={band.band} className={band.band === score.band.band ? "is-current" : ""}><b>{band.band}</b><span>{band.minPoints > 0 ? `≥ ${band.minPoints} pts` : "abaixo"}</span><span className={band.bonus > 0 ? "is-pos" : band.bonus < 0 ? "is-neg" : ""}>{band.bonus > 0 ? "+" : ""}{(band.bonus * 100).toLocaleString("pt-BR")}%</span></li>
              ))}
            </ol>
          </Panel>
          <Panel kicker="EVOLUÇÃO" title="Pontuação a cada planilha">
            {data.history.length ? <ol className="isc-history">{data.history.map((item) => <li key={item.importedAt}><span>até {fmtDate(item.closedUntil)}</span><b>{item.total} pts</b><em>Faixa {item.band}</em></li>)}</ol> : <p className="dv-footnote">Ainda só uma planilha.</p>}
            {data.live && <p className="dv-footnote">Redes pelo sistema (todas as finalizadas do mês, inclusive as que ainda não chegaram na planilha): {data.live.orders} OS · Prazo {data.live.onTimePercent === null ? "—" : `${data.live.onTimePercent.toFixed(2)}%`} · Outlier {data.live.outlierPercent === null ? "—" : `${data.live.outlierPercent.toFixed(2)}%`} · MTTR {data.live.mttrHours === null ? "—" : `${data.live.mttrHours.toFixed(2)} h`}. <Link to="/igp">Ver IGP de redes</Link></p>}
          </Panel>
        </div>

        {rec && (
          <Panel kicker="CONCILIAÇÃO" title={`Giga × sistema · ${data.cluster}`} aside={<span className="dv-panel-meta">{rec.both} ordens nas duas bases</span>}>
            <div className="dv-segmented isc-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "giga"} className={tab === "giga" ? "is-selected" : ""} onClick={() => setTab("giga")}>Só na Giga <b>{rec.onlyGigaTotal}</b></button>
              <button type="button" role="tab" aria-selected={tab === "sistema"} className={tab === "sistema" ? "is-selected" : ""} onClick={() => setTab("sistema")}>Só no sistema <b>{rec.onlySystemTotal}</b></button>
              <button type="button" role="tab" aria-selected={tab === "horario"} className={tab === "horario" ? "is-selected" : ""} onClick={() => setTab("horario")}>Fechamento diferente <b>{rec.timeDiffTotal}</b></button>
            </div>
            {tab === "giga" && <>
              <p className="dv-footnote">Ordens que a Giga conta no {data.cluster} e não existem no sistema (não chegaram pelo acionamento).</p>
              <div className="isc-table-wrap"><table className="isc-table"><thead><tr><th>OS</th><th>Origem</th><th>Cidade</th><th>Abertura</th><th>Fechamento</th><th>TME</th></tr></thead><tbody>{rec.onlyGiga.map((order) => <tr key={order.os}><td><strong>{order.os}</strong>{order.osOfs && order.osOfs !== order.os && <small>{order.osOfs}</small>}</td><td>{order.origin}</td><td>{order.city || "—"}</td><td>{fmtDate(order.openedAt)}</td><td>{fmtDate(order.closedAt)}</td><td>{order.tmeHours === null ? "—" : `${order.tmeHours.toFixed(1)} h`}</td></tr>)}</tbody></table></div>
            </>}
            {tab === "sistema" && <>
              <p className="dv-footnote">Finalizadas no sistema (mesma área, até o fechamento da planilha) que a Giga não contou: base para contestação.</p>
              <div className="isc-table-wrap"><table className="isc-table"><thead><tr><th>Ordem</th><th>BDESK</th><th>Tipo</th><th>Região</th><th>Abertura</th><th>Fim</th></tr></thead><tbody>{rec.onlySystem.map((call) => <tr key={call.id}><td><Link to={`/chamados/${call.id}`}><strong>{call.orderNumber}</strong></Link></td><td>{call.bdesk || "—"}</td><td>{call.type}</td><td>{call.region}</td><td>{fmtDate(call.openedAt)}</td><td>{fmtDate(call.executedAt)}</td></tr>)}</tbody></table></div>
            </>}
            {tab === "horario" && <>
              <p className="dv-footnote">Mesma ordem com mais de 5 min de diferença no fechamento. Positivo = o sistema fechou depois da Giga. No IGP vale o horário da Giga.</p>
              <div className="isc-table-wrap"><table className="isc-table"><thead><tr><th>OS</th><th>Origem</th><th>Fechamento Giga</th><th>Fim no sistema</th><th>Diferença</th></tr></thead><tbody>{rec.timeDiffs.map((item) => <tr key={item.os}><td><Link to={`/chamados/${item.callId}`}><strong>{item.os}</strong></Link><small>{item.orderNumber}</small></td><td>{item.origin}</td><td>{fmtDate(item.gigaClosedAt)}</td><td>{fmtDate(item.systemClosedAt)}</td><td>{item.minutes > 0 ? "+" : ""}{item.minutes} min</td></tr>)}</tbody></table></div>
            </>}
            <button type="button" className="secondary-button compact isc-export" onClick={() => tab === "giga" ? download(`so-na-giga-${data.cluster}-${data.month}.csv`, [["OS", "OS OFS", "Origem", "Cidade", "Abertura", "Fechamento", "TME"], ...rec.onlyGiga.map((o) => [o.os, o.osOfs, o.origin, o.city, o.openedAt, o.closedAt, o.tmeHours])]) : tab === "sistema" ? download(`so-no-sistema-${data.cluster}-${data.month}.csv`, [["Ordem", "BDESK", "Tipo", "Regiao", "Abertura", "Fim"], ...rec.onlySystem.map((c) => [c.orderNumber, c.bdesk, c.type, c.region, c.openedAt, c.executedAt])]) : download(`fechamento-diferente-${data.cluster}-${data.month}.csv`, [["OS", "Ordem", "Origem", "Fechamento Giga", "Fim sistema", "Minutos"], ...rec.timeDiffs.map((t) => [t.os, t.orderNumber, t.origin, t.gigaClosedAt, t.systemClosedAt, t.minutes])])}><Download size={14} aria-hidden="true" />Exportar esta lista (CSV)</button>
          </Panel>
        )}

        {data.rules && (
          <Panel kicker="PREMISSAS" title="Regras do IGP ACESSO" aside={canEditRules ? <button type="button" className="secondary-button compact" onClick={() => setShowRules(!showRules)}>{showRules ? "Fechar" : "Editar regras"}</button> : undefined}>
            <p className="dv-footnote">Pesos, metas e mínimos da aba IGP ACESSO da Giga (a partir de 01/11/2026). Outlier de reparo máximo para o Opex: {(data.rules.outlierReparoMax * 100).toLocaleString("pt-BR")}%.{data.rulesUpdatedBy ? ` Última mudança: ${data.rulesUpdatedBy}, ${fmtDate(data.rulesUpdatedAt)}.` : ""}</p>
            {showRules && canEditRules && <RulesEditor rules={data.rules} onSaved={() => void load()} />}
          </Panel>
        )}
      </>}
    </div>
  );
}
