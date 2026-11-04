import { createHash } from 'node:crypto';
import XLSX from 'xlsx';
import type { Call, Technician } from '../types.js';
import { extractOperationalData } from '../integrations/wuzapi/client.js';
import { analyzeOperationalMessage } from '../integrations/wuzapi/semantic.js';
import { getDefaultOltRegionMap, getManualOltRegionMap, resolveOltRegion } from '../integrations/wuzapi/noc-consolidation.js';

export type HistoricalActivationCandidate = {
  rowNumber: number;
  identifiers: string[];
  fingerprint: string;
  call: Call;
};

export type HistoricalActivationConflict = {
  orderNumber: string;
  rows: { rowNumber: number; openedAt: string; assignedAt?: string; executedAt: string }[];
};

export type HistoricalActivationPreview = {
  sheetName: string;
  totalRows: number;
  candidates: HistoricalActivationCandidate[];
  duplicatesWithinFile: number;
  conflictingOrders: number;
  conflicts: HistoricalActivationConflict[];
  missingOpeningDate: number;
  missingFinishedDate: number;
  missingOrder: number;
  missingReason: number;
  missingOlt: number;
  missingTechnician: number;
  omittedLongNeighborhood: number;
  omittedLongSlotPon: number;
  byType: Record<string, number>;
};

