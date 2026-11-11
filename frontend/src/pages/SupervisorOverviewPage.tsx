import { useRef, useState } from "react";
import { CalendarDays, CalendarRange, Inbox, Timer } from "lucide-react";
import { api, type SupervisorOverview } from "../api";
import { toOperationalDate } from "../dates";
import { DailyBars, KpiTile, Panel, formatCount, formatHours } from "../components/charts";
import { useCachedData } from "../lib/data-cache";
import { HourColumns } from "./SlaAnalysisPage";

// Visao dos supervisores: quantos chamados entraram (por regiao, por dia e por horario), media por dia, TME e os
// totais do mes e da semana. Entrante = chamado aberto no periodo, sem Cancelado (GIGA+ conta).
type Preset = "month" | "previous" | "quarter" | "custom";
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
function presetRange(preset: Preset, today: string) {
  const [year, month] = today.split("-").map(Number);
  if (preset === "previous") return { from: iso(year, month - 1, 1), to: iso(year, month, 0) };
  if (preset === "quarter") return { from: iso(year, month - 2, 1), to: today };
  return { from: iso(year, month, 1), to: today };
}
const perDay = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia`;
const shortDate = (day: string) => day.split("-").reverse().slice(0, 2).join("/");
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}h`;

export function SupervisorOverviewPage() {
  const today = toOperationalDate();
  const [preset, setPreset] = useState<Preset>("month");
  const [range, setRange] = useState(() => presetRange("month", today));
  const [region, setRegion] = useState("");
  const [type, setType] = useState("");
  const lastValid = useRef(range);
  if (range.from && range.to && range.from <= range.to) lastValid.current = range;
  const query = lastValid.current;
  const overview = useCachedData<SupervisorOverview>(`visao-supervisores:${query.from}:${query.to}:${region}:${type}`, () => api.supervisorOverview({ from: query.from, to: query.to, region: region || undefined, type: type || undefined }));
  const data = overview.data ?? null;

  function choosePreset(next: Preset) {
    setPreset(next);
    if (next !== "custom") setRange(presetRange(next, today));
  }

  const total = data?.period.entrantes ?? 0;
  const maxHour = data ? Math.max(1, ...data.byHour.map((item) => item.entrantes)) : 1;
  const busiest = data ? [...data.byHour].sort((left, right) => right.entrantes - left.entrantes)[0] : null;

  return (
    <div className="dv-dashboard sa-page sv-page">
      <div className="page-heading dv-heading">
        <div>
          <span className="section-kicker">INDICADORES</span>
          <h1>Visão dos supervisores</h1>
          <p>Quantos chamados entraram, de onde e em que horário, a média por dia e o tempo médio de execução (TME).</p>
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
          <label className="sa-area">Região<select value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value="">Todas</option>
            {(data?.regions ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select></label>
          <label className="sa-area">Tipo<select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">Todos</option>
            {(data?.types ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select></label>
        </div>
      </div>

      {overview.error ? <div className="dv-empty is-error" role="alert">{overview.error}</div> : !data ? <div className="dv-empty" role="status">Calculando...</div> : <>
        <div className="dv-kpi-grid">
          <KpiTile label="Entrantes no mês" value={formatCount(data.month.entrantes)} note={`${perDay(data.month.perDay)} desde ${shortDate(data.month.from)}`} icon={CalendarDays} />
          <KpiTile label="Entrantes na semana" value={formatCount(data.week.entrantes)} note={`${perDay(data.week.perDay)} desde segunda, ${shortDate(data.week.from)}`} icon={CalendarRange} />
          <KpiTile label="Média no período" value={perDay(data.period.perDay)} note={`${formatCount(total)} entrantes em ${data.period.days} dia(s)`} icon={Inbox} />
          <KpiTile label="TME no período" value={formatHours(data.period.tmeHours)} note={`${formatCount(data.period.finalizados)} finalizados (abertura até a Data Fim)`} icon={Timer} />
        </div>

        <div className="sa-grid">
          <Panel kicker="REGIÃO" title="Entrantes por região" aside={<span className="sa-aside">{data.byRegion.length} região(ões)</span>}>
            <div className="sv-region-scroll">
            <table className="sa-table sv-area-table">
              <thead><tr><th>Região</th><th>Entrantes</th><th>% do total</th><th>Média/dia</th><th>Finalizados</th><th>TME</th></tr></thead>
              <tbody>
                {data.byRegion.length === 0 && <tr><td colSpan={6}>Nenhum chamado no período.</td></tr>}
                {data.byRegion.slice(0, 100).map((row) => (
                  <tr key={row.region}>
                    <td>{row.region === "SEM REGIÃO" ? "Sem região" : row.region}</td>
                    <td><b>{formatCount(row.entrantes)}</b></td>
                    <td>{total ? `${Math.round((row.entrantes / total) * 100)}%` : "–"}</td>
                    <td>{(row.entrantes / data.period.days).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                    <td>{formatCount(row.finalizados)}</td>
                    <td>{formatHours(row.tmeHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="dv-footnote">Região do chamado, da que mais recebeu para a que menos recebeu. "Sem região": chamado sem região informada.</p>
          </Panel>
          <Panel kicker="HORÁRIO" title="Entrantes por horário" aside={busiest && busiest.entrantes ? <span className="sa-aside">Pico: {hourLabel(busiest.hour)}</span> : undefined}>
            <HourColumns ariaLabel="Chamados que entraram por hora de abertura" max={maxHour} unit={(value) => formatCount(value)}
              columns={data.byHour.map((item) => ({ hour: item.hour, value: item.entrantes, tone: item.entrantes ? "is-neutral" : "is-empty", tooltip: item.entrantes ? [`${formatCount(item.entrantes)} entrantes`, `${(item.entrantes / data.period.days).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia em média`] : ["Nenhum chamado nesta hora"] }))} />
            <p className="dv-footnote">Hora de abertura do chamado (horário de São Paulo). Faixa escura: noite (18h às 06h).</p>
          </Panel>
        </div>

        <Panel kicker="DIA A DIA" title="Entrantes e finalizados por dia">
          <DailyBars days={data.byDay.map((day) => ({ date: day.day, opened: day.entrantes, finished: day.finalizados }))} />
          <p className="dv-footnote">Entrante: chamado aberto no dia, inclusive GIGA+; só o Cancelado fica de fora. Finalizado: pela Data Fim (GIGA+ quando o OFS concluir).</p>
        </Panel>
      </>}
    </div>
  );
}
