import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChartColumn, Check, ChevronLeft, ChevronRight, Code2, Copy, Download, Hourglass, KeyRound, ListChecks, Lock, Maximize2, Minimize2, MoonStar, Repeat2, RotateCcw, Send, ThumbsDown, ThumbsUp, UsersRound, BellRing, X } from "lucide-react";
import { api, type JotaAnswer, type JotaUsage } from "../api";
import { jotaGreetingText, jotaLook, parseJotaTestDate, spDateKey, type JotaAccessory } from "../lib/jota-accessories";

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

// "Copiar": texto simples da resposta (titulo + explicacao; tabela em colunas separadas por tab, ate 50 linhas).
const COPY_ROWS = 50;
function answerText(answer: JotaAnswer): string {
  if (answer.kind === "question") return [answer.texto, ...answer.opcoes.map((option) => `- ${option}`)].join("\n");
  if (answer.kind !== "query") return [answer.titulo, answer.explicacao].filter(Boolean).join("\n");
  const clean = (value: string) => value.replace(/[\t\r\n]+/g, " ");
  const lines = [answer.titulo];
  if (answer.explicacao) lines.push(answer.explicacao);
  if (!answer.linhas.length) lines.push("Nenhuma linha para essa pergunta.");
  else {
    lines.push("", answer.colunas.map(clean).join("\t"), ...answer.linhas.slice(0, COPY_ROWS).map((row) => answer.colunas.map((column) => clean(formatCell(row[column]))).join("\t")));
    if (answer.linhas.length > COPY_ROWS) lines.push(`… e mais ${answer.linhas.length - COPY_ROWS} linha(s); baixe o CSV para ver tudo.`);
  }
  return lines.join("\n");
}
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* sem permissao ou pagina sem foco: tenta o jeito antigo */ }
  const previous = document.activeElement as HTMLElement | null;
  try {
    const area = document.createElement("textarea");
    area.value = text; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.top = "0"; area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch { return false; } finally { previous?.focus(); }
}

// A conversa sobrevive ao F5 (sessionStorage, so nesta aba e para a mesma pessoa). Respostas que estavam
// carregando viram aviso de interrompida. Guarda as ultimas 40 mensagens.
const STORE_KEY = "jota-h:conversa";
const STORE_MAX = 40;
const INTERRUPTED = "A resposta foi interrompida ao recarregar a página.";
// Valida o formato de cada mensagem salva: uma mensagem antiga ou adulterada nao pode derrubar o widget ao renderizar.
function isStoredMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (typeof message.id !== "number") return false;
  if (message.from === "user") return typeof message.text === "string";
  if (message.from !== "bot") return false;
  switch (message.kind) {
    case "loading": return true;
    case "error": return typeof message.text === "string";
    case "topic": return typeof message.title === "string" && Array.isArray(message.questions) && message.questions.every((q) => typeof q === "string");
    case "answer": {
      const answer = message.answer as Record<string, unknown> | null;
      if (typeof message.question !== "string" || !answer || typeof answer !== "object" || typeof answer.kind !== "string") return false;
      if (answer.kind === "query") return Array.isArray(answer.colunas) && Array.isArray(answer.linhas);
      return true;
    }
    default: return false;
  }
}
function restoreMessages(user: string): Message[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null") as { user?: unknown; messages?: unknown } | null;
    if (!saved || saved.user !== user || !Array.isArray(saved.messages)) return [];
    return (saved.messages as unknown[])
      .filter(isStoredMessage)
      .slice(-STORE_MAX)
      .map((message): Message => (message.from === "bot" && message.kind === "loading" ? { id: message.id, from: "bot", kind: "error", text: INTERRUPTED } : message));
  } catch { return []; }
}
function saveMessages(user: string, messages: Message[]) {
  try {
    if (messages.length) sessionStorage.setItem(STORE_KEY, JSON.stringify({ user, messages: messages.slice(-STORE_MAX) }));
    else sessionStorage.removeItem(STORE_KEY);
  } catch {
    // armazenamento cheio ou bloqueado: apaga a copia antiga para o F5 nao trazer uma conversa desatualizada
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* bloqueado */ }
  }
}

// Data usada para as fantasias. Para QA, force um dia no console:
//   localStorage['jota-h:data-teste'] = '2026-12-25'   (YYYY-MM-DD; lido uma vez ao montar; invalido = ignorado)
// e recarregue a pagina. Para voltar ao normal: localStorage.removeItem('jota-h:data-teste').
const TEST_DATE_KEY = "jota-h:data-teste";
const HELLO_KEY = "jota-h:ola-dia";
function jotaNow(): Date {
  try { return parseJotaTestDate(localStorage.getItem(TEST_DATE_KEY)) ?? new Date(); } catch { return new Date(); }
}
const prefersReducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CLOSE_MS = 180;
const HAPPY_MS = 900;

