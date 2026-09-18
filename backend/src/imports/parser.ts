import XLSX from 'xlsx';

export type ParsedImport = { fileType: 'csv' | 'xlsx'; sheetName: string; columns: string[]; rows: Record<string, string>[]; errors: string[] };

export function parseImport(fileName: string, base64: string): ParsedImport {
  const buffer = Buffer.from(base64, 'base64');
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { fileType: fileName.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx', sheetName: '', columns: [], rows: [], errors: ['Nenhuma aba encontrada.'] };
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const normalizedRows = rows.map((row) => Object.fromEntries(columns.map((column) => [column, String(row[column] ?? '')])));
  const errors = rows.length ? [] : ['A planilha nao possui linhas de dados.'];
  return { fileType: fileName.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx', sheetName, columns, rows: normalizedRows, errors };
}