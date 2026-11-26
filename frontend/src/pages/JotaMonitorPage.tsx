import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Clock, FlaskConical, MessageCircle, MessageSquare, Plus, RefreshCw, Stethoscope, ThumbsDown, ThumbsUp, User, Zap } from "lucide-react";
import { api, type JotaCheck, type JotaLogItem, type JotaMonitor, type JotaRule, type JotaTest } from "../api";
import { Panel } from "../components/charts";
import { SkeletonCards } from "../components/Skeleton";
import { JOTA_OPEN_EVENT } from "../components/JotaHWidget";

// Acompanhamento da IA (26/11/2026): se o Jota H esta respondendo (Groq principal, Gemini reserva), quem usa, o que
// perguntam, erros, 👎 e respostas vazias; as regras que a IA aprendeu (entram no prompt na hora) e os testes
// automaticos (pergunta + SQL certo). Verificar e rodar testes so quando alguem clica: nao gasta cota sozinho.

type Tab = "pessoas" | "erros" | "top" | "ruins" | "vazias" | "boas";
const PROVIDER_NAME = { groq: "Groq", gemini: "Gemini" } as const;
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const seconds = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1).replace(".", ",")} s`);
const dash = (value: number) => (value ? String(value) : "–");

function DayChart({ days }: { days: JotaMonitor["panel"]["byDay"] }) {
  const width = 760, height = 190, left = 34, bottom = 26, top = 10;
  const max = Math.max(4, ...days.map((day) => day.total));
  const slot = (width - left - 8) / days.length;
  const bar = Math.max(6, Math.min(28, slot * 0.45));
  const y = (value: number) => top + (height - top - bottom) * (1 - value / max);
  const step = days.length > 10 ? Math.ceil(days.length / 10) : 1;
  return (
    <svg className="jm-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Perguntas por dia: ${days.map((day) => `${day.day.slice(8, 10)}/${day.day.slice(5, 7)} ${day.total}${day.errors ? ` (${day.errors} com erro)` : ""}`).join(", ")}`}>
      {[0, 0.5, 1].map((part) => (
        <g key={part}>
          <line x1={left} x2={width - 4} y1={y(max * part)} y2={y(max * part)} className="jm-chart-grid" />
          <text x={left - 6} y={y(max * part) + 4} textAnchor="end" className="jm-chart-label">{Math.round(max * part)}</text>
        </g>
      ))}
      {days.map((day, index) => {
        const x = left + slot * index + slot / 2 - bar / 2;
        const answered = day.total - day.errors;
        return (
          <g key={day.day}>
            <title>{`${day.day.slice(8, 10)}/${day.day.slice(5, 7)}: ${day.total} pergunta(s), ${day.errors} com erro`}</title>
            {answered > 0 && <rect x={x} y={y(day.total)} width={bar} height={y(day.errors) - y(day.total)} rx={Math.min(6, bar / 2)} className="jm-bar-ok" />}
            {day.errors > 0 && <rect x={x} y={y(day.errors)} width={bar} height={y(0) - y(day.errors)} rx={Math.min(6, bar / 2)} className="jm-bar-error" />}
            {day.total === 0 && <rect x={x} y={y(0) - 2} width={bar} height={2} className="jm-bar-zero" />}
            {index % step === 0 && <text x={x + bar / 2} y={height - 8} textAnchor="middle" className="jm-chart-label">{`${day.day.slice(8, 10)}/${day.day.slice(5, 7)}`}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function ProviderCard({ provider, check, info }: { provider: "groq" | "gemini"; check?: JotaCheck; info: { configured: boolean; model: string }; }) {
  const state = !info.configured ? "off" : !check ? "unknown" : check.ok ? "ok" : "fail";
  const role = check?.role ?? (provider === "groq" ? "principal" : "reserva");
  return (
    <div className={`jm-provider is-${state}`}>
      <div className="jm-provider-top"><strong>{PROVIDER_NAME[provider]}</strong>{check?.ms != null && state === "ok" && <b>{check.ms} ms</b>}</div>
      <span className="jm-provider-role"><i aria-hidden="true" />{!info.configured ? "sem chave" : state === "fail" ? `${role} · ${check?.error || "falhou"}` : role}</span>
      <small>{check?.model || info.model}</small>
    </div>
  );
}

function ItemTable({ items, kind, onRule, onTest }: { items: JotaLogItem[]; kind: "erros" | "ruins" | "vazias" | "boas"; onRule: (item: JotaLogItem) => void; onTest: (item: JotaLogItem) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return <div className="dv-empty">{kind === "erros" ? "Nenhum erro no período." : kind === "ruins" ? "Ninguém marcou 👎 no período." : kind === "vazias" ? "Nenhuma resposta vazia ou recusada no período." : "Nenhuma resposta com 👍 (e SQL) no período."}</div>;
  return (
    <div className="jm-table-wrap">
      <table className="jm-table">
        <thead><tr><th scope="col">Quando</th><th scope="col">Pessoa</th><th scope="col">Pergunta</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="jm-nowrap">{dateTime(item.at)}</td>
              <td className="jm-nowrap">{item.name}</td>
              <td>
                <span className="jm-question">{item.question}</span>
                {(item.error || item.title) && <small className="jm-detail">{kind === "erros" || kind === "vazias" ? item.error || item.title : item.title}</small>}
                {item.sql && <button type="button" className="link-button jm-sql-toggle" onClick={() => setOpen(open === item.id ? null : item.id)} aria-expanded={open === item.id}>{open === item.id ? "esconder SQL" : "ver SQL"}</button>}
                {open === item.id && <pre className="jm-sql">{item.sql}</pre>}
              </td>
              <td className="jm-actions">
                {kind === "boas" ? <button type="button" className="secondary-button compact" onClick={() => onTest(item)}><FlaskConical size={14} aria-hidden="true" /> Virar teste</button>
                  : <button type="button" className="secondary-button compact" onClick={() => onRule(item)}><Plus size={14} aria-hidden="true" /> Virar regra</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RuleForm({ initial, onCancel, onSave }: { initial: { text: string; scope: JotaRule["scope"]; origin?: string }; onCancel: () => void; onSave: (text: string, scope: JotaRule["scope"]) => Promise<void> }) {
  const [text, setText] = useState(initial.text);
  const [scope, setScope] = useState(initial.scope);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); try { await onSave(text.trim(), scope); } finally { setBusy(false); } };
  return (
    <form className="jm-rule-form" onSubmit={(event) => void submit(event)}>
      {initial.origin && <small className="jm-origin">Veio de: “{initial.origin}”</small>}
      <label className="sr-only" htmlFor="jm-rule-text">Texto da regra</label>
      <textarea id="jm-rule-text" value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={1500} placeholder={'Ex.: "Baixar" conta como finalizado quando a pergunta for sobre o que a equipe fechou.'} autoFocus />
      <div className="jm-rule-form-actions">
        <label>Vale para <select value={scope} onChange={(event) => setScope(event.target.value as JotaRule["scope"])}><option value="todos">Todo mundo</option><option value="lideranca">Liderança (quem gerencia)</option></select></label>
        <button type="button" className="secondary-button compact" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="submit" className="primary-button compact" disabled={busy || text.trim().length < 5}>{busy ? "Salvando..." : "Salvar regra"}</button>
      </div>
    </form>
  );
}

export function JotaMonitorPage() {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<JotaMonitor | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [tab, setTab] = useState<Tab>("pessoas");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [newRule, setNewRule] = useState<{ text: string; scope: JotaRule["scope"]; origin?: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async (period: 7 | 30) => {
    setLoading(true);
    try { setData(await api.jotaMonitor(period)); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar o acompanhamento."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(days); }, [days, load]);

  const say = (text: string, isError = false) => { setNotice({ text, error: isError }); window.setTimeout(() => setNotice(null), 4000); };
  const fail = (err: unknown, fallback: string) => say(err instanceof Error ? err.message : fallback, true);

  async function verify() {
    setChecking(true);
    try { const lastCheck = await api.jotaCheck(); setData((current) => (current ? { ...current, lastCheck } : current)); }
    catch (err) { fail(err, "Não foi possível verificar as IAs."); }
    finally { setChecking(false); }
  }
  const setRules = (update: (rules: JotaRule[]) => JotaRule[]) => setData((current) => (current ? { ...current, rules: update(current.rules ?? []) } : current));
  const setTests = (tests: JotaTest[]) => setData((current) => (current ? { ...current, tests } : current));
  async function createRule(text: string, scope: JotaRule["scope"]) {
    try { const { rule } = await api.jotaAddRule(text, scope, newRule?.origin); setRules((rules) => [rule, ...rules]); setNewRule(null); say("Regra salva: vale já na próxima pergunta."); }
    catch (err) { fail(err, "Não foi possível salvar a regra."); }
  }
  async function saveRule(id: string, patch: { texto?: string; escopo?: JotaRule["scope"]; ativo?: boolean }) {
    try { const { rule } = await api.jotaUpdateRule(id, patch); setRules((rules) => rules.map((item) => (item.id === id ? rule : item))); if (patch.texto !== undefined) setEditing(null); }
    catch (err) { fail(err, "Não foi possível salvar a regra."); }
  }
  async function removeRule(rule: JotaRule) {
    if (!window.confirm(`Excluir esta regra? A IA deixa de seguir na próxima pergunta.\n\n${rule.text.slice(0, 200)}`)) return;
    try { await api.jotaDeleteRule(rule.id); setRules((rules) => rules.filter((item) => item.id !== rule.id)); }
    catch (err) { fail(err, "Não foi possível excluir a regra."); }
  }
  async function makeTest(item: JotaLogItem) {
    try { const { test } = await api.jotaAddTest(item.question, item.sql); setTests([test, ...(data?.tests ?? [])]); say("Virou teste: rode os testes para comparar."); }
    catch (err) { fail(err, "Não foi possível criar o teste."); }
  }
  async function removeTest(test: JotaTest) {
    if (!window.confirm(`Excluir o teste "${test.question}"?`)) return;
    try { await api.jotaDeleteTest(test.id); setTests((data?.tests ?? []).filter((item) => item.id !== test.id)); }
    catch (err) { fail(err, "Não foi possível excluir o teste."); }
  }
  async function runTests(onlyGroq: boolean) {
    const count = Math.min(15, data?.tests?.length ?? 0);
    if (!window.confirm(`Rodar ${count} teste(s)${onlyGroq ? " só com o Groq" : ""}? Cada teste faz 1 pergunta à IA.`)) return;
    setRunning(true);
    try { const result = await api.jotaRunTests(onlyGroq); setTests(result.tests); const ok = result.results.filter((item) => item.result === "ok").length; say(`${ok} de ${result.results.length} teste(s) com o mesmo resultado do SQL certo.`, ok < result.results.length); }
    catch (err) { fail(err, "Não foi possível rodar os testes."); }
    finally { setRunning(false); }
  }

  const panel = data?.panel;
  const check = data?.lastCheck;
  const anyOk = Boolean(check?.providers.some((item) => item.ok));
  const health = !data ? "unknown" : !data.providers.groq.configured && !data.providers.gemini.configured ? "fail" : !check ? "unknown" : anyOk ? "ok" : "fail";
  const principal = check?.providers.find((item) => item.role === "principal");
  const reserve = check?.providers.find((item) => item.role === "reserva");
  const healthTitle = health === "ok" ? "O Jota H está funcionando" : health === "fail" ? "O Jota H está com problema" : "Situação das IAs ainda não verificada";
  const healthText = health === "ok"
    ? `${principal?.ok ? `${PROVIDER_NAME[principal.provider]} respondendo` : `${principal ? PROVIDER_NAME[principal.provider] : "Principal"} falhou`}${reserve ? reserve.ok ? ` e ${PROVIDER_NAME[reserve.provider]} pronto como reserva` : ` e ${PROVIDER_NAME[reserve.provider]} ${reserve.configured ? "falhou" : "sem chave"}` : ""} · ${dateTime(check!.at)}`
    : health === "fail" ? (data && !data.providers.groq.configured && !data.providers.gemini.configured ? "Nenhuma chave de IA configurada no servidor (GROQ_API_KEY ou GEMINI_API_KEY)." : `Nenhuma IA respondeu na verificação de ${dateTime(check!.at)}. As perguntas vão dar erro até voltar.`)
    : "Clique em Verificar agora: faz 1 pergunta mínima a cada IA (não roda sozinho, para não gastar cota).";
  const HealthIcon = health === "ok" ? CheckCircle2 : health === "fail" ? AlertTriangle : CircleHelp;
  const activeRules = (data?.rules ?? []).filter((rule) => rule.active).length;
  const tabs: { key: Tab; label: string; count: number }[] = panel ? [
    { key: "pessoas", label: "Pessoas", count: panel.byPerson.length },
    { key: "erros", label: "Erros", count: panel.errorList.length },
    { key: "top", label: "Mais perguntadas", count: panel.top.length },
    { key: "ruins", label: "Marcadas com 👎", count: panel.disliked.length },
    { key: "vazias", label: "Respostas vazias", count: panel.empty.length },
    { key: "boas", label: "Marcadas com 👍", count: panel.liked.length },
  ] : [];
  const startRule = (item: JotaLogItem) => { setNewRule({ text: "", scope: "todos", origin: item.question }); window.setTimeout(() => document.getElementById("jm-rules")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  return (
    <div className="dv-dashboard jm-page">
      <div className="page-heading dv-heading">
        <div>
          <span className="section-kicker">ADMINISTRAÇÃO</span>
          <h1>Acompanhamento da IA</h1>
          <p>Se o Jota H está respondendo, quem usa, o que perguntam e onde erra. As regras que você escreve aqui valem já na próxima pergunta.</p>
        </div>
        <div className="cq-heading-actions">
          <div className="dv-segmented" role="group" aria-label="Período">
            {([7, 30] as const).map((value) => <button key={value} type="button" className={days === value ? "is-selected" : ""} aria-pressed={days === value} onClick={() => setDays(value)}>{value} dias</button>)}
          </div>
          <button className="secondary-button compact" type="button" onClick={() => void load(days)} disabled={loading}><RefreshCw size={15} className={loading ? "ih-spin" : ""} aria-hidden="true" /> {loading ? "Atualizando..." : "Atualizar"}</button>
          <button className="primary-button compact" type="button" onClick={() => window.dispatchEvent(new Event(JOTA_OPEN_EVENT))}><MessageCircle size={15} aria-hidden="true" /> Abrir o chat</button>
        </div>
      </div>
      {notice && <div className={notice.error ? "form-error" : "save-message"} role={notice.error ? "alert" : "status"}>{notice.text}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      {!data || !panel ? (!error && <SkeletonCards count={4} label="Carregando o acompanhamento..." />) : <>
        <section className={`panel jm-health is-${health}`} aria-label="Situação do Jota H">
          <div className="jm-health-main">
            <span className="jm-health-icon"><HealthIcon size={26} aria-hidden="true" /></span>
            <div><h2>{healthTitle}</h2><p>{healthText}</p></div>
          </div>
          <div className="jm-health-side">
            <ProviderCard provider="groq" info={data.providers.groq} check={check?.providers.find((item) => item.provider === "groq")} />
            <ProviderCard provider="gemini" info={data.providers.gemini} check={check?.providers.find((item) => item.provider === "gemini")} />
            <button type="button" className="secondary-button compact" onClick={() => void verify()} disabled={checking}><Stethoscope size={15} aria-hidden="true" /> {checking ? "Verificando..." : "Verificar agora"}</button>
          </div>
        </section>
        {data.demo && <p className="jm-demo">Modo demonstração: sem banco e sem IA. Os números são só das perguntas feitas neste preview.</p>}

        <section className="panel jm-kpis" aria-label="Resumo do período">
          <div><span><MessageSquare size={14} aria-hidden="true" /> Perguntas</span><strong>{panel.total}</strong><small>{panel.today} hoje · {panel.days} dias</small></div>
          <div><span><User size={14} aria-hidden="true" /> Pessoas</span><strong>{panel.people}</strong><small>no máximo 20 perguntas/min por pessoa</small></div>
          <div><span><CheckCircle2 size={14} aria-hidden="true" /> Respondidas sem erro</span><strong>{panel.okRate}%</strong><small>{panel.errors} com erro{panel.repaired ? ` · ${panel.repaired} SQL corrigido(s) sozinho` : ""}</small></div>
          <div><span><Clock size={14} aria-hidden="true" /> Tempo de resposta</span><strong>{seconds(panel.medianMs)}</strong><small>mediana · IA + banco, sem o cache</small></div>
          <div><span><Zap size={14} aria-hidden="true" /> Economia</span><strong>{panel.cacheRate}%</strong><small>do cache do dia · {panel.byProvider.gemini} pela reserva (Gemini)</small></div>
          <div><span><ThumbsUp size={14} aria-hidden="true" /> Avaliação</span><strong>{panel.thumbsUp} / {panel.thumbsDown}</strong><small><ThumbsUp size={11} aria-label="úteis" /> úteis / <ThumbsDown size={11} aria-label="erraram" /> erraram</small></div>
        </section>

        <Panel kicker="USO" title="Perguntas por dia" aside={<span className="jm-legend"><i className="is-ok" /> respondidas <i className="is-error" /> com erro</span>}>
          <DayChart days={panel.byDay} />
        </Panel>

        <section className="panel jm-tabs-panel">
          <div className="jm-tabs" role="tablist" aria-label="Detalhes do uso">
            {tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? "is-active" : ""} onClick={() => setTab(item.key)}>{item.label} <b>{item.count}</b></button>)}
          </div>
          <div role="tabpanel">
            {tab === "pessoas" && (panel.byPerson.length ? (
              <div className="jm-table-wrap"><table className="jm-table">
                <thead><tr><th scope="col">Pessoa</th><th scope="col" className="jm-num">Hoje</th><th scope="col" className="jm-num">{panel.days} dias</th><th scope="col" className="jm-num">Com erro</th></tr></thead>
                <tbody>{panel.byPerson.map((person) => <tr key={person.name}><td>{person.name}</td><td className="jm-num">{dash(person.today)}</td><td className="jm-num">{person.total}</td><td className="jm-num">{dash(person.errors)}</td></tr>)}</tbody>
              </table></div>
            ) : <div className="dv-empty">Ninguém perguntou no período.</div>)}
            {tab === "top" && (panel.top.length ? (
              <div className="jm-table-wrap"><table className="jm-table">
                <thead><tr><th scope="col">Pergunta</th><th scope="col">Última vez</th><th scope="col" className="jm-num">Vezes</th></tr></thead>
                <tbody>{panel.top.map((item) => <tr key={item.question}><td>{item.question}</td><td className="jm-nowrap">{dateTime(item.lastAt)}</td><td className="jm-num">{item.count}</td></tr>)}</tbody>
              </table></div>
            ) : <div className="dv-empty">Nenhuma pergunta no período.</div>)}
            {tab === "erros" && <ItemTable items={panel.errorList} kind="erros" onRule={startRule} onTest={(item) => void makeTest(item)} />}
            {tab === "ruins" && <ItemTable items={panel.disliked} kind="ruins" onRule={startRule} onTest={(item) => void makeTest(item)} />}
            {tab === "vazias" && <ItemTable items={panel.empty} kind="vazias" onRule={startRule} onTest={(item) => void makeTest(item)} />}
            {tab === "boas" && <ItemTable items={panel.liked} kind="boas" onRule={startRule} onTest={(item) => void makeTest(item)} />}
          </div>
        </section>

        <section className="panel jm-rules" id="jm-rules" aria-labelledby="jm-rules-title">
          <header className="jm-section-head">
            <div><h2 id="jm-rules-title">🎓 O que a IA já aprendeu</h2><small>{activeRules} regra(s) ligada(s) · valem na hora para a próxima pergunta</small></div>
            {!newRule && <button type="button" className="secondary-button compact" onClick={() => setNewRule({ text: "", scope: "todos" })}><Plus size={14} aria-hidden="true" /> Nova regra</button>}
          </header>
          {data.rules === null && <div className="form-error">As regras ainda não existem no banco (falta a migração do Acompanhamento da IA).</div>}
          {newRule && <RuleForm initial={newRule} onCancel={() => setNewRule(null)} onSave={createRule} />}
          {data.rules && !data.rules.length && !newRule && <div className="dv-empty">Nenhuma regra ainda. Quando a IA errar (aba Erros ou 👎), clique em “Virar regra” e escreva o jeito certo de contar.</div>}
          <ul className="jm-rule-list">
            {(data.rules ?? []).map((rule) => (
              <li key={rule.id} className={rule.active ? "" : "is-off"}>
                <label className="jm-switch" title={rule.active ? "Ligada: desligar" : "Desligada: ligar"}>
                  <input type="checkbox" role="switch" checked={rule.active} onChange={() => void saveRule(rule.id, { ativo: !rule.active })} aria-label={`${rule.active ? "Desligar" : "Ligar"} a regra`} />
                  <span aria-hidden="true" />
                </label>
                {editing === rule.id ? (
                  <div className="jm-rule-body"><RuleForm initial={{ text: rule.text, scope: rule.scope }} onCancel={() => setEditing(null)} onSave={(text, scope) => saveRule(rule.id, { texto: text, escopo: scope })} /></div>
                ) : <>
                  <div className="jm-rule-body">
                    <p>{rule.text}</p>
                    <small>{rule.scope === "lideranca" ? "Liderança" : "Todo mundo"} · {rule.author || "—"} · {dayMonth(rule.createdAt)}{rule.origin ? ` · veio de “${rule.origin}”` : ""}</small>
                  </div>
                  <div className="jm-rule-actions">
                    <button type="button" className="secondary-button compact" onClick={() => setEditing(rule.id)}>Editar</button>
                    <button type="button" className="secondary-button compact" onClick={() => void removeRule(rule)}>Excluir</button>
                  </div>
                </>}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel jm-tests" aria-labelledby="jm-tests-title">
          <header className="jm-section-head">
            <div><h2 id="jm-tests-title">Testes automáticos</h2><small>perguntas comparadas com a conta feita direto no banco · 👍 vira teste na aba “Marcadas com 👍” · só rodam quando você clica (até 15 por vez)</small></div>
            <div className="jm-rule-actions">
              <button type="button" className="secondary-button compact" onClick={() => void runTests(false)} disabled={running || !data.tests?.length}><FlaskConical size={14} aria-hidden="true" /> {running ? "Rodando..." : "Rodar testes"}</button>
              <button type="button" className="secondary-button compact" onClick={() => void runTests(true)} disabled={running || !data.tests?.length || !data.providers.groq.configured}>Só o Groq</button>
            </div>
          </header>
          {data.tests === null ? <div className="form-error">Os testes ainda não existem no banco (falta a migração do Acompanhamento da IA).</div>
            : !data.tests.length ? <p className="jm-muted">Nenhum teste ainda. Rode depois de mexer nas regras ou trocar de modelo, para ver se algo quebrou.</p> : (
            <ul className="jm-test-list">
              {data.tests.map((test) => (
                <li key={test.id} className={test.lastResult ? `is-${test.lastResult}` : ""}>
                  <span className="jm-test-badge">{test.lastResult === "ok" ? "Passou" : test.lastResult === "diferente" ? "Diferente" : test.lastResult === "erro" ? "Erro" : "Não rodou"}</span>
                  <div className="jm-rule-body">
                    <p>{test.question}</p>
                    <small>{test.lastRunAt ? `${dateTime(test.lastRunAt)} · ${test.lastDetail}` : `criado por ${test.author || "—"} em ${dayMonth(test.createdAt)}`}</small>
                  </div>
                  <button type="button" className="secondary-button compact" onClick={() => void removeTest(test)}>Excluir</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </>}
    </div>
  );
}
