import jwt from 'jsonwebtoken';
import type { ActivationAnalysis } from './types.js';

// Informativo de acionamento para o setor Casa Cliente (porte do script da planilha). Quando chega um card de uma
// OLT desta lista, o sistema manda um resumo no grupo do Casa Cliente com um link so de leitura para acompanhar.
// Grupo do Casa Cliente (pedido do usuario em 09/11/2026). WUZAPI_INFORMATIVO_CHAT no Render, se existir, tem prioridade.
export const OLT_NOTICE_DEFAULT_CHAT = '120363216252480324@g.us';
// Grupo de TESTE: o botao "Enviar informativo de teste" (Integracao OFS) manda so aqui. WUZAPI_INFORMATIVO_TEST_CHAT tem prioridade.
export const OLT_NOTICE_TEST_CHAT = '120363422003961917@g.us';
export const OLT_NOTICE_OLTS = [
  'VIP-CT1-SPO-OHW-01', 'VIP-CT1-SPO-OHW-03', 'VIP-CT2-SPO-OHW-01', 'VIP-CT2-SPO-OHW-02', 'VIP-CT3-SPO-OHW-01',
  'VIP-GZ1-SPO-BNG-01', 'VIP-GZ1-SPO-OHW-01', 'VIP-GZ1-SPO-OHW-02', 'VIP-GZ1-SPO-OHW-03',
  'VIP-GZ2-SPO-OHW-01', 'VIP-GZ2-SPO-OHW-02', 'VIP-GZ2-SPO-OHW-03',
  'VIP-IGU-SPO-OHW', 'VIP-IGU-SPO-OHW-0', 'VIP-IGU-SPO-OHW-01', 'VIP-IGU-SPO-OHW-02',
  'VIP-ITA-SPO-OHW', 'VIP-ITA-SPO-OHW-01', 'VIP-ITA-SPO-OHW-02', 'VIP-ITA-SPO-OHW-03', 'VIP-ITA-SPO-OHW-04',
  'VIP-SMP-SPO-ONK-01', 'VIP-SMP-SPO-ONK-02', 'VIP-SPO-GZ2-OHW-01', 'VIP-CQT-SPO-OHW-01',
  'VIP-SRF-SPO-OHW-01', 'VIP-SRF-SPO-OHW-02', 'VIP-SMT-SPO-OHW-01', 'VIP-SMT-SPO-OHW-02',
  'VIP-ARI-SPO-ONK-01', 'VIP-ARI-SPO-ONK-02', 'VIP-CT1-SPO-OHW-0', 'VIP-PN1-SPO-ONK-01',
];
// Afetacao a partir deste numero vira "INFORMATIVO DE ACIONAMENTO CRITICO" (como na planilha: > 29).
export const OLT_NOTICE_CRITICAL_FROM = 30;

const normalizeOlt = (value: string | null | undefined) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, '').trim();
const noticeOlts = new Set(OLT_NOTICE_OLTS.map(normalizeOlt));

export function isNoticeOlt(olt: string | null | undefined) {
  const normalized = normalizeOlt(olt);
  return Boolean(normalized) && noticeOlts.has(normalized);
}

// Mensagem que o proprio sistema manda no grupo: nao pode voltar como card novo.
export function isOltNoticeMessage(text: string | null | undefined) {
  return /^[\s*_~]*(?:\p{Extended_Pictographic}|\uFE0F|\u2139)*[\s*_~]*INFORMATIVO DE ACIONAMENTO/iu.test(String(text || ''));
}

// Todas as combinacoes PLACA/PON da mensagem (ex.: 04/10, 09/11), preservando os zeros.
export function extractAllSlotPons(text: string) {
  const found: string[] = [];
  // Nao pega datas (07/11/2026) nem pedacos de numeros maiores.
  const regex = /(?<![\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(String(text || ''))) !== null) {
    const value = `${match[1]}/${match[2]}`;
    if (!found.includes(value)) found.push(value);
  }
  return found;
}

