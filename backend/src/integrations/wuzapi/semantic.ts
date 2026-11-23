import { extractOperationalData, type WuzApiMessage } from './client.js';
import type { ActivationAnalysis } from '../../types.js';
import { consolidateNocAddresses } from './noc-consolidation.js';
import { askLlmJson, llmConfigured } from '../../llm.js';
import { normalizeCardText, splitTicket } from './card-normalizer.js';

const nullValue = (value: string | undefined) => {
  const normalized = value?.replace(/[ *_-]/g, '').trim();
  return !normalized || ['N/A', 'NA', 'NENHUM', 'NENHUMA', 'NÃO INFORMADO', 'NAO INFORMADO', 'NULL'].includes(normalized.toUpperCase()) ? null : value?.trim() || null;
};

function clean(value: string) {
  return value.replace(/^\s*[-*]\s*/, '').replace(/\s*[*]\s*$/, '').trim();
}

// Primeiro valor nao vazio do rotulo. O separador so aceita espacos da mesma linha: "Contratos Exemplos:" vazio
// nao pode "pegar" a linha seguinte como valor.
function labelValue(text: string, labels: string[]) {
  const pattern = new RegExp(`^[ \\t]*[-*]?[ \\t]*(?:${labels.join('|')})[ \\t]*[:=-][ \\t]*(.*)$`, 'gim');
  for (const match of text.matchAll(pattern)) {
    const value = match[1] ? nullValue(clean(match[1])) : null;
    if (value) return value;
  }
  return null;
}

function sectionValue(text: string, heading: RegExp, until: RegExp) {
  const match = text.match(new RegExp(`${heading.source}([\\s\\S]*?)(?=${until.source}|$)`, heading.flags.includes('i') ? 'i' : ''));
  return match?.[1]?.trim() || null;
}

function parseAddresses(text: string) {
  const section = sectionValue(text, /(?:^|\n)\s*-?\s*endere[cç]os?\s*:\s*/i, /\n\s*-?\s*(?:cope\s+rede|t[eé]cnico\s+rede|observa[cç][oõ]es?)\s*:/i);
  if (!section) return null;
  // Formato em uma linha por cliente (18/11/2026): "Serial: X || Contrato: N || Endereço: RUA, Nº, BAIRRO, CIDADE - UF,
  // CEP, complemento" (o normalizador troca "Serial" por "S/N"). Cabecalhos "SLOT/PON: 06/12" no meio sao ignorados
  // e um endereco quebrado em duas linhas volta a ser uma linha so.
  if (/\|\|\s*Endere[cç]o\s*:/i.test(section)) {
    const records = section.split(/(?=^\s*(?:S\/N|SERIAL)\s*:)/im).map((item) => item.replace(/\n\s*SLOT\s*\/\s*PON\s*:[^\n]*/gi, '').replace(/\s*\n\s*/g, ' ').trim()).filter((item) => /\|\|\s*Endere[cç]o\s*:/i.test(item));
    if (records.length) return records;
  }
  const customerRecords = section.split(/(?=^\s*(?:\d{4,}\s+\S|NOME\s*:))/gim).map((item) => item.trim()).filter(Boolean);
  const recordsWithCep = customerRecords.filter((item) => /\bCEP\s*:\s*(?:[0-9]{2}\.[0-9]{3}|[0-9]{5})[-.]?[0-9]{3}/i.test(item));
  if (recordsWithCep.length > 1) return recordsWithCep;
  // Card sem CEP (endereco em linhas: "RUA / UM / Numero / 130 / Bairro / ..."): um registro por "NOME:".
  if (!/\bCEP\s*:/i.test(section) && customerRecords.filter((item) => /^\s*NOME\s*:/i.test(item)).length > 1) return customerRecords;
  return section.split(/(?=\bCEP\s*:\s*)/i).map((item) => item.trim()).filter(Boolean);
}

function firstNumber(value: string | null) {
  if (!value) return null;
  const match = value.match(/\d[\d.,]*/);
  return match ? Number(match[0].replace(/\./g, '').replace(',', '.')) : null;
}

function splitSlots(value: string | null) {
  if (!value) return null;
  const slots = value.split(/[,;]+/).map((item) => item.replace(/[ *_]/g, '').trim()).filter(Boolean);
  return slots.length ? slots : null;
}

function classify(text: string, legacy: Record<string, string>) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const type = normalized.includes('FIELD') ? 'ACIONAMENTO FIELD' : normalized.includes('BACKBONE') || normalized.includes('NOC TX') ? 'NOC TX' : normalized.includes('NOC ACESSO') || normalized.includes('VALIDAR COM NOC') ? 'NOC ACESSO' : null;
  const card = type?.includes('FIELD') ? 'FIELD' : type?.includes('TX') ? 'TX' : type?.includes('ACESSO') ? 'ACESSO' : null;
  return { type, card };
}

