import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCcw } from "lucide-react";
import { api, type Call } from "./api";

type RepeatedOrder = {
  current: Call;
  previous: Call;
  repetitionNumber: number;
  elapsedMs: number;
};

type TechnicianSummary = {
  key: string;
  name: string;
  services: number;
  repetitions: number;
};

const PAGE_SIZE = 100;
const PAGE_BATCH_SIZE = 5;
const noAddressValues = new Set(["", "S/N", "SEM NÚMERO", "-", "SN"]);

function dateValue(value: string | undefined) {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function dateIsInRange(value: string | undefined, from: string, to: string) {
  const date = value?.slice(0, 10) || "";
  return Boolean(date) && (!from || date >= from) && (!to || date <= to);
}

function technicianRef(call: Call) {
  if (call.technicianId) {
    return { key: call.technicianId, name: call.technicianName || `Técnico ${call.technicianId}` };
  }
  const name = call.technicianName?.trim();
  return name ? { key: name.toLocaleLowerCase("pt-BR"), name } : undefined;
}

function buildRepeatedOrders(calls: Call[]): RepeatedOrder[] {
  const eligible = calls
    .map((call, index) => ({ call, index, timestamp: dateValue(call.openedAt) }))
    .filter(({ call, timestamp }) => {
      const address = (call.address || "").trim().toLocaleUpperCase("pt-BR");
      return Number.isFinite(timestamp)
        && !noAddressValues.has(address)
        && Boolean(call.olt.trim())
        && Boolean(call.slotPon.trim());
    })
    .sort((left, right) => left.timestamp - right.timestamp || left.index - right.index);

  const groups = new Map<string, Array<{ call: Call; timestamp: number }>>();
  const repeated: RepeatedOrder[] = [];

  for (const { call, timestamp } of eligible) {
    const address = (call.address || "").trim().toLocaleUpperCase("pt-BR");
    const oltSlotPon = `${call.olt.trim().toLocaleUpperCase("pt-BR")}||${call.slotPon.trim().toLocaleUpperCase("pt-BR")}`;
    const key = `${address}||${oltSlotPon}`;
    const previousCalls = groups.get(key) || [];
    const previous = [...previousCalls].reverse().find((candidate) => {
      const difference = timestamp - candidate.timestamp;
      return difference > 0 && difference <= 30 * 24 * 60 * 60 * 1000;
    });

    if (previous) {
      repeated.push({
        current: call,
        previous: previous.call,
        repetitionNumber: previousCalls.length + 1,
        elapsedMs: timestamp - previous.timestamp,
      });
    }
    previousCalls.push({ call, timestamp });
    groups.set(key, previousCalls);
  }

  return repeated;
}

function formatDate(value: string | undefined) {
  const timestamp = dateValue(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(timestamp)
    : "-";
}

function formatElapsed(elapsedMs: number) {
  const days = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor(elapsedMs / (60 * 60 * 1000));
  return days >= 1 ? `${days} dia${days === 1 ? "" : "s"}` : `${hours} hora${hours === 1 ? "" : "s"}`;
}

function quartile(percentage: number) {
  if (percentage <= 0.02) return "1° Quartil";
  if (percentage <= 0.025) return "2° Quartil";
  if (percentage <= 0.03) return "3° Quartil";
  return "4° Quartil";
}

async function fetchAllCalls(teamScoped: boolean) {
  const firstPage = await api.calls(undefined, { page: 1, pageSize: PAGE_SIZE, teamScope: teamScoped });
  const calls = [...firstPage.calls];

  for (let page = 2; page <= firstPage.totalPages; page += PAGE_BATCH_SIZE) {
    const pageNumbers = Array.from(
      { length: Math.min(PAGE_BATCH_SIZE, firstPage.totalPages - page + 1) },
      (_, index) => page + index,
    );
    const pages = await Promise.all(pageNumbers.map((pageNumber) =>
      api.calls(undefined, { page: pageNumber, pageSize: PAGE_SIZE, teamScope: teamScoped }),
    ));
    calls.push(...pages.flatMap((result) => result.calls));
  }

  return calls;
}

export function RepeatedCallsPage({ teamScoped = false }: { teamScoped?: boolean }) {
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"orders" | "quartile">("orders");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchAllCalls(teamScoped)
      .then((result) => { if (!cancelled) setCalls(result); })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os chamados.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teamScoped, refreshKey]);

  const allRepeated = calls ? buildRepeatedOrders(calls) : [];
  const repeated = allRepeated
    .filter((entry) => dateIsInRange(entry.current.openedAt, from, to))
    .sort((left, right) => dateValue(right.current.openedAt) - dateValue(left.current.openedAt));
  const summaries = new Map<string, TechnicianSummary>();

  for (const call of calls || []) {
    if (!dateIsInRange(call.openedAt, from, to)) continue;
    const technician = technicianRef(call);
    if (!technician) continue;
    const summary = summaries.get(technician.key) || { ...technician, services: 0, repetitions: 0 };
    summary.services += 1;
    summaries.set(technician.key, summary);
  }

  let unattributedRepetitions = 0;
  for (const entry of repeated) {
    const technician = technicianRef(entry.previous);
    if (!technician) {
      unattributedRepetitions += 1;
    }
    const summaryKey = technician?.key || "__unknown_original_technician__";
    const summary = summaries.get(summaryKey) || {
      key: summaryKey,
      name: technician?.name || "Técnico original não informado",
      services: 0,
      repetitions: 0,
    };
    summary.repetitions += 1;
    summaries.set(summaryKey, summary);
  }

  const technicianSummaries = [...summaries.values()]
    .filter((summary) => summary.services > 0 || summary.repetitions > 0)
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  const totalServices = technicianSummaries.reduce((sum, row) => sum + row.services, 0);
  const totalRepetitions = technicianSummaries.reduce((sum, row) => sum + row.repetitions, 0);

  return (
    <section className="repeated-page">
      <div className="page-heading repeated-heading">
        <div><h1>Chamados repetidos</h1><p>Reincidência por endereço, OLT e placa/PON.</p></div>
        <button className="secondary-button compact" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} title="Atualizar dados">
          <RefreshCcw size={16} /> Atualizar
        </button>
      </div>

      <div className="repeated-filters">
        <label>De <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Até <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
      </div>

      <div className="repeated-tabs" role="tablist" aria-label="Relatórios de chamados repetidos">
        <button type="button" role="tab" aria-selected={activeTab === "orders"} className={activeTab === "orders" ? "repeated-tab active" : "repeated-tab"} onClick={() => setActiveTab("orders")}>
          Ordens repetidas <span>{repeated.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "quartile"} className={activeTab === "quartile" ? "repeated-tab active" : "repeated-tab"} onClick={() => setActiveTab("quartile")}>
          Quartil <span>{technicianSummaries.length}</span>
        </button>
      </div>

      {loading && <div className="repeated-message">Carregando histórico de chamados...</div>}
      {!loading && error && <div className="repeated-message is-error">{error}</div>}

      {!loading && !error && activeTab === "orders" && (
        <div className="repeated-table-wrap">
          <table className="repeated-table">
            <thead><tr><th>Ordem repetida</th><th>Técnico atual</th><th>Data do evento</th><th>Chamado original</th><th>Primeiro técnico</th><th>Data original</th><th>Intervalo</th><th>Endereço</th><th>OLT</th><th>Placa/PON</th></tr></thead>
            <tbody>
              {repeated.map((entry) => (
                <tr key={`${entry.current.id}-${entry.previous.id}`}>
                  <td><Link to={`/chamados/${entry.current.id}`}>{entry.current.orderNumber || entry.current.id}</Link><small>Repetição {entry.repetitionNumber}</small></td>
                  <td>{entry.current.technicianName || "-"}</td>
                  <td>{formatDate(entry.current.openedAt)}</td>
                  <td><Link to={`/chamados/${entry.previous.id}`}>{entry.previous.orderNumber || entry.previous.id}</Link></td>
                  <td>{entry.previous.technicianName || "Não informado"}</td>
                  <td>{formatDate(entry.previous.openedAt)}</td>
                  <td>{formatElapsed(entry.elapsedMs)}</td>
                  <td>{entry.current.address || "-"}</td>
                  <td>{entry.current.olt || "-"}</td>
                  <td>{entry.current.slotPon || "-"}</td>
                </tr>
              ))}
              {!repeated.length && <tr><td colSpan={10} className="repeated-empty">Nenhuma ordem repetida encontrada neste período.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && activeTab === "quartile" && (
        <div className="repeated-table-wrap">
          <table className="repeated-table quartile-table">
            <thead><tr><th>Técnico</th><th>Serv</th><th># Rep</th><th>% IRE</th><th>Quartil</th></tr></thead>
            <tbody>
              {technicianSummaries.map((summary) => {
                const percentage = summary.services > 0 ? summary.repetitions / summary.services : undefined;
                const level = percentage === undefined ? "-" : quartile(percentage);
                return <tr key={summary.key}><td>{summary.name}</td><td>{summary.services}</td><td>{summary.repetitions}</td><td>{percentage === undefined ? "-" : new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(percentage)}</td><td>{percentage === undefined ? "-" : <span className={`quartile-badge quartile-${level[0]}`}>{level}</span>}</td></tr>;
              })}
              {!technicianSummaries.length && <tr><td colSpan={5} className="repeated-empty">Nenhum serviço com técnico encontrado neste período.</td></tr>}
              {technicianSummaries.length > 0 && <tr className="repeated-total"><td>Total</td><td>{totalServices}</td><td>{totalRepetitions}</td><td>{totalServices ? new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(totalRepetitions / totalServices) : "-"}</td><td>-</td></tr>}
            </tbody>
          </table>
          <p className="repeated-footnote"># Rep é atribuído ao técnico do chamado original. Quartis: até 2%, até 2,5%, até 3% e acima de 3%.{unattributedRepetitions > 0 ? ` ${unattributedRepetitions} repetição(ões) sem técnico original não entram no quartil.` : ""}</p>
        </div>
      )}
    </section>
  );
}