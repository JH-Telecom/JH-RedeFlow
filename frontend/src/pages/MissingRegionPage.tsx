import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Check, ChevronLeft, ChevronRight, MapPinOff, Search, Sparkles, X } from "lucide-react";
import { api, type MissingRegionCall, type Role, type User } from "../api";
import { SkeletonRows } from "../components/Skeleton";
import { readDataCache, writeDataCache } from "../lib/data-cache";
import { usePeriodicLoad } from "../lib/screen-cache";

// Fila "Sem região" (refeita em 18/11/2026): chamados com região vazia ou "Não informada". Vem tudo de uma vez com a
// sugestão de região (OLT cadastrada, bairro ou cidade) e a tela filtra, pesquisa e pagina no navegador. Dá para salvar
// um por um (já vem com a sugestão escolhida), selecionar vários e salvar juntos, ou aceitar todas as sugestões.
type Filter = "ativos" | "encerrados" | "todos";
const CLOSED = new Set(["Finalizado", "Cancelado", "Baixar"]);
const PAGE = 50;
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const REASON: Record<string, string> = { olt: "pela OLT", bairro: "pelo bairro", cidade: "pela cidade", ia: "da IA" };
type Data = { calls: MissingRegionCall[]; regions: string[]; total: number };

export function MissingRegionPage({ user }: { user: User & { role: Role } }) {
  const canEdit = user.role.permissions.includes("calls.edit");
  const canMapOlt = user.role.permissions.includes("settings.manage");
  const [data, setData] = useState<Data | null>(() => readDataCache<Data>("tela:sem-regiao:v2") ?? null);
  const [filter, setFilter] = useState<Filter>("ativos");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [byOlt, setByOlt] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRegion, setBulkRegion] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const next = await api.missingRegionCalls();
      const value = { calls: next.calls, regions: next.regions, total: next.total };
      setData(value); writeDataCache("tela:sem-regiao:v2", value); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar os chamados sem região."); }
  }
  usePeriodicLoad("tela:sem-regiao:v2", load);

  const calls = data?.calls ?? [];
  const counts = useMemo(() => ({ ativos: calls.filter((call) => !CLOSED.has(call.status)).length, encerrados: calls.filter((call) => CLOSED.has(call.status)).length, todos: calls.length }), [calls]);
  const visible = useMemo(() => {
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
    return calls.filter((call) => (filter === "todos" || (filter === "ativos") !== CLOSED.has(call.status))
      && words.every((word) => normalize([call.orderNumber, call.status, call.type, call.olt, call.slotPon, call.bairro, call.city, call.address, call.technicianName, call.client].filter(Boolean).join(" ")).includes(word)));
  }, [calls, filter, query]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const current = Math.min(page, pages);
  const pageItems = visible.slice((current - 1) * PAGE, current * PAGE);
  const withSuggestion = visible.filter((call) => call.suggestion);
  // Sem sugestao das regras: a IA le endereco, bairro e cidade (ate 20 por vez, os da pagina primeiro).
  const withoutSuggestion = visible.filter((call) => !call.suggestion && (call.address || call.bairro || call.city));
  async function analyzeWithAi() {
    const ids = [...pageItems, ...visible].filter((call, index, list) => !call.suggestion && (call.address || call.bairro || call.city) && list.indexOf(call) === index).slice(0, 20).map((call) => call.id);
    if (!ids.length) return;
    setSaving("ia"); setNotice(""); setError("");
    try {
      const { suggestions } = await api.analyzeRegionsWithAi(ids);
      const found = Object.values(suggestions).filter(Boolean).length;
      setData((current) => current ? { ...current, calls: current.calls.map((call) => (suggestions[call.id] ? { ...call, suggestion: suggestions[call.id] } : call)) } : current);
      setNotice(`IA analisou ${ids.length} chamado(s) e sugeriu a região de ${found}. Confira antes de salvar.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível analisar com a IA."); }
    finally { setSaving(null); }
  }
  const regionOf = (call: MissingRegionCall) => choice[call.id] ?? call.suggestion?.region ?? "";
  const allOnPageSelected = pageItems.length > 0 && pageItems.every((call) => selected.has(call.id));

  function done(message: string) { setNotice(message); setSelected(new Set()); setBulkRegion(""); void load(); }

  async function saveOne(call: MissingRegionCall) {
    const region = regionOf(call);
    if (!region) return;
    setSaving(call.id); setNotice(""); setError("");
    try {
      const applyOlt = Boolean(byOlt[call.id] && call.olt && call.sameOlt > 0);
      const result = await api.setCallRegion(call.id, region, applyOlt);
      done(`Ordem ${call.orderNumber}: região ${region}${result.others ? ` · mais ${result.others} chamado(s) da OLT ${call.olt}` : ""}${result.oltSaved ? ` · OLT ${call.olt} cadastrada em ${region}` : ""}.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar a região."); }
    finally { setSaving(null); }
  }

  async function saveSelected() {
    if (!bulkRegion || !selected.size) return;
    setSaving("lote"); setNotice(""); setError("");
    try { const { updated } = await api.setCallsRegion([...selected], bulkRegion); done(`${updated} chamado(s) colocados em ${bulkRegion}.`); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar as regiões."); }
    finally { setSaving(null); }
  }
  // Aceita a sugestão de todos os chamados filtrados que têm uma (um pedido por região).
  async function acceptSuggestions() {
    if (!withSuggestion.length || !window.confirm(`Colocar a região sugerida em ${withSuggestion.length} chamado(s)? A sugestão vem da OLT, do bairro ou da cidade.`)) return;
    setSaving("sugestoes"); setNotice(""); setError("");
    try {
      const groups = new Map<string, string[]>();
      for (const call of withSuggestion) groups.set(call.suggestion!.region, [...(groups.get(call.suggestion!.region) ?? []), call.id]);
      let updated = 0;
      for (const [region, ids] of groups) updated += (await api.setCallsRegion(ids, region)).updated;
      done(`${updated} chamado(s) com a região sugerida.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar as sugestões."); }
    finally { setSaving(null); }
  }
  const toggle = (id: string) => setSelected((currentSet) => { const next = new Set(currentSet); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <div className="sr-page">
      <div className="page-heading">
        <div>
          <span className="section-kicker">OPERAÇÃO</span>
          <h1>Sem região</h1>
          <p>Chamados com a região "Não informada". Coloque a região certa para eles entrarem nos filtros e indicadores por região.</p>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="sr-notice" role="status"><Check size={15} aria-hidden="true" /> {notice}</p>}
      <section className="panel sr-panel">
        {!data ? <SkeletonRows rows={6} columns={5} label="Carregando chamados sem região..." /> : !calls.length ? (
          <div className="empty-state sr-empty"><MapPinOff size={22} aria-hidden="true" /> Nenhum chamado sem região. Tudo certo!</div>
        ) : (
          <>
            <div className="sr-toolbar">
              <div className="sr-tabs" role="group" aria-label="Quais chamados">
                {(["ativos", "encerrados", "todos"] as Filter[]).map((item) => (
                  <button key={item} type="button" className={filter === item ? "is-selected" : ""} aria-pressed={filter === item} onClick={() => { setFilter(item); setPage(1); }}>
                    {item === "ativos" ? "Em aberto" : item === "encerrados" ? "Encerrados" : "Todos"}<span>{counts[item]}</span>
                  </button>
                ))}
              </div>
              <label className="sr-search"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Ordem, OLT, bairro, cidade, técnico..." aria-label="Pesquisar" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca"><X size={14} /></button>}</label>
              {canEdit && withoutSuggestion.length > 0 && (
                <button type="button" className="secondary-button compact sr-accept" onClick={() => void analyzeWithAi()} disabled={saving !== null} title="A IA lê o endereço, o bairro e a cidade e sugere a região (até 20 por vez)">
                  <Bot size={15} aria-hidden="true" /> {saving === "ia" ? "Analisando..." : `Analisar ${Math.min(20, withoutSuggestion.length)} com IA`}
                </button>
              )}
              {canEdit && withSuggestion.length > 0 && (
                <button type="button" className="secondary-button compact sr-accept" onClick={() => void acceptSuggestions()} disabled={saving !== null}>
                  <Sparkles size={15} aria-hidden="true" /> {saving === "sugestoes" ? "Salvando..." : `Aceitar ${withSuggestion.length} sugestão(ões)`}
                </button>
              )}
            </div>

            {canEdit && selected.size > 0 && (
              <div className="sr-bulk" role="region" aria-label="Chamados selecionados">
                <strong>{selected.size} selecionado(s)</strong>
                <select value={bulkRegion} onChange={(event) => setBulkRegion(event.target.value)} aria-label="Região para os selecionados">
                  <option value="">Escolha a região</option>
                  {data.regions.map((region) => <option key={region}>{region}</option>)}
                </select>
                <button type="button" className="primary-button compact" disabled={!bulkRegion || saving !== null} onClick={() => void saveSelected()}>{saving === "lote" ? "Salvando..." : "Salvar nos selecionados"}</button>
                <button type="button" className="link-button" onClick={() => setSelected(new Set())}>Limpar seleção</button>
              </div>
            )}

            {!visible.length ? <div className="dv-empty dv-empty-action"><span>Nenhum chamado com esse filtro{query ? ` e a busca "${query}"` : ""}.</span><button type="button" className="secondary-button compact" onClick={() => { setFilter("todos"); setQuery(""); }}>Ver todos</button></div> : (
              <div className="sr-scroll">
                <table className="sr-table">
                  <colgroup><col className="sr-col-check" /><col className="sr-col-order" /><col className="sr-col-call" /><col /><col className="sr-col-date" /><col className="sr-col-region" /></colgroup>
                  <thead>
                    <tr>
                      <th>{canEdit && <input type="checkbox" checked={allOnPageSelected} onChange={() => setSelected((currentSet) => { const next = new Set(currentSet); pageItems.forEach((call) => (allOnPageSelected ? next.delete(call.id) : next.add(call.id))); return next; })} aria-label="Selecionar todos desta página" />}</th>
                      <th>Ordem</th><th>Chamado</th><th>Local e OLT</th><th>Abertura</th><th>Região</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((call) => {
                      const place = [call.bairro, call.city].filter(Boolean).join(" · ");
                      const region = regionOf(call);
                      return (
                        <tr key={call.id} className={selected.has(call.id) ? "is-selected" : ""}>
                          <td className="sr-check">{canEdit && <input type="checkbox" checked={selected.has(call.id)} onChange={() => toggle(call.id)} aria-label={`Selecionar a ordem ${call.orderNumber}`} />}</td>
                          <td data-label="Ordem"><Link to={`/chamados/${call.id}`} className="sr-order">{call.orderNumber}</Link>{call.technicianName && <small title={call.technicianName}>{call.technicianName}</small>}</td>
                          <td data-label="Chamado"><span className={`sr-status${CLOSED.has(call.status) ? " is-closed" : ""}`}>{call.status}</span><small title={call.type}>{call.type}</small></td>
                          <td data-label="Local e OLT" className="sr-place"><strong title={place}>{place || "Sem bairro"}</strong>{call.address && <small title={call.address}>{call.address}</small>}{call.olt && <small className="sr-olt-name" title={`${call.olt}${call.slotPon ? ` · PON ${call.slotPon}` : ""}`}>{call.olt}{call.slotPon ? ` · PON ${call.slotPon}` : ""}</small>}</td>
                          <td data-label="Abertura" className="sr-date">{dateTime(call.openedAt)}</td>
                          <td data-label="Região" className="sr-edit">
                            {canEdit ? (
                              <>
                                <div className="sr-edit-row">
                                  <select value={region} onChange={(event) => setChoice((currentChoice) => ({ ...currentChoice, [call.id]: event.target.value }))} aria-label={`Região da ordem ${call.orderNumber}`}>
                                    <option value="">Escolha a região</option>
                                    {data.regions.map((item) => <option key={item}>{item}</option>)}
                                  </select>
                                  <button type="button" className="primary-button compact" disabled={!region || saving !== null} onClick={() => void saveOne(call)}>{saving === call.id ? "Salvando..." : "Salvar"}</button>
                                </div>
                                {call.suggestion && <small className="sr-suggestion" title={call.suggestion.detail}><Sparkles size={12} aria-hidden="true" /> Sugestão {REASON[call.suggestion.reason]}: {call.suggestion.region}</small>}
                                {call.olt && call.sameOlt > 0 && (
                                  <label className="sr-olt">
                                    <input type="checkbox" checked={Boolean(byOlt[call.id])} onChange={(event) => setByOlt((currentOlt) => ({ ...currentOlt, [call.id]: event.target.checked }))} />
                                    Também os outros {call.sameOlt} desta OLT{canMapOlt ? " e cadastrar a OLT nessa região" : ""}
                                  </label>
                                )}
                              </>
                            ) : <span className="sr-muted">Sem permissão para editar</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="sr-footer">
              <span>{visible.length.toLocaleString("pt-BR")} de {calls.length.toLocaleString("pt-BR")} chamado(s) sem região</span>
              {pages > 1 && (
                <div className="sr-pager">
                  <button type="button" className="icon-button" aria-label="Página anterior" disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft size={16} /></button>
                  <span>Página {current} de {pages}</span>
                  <button type="button" className="icon-button" aria-label="Próxima página" disabled={current >= pages} onClick={() => setPage(current + 1)}><ChevronRight size={16} /></button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