function normalizeHeader(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function matchHeaderValue(header: string, aliases: readonly string[]) {
  return aliases.includes(header);
}

function resolveHeaderIndex(headers: string[], aliases: readonly string[]) {
  return headers.findIndex((header) => matchHeaderValue(header, aliases));
}

export function normalizeHistoricalIdentifier(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeTechnicianName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// "Equipe JH", "JH TELECOM REDES", "JH Telecom Rede": e a propria equipe, cadastrada como "JH Telecom".
const TEAM_NAME_PATTERN = /^(?:equipe\s+)?jh(?:\s+telecom)?(?:\s+redes?)?$/;

export function findHistoricalTechnician(name: string, technicians: Technician[]) {
  const rawName = normalizeTechnicianName(name);
  const normalizedName = TEAM_NAME_PATTERN.test(rawName) ? 'jh telecom' : rawName;
  const registered = technicians.filter((technician) => technician.teamRole === 'Tecnico');
  const exact = pickOne(registered.filter((technician) => normalizeTechnicianName(technician.name) === normalizedName));
  if (exact.decided) return exact.technician;
  // Sem nome identico: comparacao tolerante (sobrenome a mais/a menos, "Sousa"/"Souza", "Junio"/"Junior").
  return pickOne(registered.filter((technician) => similarTechnicianNames(normalizedName, normalizeTechnicianName(technician.name)))).technician;
}

// Um unico cadastro; com nome em duplicidade (um ativo e outro inativo), vale o unico ativo.
function pickOne(matches: Technician[]): { decided: boolean; technician?: Technician } {
  if (matches.length === 1) return { decided: true, technician: matches[0] };
  if (!matches.length) return { decided: false };
  const active = matches.filter((technician) => technician.active);
  return { decided: true, technician: active.length === 1 ? active[0] : undefined };
}

const NAME_CONNECTORS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
const nameTokens = (name: string) => name.split(' ').filter((token) => token && !NAME_CONNECTORS.has(token));

function oneEditApart(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (left.length - i) + (right.length - j) <= 1;
}

function similarTokens(left: string, right: string) {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
  return shorter.length >= 5 && oneEditApart(left, right);
}

// Mesmo primeiro nome e todos os nomes do mais curto aparecem, na ordem, no mais longo (com tolerancia por palavra).
export function similarTechnicianNames(left: string, right: string) {
  const leftTokens = nameTokens(left);
  const rightTokens = nameTokens(right);
  const [shorter, longer] = leftTokens.length <= rightTokens.length ? [leftTokens, rightTokens] : [rightTokens, leftTokens];
  // Primeiro nome com 3+ letras: siglas como "JH" ficam so na comparacao exata.
  if (shorter.length < 2 || shorter[0].length < 3 || !similarTokens(shorter[0], longer[0])) return false;
  let position = 1;
  for (const token of shorter.slice(1)) {
    while (position < longer.length && !similarTokens(token, longer[position])) position += 1;
    if (position >= longer.length) return false;
    position += 1;
  }
  return true;
}

function parseWorkbookDate(value: unknown): string | undefined {
  // Celulas de data da planilha tem precisao de segundos; o SheetJS pode devolver o instante com 1 ms de erro de arredondamento.
  // O SheetJS monta a data com o fuso do processo (UTC no Render, -03 na maquina local). Os componentes locais sao o
  // horario escrito na planilha, que e de Sao Paulo (UTC-3, sem horario de verao): converte a partir deles.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const milliseconds = Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours() + 3, value.getMinutes(), value.getSeconds(), value.getMilliseconds());
    return new Date(Math.round(milliseconds / 1000) * 1000).toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return undefined;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H + 3, parsed.M, parsed.S)).toISOString();
  }
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const text = value.trim();
  const localDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (localDate) {
    const first = Number(localDate[1]);
    const second = Number(localDate[2]);
    const yearValue = Number(localDate[3]);
    const year = yearValue < 100 ? (yearValue >= 70 ? 1900 + yearValue : 2000 + yearValue) : yearValue;
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    return new Date(Date.UTC(year, month - 1, day, Number(localDate[4] || 0) + 3, Number(localDate[5] || 0), Number(localDate[6] || 0))).toISOString();
  }
  // "2026-11-02 14:47:57" (relatorio da operadora): horario de Sao Paulo. new Date() usaria o fuso do servidor.
  const isoLocal = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (isoLocal) return new Date(Date.UTC(Number(isoLocal[1]), Number(isoLocal[2]) - 1, Number(isoLocal[3]), Number(isoLocal[4] || 0) + 3, Number(isoLocal[5] || 0), Number(isoLocal[6] || 0))).toISOString();
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function stableCallId(identity: string) {
  const hash = createHash('sha256').update(`legacy-activation:${identity}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fingerprint(values: unknown[]) {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

export function parseHistoricalActivationWorkbook(fileName: string, buffer: Buffer): HistoricalActivationPreview {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('A planilha não contém abas para importar.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    const hasOpening = resolveHeaderIndex(headers, ['data abertura', 'data de abertura', 'dt abertura', 'abertura']) >= 0;
    const hasFinished = resolveHeaderIndex(headers, ['data fim', 'data de fim', 'data final', 'data finalizacao', 'data de finalizacao', 'dt fim', 'fim']) >= 0;
    const hasMessage = resolveHeaderIndex(headers, ['acionamento', 'mensagem de acionamento', 'mensagem acionamento', 'mensagem', 'texto acionamento']) >= 0;
    return hasOpening && hasFinished && hasMessage;
  });
  if (headerIndex < 0) {
    const reportHeaderIndex = rows.findIndex((row) => {
      const headers = row.map(normalizeHeader);
      return headers.includes('os') && headers.includes('data abertura') && headers.includes('data fechamento');
    });
    if (reportHeaderIndex >= 0) return parseOperatorReport(fileName, sheetName, rows, reportHeaderIndex);
    throw new Error('Não encontrei as colunas Data Abertura, Data-Fim e Acionamento (ou OS, DATA_ABERTURA e DATA_FECHAMENTO do relatório da operadora).');
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const technicianAliases = ['tecnico', 'tecnico rede', 'responsavel', 'responsavel tecnico', 'nome tecnico'];
  const openingAliases = ['data abertura', 'data de abertura', 'dt abertura', 'abertura'];
  const activationAliases = ['data acionamento', 'data de acionamento', 'data do acionamento', 'dt acionamento', 'acionamento'];
  const finishedAliases = ['data fim', 'data de fim', 'data final', 'data finalizacao', 'data de finalizacao', 'dt fim', 'fim'];
  const messageAliases = ['acionamento', 'mensagem de acionamento', 'mensagem acionamento', 'mensagem', 'texto acionamento'];
  const technicianColumn = resolveHeaderIndex(headers, technicianAliases);
  const openingColumn = resolveHeaderIndex(headers, openingAliases);
  const activationColumn = resolveHeaderIndex(headers, activationAliases);
  const finishedColumn = resolveHeaderIndex(headers, finishedAliases);
  const messageColumn = resolveHeaderIndex(headers, messageAliases);
  const totalRows = rows.slice(headerIndex + 1).filter((row) => String(row[messageColumn] ?? '').trim()).length;
  const groups = new Map<string, HistoricalActivationCandidate[]>();
  const missing = { missingOpeningDate: 0, missingFinishedDate: 0, missingOrder: 0, missingReason: 0, missingOlt: 0, missingTechnician: 0, omittedLongNeighborhood: 0, omittedLongSlotPon: 0 };
  const byType: Record<string, number> = {};

  rows.slice(headerIndex + 1).forEach((row, index) => {
    const message = String(row[messageColumn] ?? '').trim();
    if (!message) return;
    const openedAt = parseWorkbookDate(row[openingColumn]);
    const executedAt = parseWorkbookDate(row[finishedColumn]);
    if (!openedAt) missing.missingOpeningDate += 1;
    if (!executedAt) missing.missingFinishedDate += 1;

    const legacy = extractOperationalData(message);
    const analysis = analyzeOperationalMessage(message);
    const workbookTechnician = technicianColumn >= 0 ? String(row[technicianColumn] ?? '').trim() : '';
    const orderLabelPattern = /^[\t ]*[-*]?[\t ]*(?:O\.?S\.?[\t ]*OT|OFFICE[\t ]*TRACK|OFFICETRACK)[\t ]*[:=-][\t ]*(.*?)[\t ]*$/i;
    const orderLabel = message.split(/\r?\n/).find((line) => orderLabelPattern.test(line));
    const explicitOrder = orderLabel?.match(orderLabelPattern)?.[1]?.trim() || '';
    const orderNumber = orderLabel ? explicitOrder : analysis.os_ot || analysis.office_track || legacy.orderNumber || legacy.officeTrack;
    if (!orderNumber) missing.missingOrder += 1;
    if (!analysis.motivo && !legacy.reason) missing.missingReason += 1;
    if (!analysis.olt && !legacy.olt) missing.missingOlt += 1;
    if (!analysis.tecnico_rede && !analysis.tecnico && !legacy.technician && !workbookTechnician) missing.missingTechnician += 1;

    const type = analysis.tipo_registro || legacy.type || 'NOC ACESSO';
    byType[type] = (byType[type] || 0) + 1;
    if (!openedAt || !executedAt || !orderNumber) return;

    const orderKey = normalizeHistoricalIdentifier(orderNumber);
    if (!orderKey) { missing.missingOrder += 1; return; }
    const identifiers = [...new Set([analysis.os_ot, analysis.office_track, analysis.os_casa_cliente, analysis.bdesk, analysis.ticket, analysis.contrato, orderNumber]
      .filter((item): item is string => Boolean(item?.trim())))];
    const olt = analysis.olt || legacy.olt || '';
    const extractedBairro = analysis.bairro_principal || '';
    const extractedSlotPon = analysis.slot_pon?.join(', ') || legacy.slotPon || '';
    const bairro = extractedBairro.length <= 160 ? extractedBairro : '';
    const slotPon = extractedSlotPon.length <= 255 ? extractedSlotPon : '';
    if (extractedBairro.length > 160) missing.omittedLongNeighborhood += 1;
    if (extractedSlotPon.length > 255) missing.omittedLongSlotPon += 1;
    const identity = `legacy-activation:${orderKey}`;
    const rowNumber = headerIndex + index + 2;
    const rowFingerprint = fingerprint([message.replace(/\s+/g, ' ').trim(), openedAt, executedAt]);
    const call: Call = {
      id: stableCallId(identity),
      orderNumber,
      bdesk: analysis.bdesk || legacy.bdesk || '',
      officeTrack: analysis.office_track || legacy.officeTrack || '',
      client: legacy.client || 'Cliente nao identificado',
      type,
      reason: analysis.motivo || legacy.reason || 'Motivo nao informado',
      region: resolveOltRegion(olt).region || legacy.region || 'Nao informada',
      city: legacy.city || '',
      address: analysis.endereco_principal || '',
      bairro,
      olt,
      slotPon,
      status: 'Finalizado',
      openedAt,
      assignedAt: parseWorkbookDate(activationColumn >= 0 ? row[activationColumn] : undefined),
      executedAt,
      technicianName: workbookTechnician || analysis.tecnico_rede || analysis.tecnico || legacy.technician || undefined,
      result: analysis.tratativa_realizada || undefined,
      notes: `Importado do histórico ${fileName}, linha ${rowNumber}.\n\n${message}`,
      source: 'legacy-activation',
      sourceIdentity: identity,
      sourceIdentifiers: identifiers.map(normalizeHistoricalIdentifier),
      sourceFileName: fileName,
      sourceReferenceDate: executedAt.slice(0, 10),
      sourceFingerprint: rowFingerprint,
      sourceProcessedAt: new Date().toISOString(),
    };
    const candidate = { rowNumber, identifiers, fingerprint: rowFingerprint, call };
    const group = groups.get(orderKey) || [];
    group.push(candidate);
    groups.set(orderKey, group);
  });

  return { sheetName, totalRows, ...settleGroups(groups), ...missing, byType };
}

// Mesma O.S. repetida: identica entra uma vez; com conteudo diferente vai para revisao manual.
function settleGroups(groups: Map<string, HistoricalActivationCandidate[]>) {
  const candidates: HistoricalActivationCandidate[] = [];
  let duplicatesWithinFile = 0;
  let conflictingOrders = 0;
  const conflicts: HistoricalActivationConflict[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { candidates.push(group[0]); continue; }
    if (group.every((candidate) => candidate.fingerprint === group[0].fingerprint)) {
      candidates.push(group[0]);
      duplicatesWithinFile += group.length - 1;
    } else {
      conflictingOrders += group.length;
      conflicts.push({ orderNumber: group[0].call.orderNumber, rows: group.map(({ rowNumber, call }) => ({ rowNumber, openedAt: call.openedAt, assignedAt: call.assignedAt, executedAt: call.executedAt || '' })) });
    }
  }

  return { candidates, duplicatesWithinFile, conflictingOrders, conflicts };
}

// ---------- Relatorio da operadora (OS, ORIGEM, DATA_ABERTURA, DATA_FECHAMENTO, RECURSO, CIDADE...) ----------
// Sem card: o tipo vem da ORIGEM, a regiao da CIDADE e o tecnico do RECURSO.
const REPORT_TYPES: Record<string, string> = { BACKBONE: 'NOC TX', BDESK: 'NOC ACESSO', ACESSO: 'NOC ACESSO', FIELD: 'ACIONAMENTO FIELD' };
const ROMAN_NUMERALS: Record<string, string> = { I: '1', II: '2', III: '3', IV: '4', V: '5' };
const plainText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

function reportCell(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return String(value ?? '').trim();
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_match, space: string, letter: string) => space + letter.toUpperCase());
}

// "Sao Paulo/guaianases" -> GUAIANASES; "Guarulhos Ii" -> GUARULHOS 2; "Maua/conquista" -> CONQUISTA.
// Usa a grafia das regioes conhecidas (mapa de OLTs); sem correspondencia, o proprio texto em maiusculas.
function regionFromCity(city: string) {
  const known = new Map<string, string>();
  for (const region of [...Object.values(getDefaultOltRegionMap()), ...Object.values(getManualOltRegionMap())]) known.set(plainText(region), region);
  const parts = city.split('/').map((part) => plainText(part).replace(/\b(I{1,3}|IV|V)$/, (numeral) => ROMAN_NUMERALS[numeral] || numeral)).filter(Boolean);
  for (const part of [...parts].reverse()) {
    if (known.has(part)) return known.get(part)!;
    const prefixed = [...known.keys()].filter((region) => region.startsWith(`${part} `));
    if (prefixed.length === 1) return known.get(prefixed[0])!;
  }
  return parts[parts.length - 1] || '';
}

function parseOperatorReport(fileName: string, sheetName: string, rows: unknown[][], headerIndex: number): HistoricalActivationPreview {
  const headers = rows[headerIndex].map(normalizeHeader);
  const column = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const at = (row: unknown[], index: number) => (index >= 0 ? reportCell(row[index]) : '');
  const columns = {
    order: column('os'), ofs: column('os ofs'), bdesk: column('bdesk'), origin: column('origem'), cause: column('causa simples'),
    city: column('cidade'), affected: column('clientes afetados'), opened: column('data abertura'), closed: column('data fechamento'),
    element: column('elemento'), cluster: column('cluster'), technician: column('recurso'), network: column('rede'), tme: column('tme'),
  };
  const dataRows = rows.slice(headerIndex + 1).filter((row) => row.some((value) => String(value ?? '').trim()));
  const groups = new Map<string, HistoricalActivationCandidate[]>();
  const missing = { missingOpeningDate: 0, missingFinishedDate: 0, missingOrder: 0, missingReason: 0, missingOlt: 0, missingTechnician: 0, omittedLongNeighborhood: 0, omittedLongSlotPon: 0 };
  const byType: Record<string, number> = {};

  rows.slice(headerIndex + 1).forEach((row, index) => {
    if (!row.some((value) => String(value ?? '').trim())) return;
    const rowNumber = headerIndex + index + 2;
    const orderNumber = at(row, columns.order) || at(row, columns.ofs);
    const openedAt = parseWorkbookDate(columns.opened >= 0 ? row[columns.opened] : undefined);
    const executedAt = parseWorkbookDate(columns.closed >= 0 ? row[columns.closed] : undefined);
    if (!openedAt) missing.missingOpeningDate += 1;
    if (!executedAt) missing.missingFinishedDate += 1;
    if (!orderNumber) missing.missingOrder += 1;
    const origin = plainText(at(row, columns.origin));
    const type = REPORT_TYPES[origin] || (plainText(at(row, columns.network)) === 'ACESSO' ? 'NOC ACESSO' : 'NOC ACESSO');
    byType[type] = (byType[type] || 0) + 1;
    const reason = at(row, columns.cause);
    if (!reason) missing.missingReason += 1;
    const element = at(row, columns.element);
    const olt = /^(VIP-|OLT-)/i.test(element) ? element : '';
    if (!olt) missing.missingOlt += 1;
    const technicianName = at(row, columns.technician) ? titleCase(at(row, columns.technician)) : '';
    if (!technicianName) missing.missingTechnician += 1;
    if (!openedAt || !executedAt || !orderNumber) return;
    const orderKey = normalizeHistoricalIdentifier(orderNumber);
    if (!orderKey) return;

    const city = at(row, columns.city);
    const bdesk = at(row, columns.bdesk);
    const officeTrack = at(row, columns.ofs) || orderNumber;
    const identifiers = [...new Set([orderNumber, officeTrack, bdesk].filter(Boolean))];
    const identity = `legacy-activation:${orderKey}`;
    const details = [
      at(row, columns.tme) && `TME do relatório: ${at(row, columns.tme)} h`,
      element && !olt && `Elemento: ${element}`,
      at(row, columns.affected) && `Clientes afetados: ${at(row, columns.affected)}`,
      at(row, columns.cluster) && `Cluster: ${at(row, columns.cluster)}`,
    ].filter(Boolean).join('\n');
    const rowFingerprint = fingerprint([orderNumber, openedAt, executedAt, technicianName, origin]);
    const call: Call = {
      id: stableCallId(identity),
      orderNumber,
      bdesk,
      officeTrack,
      client: 'Cliente nao identificado',
      type,
      reason: reason || 'Motivo nao informado',
      region: (olt && resolveOltRegion(olt).region) || regionFromCity(city) || 'Nao informada',
      city: city.split('/')[0]?.trim() || '',
      address: '',
      bairro: '',
      olt,
      slotPon: '',
      status: 'Finalizado',
      openedAt,
      executedAt,
      technicianName: technicianName || undefined,
      notes: `Importado do relatório ${fileName}, linha ${rowNumber}.${details ? `\n${details}` : ''}`,
      source: 'legacy-activation',
      sourceIdentity: identity,
      sourceIdentifiers: identifiers.map(normalizeHistoricalIdentifier),
      sourceFileName: fileName,
      sourceReferenceDate: executedAt.slice(0, 10),
      sourceFingerprint: rowFingerprint,
      sourceProcessedAt: new Date().toISOString(),
    };
    const group = groups.get(orderKey) || [];
    group.push({ rowNumber, identifiers, fingerprint: rowFingerprint, call });
    groups.set(orderKey, group);
  });

  return { sheetName, totalRows: dataRows.length, ...settleGroups(groups), ...missing, byType };
}