// Linhas de endereco do bloco "Enderecos:" (ate 15), com marcador.
export function extractNoticeAddresses(text: string) {
  const source = String(text || '').trim();
  if (!source) return '';
  const block = source.match(/Endereços?:([\s\S]*)/i)?.[1] ?? source;
  return block.split(/\r?\n/)
    .map((line) => line.trim().replace(/^Endere(ç|c)o:\s*/i, '').trim())
    .filter((line) => line && line.toUpperCase() !== 'N/A' && /\b(RUA|AVENIDA|AV\.|AV|ESTRADA|TRAVESSA|ALAMEDA|RODOVIA|PRAÇA|PRACA)\b/i.test(line))
    .slice(0, 15)
    .map((line) => `• ${line}`)
    .join('\n');
}

// link vazio = mensagem com botao (o link vai no botao "Acompanhar chamado", nao no texto).
export const OLT_NOTICE_BUTTON_TITLE = 'Acompanhar chamado';
export const OLT_NOTICE_FOOTER = 'Somente leitura · o link vale até 7 dias depois do encerramento';
export function buildOltNotice(analysis: Partial<ActivationAnalysis>, originalMessage: string, link = '') {
  const slotPons = extractAllSlotPons(originalMessage);
  const slotPonText = slotPons.length ? slotPons.join(', ') : analysis.placa_pon || (analysis.slot_pon || []).join(', ') || '-';
  const affected = Number(String(analysis.afetados ?? '').replace(/\D/g, ''));
  const title = affected >= OLT_NOTICE_CRITICAL_FROM ? '🚨 INFORMATIVO DE ACIONAMENTO CRÍTICO' : 'ℹ️ INFORMATIVO DE ACIONAMENTO';
  return [
    `*${title}*`,
    '',
    `*Tipo:* ${analysis.tipo_card || '-'}`,
    `*BDESK:* ${analysis.bdesk || analysis.ticket || '-'}`,
    `*OfficeTrack:* ${analysis.office_track || analysis.os_ot || '-'}`,
    `*Evento:* ${analysis.tipo_falha || analysis.motivo || '-'}`,
    `*Afetação:* ${analysis.afetados ?? '-'}`,
    `*OLT:* ${analysis.olt || '-'}`,
    `*PLACA/PON:* ${slotPonText}`,
    '',
    '*Endereços:*',
    extractNoticeAddresses(originalMessage) || '-',
    ...(link ? ['', '🔎 *Acompanhar o chamado (só leitura):*', link] : []),
  ].join('\n');
}

// Link unico, so de leitura, que abre so este acionamento/chamado. A validade e conferida na consulta.
const PUBLIC_VIEW_SCOPE = 'public-call-view';
export function createPublicViewToken(activationId: string, secret: string) {
  return jwt.sign({ scope: PUBLIC_VIEW_SCOPE, act: activationId }, secret, { noTimestamp: false });
}
export function readPublicViewToken(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret) as { scope?: string; act?: string };
    return payload.scope === PUBLIC_VIEW_SCOPE && typeof payload.act === 'string' ? payload.act : null;
  } catch { return null; }
}

// O link vale enquanto o caso estiver vivo e por mais 7 dias depois de encerrado (ou recusado). Limite geral: 60 dias.
export const PUBLIC_VIEW_GRACE_DAYS = 7;
export const PUBLIC_VIEW_MAX_DAYS = 60;
export function publicViewExpired(input: { receivedAt: string; closedAt?: string | null }, now = Date.now()) {
  if (now - Date.parse(input.receivedAt) > PUBLIC_VIEW_MAX_DAYS * 86_400_000) return true;
  return Boolean(input.closedAt) && now - Date.parse(input.closedAt!) > PUBLIC_VIEW_GRACE_DAYS * 86_400_000;
}
