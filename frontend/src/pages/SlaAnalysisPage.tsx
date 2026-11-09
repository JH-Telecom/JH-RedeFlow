import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ClipboardList, Inbox, MoonStar } from "lucide-react";
import { api, type SlaAnalysis, type SlaArea, type SlaCounters, type SlaRankItem } from "../api";
import { toOperationalDate } from "../dates";
import { KpiTile, Panel, formatCount, formatHours, formatPercent } from "../components/charts";
import { useCachedData } from "../lib/data-cache";

// Analise de prazo (regra 6h/9h) dos chamados finalizados. "Perder prazo" = mais de 6h entre abertura e Data Fim.

const AREAS: { value: SlaArea; label: string }[] = [
  { value: "ALL", label: "Todos os clusters" },
  { value: "SP", label: "C.8 São Paulo" },
  { value: "GRU", label: "C.12 Guarulhos" },
  { value: "ALTO_TIETE", label: "C.11 Alto Tietê" },
  { value: "ABC", label: "C.9 ABC" },
  { value: "OUTRAS", label: "Outras (sem cluster)" },
];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const LOST_GOOD_MAX = 11; // meta de 89% no prazo
const LOST_MINIMUM_MAX = 15; // minimo de 85% no prazo
type Preset = "month" | "previous" | "quarter" | "custom";

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}h`;
const isNight = (hour: number) => hour >= 18 || hour < 6;
const lostTone = (percent: number | null) => (percent === null ? "is-empty" : percent <= LOST_GOOD_MAX ? "is-good" : percent <= LOST_MINIMUM_MAX ? "is-warning" : "is-critical");
const plural = (count: number, one: string, many: string) => `${formatCount(count)} ${count === 1 ? one : many}`;

function presetRange(preset: Preset, today: string) {
  const [year, month] = today.split("-").map(Number);
  const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  if (preset === "previous") return { from: iso(year, month - 1, 1), to: iso(year, month, 0) };
  if (preset === "quarter") return { from: iso(year, month - 2, 1), to: iso(year, month + 1, 0) };
  return { from: iso(year, month, 1), to: iso(year, month + 1, 0) };
}

function LostCell({ item }: { item: SlaCounters }) {
  return (
    <span className={`sa-lost ${lostTone(item.lostPercent)}`}>
      <i aria-hidden="true"><b style={{ width: `${Math.min(100, item.lostPercent ?? 0)}%` }} /></i>
      {formatPercent(item.lostPercent)}
    </span>
  );
}

// compact: so nome, OS, perdas e % (para os quadros estreitos do estudo noturno).
function RankTable({ items, nameLabel, empty, showExecution = false, limit = 10, compact = false }: { items: SlaRankItem[]; nameLabel: string; empty: string; showExecution?: boolean; limit?: number; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return <div className="dv-empty">{empty}</div>;
  const visible = expanded ? items : items.slice(0, limit);
  // Coluna "após acionamento" so quando a planilha/card trouxe acionamento diferente da abertura.
  const withExecution = !compact && showExecution && items.some((item) => item.withExecution > 0);
  return (
    <div className="sa-table-wrap">
      <table className="sa-table">
        <thead><tr><th>{nameLabel}</th><th>OS</th><th>Perderam</th><th>% perda</th>{!compact && <><th>Outlier</th><th>{showExecution ? "Execução média (TME)" : "Tempo médio"}</th></>}{withExecution && <th>Após acionamento</th>}</tr></thead>
        <tbody>
          {visible.map((item) => (
            <tr key={item.name}>
              <td><strong>{item.name}</strong>{item.detail && <small>{item.detail}</small>}</td>
              <td>{formatCount(item.orders)}</td>
              <td><b>{formatCount(item.lost)}</b></td>
              <td><LostCell item={item} /></td>
              {!compact && <><td>{formatCount(item.outliers)}</td><td>{formatHours(item.avgHours)}</td></>}
              {withExecution && <td title={item.withExecution ? `Média de ${plural(item.withExecution, "chamado", "chamados")} com data de acionamento` : "Sem data de acionamento nos chamados"}>{formatHours(item.avgExecutionHours)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {items.length > limit && <button type="button" className="dv-link-button" onClick={() => setExpanded((current) => !current)}>{expanded ? "Mostrar menos" : `Ver todos (${items.length})`}</button>}
    </div>
  );
}

// Mapa de calor: linhas = dias (segunda a domingo), colunas = faixas de 6h da abertura. Cor pela faixa de meta,
// e o numero sempre escrito na celula (a cor nunca e o unico sinal).
const BANDS = ["00h–06h", "06h–12h", "12h–18h", "18h–24h"];
const HEAT_DAYS = [1, 2, 3, 4, 5, 6, 0];
function HeatmapTable({ cells }: { cells: SlaAnalysis["heatmap"] }) {
  if (!cells.some((cell) => cell.orders)) return <div className="dv-empty">Nenhum chamado finalizado no período.</div>;
  const cell = (weekday: number, band: number) => cells.find((item) => item.weekday === weekday && item.band === band);
  return (
    <div className="sa-table-wrap">
      <table className="sa-heatmap">
        <thead><tr><th>Dia</th>{BANDS.map((band, index) => <th key={band} className={index === 0 || index === 3 ? "is-night" : ""}>{band}</th>)}<th>Dia todo</th></tr></thead>
        <tbody>
          {HEAT_DAYS.map((weekday) => {
            const row = BANDS.map((_, band) => cell(weekday, band));
            const orders = row.reduce((sum, item) => sum + (item?.orders ?? 0), 0);
            const lost = row.reduce((sum, item) => sum + (item?.lost ?? 0), 0);
            const dayPercent = orders ? (lost / orders) * 100 : null;
            return (
              <tr key={weekday}>
                <th scope="row">{WEEKDAYS[weekday]}</th>
                {row.map((item, band) => (
                  <td key={band} className={item?.orders ? lostTone(item.lostPercent) : "is-empty"} title={item?.orders ? `${WEEKDAYS[weekday]} ${BANDS[band]}: ${formatPercent(item.lostPercent)} perderam prazo (${item.lost} de ${item.orders}) · tempo médio ${formatHours(item.avgHours)}` : `${WEEKDAYS[weekday]} ${BANDS[band]}: nenhum chamado`}>
                    {item?.orders ? <><b>{formatPercent(item.lostPercent)}</b><small>{item.lost}/{item.orders}</small></> : <span>–</span>}
                  </td>
                ))}
                <td className={`is-total ${orders ? lostTone(dayPercent) : "is-empty"}`}>{orders ? <><b>{formatPercent(dayPercent)}</b><small>{lost}/{orders}</small></> : <span>–</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Colunas por hora com dica no hover/foco. `value` define a altura; `tone` a cor; noite com faixa de fundo.
type HourColumn = { hour: number; value: number; tone: string; tooltip: string[] };
function HourColumns({ columns, max, unit, ariaLabel }: { columns: HourColumn[]; max: number; unit: (value: number) => string; ariaLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const activeIndex = columns.findIndex((column) => column.hour === active);
  const top = Math.max(max, 1);
  return (
    <div className="sa-hours" role="group" aria-label={ariaLabel}>
      <div className="sa-hours-plot" onMouseLeave={() => setActive(null)}>
        <span className="sa-hours-max" aria-hidden="true">{unit(top)}</span>
        {columns.map((column) => (
          <button key={column.hour} type="button" className={`sa-hour${isNight(column.hour) ? " is-night" : ""}${active === column.hour ? " is-active" : ""}`}
            onMouseEnter={() => setActive(column.hour)} onFocus={() => setActive(column.hour)} onBlur={() => setActive(null)}
            aria-label={`${hourLabel(column.hour)}: ${column.tooltip.join(", ")}`}>
            <span className="sa-hour-bar"><i className={column.tone} style={{ height: `${(column.value / top) * 100}%` }} /></span>
            <small>{column.hour % 3 === 0 ? hourLabel(column.hour) : ""}</small>
          </button>
        ))}
        {activeIndex >= 0 && (
          <div className="dv-tooltip" style={{ left: `${((activeIndex + 0.5) / columns.length) * 100}%` }} role="status">
            <b>{hourLabel(columns[activeIndex].hour)}{isNight(columns[activeIndex].hour) ? " · noite" : ""}</b>
            {columns[activeIndex].tooltip.map((line) => <span key={line}>{line}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

function ShiftTable({ analysis }: { analysis: SlaAnalysis }) {
  const rows: { label: string; value: (shift: SlaAnalysis["night"]["day"]) => string }[] = [
    { label: "Chamados finalizados", value: (shift) => formatCount(shift.orders) },
    { label: "Perderam prazo (> 6h)", value: (shift) => `${formatCount(shift.lost)} (${formatPercent(shift.lostPercent)})` },
    { label: "Outlier (> 9h)", value: (shift) => `${formatCount(shift.outliers)} (${formatPercent(shift.outlierPercent)})` },
    { label: "Execução média (TME)", value: (shift) => formatHours(shift.avgHours) },
    { label: "Abertura até acionamento", value: (shift) => formatHours(shift.avgWaitHours) },
    { label: "Execução (acionamento até fim)", value: (shift) => formatHours(shift.avgExecutionHours) },
  ];
  const { day, night } = analysis.night;
  return (
    <table className="sa-table sa-shift">
      <thead><tr><th>Indicador</th><th>Dia (06h–18h)</th><th>Noite (18h–06h)</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.value(day)}</td><td><b>{row.value(night)}</b></td></tr>)}</tbody>
      <tfoot><tr><td colSpan={3}>{day.withAssignment + night.withAssignment ? `Acionamento e execução usam só os chamados com data de acionamento: ${formatCount(day.withAssignment)} de dia e ${formatCount(night.withAssignment)} à noite.` : "As planilhas não trazem a hora de acionamento separada da abertura; acionamento e execução aparecem quando houver essa informação."}</td></tr></tfoot>
    </table>
  );
}

export function SlaAnalysisPage() {
  const today = toOperationalDate();
  // Periodo pode vir no endereco (?de=AAAA-MM-DD&ate=AAAA-MM-DD) para compartilhar a analise.
  const [searchParams] = useSearchParams();
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const linkedRange = isoDate.test(searchParams.get("de") || "") && isoDate.test(searchParams.get("ate") || "") ? { from: searchParams.get("de")!, to: searchParams.get("ate")! } : null;
  const [preset, setPreset] = useState<Preset>(linkedRange ? "custom" : "month");
  const [range, setRange] = useState(() => linkedRange ?? presetRange("month", today));
  const [area, setArea] = useState<SlaArea>("ALL");
  // Periodo invalido (de > ate) mantem o ultimo periodo valido na tela.
  const lastValidRange = useRef(range);
  if (range.from && range.to && range.from <= range.to) lastValidRange.current = range;
  const queryRange = lastValidRange.current;
  const slaQuery = useCachedData<SlaAnalysis>(`analise-prazo:${queryRange.from}:${queryRange.to}:${area}`, () => api.slaAnalysis(queryRange.from, queryRange.to, area).then((data) => data.analysis));
  const analysis = slaQuery.data ?? null;
  const error = slaQuery.error;

  function choosePreset(next: Preset) {
    setPreset(next);
    if (next !== "custom") setRange(presetRange(next, today));
  }

  const periodLabel = `${range.from.split("-").reverse().join("/")} a ${range.to.split("-").reverse().join("/")}`;
  const total = analysis?.total;
  const night = analysis?.night;
  const maxAvgIncoming = analysis ? Math.max(...analysis.incoming.byHour.map((item) => item.avgPerDay ?? 0)) : 0;
  const maxWeekday = analysis ? Math.max(...analysis.incoming.byWeekday.map((item) => item.avgPerDay ?? 0), 0.01) : 1;
  const maxClosing = analysis ? Math.max(...analysis.night.lostClosingHours.map((item) => item.count), 1) : 1;

  return (
    <div className="dv-dashboard sa-page">
      <div className="page-heading dv-heading">
        <div>
          <span className="section-kicker">INDICADORES</span>
          <h1>Análise de prazo</h1>
          <p>Chamados finalizados no período pela Data Fim. Perde prazo quem passa de 6h entre abertura e fim; noite é a abertura entre 18h e 06h.</p>
        </div>
        <div className="sa-filters">
          <div className="dv-segmented" role="group" aria-label="Período">
            {([["month", "Este mês"], ["previous", "Mês anterior"], ["quarter", "Últimos 3 meses"], ["custom", "Personalizado"]] as [Preset, string][]).map(([value, label]) => (
              <button key={value} type="button" className={preset === value ? "is-selected" : ""} aria-pressed={preset === value} onClick={() => choosePreset(value)}>{label}</button>
            ))}
          </div>
          {preset === "custom" && <div className="sa-dates">
            <label>De<input type="date" value={range.from} max={range.to} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label>
            <label>Até<input type="date" value={range.to} min={range.from} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label>
          </div>}
          <label className="sa-area">Cluster<select value={area} onChange={(event) => setArea(event.target.value as SlaArea)}>{AREAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
      </div>

      {error ? <div className="dv-empty is-error" role="alert">{error}</div> : !analysis || !total || !night ? <div className="dv-empty" role="status">Calculando a análise do período...</div> : <>
        <div className="dv-kpi-grid">
          <KpiTile label="Finalizados no período" value={formatCount(total.orders)} note={`${periodLabel}`} icon={ClipboardList} />
          <KpiTile label="Perderam prazo" value={formatPercent(total.lostPercent)} note={`${plural(total.lost, "chamado", "chamados")} acima de 6h, ${formatCount(total.outliers)} outlier`} icon={AlertTriangle} tone={total.lostPercent === null ? "default" : total.lostPercent <= LOST_GOOD_MAX ? "good" : total.lostPercent <= LOST_MINIMUM_MAX ? "warning" : "critical"} />
          <KpiTile label="Média de entrantes" value={`${(analysis.incoming.avgPerDay ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia`} note={`${plural(analysis.incoming.opened, "chamado aberto", "chamados abertos")} em ${plural(analysis.incoming.days, "dia", "dias")}; ${formatPercent(analysis.incoming.nightShare)} à noite`} icon={Inbox} />
          <KpiTile label="Perda de prazo à noite" value={formatPercent(night.night.lostPercent)} note={`De dia: ${formatPercent(night.day.lostPercent)}. ${plural(night.night.orders, "chamado noturno", "chamados noturnos")}`} icon={MoonStar} tone={night.night.lostPercent === null ? "default" : night.night.lostPercent <= LOST_GOOD_MAX ? "good" : night.night.lostPercent <= LOST_MINIMUM_MAX ? "warning" : "critical"} />
        </div>

        <div className="sa-grid">
          <Panel kicker="TÉCNICOS" title="Quem mais perde prazo" aside={<span className="sa-aside">Ordenado por perdas</span>}>
            <RankTable items={analysis.technicians} nameLabel="Técnico" empty="Nenhum chamado finalizado no período." showExecution />
            <p className="dv-footnote">Execução média (TME) é o tempo da abertura até a Data Fim, como no relatório da operadora.</p>
          </Panel>
          <Panel kicker="BAIRROS" title="Onde mais se perde prazo" aside={<span className="sa-aside">Ordenado por perdas</span>}>
            <RankTable items={analysis.neighborhoods} nameLabel="Bairro" empty="Nenhum chamado finalizado no período." />
            <p className="dv-footnote">Sem bairro no chamado, entra a região.</p>
          </Panel>
        </div>

        <Panel kicker="HORÁRIO" title="Hora de abertura e perda de prazo" aside={<span className="sa-legend"><i className="is-good" />até 11%<i className="is-warning" />até 15%<i className="is-critical" />acima de 15%<span className="sa-night-key">Noite</span></span>}>
          <HourColumns ariaLabel="Percentual de perda de prazo por hora de abertura" max={100} unit={() => "100%"}
            columns={analysis.byOpeningHour.map((item) => ({ hour: item.hour, value: item.lostPercent ?? 0, tone: item.orders ? lostTone(item.lostPercent) : "is-empty", tooltip: item.orders ? [`${formatPercent(item.lostPercent)} perderam prazo`, `${formatCount(item.lost)} de ${plural(item.orders, "chamado", "chamados")}`, `Tempo médio ${formatHours(item.avgHours)}`] : ["Nenhum chamado aberto nesta hora"] }))} />
          {(() => {
            const worst = analysis.byOpeningHour.filter((item) => item.orders >= 3).sort((left, right) => (right.lostPercent ?? 0) - (left.lostPercent ?? 0))[0];
            return worst ? <p className="dv-footnote">Pior horário com pelo menos 3 chamados: <b>{hourLabel(worst.hour)}</b>, {formatPercent(worst.lostPercent)} de perda ({worst.lost} de {worst.orders}).</p> : null;
          })()}
        </Panel>

        <Panel kicker="DIA × HORÁRIO" title="Onde a semana perde prazo" aside={<span className="sa-legend"><i className="is-good" />até 11%<i className="is-warning" />até 15%<i className="is-critical" />acima de 15%</span>}>
          <HeatmapTable cells={analysis.heatmap} />
          <p className="dv-footnote">% de chamados finalizados que passaram de 6h, pelo dia da semana e faixa de horário da abertura. Embaixo, quantos perderam de quantos.</p>
        </Panel>

        <div className="sa-grid">
          <Panel kicker="ENTRANTES" title="Média de chamados abertos por hora">
            <HourColumns ariaLabel="Média de chamados abertos por hora do dia" max={maxAvgIncoming} unit={(value) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/dia`}
              columns={analysis.incoming.byHour.map((item) => ({ hour: item.hour, value: item.avgPerDay ?? 0, tone: "is-neutral", tooltip: [`${(item.avgPerDay ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} por dia em média`, `${plural(item.opened, "chamado", "chamados")} no período`] }))} />
          </Panel>
          <Panel kicker="ENTRANTES" title="Média por dia da semana">
            <ol className="sa-weekdays">
              {analysis.incoming.byWeekday.map((item) => (
                <li key={item.weekday} title={`${WEEKDAYS[item.weekday]}: ${plural(item.opened, "chamado", "chamados")} no período`}>
                  <span>{WEEKDAYS[item.weekday]}</span>
                  <span className="dv-rank-track" aria-hidden="true"><i style={{ width: `${((item.avgPerDay ?? 0) / maxWeekday) * 100}%` }} /></span>
                  <b>{item.avgPerDay === null ? "–" : item.avgPerDay.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</b>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <Panel kicker="ESTUDO NOTURNO" title="Por que se perde mais prazo das 18h às 06h" className="sa-night">
          <div className="sa-night-top">
            <ShiftTable analysis={analysis} />
            <div className="sa-insights">
              <h3>O que os dados mostram</h3>
              <ul>{night.insights.map((text) => <li key={text}>{text}</li>)}</ul>
            </div>
          </div>
          <div className="sa-grid">
            <div>
              <h3 className="sa-subtitle">Hora de abertura à noite</h3>
              <HourColumns ariaLabel="Perda de prazo por hora de abertura no período noturno" max={100} unit={() => "100%"}
                columns={night.byOpeningHour.map((item) => ({ hour: item.hour, value: item.lostPercent ?? 0, tone: item.orders ? lostTone(item.lostPercent) : "is-empty", tooltip: item.orders ? [`${formatPercent(item.lostPercent)} perderam prazo`, `${formatCount(item.lost)} de ${plural(item.orders, "chamado", "chamados")}`] : ["Nenhum chamado"] }))} />
            </div>
            <div>
              <h3 className="sa-subtitle">Quando os noturnos atrasados fecharam</h3>
              <HourColumns ariaLabel="Hora de fechamento dos chamados noturnos que perderam prazo" max={maxClosing} unit={(value) => formatCount(value)}
                columns={night.lostClosingHours.map((item) => ({ hour: item.hour, value: item.count, tone: "is-neutral", tooltip: [`${plural(item.count, "chamado fechou", "chamados fecharam")} nesta hora`] }))} />
              <p className="dv-footnote">{plural(night.crossedMorning, "chamado noturno atrasado fechou", "chamados noturnos atrasados fecharam")} depois das 06h.</p>
            </div>
          </div>
          <div className="sa-grid sa-grid-3">
            <div><h3 className="sa-subtitle">Por tipo</h3><RankTable items={night.byType} nameLabel="Tipo" empty="Sem chamados noturnos." limit={5} compact /></div>
            <div><h3 className="sa-subtitle">Técnicos à noite</h3><RankTable items={night.technicians} nameLabel="Técnico" empty="Sem chamados noturnos." limit={5} compact /></div>
            <div><h3 className="sa-subtitle">Motivos das perdas</h3><RankTable items={night.reasons} nameLabel="Motivo" empty="Nenhuma perda à noite." limit={5} compact /></div>
          </div>
          <div>
            <h3 className="sa-subtitle">Perda à noite por dia da semana</h3>
            <ol className="sa-weekdays">
              {night.byWeekday.map((item) => (
                <li key={item.weekday} title={`${WEEKDAYS[item.weekday]}: ${formatCount(item.lost)} de ${plural(item.orders, "chamado", "chamados")}`}>
                  <span>{WEEKDAYS[item.weekday]}</span>
                  <LostCell item={item} />
                  <b>{item.orders ? `${formatCount(item.lost)}/${formatCount(item.orders)}` : "–"}</b>
                </li>
              ))}
            </ol>
          </div>
        </Panel>
      </>}
    </div>
  );
}
