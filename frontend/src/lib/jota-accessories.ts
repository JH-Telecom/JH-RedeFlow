// Fantasias do Jota H por data (gorro de Natal, oculos de sexta, chapeu de Ano Novo). Funcao pura: recebe um instante
// e decide pela data de Sao Paulo (nao pelo fuso do computador). Para incluir outra data, acrescente uma regra em
// RULES (e, se quiser, uma saudacao em GREETINGS) e desenhe o acessorio no BotFace (JotaHWidget.tsx).
export type JotaAccessory = 'gorro-natal' | 'oculos' | 'chapeu-festa';
export type JotaGreeting = 'natal' | 'sexta' | 'natal-sexta' | 'ano-novo' | null;
export type JotaLook = { accessories: JotaAccessory[]; greeting: JotaGreeting };
export type SpDay = { year: number; month: number; day: number; weekday: number }; // weekday: 0 = domingo ... 6 = sabado

const TIME_ZONE = 'America/Sao_Paulo';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatter = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });

export function spDay(date: Date): SpDay {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday: WEEKDAYS.indexOf(parts.weekday) };
}

/** Data de Sao Paulo no formato YYYY-MM-DD. */
export function spDateKey(date: Date): string {
  const { year, month, day } = spDay(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Cada regra pode vestir um acessorio num "lugar" (cabeca ou rosto). Ordem = prioridade: no mesmo lugar vale a
// primeira regra que bater (Ano Novo antes do Natal). Lugares diferentes se somam (gorro + oculos).
type Rule = { id: string; slot: 'cabeca' | 'rosto'; accessory: JotaAccessory; when: (day: SpDay) => boolean };
const RULES: Rule[] = [
  { id: 'ano-novo', slot: 'cabeca', accessory: 'chapeu-festa', when: (d) => (d.month === 12 && d.day === 31) || (d.month === 1 && d.day === 1) },
  { id: 'natal', slot: 'cabeca', accessory: 'gorro-natal', when: (d) => d.month === 12 && d.day >= 1 && d.day <= 25 },
  { id: 'sexta', slot: 'rosto', accessory: 'oculos', when: (d) => d.weekday === 5 },
];
// Saudacao: a primeira cujas regras todas bateram.
const GREETINGS: { greeting: Exclude<JotaGreeting, null>; needs: string[] }[] = [
  { greeting: 'ano-novo', needs: ['ano-novo'] },
  { greeting: 'natal-sexta', needs: ['natal', 'sexta'] },
  { greeting: 'natal', needs: ['natal'] },
  { greeting: 'sexta', needs: ['sexta'] },
];

export function jotaLook(date: Date): JotaLook {
  const day = spDay(date);
  const used = new Set<string>();
  const matched: string[] = [];
  const accessories: JotaAccessory[] = [];
  for (const rule of RULES) {
    if (used.has(rule.slot) || !rule.when(day)) continue;
    used.add(rule.slot);
    matched.push(rule.id);
    accessories.push(rule.accessory);
  }
  const greeting = GREETINGS.find((item) => item.needs.every((id) => matched.includes(id)))?.greeting ?? null;
  return { accessories, greeting };
}

/** Le a data forcada para QA ('YYYY-MM-DD'); devolve meio-dia em Sao Paulo daquele dia, ou null se invalida. */
export function parseJotaTestDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00-03:00`);
  return Number.isFinite(date.getTime()) && spDateKey(date) === value ? date : null;
}

export function jotaGreetingText(greeting: JotaGreeting, firstName: string): { text: string; emoji: string } {
  const name = firstName ? `, ${firstName}` : '';
  switch (greeting) {
    case 'natal': return { text: `Feliz Natal${name}!`, emoji: '🎄' };
    case 'sexta': return { text: `Sextou${name}!`, emoji: '😎' };
    case 'natal-sexta': return { text: `Feliz Natal e sextou${name}!`, emoji: '🎄😎' };
    case 'ano-novo': return { text: `Feliz Ano Novo${name}!`, emoji: '🎉' };
    default: return { text: `Oi${name}! Posso ajudar?`, emoji: '👋' };
  }
}