// Tecnico informado como "0", "-" ou "**" significa "sem tecnico".
const technicianValue = (value: string | null) => (value && !/^[0\-–—.]+$/.test(value.trim()) ? value : null);

export function analyzeOperationalMessage(message: WuzApiMessage | string): ActivationAnalysis {
  const rawText = typeof message === 'string' ? message : message.message || '';
  // Cards fora do padrao (negrito, bullets, rotulos com outro nome) viram o formato padrao antes da leitura.
  const text = normalizeCardText(rawText);
  const legacy = extractOperationalData(text);
  const classification = classify(text, legacy);
  const markerCount = [
    classification.type,
    /\b(?:ORDEM|OS|ACIONAMENTO)\b/i.test(text) ? 'operational-marker' : null,
    labelValue(text, ['BDESK', 'TICKET']),
    labelValue(text, ['TAREFA OFFICE TRACK', 'OFFICE TRACK', 'OFFICETRACK', 'OS OT', 'OS']),
    labelValue(text, ['OLT']),
    labelValue(text, ['SLOT\\s*/\\s*PON', 'PLACA\\s*/\\s*PON']),
    labelValue(text, ['MOTIVO', 'TIPO DE FALHA', 'TIPO']),
    labelValue(text, ['AFETADOS', 'AFETAÇÃO', 'AFETACAO']),
  ].filter(Boolean).length;
  const isActivation = Boolean(classification.type) || markerCount >= 2;
  const slotValue = labelValue(text, ['SLOT\\s*/\\s*PON', 'PLACA\\s*/\\s*PON']) || legacy.slotPon || null;
  const dataHora = labelValue(text, ['DATA\\s*/\\s*HORA DO EVENTO', 'DATA HORA DO EVENTO', 'DATA\\s*HORA'])
    // Cards de backbone (NOC TX) nao trazem "Data/Hora do Evento": a abertura do ticket ("ABERTO EM") e o evento.
    || labelValue(text, ['ABERTO EM']);
  const officeTrack = labelValue(text, ['TAREFA OFFICE TRACK', 'OFFICE TRACK', 'OFFICETRACK', 'OS OT']) || nullValue(legacy.officeTrack);
  const contract = labelValue(text, ['CONTRATO(?:S)?(?: EXEMPLO(?:S)?)?']) || nullValue(legacy.contract);
  const technician = technicianValue(labelValue(text, ['TÉCNICO REDE', 'TECNICO REDE']) || labelValue(text, ['TÉCNICO', 'TECNICO']) || nullValue(legacy.technician));
  const addresses = parseAddresses(text) || (legacy.addresses ? [legacy.addresses] : null);
  const consolidated = consolidateNocAddresses(addresses);
  const isNoBairroApplicable = classification.card === 'TX';
  // TICKET do backbone vem com o trecho junto: "658278 » SP::ATN::MAUA_TUR<>SAO_PAULO_MTX::DWDM::VIP"
  const ticket = splitTicket(labelValue(text, ['TICKET']) || nullValue(legacy.ticket));
  const bdesk = splitTicket(labelValue(text, ['BDESK']));
  const analysis: ActivationAnalysis = {
    eh_acionamento: isActivation,
    tipo_registro: classification.type,
    tipo_card: classification.card,
    categoria: classification.card,
    origem: 'WUZAPI',
    prioridade: null,
    tecnico: technicianValue(labelValue(text, ['TÉCNICO', 'TECNICO'])),
    auxiliar: technicianValue(labelValue(text, ['AUXILIAR'])),
    telefone: labelValue(text, ['TELEFONE', 'CELULAR']),
    bdesk: bdesk.numero || ticket.numero || splitTicket(nullValue(legacy.bdesk)).numero,
    ticket: ticket.numero,
    trecho: labelValue(text, ['TRECHO']) || ticket.trecho || bdesk.trecho,
    office_track: officeTrack,
    os_ot: officeTrack,
    os_casa_cliente: labelValue(text, ['O\\.S\\. CASA CLIENTE', 'OS CASA CLIENTE']),
    contrato: contract,
    sn: labelValue(text, ['S/N', 'SN']),
    olt: (labelValue(text, ['OLT']) || nullValue(legacy.olt))?.replace(/^OLT\s*:\s*|^OLT\s+/i, '') || null,
    slot_pon: splitSlots(slotValue),
    placa_pon: labelValue(text, ['PLACA']),
    tipo_falha: labelValue(text, ['TIPO DE FALHA', 'TIPO']),
    motivo: labelValue(text, ['MOTIVO']) || nullValue(legacy.reason),
    afetados: firstNumber(labelValue(text, ['AFETADOS', 'AFETAÇÃO', 'AFETACAO']) || nullValue(legacy.affectedCount)),
    data_hora_evento: dataHora || nullValue(legacy.eventAt),
    tratativa_realizada: labelValue(text, ['TRATATIVA REALIZADA', 'TRATATIVA']),
    localizacao: addresses,
    id_cto: labelValue(text, ['ID\\s*/\\s*CTO', 'ID CTO']),
    loc_cto: labelValue(text, ['LOC CTO']),
    materiais_utilizados: labelValue(text, ['MATERIAIS UTILIZADOS', 'MATERIAIS']),
    tecnico_rede: technician,
    cope_rede: labelValue(text, ['COPE REDE']) || nullValue(legacy.cope),
    observacoes: labelValue(text, ['OBSERVAÇÕES', 'OBSERVACOES']) || nullValue(legacy.observations),
    raw_text: rawText,
    clientes_afetados: isNoBairroApplicable ? [] : consolidated.clientes,
    endereco_principal: isNoBairroApplicable ? null : consolidated.enderecoPrincipal,
    bairro_principal: isNoBairroApplicable ? null : consolidated.bairroPrincipal,
    cep_principal: isNoBairroApplicable ? null : consolidated.cepPrincipal,
  };
  return analysis;
}

