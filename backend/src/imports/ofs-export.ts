// Leitura do export do OFS para o Painel diario no backend. Mesma logica de frontend/src/lib/manual-production.ts
// (parseManualProductionData), usada quando o CSV chega automaticamente pela extensao do Coletor OFS.
import type { ManualProductionActivity, ManualProductionData, ManualProductionOrder, ManualProductionRecord, ManualProductionTechnician } from '../types.js';
import { OPERATIONAL_TIME_ZONE } from '../timezone.js';

type ProductionCounter = ManualProductionActivity | ManualProductionTechnician;

const allowedActivityTypes = new Set(['manutencao preventiva de rede', 'manutencao corretiva de rede', 'manutencao de rede field']);

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') { current += '"'; index += 1; } else { inQuotes = !inQuotes; }
      continue;
    }
    if (character === delimiter && !inQuotes) { cells.push(current.trim()); current = ''; continue; }
    current += character;
  }
  cells.push(current.trim());
  return cells;
}

function splitCsvLikeLine(line: string): string[] {
  const best = [';', ',', '\t']
    .map((delimiter) => ({ delimiter, count: parseDelimitedLine(line, delimiter).length }))
    .map((item) => ({ ...item, count: item.count > 1 ? item.count : 0 }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter ?? ',';
  return parseDelimitedLine(line, best);
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function emptyCounter<T extends object>(base: T): T & Omit<ProductionCounter, 'type' | 'name'> {
  return { ...base, pending: 0, enRoute: 0, started: 0, concluded: 0, cancelled: 0, suspended: 0, total: 0 };
}

function incrementProductionStatus(item: ProductionCounter, status: string) {
  const normalizedStatus = normalizeText(status);
  if (normalizedStatus === 'pendente') item.pending += 1;
  if (normalizedStatus === 'em rota') item.enRoute += 1;
  if (normalizedStatus === 'iniciado') item.started += 1;
  if (normalizedStatus === 'concluido') item.concluded += 1;
  if (normalizedStatus === 'cancelado') item.cancelled += 1;
  if (normalizedStatus === 'suspenso') item.suspended += 1;
  item.total += 1;
}

function updatedAtLabel() {
  return new Date().toLocaleString('pt-BR', { timeZone: OPERATIONAL_TIME_ZONE });
}

// Colunas do export "plano" do OFS, localizadas pelo NOME do cabecalho (nao pela posicao): a ordem muda conforme
// a alocacao/visao exportada. Pode haver mais de uma coluna "Tipo de Atividade"; vale a que tiver um tipo de rede.
type OfsColumns = { resource: number; status: number; types: number[]; order: number; start: number; duration: number };

function findOfsColumns(header: string[]): OfsColumns {
  const normalized = header.map(normalizeText);
  const index = (...names: string[]) => normalized.findIndex((cell) => names.includes(cell));
  return {
    resource: index('recurso', 'tecnico'),
    status: index('status da atividade', 'status'),
    types: normalized.flatMap((cell, position) => (/^tipo de atividade(?:\s*\d+)?$/.test(cell) ? [position] : [])),
    order: index('ordem de servico', 'os', 'o s'),
    start: index('inicio', 'hora de inicio'),
    duration: index('tempo', 'duracao'),
  };
}

function missingColumns(columns: OfsColumns) {
  return [
    columns.status < 0 ? 'Status da Atividade' : null,
    columns.types.length ? null : 'Tipo de Atividade',
    columns.order < 0 ? 'Ordem de Servico' : null,
  ].filter((name): name is string => Boolean(name));
}

function parseFlatActivityExport(rows: string[][]): ManualProductionData {
  const columns = findOfsColumns(rows[0] ?? []);
  const activities = new Map<string, ManualProductionActivity>();
  const technicians = new Map<string, ManualProductionTechnician>();
  const orders: ManualProductionOrder[] = [];
  const records: ManualProductionRecord[] = [];
  const cell = (cells: string[], position: number) => (position >= 0 ? cells[position]?.trim() ?? '' : '');
  for (const cells of rows.slice(1)) {
    const activityType = columns.types.map((position) => cell(cells, position)).find((value) => allowedActivityTypes.has(normalizeText(value)));
    if (!activityType) continue;
    const technicianName = cell(cells, columns.resource);
    const status = cell(cells, columns.status);
    const order = cell(cells, columns.order);
    const activity = activities.get(activityType) ?? emptyCounter({ type: activityType });
    incrementProductionStatus(activity, status);
    activities.set(activityType, activity);
    const record = { activityType, technician: technicianName, status, order, inicio: cell(cells, columns.start), tempo: cell(cells, columns.duration) };
    records.push(record);
    if (technicianName) {
      const technician = technicians.get(technicianName) ?? emptyCounter({ name: technicianName });
      incrementProductionStatus(technician, status);
      technicians.set(technicianName, technician);
    }
    if (order && normalizeText(status) === 'iniciado') orders.push({ order, technician: technicianName, inicio: record.inicio, tempo: record.tempo });
  }
  return { activities: [...activities.values()], technicians: [...technicians.values()], orders, records, updatedAt: updatedAtLabel() };
}

function headerOf(raw: string) {
  const firstLine = raw.split(/\r?\n/).find((line) => line.trim());
  return firstLine ? splitCsvLikeLine(firstLine.trim()) : [];
}

export function isOfsFlatExport(raw: string) {
  const header = headerOf(raw);
  return header.length > 1 && !missingColumns(findOfsColumns(header)).length;
}

// Somente o export plano do OFS (o formato que a extensao captura). O formato antigo de tabelas resumidas
// continua sendo lido apenas pelo envio manual na tela do Painel diario.
export function parseOfsActivityExport(raw: string): ManualProductionData {
  const header = headerOf(raw);
  const missing = missingColumns(findOfsColumns(header));
  if (header.length <= 1 || missing.length) {
    const received = header.slice(0, 12).join(' | ') || 'arquivo vazio';
    throw new Error(`O arquivo nao e o export de atividades do OFS: faltam as colunas ${missing.join(', ') || 'esperadas'}. Colunas recebidas: ${received}${header.length > 12 ? ' ...' : ''}`);
  }
  const rows = raw.split(/\r?\n/).map((line) => line.replace(/^\s+|\s+$/g, '')).filter(Boolean);
  return parseFlatActivityExport(rows.map(splitCsvLikeLine));
}

// "Data" no formato dd/mm/aa ou dd/mm/aaaa (mesma regra da extensao): quantas linhas sao do dia informado.
export function countRowsForDate(raw: string, isoDate: string) {
  const rows = raw.split(/\r?\n/).filter((line) => line.trim());
  if (rows.length < 2) return { hasDateColumn: false, matching: 0 };
  const header = splitCsvLikeLine(rows[0]).map((cell) => cell.trim());
  const dateIndex = header.indexOf('Data');
  if (dateIndex < 0) return { hasDateColumn: false, matching: 0 };
  let matching = 0;
  for (const line of rows.slice(1)) {
    const match = splitCsvLikeLine(line)[dateIndex]?.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!match) continue;
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    if (`${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` === isoDate) matching += 1;
  }
  return { hasDateColumn: true, matching };
}
