import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChartColumn, ChevronLeft, ChevronRight, Code2, Download, Hourglass, KeyRound, ListChecks, Lock, Maximize2, Minimize2, MoonStar, Repeat2, RotateCcw, Send, ThumbsDown, ThumbsUp, UsersRound, BellRing, X } from "lucide-react";
import { api, type JotaAnswer, type JotaUsage } from "../api";

// Jota H: assistente flutuante (balao no canto inferior direito, em qualquer tela). A pessoa pergunta em portugues, o
// Gemini monta a consulta sem ver dados e o banco responde so leitura. Quem gerencia as configuracoes ve o uso.
type QueryAnswer = Extract<JotaAnswer, { kind: "query" }>;
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
type Message =
  | { id: number; from: "user"; text: string }
  | { id: number; from: "bot"; kind: "topic"; title: string; questions: string[] }
  | { id: number; from: "bot"; kind: "answer"; question: string; answer: JotaAnswer; feedback?: 1 | -1 }
  | { id: number; from: "bot"; kind: "error"; text: string }
  | { id: number; from: "bot"; kind: "loading" };

const TOPICS: { label: string; icon: typeof ListChecks; questions: string[] }[] = [
  { label: "Chamados de hoje", icon: ListChecks, questions: ["Quantos chamados entraram hoje por região?", "Quais chamados estão abertos sem técnico agora?", "Quantos chamados foram finalizados hoje por tipo?"] },
  { label: "Prazo e TME", icon: Hourglass, questions: ["Qual o TME e o % dentro do prazo de 6 h esta semana?", "Quais chamados passaram de 6 h hoje?", "TME por região no mês"] },
  { label: "Técnicos", icon: UsersRound, questions: ["Ranking de técnicos por chamados finalizados este mês", "TME por técnico na semana passada", "Quantos chamados cada técnico tem em aberto agora?"] },
  { label: "Repetidos", icon: Repeat2, questions: ["Quantos chamados repetidos tivemos este mês?", "Quais regiões têm mais repetidos nos últimos 30 dias?", "Liste os repetidos desta semana"] },
  { label: "Acionamentos", icon: BellRing, questions: ["Quantos acionamentos foram aceitos e recusados hoje?", "Quem mais recusou acionamentos este mês?", "Motivos de recusa mais comuns na semana"] },
  { label: "Chaves dos POPs", icon: KeyRound, questions: ["Quais chaves de POP estão retiradas e com quem?", "Chaves retiradas há mais de 7 dias", "Histórico de retiradas da última semana"] },
  { label: "Roteirizador", icon: MoonStar, questions: ["O que o roteirizador moveu na última madrugada?", "Quantas ordens o roteirizador moveu por técnico esta semana?", "Erros do roteirizador nos últimos 7 dias"] },
];
const DEFAULT_SUGGESTIONS = ["Quantos chamados entraram hoje por região?", "Quais técnicos mais finalizaram este mês?", "TME da semana passada", "Quais chaves de POP estão retiradas?"];
const PAGE = 100;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const formatCell = (value: unknown) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "string" && ISO.test(value)) { const date = new Date(value); if (Number.isFinite(date.getTime())) return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
function downloadCsv(answer: QueryAnswer) {
  const escape = (value: unknown) => { const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
  const csv = [answer.colunas.map(escape).join(";"), ...answer.linhas.map((row) => answer.colunas.map((column) => escape(row[column])).join(";"))].join("\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `jota-h-${answer.titulo.slice(0, 40).replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "resultado"}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Robo do Jota H. As cores ficam no CSS (jota-h.css), para acompanhar o tema escolhido; as animacoes (balancar,
// piscar, antena acesa, sorriso) tambem. `animated` liga o movimento (balao e cabecalho).
function BotFace({ size = 20, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg className={`jw-bot${animated ? " is-animated" : ""}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g className="jw-bot-body">
        <rect className="jw-bot-stem" x="15.2" y="3.5" width="1.6" height="5" rx="0.8" />
        <circle className="jw-bot-ball" cx="16" cy="3.4" r="2.3" />
        <rect className="jw-bot-ear" x="2.6" y="13.5" width="3.2" height="7" rx="1.6" />
        <rect className="jw-bot-ear" x="26.2" y="13.5" width="3.2" height="7" rx="1.6" />
        <rect className="jw-bot-head" x="5" y="8" width="22" height="19" rx="7.5" />
        <rect className="jw-bot-visor" x="8.5" y="12.2" width="15" height="10" rx="5" />
        <g className="jw-bot-eyes">
          <circle className="jw-bot-eye" cx="12.8" cy="16.6" r="1.9" />
          <circle className="jw-bot-eye" cx="19.2" cy="16.6" r="1.9" />
        </g>
        <path className="jw-bot-mouth" d="M13.6 19.5 Q16 21.6 18.4 19.5" />
      </g>
    </svg>
  );
}

function ResultTable({ answer }: { answer: QueryAnswer }) {
  const [page, setPage] = useState(0);
  if (!answer.linhas.length) return <p className="jw-muted">Nenhuma linha para essa pergunta.</p>;
  if (answer.linhas.length === 1 && answer.colunas.length <= 4) {
    return <div className="jw-tiles">{answer.colunas.map((column) => <div key={column} className="jw-tile"><span>{column}</span><strong>{formatCell(answer.linhas[0][column])}</strong></div>)}</div>;
  }
  const pages = Math.ceil(answer.linhas.length / PAGE);
  return (
    <>
      <div className="jw-table-wrap">
        <table className="jw-table">
          <thead><tr>{answer.colunas.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{answer.linhas.slice(page * PAGE, page * PAGE + PAGE).map((row, index) => <tr key={index}>{answer.colunas.map((column) => <td key={column}>{formatCell(row[column])}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="jw-pager">
          <button type="button" className="jw-icon" aria-label="Página anterior" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
          <span>Página {page + 1} de {pages}</span>
          <button type="button" className="jw-icon" aria-label="Próxima página" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
        </div>
      )}
    </>
  );
}

function UsageChart({ days }: { days: JotaUsage["byDay"] }) {
  const width = 320, height = 120, pad = 22;
  const max = Math.max(4, ...days.map((day) => day.total));
  const x = (index: number) => pad + (index * (width - pad * 2)) / Math.max(1, days.length - 1);
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2);
  const line = days.map((day, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(day.total).toFixed(1)}`).join(" ");
  const area = `${line} L${x(days.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;
  return (
    <svg className="jw-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Perguntas por dia: ${days.map((day) => `${day.day.slice(8, 10)}/${day.day.slice(5, 7)} ${day.total}`).join(", ")}`}>
      {[0, 0.5, 1].map((step) => <line key={step} x1={pad} x2={width - pad} y1={y(max * step)} y2={y(max * step)} className="jw-chart-grid" />)}
      <text x={pad - 4} y={y(max) + 3} textAnchor="end" className="jw-chart-label">{max}</text>
      <text x={pad - 4} y={y(0) + 3} textAnchor="end" className="jw-chart-label">0</text>
      <path d={area} className="jw-chart-area" />
      <path d={line} className="jw-chart-line" />
      {days.map((day, index) => (
        <g key={day.day}>
          <circle cx={x(index)} cy={y(day.total)} r={4} className="jw-chart-dot"><title>{`${day.day.slice(8, 10)}/${day.day.slice(5, 7)}: ${day.total} pergunta(s), ${day.errors} com erro`}</title></circle>
          <text x={x(index)} y={height - 6} textAnchor="middle" className="jw-chart-label">{`${day.day.slice(8, 10)}/${day.day.slice(5, 7)}`}</text>
        </g>
      ))}
    </svg>
  );
}

function UsagePanel() {
  const [usage, setUsage] = useState<JotaUsage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void api.jotaUsage().then(setUsage).catch((err) => setError(err instanceof Error ? err.message : "Não foi possível carregar o uso.")); }, []);
  if (error) return <p className="form-error">{error}</p>;
  if (!usage) return <p className="jw-muted">Carregando o uso…</p>;
  return (
    <section className="jw-usage" aria-label="Uso do Jota H nos últimos 7 dias">
      <h3><ChartColumn size={16} aria-hidden="true" /> Uso do Jota H — últimos 7 dias</h3>
      <div className="jw-usage-tiles">
        <div><span>Perguntas hoje</span><strong>{usage.today}</strong></div>
        <div><span>Nos 7 dias</span><strong>{usage.week}</strong></div>
        <div><span>Com erro</span><strong>{usage.errors} <small>({usage.errorRate}%)</small></strong></div>
        <div><span>Pessoas</span><strong>{usage.people}</strong></div>
        <div><span>Avaliações</span><strong><ThumbsUp size={14} aria-label="Útil" /> {usage.thumbsUp} / <ThumbsDown size={14} aria-label="Não ajudou" /> {usage.thumbsDown}</strong></div>
      </div>
      <UsageChart days={usage.byDay} />
      <div className="jw-table-wrap">
        <table className="jw-table">
          <thead><tr><th scope="col">Pessoa</th><th scope="col">Hoje</th><th scope="col">7 dias</th><th scope="col">Erros</th></tr></thead>
          <tbody>{usage.byPerson.length ? usage.byPerson.map((person) => <tr key={person.name}><td>{person.name}</td><td>{person.today}</td><td>{person.week}</td><td>{person.errors}</td></tr>) : <tr><td colSpan={4}>Ninguém perguntou ainda.</td></tr>}</tbody>
        </table>
      </div>
      <h4>Últimas perguntas com erro</h4>
      {usage.recentErrors.length ? (
        <div className="jw-table-wrap">
          <table className="jw-table">
            <thead><tr><th scope="col">Quando</th><th scope="col">Quem</th><th scope="col">Pergunta</th></tr></thead>
            <tbody>{usage.recentErrors.map((item, index) => <tr key={index} title={item.error}><td>{dateTime(item.at)}</td><td>{item.name}</td><td className="jw-wrap">{item.question}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <p className="jw-muted">Nenhum erro na semana.</p>}
      <h4>Responderam vazio (pode ser pergunta mal entendida)</h4>
      {usage.empty.length ? <ul className="jw-empty-list">{usage.empty.map((item, index) => <li key={index}>{item.question} — <span>{item.name}</span></li>)}</ul> : <p className="jw-muted">Nenhuma na semana.</p>}
    </section>
  );
}

export function JotaHWidget({ userName, canSeeUsage }: { userName: string; canSeeUsage: boolean }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [showSql, setShowSql] = useState<Record<number, boolean>>({});
  const nextId = useRef(1);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const busy = messages.some((message) => message.from === "bot" && message.kind === "loading");
  const firstName = userName.trim().split(/\s+/)[0] || "";
  const lastAnswer = [...messages].reverse().find((message): message is Extract<Message, { kind: "answer" }> => message.from === "bot" && message.kind === "answer");
  const suggestions = lastAnswer && (lastAnswer.answer.kind === "query" || lastAnswer.answer.kind === "error") && lastAnswer.answer.sugestoes?.length ? lastAnswer.answer.sugestoes : DEFAULT_SUGGESTIONS;

  useEffect(() => { document.body.classList.add("has-jota-h"); return () => document.body.classList.remove("has-jota-h"); }, []);
  useEffect(() => { if (open && !showUsage) bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" }); }, [messages, open, showUsage]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); launcherRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const push = (message: WithoutId<Message>) => { const id = nextId.current++; setMessages((current) => [...current, { ...message, id } as Message]); return id; };
  async function ask(raw: string) {
    const question = raw.trim();
    if (question.length < 3 || busy) return;
    setShowUsage(false);
    const contexto = messages.flatMap((message) => (message.from === "bot" && message.kind === "answer" && message.answer.kind === "query" ? [{ pergunta: message.question, sql: message.answer.sql }] : [])).slice(-3);
    push({ from: "user", text: question });
    const loadingId = push({ from: "bot", kind: "loading" });
    setText("");
    try {
      const answer = await api.jotaH(question, contexto);
      setMessages((current) => current.map((message) => (message.id === loadingId ? { id: loadingId, from: "bot", kind: "answer", question, answer } : message)));
    } catch (err) {
      setMessages((current) => current.map((message) => (message.id === loadingId ? { id: loadingId, from: "bot", kind: "error", text: err instanceof Error ? err.message : "Não deu para responder agora." } : message)));
    }
  }
  async function rate(id: number, logId: string, util: boolean) {
    setMessages((current) => current.map((message) => (message.id === id && message.from === "bot" && message.kind === "answer" ? { ...message, feedback: util ? 1 : -1 } : message)));
    try { await api.jotaFeedback(logId, util); } catch { /* avaliacao e opcional */ }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void ask(text); };
  const reset = () => { setMessages([]); setShowSql({}); setShowUsage(false); inputRef.current?.focus(); };

  return (
    <>
      {open && (
        <div className={`jw-panel${expanded ? " is-expanded" : ""}`} role="dialog" aria-modal="false" aria-labelledby="jw-title">
          <header className="jw-head">
            <span className="jw-head-avatar"><BotFace size={26} animated /></span>
            <div className="jw-head-text">
              <strong id="jw-title">Jota H</strong>
              <small><i aria-hidden="true" /> assistente da operação · IA</small>
            </div>
            <div className="jw-head-actions">
              <button type="button" className="jw-head-button" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Diminuir" : "Ampliar"} title={expanded ? "Diminuir" : "Ampliar"}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
              {canSeeUsage && <button type="button" className="jw-head-button" onClick={() => setShowUsage(!showUsage)} aria-pressed={showUsage} aria-label="Uso do Jota H" title="Uso do Jota H"><ChartColumn size={15} /></button>}
              <button type="button" className="jw-head-button" onClick={reset} aria-label="Nova conversa" title="Nova conversa"><RotateCcw size={15} /></button>
              <button type="button" className="jw-head-button" onClick={() => { setOpen(false); launcherRef.current?.focus(); }} aria-label="Fechar o Jota H" title="Fechar"><X size={16} /></button>
            </div>
          </header>

          <div className="jw-body" ref={bodyRef} aria-live="polite">
            {showUsage ? <UsagePanel /> : (
              <>
                <div className="jw-row">
                  <span className="jw-avatar" aria-hidden="true"><BotFace size={16} /></span>
                  <div className="jw-bubble">
                    <strong>Oi{firstName ? `, ${firstName}` : ""}! Eu sou o Jota H 🤖</strong>
                    <p>Posso contar chamados, prazo, TME, técnicos, repetidos, acionamentos, chaves dos POPs… Escolha um assunto ou escreva do seu jeito.</p>
                    <div className="jw-topics">
                      {TOPICS.map((topic) => <button key={topic.label} type="button" onClick={() => push({ from: "bot", kind: "topic", title: topic.label, questions: topic.questions })}><topic.icon size={14} aria-hidden="true" />{topic.label}</button>)}
                    </div>
                  </div>
                </div>
                {messages.map((message) => {
                  if (message.from === "user") return <p key={message.id} className="jw-user">{message.text}</p>;
                  return (
                    <div key={message.id} className="jw-row">
                      <span className="jw-avatar" aria-hidden="true"><BotFace size={16} /></span>
                      {message.kind === "loading" ? <div className="jw-bubble jw-typing" aria-label="Jota H está pensando"><i /><i /><i /></div>
                        : message.kind === "error" ? <div className="jw-bubble"><p className="jw-error">{message.text}</p></div>
                        : message.kind === "topic" ? (
                          <div className="jw-bubble">
                            <p><b>{message.title}</b>: escolha uma pergunta ou escreva a sua.</p>
                            <div className="jw-chips">{message.questions.map((question) => <button key={question} type="button" disabled={busy} onClick={() => void ask(question)}>{question}</button>)}</div>
                          </div>
                        ) : (() => {
                          const answer = message.answer;
                          const logId = "logId" in answer ? answer.logId : undefined;
                          return (
                            <div className="jw-bubble jw-answer">
                              {answer.kind === "question" && (
                                <>
                                  <p>{answer.texto}</p>
                                  <div className="jw-chips">{answer.opcoes.map((option) => <button key={option} type="button" disabled={busy} onClick={() => void ask(`${message.question} (${option})`)}>{option}</button>)}</div>
                                </>
                              )}
                              {(answer.kind === "refused" || answer.kind === "error") && (<><strong>{answer.titulo}</strong><p className={answer.kind === "error" ? "jw-error" : "jw-muted"}>{answer.explicacao}</p></>)}
                              {answer.kind === "query" && (
                                <>
                                  <div className="jw-answer-head">
                                    <strong>{answer.titulo}</strong>
                                    <span>
                                      <button type="button" className="jw-icon" title="Ver a consulta" aria-label="Ver a consulta" aria-pressed={Boolean(showSql[message.id])} onClick={() => setShowSql((current) => ({ ...current, [message.id]: !current[message.id] }))}><Code2 size={14} /></button>
                                      {answer.linhas.length > 0 && <button type="button" className="jw-icon" title="Baixar CSV" aria-label="Baixar CSV" onClick={() => downloadCsv(answer)}><Download size={14} /></button>}
                                    </span>
                                  </div>
                                  {answer.explicacao && <p className="jw-muted">{answer.explicacao}</p>}
                                  <ResultTable answer={answer} />
                                  {answer.limite && <p className="jw-muted">Mostrando as primeiras 200 linhas.</p>}
                                </>
                              )}
                              {"sql" in answer && answer.sql && showSql[message.id] && <pre className="jw-sql">{answer.sql}</pre>}
                              {logId && answer.kind !== "question" && (
                                <div className="jw-rate">
                                  <span>Ajudou?</span>
                                  <button type="button" className="jw-icon" aria-label="Ajudou" aria-pressed={message.feedback === 1} onClick={() => void rate(message.id, logId, true)}><ThumbsUp size={14} /></button>
                                  <button type="button" className="jw-icon" aria-label="Não ajudou" aria-pressed={message.feedback === -1} onClick={() => void rate(message.id, logId, false)}><ThumbsDown size={14} /></button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div className="jw-suggestions" aria-label="Sugestões de pergunta">
            {suggestions.map((suggestion) => <button key={suggestion} type="button" disabled={busy} onClick={() => void ask(suggestion)}>{suggestion}</button>)}
          </div>
          <form className="jw-form" onSubmit={submit}>
            <label className="sr-only" htmlFor="jw-input">Pergunta para o Jota H</label>
            <input id="jw-input" ref={inputRef} value={text} onChange={(event) => setText(event.target.value)} placeholder="Pergunte em português…" maxLength={500} autoComplete="off" />
            <button type="submit" className="jw-send" aria-label="Enviar pergunta" disabled={busy || text.trim().length < 3}><Send size={16} /></button>
          </form>
          <p className="jw-foot"><Lock size={12} aria-hidden="true" /> A IA só monta a conta — os dados da operação não saem do sistema</p>
        </div>
      )}
      <div className={`jw-launcher-wrap${open ? " is-open" : ""}`}>
        {!open && <span className="jw-hello" aria-hidden="true">Oi{firstName ? `, ${firstName}` : ""}! Posso ajudar? <span className="jw-wave">👋</span></span>}
        <button ref={launcherRef} type="button" className={`jw-launcher${open ? " is-open" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Fechar o Jota H" : "Abrir o Jota H, assistente da operação"}>
          <BotFace size={40} animated />
        </button>
      </div>
    </>
  );
}
