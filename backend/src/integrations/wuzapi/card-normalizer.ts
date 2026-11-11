// Normaliza cards de acionamento escritos fora do padrao antes da leitura dos campos (semantic.ts e client.ts).
// As regras de leitura continuam as mesmas; aqui so se transforma cada variacao no formato padrao:
//   "*OLT*: x", "• OLT – x", "▶️ OLT: *x*"            -> "OLT: x"
//   "Técnico de rede: x", "B-DESK: x", "Clientes afetados" -> "TÉCNICO REDE", "BDESK", "AFETADOS"
//   "NOC-ACESSO", "Validar com o NOC", "Acionamento de campo" -> "NOC ACESSO", "VALIDAR COM NOC", "ACIONAMENTO FIELD"

const ZERO_WIDTH = /[​-‍⁠﻿]/g;
// Marcadores no inicio da linha: travessoes, bullets, setas, emojis e seletores de variacao.
const LINE_DECORATION = /^(?:[\s\-–—•●○◦▪▫■□‣⁃►▶▷➤➔→⇒>·|#=*~]|\p{Extended_Pictographic}|️|⃣)+/u;
const SEPARATOR_AFTER_LABEL = /^([\p{L}\p{N} ./()º°-]{2,60}?)\s*(?:[:：=]|\s[-–—]\s)\s*/u;

const strip = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// [rotulo escrito de outra forma (sem acento, maiusculo), rotulo padrao entendido pelas regras de leitura]
const LABEL_ALIASES: Array<[RegExp, string]> = [
  [/^TECNICO\s+(?:DE\s+|DA\s+)?REDE(?:\s+EXTERNA)?$/, 'TÉCNICO REDE'],
  [/^TECNICO\s+(?:DE\s+)?CAMPO$/, 'TÉCNICO'],
  [/^B\s*[-.]?\s*DESK$|^N[º°O]?\s*(?:DO\s+)?BDESK$|^BDESK\s*\/\s*TICKET$/, 'BDESK'],
  [/^(?:N[º°O]?\s*(?:DO\s+)?)?TICKET$|^CHAMADO\s+NOC$/, 'TICKET'],
  [/^(?:CLIENTES\s+AFETADOS|QTD\.?\s*(?:DE\s+)?AFETADOS|QUANTIDADE\s+(?:DE\s+)?AFETADOS|AFETACAO(?:\s+DIRETA)?|AFETADO)$/, 'AFETADOS'],
  [/^(?:DATA\s*(?:\/|E)\s*HORA\s*(?:DO\s+)?EVENTO|HORARIO\s+DO\s+EVENTO|DATA\s+DO\s+EVENTO)$/, 'Data/Hora do Evento'],
  [/^(?:SLOT\s*(?:\/|E|-)?\s*PON|SLOT\s*\/\s*PORTA|SLOT\s+E\s+PORTA)$/, 'SLOT/PON'],
  [/^PLACA\s*(?:\/|E|-)\s*PON$/, 'PLACA/PON'],
  [/^(?:TIPO\s+(?:DA\s+)?FALHA|FALHA)$/, 'Tipo de Falha'],
  [/^(?:MOTIVO\s+(?:DO\s+)?ACIONAMENTO|DEFEITO|PROBLEMA)$/, 'MOTIVO'],
  [/^(?:TAREFA\s+(?:DO\s+|DA\s+)?(?:OFFICE\s*TRACK|OT|OFS)|OFFICE\s*TRACK|N[º°O]?\s*OT|OT|OFS)$/, 'Tarefa Office Track'],
  // "OfficeTrack/OS", "OS/OfficeTrack", "Office Track / O.S." (cards de backbone)
  [/^(?:OFFICE\s*TRACK|OT|OFS)\s*\/\s*O\.?\s*S\.?$|^O\.?\s*S\.?\s*\/\s*(?:OFFICE\s*TRACK|OFS)$/, 'Tarefa Office Track'],
  [/^O\.?\s*S\.?\s*(?:DA\s+|DO\s+)?CASA\s+(?:DO\s+|DA\s+)?CLIENTE$/, 'O.S. CASA CLIENTE'],
  [/^(?:O\.?\s*S\.?\s*OT|OS\s*\/\s*OT)$/, 'OS OT'],
  [/^CONTRATOS?\s*(?:\(S\))?\s+(?:DE\s+)?EXEMPLOS?\s*(?:\(S\))?$|^CONTRATO\(S\)(?:\s+EXEMPLO\(S\))?$/, 'Contratos Exemplos'],
  [/^OBSERVACAO$|^OBS\.?$/, 'OBSERVAÇÕES'],
  [/^ENDERECO\(S\)$|^ENDERECOS?\s+(?:DOS\s+)?(?:CLIENTES|AFETADOS)$/, 'Endereços'],
  [/^ID\s*(?:DA\s+)?CTO$|^CTO$/, 'ID/CTO'],
  [/^(?:LOCALIZACAO|LOCAL)\s+(?:DA\s+)?CTO$/, 'LOC CTO'],
  [/^COPE(?:\s+DE)?\s+REDES?$/, 'COPE REDE'],
  [/^(?:SERIAL|N[º°O]?\s*SERIE|NUMERO\s+DE\s+SERIE|SN)$/, 'S/N'],
];

// Rotulos que ja estao no padrao: so precisam do separador trocado por ":" quando vierem com "-", "–" ou "=".
const KNOWN_LABELS = new Set(['OLT', 'OLT DE ATENDIMENTO', 'MOTIVO', 'TIPO', 'TIPO DE FALHA', 'TECNICO', 'TECNICO REDE', 'AUXILIAR', 'TELEFONE', 'CELULAR', 'CONTRATO', 'CONTRATOS', 'BDESK', 'TICKET', 'AFETADOS', 'S/N', 'PLACA', 'PON', 'SLOT/PON', 'PLACA/PON', 'OS OT', 'OFFICETRACK', 'ID/CTO', 'LOC CTO', 'PORTAS MEDIDAS', 'NOME DO OPERADOR', 'COPE REDE', 'ABERTO EM', 'TRECHO', 'ORDEM', 'ORDEM DE SERVICO', 'CLIENTE', 'CIDADE', 'REGIAO', 'TRATATIVA', 'TRATATIVA REALIZADA', 'MATERIAIS UTILIZADOS']);

function canonicalLabel(label: string) {
  const key = strip(label).replace(/\s+/g, ' ').trim();
  for (const [pattern, canonical] of LABEL_ALIASES) if (pattern.test(key)) return canonical;
  return KNOWN_LABELS.has(key) ? label.trim() : null;
}

function normalizeLine(rawLine: string) {
  let line = rawLine.replace(/[ \t]+/g, ' ');
  // Formatacao do WhatsApp: *negrito*, ~riscado~, ```mono```. Asterisco/til nao carregam dado nos cards.
  line = line.replace(/```/g, '').replace(/[*~]/g, '');
  // _italico_ somente quando envolve a palavra inteira (preserva NAO_INFORMADO, MAUA_TUR etc.)
  line = line.replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s).,:;])/g, '$1$2');
  line = line.replace(LINE_DECORATION, '').trim();
  // So reescreve rotulos reconhecidos; linhas de endereco ("SAO PAULO - SP") e trechos ("SP::RUP::...") ficam como estao.
  const labeled = line.match(SEPARATOR_AFTER_LABEL);
  const canonical = labeled ? canonicalLabel(labeled[1]) : null;
  if (labeled && canonical) line = `${canonical}: ${line.slice(labeled[0].length).trim()}`.trimEnd();
  return line;
}

export function normalizeCardText(text: string) {
  if (!text) return '';
  let normalized = text.normalize('NFC').replace(ZERO_WIDTH, '').replace(/ /g, ' ').replace(/\r\n?/g, '\n').replace(/：/g, ':');
  // Tipo do card escrito de outras formas
  normalized = normalized
    .replace(/\bNOC\s*[-_.\/]?\s*(ACESSO|TX)S?\b/gi, (_match, kind: string) => `NOC ${kind.toUpperCase()}`)
    .replace(/\bVALIDAR\s+(?:COM|C\/)\s+(?:O\s+)?NOC\b/gi, 'VALIDAR COM NOC')
    .replace(/\bACIONAMENTO\s+(?:DE\s+|DO\s+)?(?:CAMPO|FILD|FIELDS)\b/gi, 'ACIONAMENTO FIELD')
    .replace(/\bEVENTO\s+(?:DE\s+)?BACK\s*-?\s*BONE\b/gi, 'EVENTO BACKBONE');
  return normalized.split('\n').map(normalizeLine).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// "658278 » SP::RUP::MAUA_TUR<>SAO_PAULO_MTX::METRO::VIP" -> { numero: "658278", trecho: "SP::RUP::..." }
export function splitTicket(value: string | null | undefined) {
  if (!value) return { numero: null as string | null, trecho: null as string | null };
  const match = value.trim().match(/^#?\s*(\d{4,})\s*(?:[»>|\-–—:]+\s*(.+))?$/);
  if (!match) return { numero: value.trim() || null, trecho: null };
  return { numero: match[1], trecho: match[2]?.trim() || null };
}
