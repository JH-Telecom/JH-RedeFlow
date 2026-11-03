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

// Export "plano" do OFS: Recurso (0), Status da Atividade (2), Inicio (15), Tempo (20), Tipo de Atividade (23), Ordem de Servico (24).
function parseFlatActivityExport(rows: string[][]): ManualProductionData {
  const activities = new Map<string, ManualProductionActivity>();
  const technicians = new Map<string, ManualProductionTechnician>();
  const orders: ManualProductionOrder[] = [];
  const records: ManualProductionRecord[] = [];
  for (const cells of rows.slice(1)) {
    if (cells.length < 25) continue;
    const technicianName = cells[0]?.trim();
    const status = cells[2]?.trim() ?? '';
    const activityType = cells[23]?.trim();
    const order = cells[24]?.trim();
    if (!activityType || !allowedActivityTypes.has(normalizeText(activityType))) continue;
    const activity = activities.get(activityType) ?? emptyCounter({ type: activityType });
    incrementProductionStatus(activity, status);
    activities.set(activityType, activity);
    const record = { activityType, technician: technicianName || '', status, order: order || '', inicio: cells[15]?.trim() ?? '', tempo: cells[20]?.trim() ?? '' };
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

export function isOfsFlatExport(raw: string) {
  const firstLine = raw.split(/\r?\n/).find((line) => line.trim());
  if (!firstLine) return false;
  const header = splitCsvLikeLine(firstLine.trim()).map(normalizeText);
  return header.includes('recurso')
    && header.includes('status da atividade')
    && header.filter((cell) => /^tipo de atividade(?:\s*\d+)?$/.test(cell)).length >= 2
    && header.includes('ordem de servico');
}

// Somente o export plano do OFS (o formato que a extensao captura). O formato antigo de tabelas resumidas
// continua sendo lido apenas pelo envio manual na tela do Painel diario.
export function parseOfsActivityExport(raw: string): ManualProductionData {
  if (!isOfsFlatExport(raw)) throw new Error('O arquivo nao e o export de atividades do OFS (faltam Recurso, Status da Atividade, Tipo de Atividade ou Ordem de Servico).');
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