// Robo do Jota H. As cores ficam no CSS (jota-h.css), para acompanhar o tema escolhido; as animacoes (balancar,
// piscar, antena acesa, sorriso, "pensando", pulinho) tambem. `animated` liga o movimento (balao e cabecalho).
// Os acessorios de data (jota-accessories.ts) sao fantasia: cores fixas como atributos do SVG, de proposito fora do
// CSS, para o gerador de temas (escuro e paletas) nao trocar o vermelho/branco do gorro. Ficam dentro de
// .jw-bot-body, entao balancam junto com a cabeca. Com chapeu, a antena sai (ficaria dentro do chapeu).
const OUTLINE = "#9aa6b8";
function SantaHat() {
  return (
    <g className="jw-acc jw-acc-santa">
      <path d="M6.6 7.6 C7.6 2.6 12.4 -0.4 17.8 0 C22.2 0.4 25.8 2.4 27.4 5.4 L25.2 7.6 Z" fill="#d7263d" stroke="#8f1426" strokeWidth="0.6" strokeLinejoin="round" />
      <path d="M17.4 1.6 C21 1.8 24 3.4 25.8 5.6" fill="none" stroke="#a81b30" strokeWidth="0.7" strokeLinecap="round" />
      <rect x="4.4" y="6.4" width="23.2" height="3.8" rx="1.9" fill="#ffffff" stroke={OUTLINE} strokeWidth="0.6" />
      <circle cx="27.6" cy="5.6" r="2.2" fill="#ffffff" stroke={OUTLINE} strokeWidth="0.6" />
    </g>
  );
}
function PartyHat() {
  // cone com ponta em (16,-2.4) e base de 10.4 a 21.6 em y=8.6; listras acompanham a largura do cone
  const half = (y: number) => (5.6 * (y + 2.4)) / 11;
  const band = (top: number, bottom: number) => `M${16 - half(top)} ${top} L${16 + half(top)} ${top} L${16 + half(bottom)} ${bottom} L${16 - half(bottom)} ${bottom} Z`;
  return (
    <g className="jw-acc jw-acc-party">
      <path d="M16 -2.4 L21.6 8.6 L10.4 8.6 Z" fill="#7c3aed" stroke="#4c1d95" strokeWidth="0.6" strokeLinejoin="round" />
      <path d={band(1.4, 2.9)} fill="#facc15" />
      <path d={band(5, 6.5)} fill="#facc15" />
      <circle cx="13.9" cy="4.2" r="0.55" fill="#f472b6" />
      <circle cx="17.6" cy="3.8" r="0.55" fill="#22d3ee" />
      <circle cx="16" cy="-2.6" r="1.9" fill="#f472b6" stroke="#9d174d" strokeWidth="0.5" />
    </g>
  );
}
function Sunglasses() {
  // lentes maiores que o visor (passam um pouco para a cabeca) com aro dourado: aparecem sobre o visor escuro e
  // cobrem os olhos (a piscada e o "olhar de lado" ficam por baixo, sem aparecer pela metade)
  return (
    <g className="jw-acc jw-acc-glasses">
      <path d="M7.8 15.2 L5.4 14.4 M24.2 15.2 L26.6 14.4" stroke="#1f2937" strokeWidth="0.9" strokeLinecap="round" />
      <rect x="7.6" y="13.6" width="7.6" height="5.2" rx="2.2" fill="#111827" stroke="#ffc83d" strokeWidth="0.8" />
      <rect x="16.8" y="13.6" width="7.6" height="5.2" rx="2.2" fill="#111827" stroke="#ffc83d" strokeWidth="0.8" />
      <path d="M15.2 15.4 Q16 14.6 16.8 15.4" fill="none" stroke="#ffc83d" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M9.2 17.2 L11.6 14.8 M18.4 17.2 L20.8 14.8" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="0.7" strokeLinecap="round" />
    </g>
  );
}
type BotFaceProps = { size?: number; animated?: boolean; accessories?: readonly JotaAccessory[]; thinking?: boolean; happy?: boolean };
function BotFace({ size = 20, animated = false, accessories = [], thinking = false, happy = false }: BotFaceProps) {
  const hat = accessories.includes("chapeu-festa") ? "party" : accessories.includes("gorro-natal") ? "santa" : null;
  const classes = ["jw-bot", animated && "is-animated", thinking && "is-thinking", happy && "is-happy"].filter(Boolean).join(" ");
  return (
    <svg className={classes} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g className="jw-bot-hop">
        <g className="jw-bot-body">
          {!hat && <rect className="jw-bot-stem" x="15.2" y="3.5" width="1.6" height="5" rx="0.8" />}
          {!hat && <circle className="jw-bot-ball" cx="16" cy="3.4" r="2.3" />}
          <rect className="jw-bot-ear" x="2.6" y="13.5" width="3.2" height="7" rx="1.6" />
          <rect className="jw-bot-ear" x="26.2" y="13.5" width="3.2" height="7" rx="1.6" />
          <rect className="jw-bot-head" x="5" y="8" width="22" height="19" rx="7.5" />
          <rect className="jw-bot-visor" x="8.5" y="12.2" width="15" height="10" rx="5" />
          <g className="jw-bot-look">
            <g className="jw-bot-eyes">
              <circle className="jw-bot-eye" cx="12.8" cy="16.6" r="1.9" />
              <circle className="jw-bot-eye" cx="19.2" cy="16.6" r="1.9" />
            </g>
          </g>
          <path className="jw-bot-mouth" d="M13.6 19.5 Q16 21.6 18.4 19.5" />
          {accessories.includes("oculos") && <Sunglasses />}
          {hat === "santa" && <SantaHat />}
          {hat === "party" && <PartyHat />}
        </g>
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
  // closed -> open -> closing (animacao de saida, ainda montado) -> closed
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const open = phase === "open";
  const [expanded, setExpanded] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => restoreMessages(userName));
  const [text, setText] = useState("");
  const [showSql, setShowSql] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<{ id: number; ok: boolean } | null>(null);
  const [happy, setHappy] = useState(0);
  const [now] = useState(jotaNow);
  const look = useMemo(() => jotaLook(now), [now]);
  const today = useMemo(() => spDateKey(now), [now]);
  const [greetToday] = useState(() => { try { return localStorage.getItem(HELLO_KEY) !== today; } catch { return false; } });
  const [greeting, setGreeting] = useState(false);
  const nextId = useRef(messages.reduce((max, message) => Math.max(max, message.id), 0) + 1);
  const closeTimer = useRef<number | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const launcherWrapRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const busy = messages.some((message) => message.from === "bot" && message.kind === "loading");
  const firstName = userName.trim().split(/\s+/)[0] || "";
  const hello = jotaGreetingText(look.greeting, firstName);
  const lastAnswer = [...messages].reverse().find((message): message is Extract<Message, { kind: "answer" }> => message.from === "bot" && message.kind === "answer");
  const suggestions = lastAnswer && (lastAnswer.answer.kind === "query" || lastAnswer.answer.kind === "error") && lastAnswer.answer.sugestoes?.length ? lastAnswer.answer.sugestoes : DEFAULT_SUGGESTIONS;

  const openPanel = () => { window.clearTimeout(closeTimer.current); setGreeting(false); setPhase("open"); };
  const closePanel = (returnFocus: boolean) => {
    if (phase !== "open") return;
    window.clearTimeout(closeTimer.current);
    if (prefersReducedMotion()) setPhase("closed");
    else { setPhase("closing"); closeTimer.current = window.setTimeout(() => setPhase("closed"), CLOSE_MS); }
    if (returnFocus) launcherRef.current?.focus();
  };
  const togglePanel = () => (open ? closePanel(true) : openPanel());

  useEffect(() => { document.body.classList.add("has-jota-h"); return () => document.body.classList.remove("has-jota-h"); }, []);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useEffect(() => { saveMessages(userName, messages); }, [messages, userName]);
  useEffect(() => { if (open && !showUsage) bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" }); }, [messages, open, showUsage]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  // Esc fecha; clique (pointerdown) fora do painel e do balao fecha sem perder a conversa. Selecionar texto que
  // comecou dentro do painel nao fecha (o pointerdown foi dentro).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); closePanel(true); } };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || panelRef.current?.contains(target) || launcherWrapRef.current?.contains(target)) return;
      closePanel(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointer, true); };
  });
  // Ctrl+J (Cmd+J no Mac) abre/fecha de qualquer lugar, inclusive com o foco na caixa do Jota H.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "j") return;
      event.preventDefault();
      if (event.repeat) return;
      togglePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // "Oi!" aparece sozinho por ~5 s na primeira vez do dia (data de Sao Paulo); depois so ao passar o mouse.
  useEffect(() => {
    if (!greetToday) return;
    try { localStorage.setItem(HELLO_KEY, today); } catch { /* sem armazenamento: so nao lembra */ }
    setGreeting(true);
    const timer = window.setTimeout(() => setGreeting(false), 5000);
    return () => { window.clearTimeout(timer); setGreeting(false); };
  }, [greetToday, today]);
  // pulinho do robo do cabecalho quando chega resposta (uma vez)
  useEffect(() => {
    if (!happy) return;
    const timer = window.setTimeout(() => setHappy(0), HAPPY_MS);
    return () => window.clearTimeout(timer);
  }, [happy]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

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
      setHappy((count) => count + 1);
    } catch (err) {
      setMessages((current) => current.map((message) => (message.id === loadingId ? { id: loadingId, from: "bot", kind: "error", text: err instanceof Error ? err.message : "Não deu para responder agora." } : message)));
    }
  }
  async function rate(id: number, logId: string, util: boolean) {
    setMessages((current) => current.map((message) => (message.id === id && message.from === "bot" && message.kind === "answer" ? { ...message, feedback: util ? 1 : -1 } : message)));
    try { await api.jotaFeedback(logId, util); } catch { /* avaliacao e opcional */ }
  }
  async function copy(id: number, answer: JotaAnswer) {
    setCopied({ id, ok: await copyText(answerText(answer)) });
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void ask(text); };
  const reset = () => { setMessages([]); setShowSql({}); setShowUsage(false); inputRef.current?.focus(); };

  return (
    <>
      {phase !== "closed" && (
        <div ref={panelRef} className={`jw-panel${expanded ? " is-expanded" : ""}${phase === "closing" ? " is-closing" : ""}`} role="dialog" aria-modal="false" aria-labelledby="jw-title">
          <header className="jw-head">
            <span className="jw-head-avatar"><BotFace size={26} animated accessories={look.accessories} thinking={busy} happy={happy > 0} /></span>
            <div className="jw-head-text">
              <strong id="jw-title">Jota H</strong>
              <small><i aria-hidden="true" /> assistente da operação · IA</small>
            </div>
            <div className="jw-head-actions">
              <button type="button" className="jw-head-button" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Diminuir" : "Ampliar"} title={expanded ? "Diminuir" : "Ampliar"}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
              {canSeeUsage && <button type="button" className="jw-head-button" onClick={() => setShowUsage(!showUsage)} aria-pressed={showUsage} aria-label="Uso do Jota H" title="Uso do Jota H"><ChartColumn size={15} /></button>}
              <button type="button" className="jw-head-button" onClick={reset} aria-label="Nova conversa" title="Nova conversa"><RotateCcw size={15} /></button>
              <button type="button" className="jw-head-button" onClick={() => closePanel(true)} aria-label="Fechar o Jota H" title="Fechar (Esc)"><X size={16} /></button>
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
                      {message.kind === "loading" ? <div key="loading" className="jw-bubble jw-typing" aria-label="Jota H está pensando"><i /><i /><i /></div>
                        : message.kind === "error" ? <div key="error" className="jw-bubble"><p className="jw-error">{message.text}</p></div>
                        : message.kind === "topic" ? (
                          <div className="jw-bubble">
                            <p><b>{message.title}</b>: escolha uma pergunta ou escreva a sua.</p>
                            <div className="jw-chips">{message.questions.map((question) => <button key={question} type="button" disabled={busy} onClick={() => void ask(question)}>{question}</button>)}</div>
                          </div>
                        ) : (() => {
                          const answer = message.answer;
                          const logId = "logId" in answer ? answer.logId : undefined;
                          return (
                            <div key="answer" className="jw-bubble jw-answer">
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
                              <div className="jw-answer-foot">
                                <button type="button" className="jw-copy" onClick={() => void copy(message.id, answer)} aria-label={copied?.id === message.id ? (copied.ok ? "Resposta copiada" : "Não deu para copiar") : "Copiar a resposta"} title="Copiar a resposta como texto">
                                  {copied?.id === message.id && copied.ok ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                                  <span>{copied?.id === message.id ? (copied.ok ? "Copiado" : "Não deu para copiar") : "Copiar"}</span>
                                </button>
                                {logId && answer.kind !== "question" && (
                                  <div className="jw-rate">
                                    <span>Ajudou?</span>
                                    <button type="button" className="jw-icon" aria-label="Ajudou" aria-pressed={message.feedback === 1} onClick={() => void rate(message.id, logId, true)}><ThumbsUp size={14} /></button>
                                    <button type="button" className="jw-icon" aria-label="Não ajudou" aria-pressed={message.feedback === -1} onClick={() => void rate(message.id, logId, false)}><ThumbsDown size={14} /></button>
                                  </div>
                                )}
                              </div>
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
      <div ref={launcherWrapRef} className={`jw-launcher-wrap${open ? " is-open" : ""}${greeting && phase === "closed" ? " is-greeting" : ""}`}>
        {phase === "closed" && <span className="jw-hello" aria-hidden="true">{hello.text} <span className="jw-wave">{hello.emoji}</span></span>}
        <button ref={launcherRef} type="button" className={`jw-launcher${open ? " is-open" : ""}`} onClick={togglePanel} aria-expanded={open} aria-keyshortcuts="Control+J Meta+J" aria-label={open ? "Fechar o Jota H" : "Abrir o Jota H, assistente da operação"}>
          <BotFace size={40} animated accessories={look.accessories} thinking={busy} />
        </button>
      </div>
    </>
  );
}