function parseJsonObject(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || value;
  try {
    const parsed = JSON.parse(fenced);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

// A resposta da IA vem no formato que ela quiser: o Groq (19/11/2026) devolvia contrato/OS como numero e isso
// quebrava o registro do acionamento ("normalize is not a function"). Aqui so passam os campos conhecidos, cada um
// convertido para o tipo da analise por regras; o que nao der para converter fica com o valor das regras.
const AI_LIST_FIELDS = new Set(['slot_pon', 'localizacao']);
const AI_SKIPPED_FIELDS = new Set(['raw_text', 'clientes_afetados', 'regiao_ia', 'atreladas', 'atrelada', 'endereco_principal', 'bairro_principal', 'cep_principal']);
export function sanitizeAiAnalysis(parsed: Record<string, unknown>, fallback: ActivationAnalysis): Partial<ActivationAnalysis> {
  const text = (value: unknown) => (typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (AI_SKIPPED_FIELDS.has(key) || !(key in fallback)) continue;
    if (value === null || value === undefined) { out[key] = null; continue; }
    if (key === 'eh_acionamento') { if (typeof value === 'boolean') out[key] = value; continue; }
    if (key === 'afetados') { const number = typeof value === 'number' ? value : Number(text(value)); if (Number.isFinite(number)) out[key] = number; continue; }
    if (AI_LIST_FIELDS.has(key)) {
      const list = (Array.isArray(value) ? value : [value]).map(text).filter((item): item is string => Boolean(item && item.trim()));
      out[key] = list.length ? list : null;
      continue;
    }
    const converted = text(value);
    if (converted !== undefined) out[key] = converted.trim() || null;
  }
  return out as Partial<ActivationAnalysis>;
}

export async function interpretWithGemini(message: WuzApiMessage, fallback: ActivationAnalysis): Promise<ActivationAnalysis> {
  if (!llmConfigured()) return fallback;
  const prompt = `Você é um parser de mensagens operacionais de telecom. Retorne SOMENTE JSON válido, sem markdown. Leia a mensagem inteira, não invente dados e use null quando um campo não existir. Preserve todos os endereços como uma lista. Não confunda data/hora com slot/PON, CEP com Office Track, contrato ou OS. Campos: eh_acionamento, tipo_registro, tipo_card, categoria, origem, prioridade, tecnico, auxiliar, telefone, bdesk, ticket, office_track, os_ot, os_casa_cliente, contrato, sn, olt, slot_pon (lista), placa_pon, tipo_falha, motivo, afetados (número), data_hora_evento, tratativa_realizada, localizacao (lista), id_cto, loc_cto, materiais_utilizados, tecnico_rede, cope_rede, observacoes. Mensagem:\n${message.message || ''}`;
  try {
    // llm.ts: Groq primeiro, Gemini de reserva (18/11/2026: o Gemini dava muito erro de cota).
    const answer = await askLlmJson(prompt, { timeoutMs: 10_000, label: 'card' });
    const parsed = parseJsonObject(answer.text);
    if (!parsed || typeof parsed.eh_acionamento !== 'boolean') return fallback;
    // Endereco, bairro e clientes: valem os das regras quando elas leram (a IA geral as vezes devolvia pedaco do CEP
    // como bairro); a analise de endereco propria (address-ai.ts) cobre os casos em que as regras nao leram.
    const merged = { ...fallback, ...sanitizeAiAnalysis(parsed, fallback), raw_text: fallback.raw_text } as ActivationAnalysis;
    if (fallback.endereco_principal) merged.endereco_principal = fallback.endereco_principal;
    if (fallback.bairro_principal) merged.bairro_principal = fallback.bairro_principal;
    if (fallback.clientes_afetados?.length) merged.clientes_afetados = fallback.clientes_afetados;
    return merged;
  } catch {
    return fallback;
  }
}
