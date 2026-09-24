import { extractOperationalData, type WuzApiMessage } from './client.js';
import type { ActivationAnalysis } from '../../types.js';
import { consolidateNocAddresses } from './noc-consolidation.js';

const nullValue = (value: string | undefined) => {
  const normalized = value?.replace(/[ *_-]/g, '').trim();
  return !normalized || ['N/A', 'NA', 'NENHUM', 'NENHUMA', 'NÃO INFORMADO', 'NAO INFORMADO', 'NULL'].includes(normalized.toUpperCase()) ? null : value?.trim() || null;
};

function clean(value: string) {
  return value.replace(/^\s*[-*]\s*/, '').replace(/\s*[*]\s*$/, '').trim();
}

function labelValue(text: string, labels: string[]) {
  const pattern = new RegExp(`^\\s*[-*]?\\s*(?:${labels.join('|')})\\s*[:=-]\\s*(.*)$`, 'im');
  const match = text.match(pattern);
  return match?.[1] ? nullValue(clean(match[1])) : null;
}

function sectionValue(text: string, heading: RegExp, until: RegExp) {
  const match = text.match(new RegExp(`${heading.source}([\\s\\S]*?)(?=${until.source}|$)`, heading.flags.includes('i') ? 'i' : ''));
  return match?.[1]?.trim() || null;
}

function parseAddresses(text: string) {
  const section = sectionValue(text, /(?:^|\n)\s*-?\s*endere[cç]os?\s*:\s*/i, /\n\s*-?\s*(?:cope\s+rede|t[eé]cnico\s+rede|observa[cç][oõ]es?)\s*:/i);
  if (!section) return null;
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

export function analyzeOperationalMessage(message: WuzApiMessage | string): ActivationAnalysis {
  const text = typeof message === 'string' ? message : message.message || '';
  const legacy = extractOperationalData(text);
  const classification = classify(text, legacy);
  const markerCount = [
    classification.type,
    /\b(?:ORDEM|OS|ACIONAMENTO)\b/i.test(text) ? 'operational-marker' : null,
    labelValue(text, ['BDESK', 'TICKET']),
    labelValue(text, ['TAREFA OFFICE TRACK', 'OFFICE TRACK', 'OFFICETRACK', 'OS OT']),
    labelValue(text, ['OLT']),
    labelValue(text, ['SLOT\\s*/\\s*PON', 'PLACA\\s*/\\s*PON']),
    labelValue(text, ['MOTIVO', 'TIPO DE FALHA', 'TIPO']),
    labelValue(text, ['AFETADOS', 'AFETAÇÃO', 'AFETACAO']),
  ].filter(Boolean).length;
  const isActivation = Boolean(classification.type) || markerCount >= 2;
  const slotValue = labelValue(text, ['SLOT\\s*/\\s*PON', 'PLACA\\s*/\\s*PON']) || legacy.slotPon || null;
  const dataHora = labelValue(text, ['DATA\\s*/\\s*HORA DO EVENTO', 'DATA HORA DO EVENTO', 'DATA\\s*HORA']);
  const officeTrack = labelValue(text, ['TAREFA OFFICE TRACK', 'OFFICE TRACK', 'OFFICETRACK', 'OS OT']) || nullValue(legacy.officeTrack);
  const contract = labelValue(text, ['CONTRATO(?:S)?(?: EXEMPLO(?:S)?)?']) || nullValue(legacy.contract);
  const technician = labelValue(text, ['TÉCNICO REDE', 'TECNICO REDE', 'TÉCNICO', 'TECNICO']) || nullValue(legacy.technician);
  const addresses = parseAddresses(text) || (legacy.addresses ? [legacy.addresses] : null);
  const consolidated = consolidateNocAddresses(addresses);
  const analysis: ActivationAnalysis = {
    eh_acionamento: isActivation,
    tipo_registro: classification.type,
    tipo_card: classification.card,
    categoria: classification.card,
    origem: 'WUZAPI',
    prioridade: null,
    tecnico: labelValue(text, ['TÉCNICO', 'TECNICO']),
    auxiliar: labelValue(text, ['AUXILIAR']),
    telefone: labelValue(text, ['TELEFONE', 'CELULAR']),
    bdesk: labelValue(text, ['BDESK']) || nullValue(legacy.bdesk),
    ticket: labelValue(text, ['TICKET']) || nullValue(legacy.ticket),
    office_track: officeTrack,
    os_ot: officeTrack,
    os_casa_cliente: labelValue(text, ['O\\.S\\. CASA CLIENTE', 'OS CASA CLIENTE']),
    contrato: contract,
    sn: labelValue(text, ['S/N', 'SN']),
    olt: labelValue(text, ['OLT']) || nullValue(legacy.olt),
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
    raw_text: text,
    clientes_afetados: consolidated.clientes,
    endereco_principal: consolidated.enderecoPrincipal,
    bairro_principal: consolidated.bairroPrincipal,
    cep_principal: consolidated.cepPrincipal,
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

export async function interpretWithGemini(message: WuzApiMessage, fallback: ActivationAnalysis): Promise<ActivationAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const prompt = `Você é um parser de mensagens operacionais de telecom. Retorne SOMENTE JSON válido, sem markdown. Leia a mensagem inteira, não invente dados e use null quando um campo não existir. Preserve todos os endereços como uma lista. Não confunda data/hora com slot/PON, CEP com Office Track, contrato ou OS. Campos: eh_acionamento, tipo_registro, tipo_card, categoria, origem, prioridade, tecnico, auxiliar, telefone, bdesk, ticket, office_track, os_ot, os_casa_cliente, contrato, sn, olt, slot_pon (lista), placa_pon, tipo_falha, motivo, afetados (número), data_hora_evento, tratativa_realizada, localizacao (lista), id_cto, loc_cto, materiais_utilizados, tecnico_rede, cope_rede, observacoes. Mensagem:\n${message.message || ''}`;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return fallback;
    const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const value = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = value ? parseJsonObject(value) : null;
    if (!parsed || typeof parsed.eh_acionamento !== 'boolean') return fallback;
    return { ...fallback, ...parsed, raw_text: fallback.raw_text } as ActivationAnalysis;
  } catch {
    return fallback;
  }
}
