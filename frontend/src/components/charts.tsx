import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock3, type LucideIcon } from "lucide-react";
import type { SlaBreakdown } from "../api";

const numberFormat = new Intl.NumberFormat("pt-BR");
export const formatCount = (value: number) => numberFormat.format(value);
export const formatPercent = (value: number | null) => value === null ? "–" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
export const formatHours = (value: number | null) => value === null ? "–" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`;

export function percentOf(part: number, total: number) {
  return total ? (part / total) * 100 : null;
}

type KpiTone = "default" | "good" | "warning" | "critical";

// Numero de destaque com rotulo e contexto; com `to` vira atalho para a tela correspondente.
export function KpiTile({ label, value, note, icon: Icon, tone = "default", to }: { label: string; value: string; note?: ReactNode; icon: LucideIcon; tone?: KpiTone; to?: string }) {
  const body = <>
    <span className="dv-kpi-label"><Icon size={15} aria-hidden="true" />{label}</span>
    <strong className="dv-kpi-value">{value}</strong>
    {note && <small className="dv-kpi-note">{note}</small>}
  </>;
  return to
    ? <Link className={`dv-kpi dv-kpi-${tone} is-link`} to={to}>{body}</Link>
    : <section className={`dv-kpi dv-kpi-${tone}`}>{body}</section>;
}

export function Panel({ kicker, title, aside, children, className = "" }: { kicker: string; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel dv-panel ${className}`}>
      <header className="dv-panel-heading">
        <div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div>
        {aside}
      </header>
      {children}
    </section>
  );
}

// Ranking horizontal: barras proporcionais ao maior valor, top N com opcao de ver todos.
export function RankBars({ items, empty, limit = 8, unit = "chamados" }: { items: { label: string; value: number }[]; empty: string; limit?: number; unit?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return <div className="dv-empty">{empty}</div>;
  const max = Math.max(...items.map((item) => item.value), 1);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const visible = expanded ? items : items.slice(0, limit);
  return (
    <div className="dv-rank">
      <ol>
        {visible.map((item) => (
          <li key={item.label} title={`${item.label}: ${formatCount(item.value)} ${unit} (${formatPercent(percentOf(item.value, total))} do total)`}>
            <span className="dv-rank-label">{item.label || "Não informado"}</span>
            <span className="dv-rank-track" aria-hidden="true"><i style={{ width: `${(item.value / max) * 100}%` }} /></span>
            <b>{formatCount(item.value)}</b>
          </li>
        ))}
      </ol>
      {items.length > limit && (
        <button type="button" className="dv-link-button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "Mostrar menos" : `Ver todos (${items.length})`}
        </button>
      )}
    </div>
  );
}

const slaSegments = [
  { key: "onTime" as const, label: "No prazo", rule: "até 6h", icon: CheckCircle2 },
  { key: "late" as const, label: "Fora do prazo", rule: "6h a 9h", icon: Clock3 },
  { key: "outlier" as const, label: "Outlier", rule: "acima de 9h", icon: AlertTriangle },
];

// Barra 100% empilhada com os tres estados de SLA; legenda sempre com icone, rotulo, quantidade e percentual.
export function SlaStack({ value, caption }: { value: SlaBreakdown; caption: string }) {
  const total = value.onTime + value.late + value.outlier;
  return (
    <div className="dv-sla">
      <div className="dv-sla-bar" role="img" aria-label={`${caption}: ${slaSegments.map((segment) => `${segment.label} ${value[segment.key]}`).join(", ")}`}>
        {total === 0 ? <span className="dv-sla-empty" /> : slaSegments.filter((segment) => value[segment.key] > 0).map((segment) => (
          <span key={segment.key} className={`dv-sla-segment is-${segment.key}`} style={{ flexGrow: value[segment.key] }} title={`${segment.label} (${segment.rule}): ${formatCount(value[segment.key])} · ${formatPercent(percentOf(value[segment.key], total))}`} />
        ))}
      </div>
      <ul className="dv-sla-legend">
        {slaSegments.map((segment) => (
          <li key={segment.key} className={`is-${segment.key}`}>
            <segment.icon size={16} aria-hidden="true" />
            <span><b>{segment.label}</b><small>{segment.rule}</small></span>
            <strong>{formatCount(value[segment.key])}</strong>
            <em>{formatPercent(percentOf(value[segment.key], total))}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Barras agrupadas por dia (abertos x finalizados), com dica ao passar o mouse ou focar.
export function DailyBars({ days }: { days: { date: string; opened: number; finished: number }[] }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...days.flatMap((day) => [day.opened, day.finished]));
  const ticks = [max, Math.round(max / 2), 0];
  const activeDay = days.find((day) => day.date === active);
  const label = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const weekday = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  const showEvery = days.length > 16 ? 3 : days.length > 10 ? 2 : 1;
  return (
    <div className="dv-daily">
      <div className="dv-legend" aria-hidden="true">
        <span className="is-opened">Abertos</span>
        <span className="is-finished">Finalizados</span>
      </div>
      <div className="dv-daily-plot">
        <div className="dv-daily-axis" aria-hidden="true">{ticks.map((tick, index) => <span key={index}>{formatCount(tick)}</span>)}</div>
        <div className="dv-daily-columns" onMouseLeave={() => setActive(null)}>
          {days.map((day, index) => (
            <button
              type="button"
              key={day.date}
              className={`dv-daily-column${active === day.date ? " is-active" : ""}`}
              onMouseEnter={() => setActive(day.date)}
              onFocus={() => setActive(day.date)}
              onBlur={() => setActive(null)}
              aria-label={`${label(day.date)}: ${day.opened} abertos, ${day.finished} finalizados`}
            >
              <span className="dv-daily-bars">
                <i className="is-opened" style={{ height: `${(day.opened / max) * 100}%` }} />
                <i className="is-finished" style={{ height: `${(day.finished / max) * 100}%` }} />
              </span>
              <small>{index % showEvery === 0 || index === days.length - 1 ? label(day.date) : ""}</small>
            </button>
          ))}
          {activeDay && (
            <div className="dv-tooltip" style={{ left: `${((days.indexOf(activeDay) + 0.5) / days.length) * 100}%` }} role="status">
              <b>{weekday(activeDay.date)} · {label(activeDay.date)}</b>
              <span className="is-opened">Abertos <strong>{formatCount(activeDay.opened)}</strong></span>
              <span className="is-finished">Finalizados <strong>{formatCount(activeDay.finished)}</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
