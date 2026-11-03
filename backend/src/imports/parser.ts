import XLSX from 'xlsx';

export type ParsedImport = { fileType: 'csv' | 'xlsx'; sheetName: string; columns: string[]; rows: Record<string, string>[]; errors: string[] };

function formatCellValue(column: string, value: unknown) {
  const normalizedColumn = column.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const isTimeColumn = normalizedColumn.includes('fim') || normalizedColumn.includes('hora');
  const isDateColumn = normalizedColumn.includes('data') || normalizedColumn.includes('date');
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (isTimeColumn && !isDateColumn) return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
    return `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}`;
  }
  if (isDateColumn && typeof value === 'number' && value >= 1) {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return `${String(date.d).padStart(2, '0')}/${String(date.m).padStart(2, '0')}/${date.y}`;
  }
  if (isTimeColumn && !isDateColumn && typeof value === 'number' && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60);
    return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  }
  return String(value ?? '');
}

// Texto em UTF-8 (com ou sem BOM); se nao for UTF-8 valido, Latin-1 (CSV salvo pelo Excel no Windows).
function decodeText(buffer: Buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  return (utf8.includes('�') ? new TextDecoder('latin1').decode(buffer) : utf8).replace(/^﻿/, '');
}

export function parseImport(fileName: string, base64: string): ParsedImport {
  const buffer = Buffer.from(base64, 'base64');
  // CSV/TXT/TSV: le como texto puro (raw). Sem isso o SheetJS decodificava UTF-8 como Latin-1 ("Serviço" -> "ServiÃ§o")
  // e interpretava datas dd/mm como mm/dd ("03/11/26" virava 11/03/2026).
  const isText = /\.(csv|txt|tsv)$/i.test(fileName);
  const workbook = isText ? XLSX.read(decodeText(buffer), { type: 'string', raw: true }) : XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { fileType: fileName.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx', sheetName: '', columns: [], rows: [], errors: ['Nenhuma aba encontrada.'] };
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const normalizedRows = rows.map((row) => Object.fromEntries(columns.map((column) => [column, formatCellValue(column, row[column])])));
  const errors = rows.length ? [] : ['A planilha nao possui linhas de dados.'];
  return { fileType: fileName.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx', sheetName, columns, rows: normalizedRows, errors };
}