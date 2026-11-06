import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Target } from "lucide-react";
import { api, type IgpGoalPlan, type IgpMetrics, type IgpPlan } from "../api";
import { toOperationalDate } from "../dates";

// Meta do mes com projecao (Visao geral e Modo TV): % no prazo e % outliers do mes ate agora, contra a meta, e o
// que ainda precisa nas ordens que devem fechar ate o fim do mes no ritmo atual (mesma conta da aba IGP).

const pct = (value: number | null | undefined) => (value === null || value === undefined ? "–" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const count = (value: number) => value.toLocaleString("pt-BR");

export function goalSentence(kind: "onTime" | "outlier", plan: IgpGoalPlan) {
  const p = plan.projected;
  if (kind === "onTime") {
    if (!p) return plan.met ? "Meta batida no mês." : `Faltou: precisaria de ${count(plan.streak ?? 0)} no prazo seguidas.`;
    if (plan.met && p.slack !== null) return `Batida. Das ~${count(p.remainingOrders)} ordens que faltam, até ${count(p.slack)} podem passar de 6h.`;
    if (!p.possible) return `Não dá mais no ritmo do mês: precisaria de ${count(p.required)} no prazo em ~${count(p.remainingOrders)} ordens.`;
    return `Precisa de ${count(p.required)} das ~${count(p.remainingOrders)} ordens que faltam no prazo (${pct(p.requiredPercent)}).`;
  }
  if (!p) return plan.met ? "Meta batida no mês." : "Meta de outliers estourada no mês.";
  if (!p.possible) return `Estourada: mesmo sem nenhum outlier até o fim do mês não volta para a meta.`;
  return `Cabem até ${count(p.slack ?? 0)} outliers nas ~${count(p.remainingOrders)} ordens que faltam.`;
}

export function useMonthGoals() {
  const [data, setData] = useState<{ igp: IgpMetrics; plan?: IgpPlan } | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => api.igp(toOperationalDate().slice(0, 7)).then((result) => { if (active) setData(result); }).catch(() => undefined);
    void load();
    const interval = window.setInterval(load, 5 * 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  return data;
}

export function MonthGoals() {
  const data = useMonthGoals();
  if (!data?.plan || !data.igp.total.orders) return null;
  const { igp, plan } = data;
  const onTime = plan.onTime.target;
  const outlier = plan.outlier.target;
  return (
    <section className="panel mg-panel" aria-label="Meta do mês">
      <header>
        <span className="mg-icon" aria-hidden="true"><Target size={16} /></span>
        <div><strong>Meta do mês</strong><small>{igp.total.orders.toLocaleString("pt-BR")} ordens até agora · dia {plan.elapsedDays} de {plan.daysInMonth}</small></div>
        <Link to="/igp" className="link-button">Ver IGP</Link>
      </header>
      <div className="mg-goals">
        <article className={onTime.met ? "is-met" : "is-missed"}>
          <span>No prazo (até 6h)</span>
          <strong>{pct(igp.total.onTimePercent)}</strong>
          <small>Meta {pct(onTime.goal)} · {onTime.met ? "batendo" : "abaixo"}</small>
          <p>{goalSentence("onTime", onTime)}</p>
        </article>
        <article className={outlier.met ? "is-met" : "is-missed"}>
          <span>Outliers (acima de 9h)</span>
          <strong>{pct(igp.total.outlierPercent)}</strong>
          <small>Meta até {pct(outlier.goal)} · {outlier.met ? "dentro" : "acima"}</small>
          <p>{goalSentence("outlier", outlier)}</p>
        </article>
      </div>
    </section>
  );
}
