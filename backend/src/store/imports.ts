import { getSupabaseAdmin, isSupabaseConfigured } from "../integrations/supabase/client.js";
import { matchD0Rows, technicianAssignmentsFromRows, type D0Row } from "../imports/d0.js";
import { listTechnicians } from "./teams.js";
import { toOperationalDate } from "../timezone.js";
import type { Call, ImportRecord, ManualDailyBase, ManualProductionData, User } from "../types.js";
import { listCalls, updateCall } from "./calls.js";
import { d0BaseRows, imports, manualDailyBases } from "./demo-data.js";
import { captureUnknownOltRequests } from "./settings.js";
import { callsWithManualEndDate } from './observations.js';

export async function listImports(): Promise<ImportRecord[]> {
  return [...imports.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveImport(record: ImportRecord): Promise<ImportRecord> {
  imports.set(record.id, record); return record;
}

export type D0BaseSummary = { fileName?: string; rowCount: number; uploadedBy?: string; uploadedAt?: string };

export type D0SyncResult = { rows: number; matchedCalls: number; updatedCalls: number; unmatchedRows: number };

export async function getD0BaseSummary(): Promise<D0BaseSummary> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const [{ count, error: countError }, { data, error }] = await Promise.all([
      admin.from('d0_base_records').select('id', { count: 'exact', head: true }),
      admin.from('d0_base_records').select('file_name, uploaded_by, imported_at').order('imported_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (countError || error) throw new Error(countError?.message || error?.message || 'Nao foi possivel consultar a base D-0.');
    return { fileName: data?.file_name, rowCount: count || 0, uploadedBy: data?.uploaded_by, uploadedAt: data?.imported_at };
  }
  const latest = d0BaseRows.at(-1);
  return { fileName: latest?.fileName, rowCount: d0BaseRows.length, uploadedBy: latest?.uploadedBy, uploadedAt: latest?.importedAt };
}

export async function replaceD0Base(fileName: string, uploadedBy: string, rows: D0Row[]): Promise<D0SyncResult> {
  if (!rows.length) throw new Error('A base D-0 nao possui linhas para importar.');
  const d0Olts = rows.flatMap((row) => {
    const entry = Object.entries(row).find(([key, value]) => ['olt', 'olt de atendimento'].includes(key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()) && value.trim());
    return entry ? [entry[1]] : [];
  });
  await captureUnknownOltRequests(d0Olts, 'Importacao D-0');
  const importedAt = new Date().toISOString();
  const records = rows.map((payload, index) => ({ fileName, rowNumber: index + 2, payload, uploadedBy, importedAt }));

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { error: deleteError } = await admin.from('d0_base_records').delete().not('id', 'is', null);
    if (deleteError) throw new Error(deleteError.message);
    for (let offset = 0; offset < records.length; offset += 500) {
      const batch = records.slice(offset, offset + 500).map((record) => ({ file_name: record.fileName, row_number: record.rowNumber, payload: record.payload, uploaded_by: record.uploadedBy, imported_at: record.importedAt }));
      const { error } = await admin.from('d0_base_records').insert(batch);
      if (error) throw new Error(error.message);
    }
  } else {
    d0BaseRows.splice(0, d0BaseRows.length, ...records);
  }

  return applyOfsRowsToCalls(rows, 'Importacao D-0');
}

// Cruza linhas do export do OFS/D-0 com os chamados e atualiza Status OFS, endereco, bairro, cidade, regiao, OLT e
// Data Fim (mesma regra da D-0), sem tocar no snapshot `d0_base_records`. Usado tambem para dias anteriores.
export async function applyOfsRowsToCalls(rows: D0Row[], actorName: string): Promise<D0SyncResult> {
  const currentCalls = await listCalls();
  const { matches, unmatchedRows } = matchD0Rows(rows, currentCalls);
  // Tecnico do OFS ("Recurso") entra no chamado que ainda nao tem tecnico.
  for (const assignment of technicianAssignmentsFromRows(rows, currentCalls, await listTechnicians())) {
    const { callId, ...fields } = assignment;
    const match = matches.find((item) => item.callId === callId);
    if (match) Object.assign(match.fields, fields);
    else matches.push({ callId, fields });
  }
  // Data Fim corrigida a mao na tela do chamado: o OFS nao sobrescreve.
  const manualEndDates = await callsWithManualEndDate(matches.filter((match) => 'executedAt' in match.fields).map((match) => match.callId));
  for (const match of matches) if (manualEndDates.has(match.callId)) delete (match.fields as { executedAt?: unknown }).executedAt;
  const callsById = new Map(currentCalls.map((call) => [call.id, call]));
  const actor: User = { id: 'system-d0-import', name: actorName, email: 'system-d0@jhtelecom.com', roleId: 'system', active: true, createdAt: new Date().toISOString() };
  let updatedCalls = 0;
  const batchSize = 10;
  for (let offset = 0; offset < matches.length; offset += batchSize) {
    const batch = matches.slice(offset, offset + batchSize);
    const updateResults = await Promise.all(batch.map(async (match) => {
      const current = callsById.get(match.callId);
      const changed = current && Object.entries(match.fields).some(([field, value]) => String(current[field as keyof Call] ?? '') !== String(value ?? ''));
      const updated = await updateCall(match.callId, match.fields, actor);
      return updated && changed ? 1 : 0;
    }));
    updatedCalls += updateResults.reduce<number>((total, count) => total + count, 0);
  }
  return { rows: rows.length, matchedCalls: matches.length, updatedCalls, unmatchedRows };
}

export async function clearD0Base(): Promise<number> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('d0_base_records').delete().not('id', 'is', null).select('id');
    if (error) throw new Error(error.message);
    return data?.length || 0;
  }
  const deleted = d0BaseRows.length;
  d0BaseRows.length = 0;
  return deleted;
}

export function manualBaseDate(date?: string) {
  return date || toOperationalDate();
}

export function mapManualBase(row: { business_date: string; file_name: string; payload: ManualProductionData; uploaded_by: string; updated_at: string }): ManualDailyBase {
  return { businessDate: row.business_date, fileName: row.file_name, data: row.payload, uploadedBy: row.uploaded_by, updatedAt: row.updated_at };
}

export async function getManualDailyBase(date?: string): Promise<ManualDailyBase | undefined> {
  const businessDate = manualBaseDate(date);
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('manual_daily_bases').select('business_date, file_name, payload, uploaded_by, updated_at').eq('business_date', businessDate).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapManualBase(data as { business_date: string; file_name: string; payload: ManualProductionData; uploaded_by: string; updated_at: string }) : undefined;
  }
  return manualDailyBases.get(businessDate);
}

export async function saveManualDailyBase(fileName: string, data: ManualProductionData, uploadedBy: string, date?: string): Promise<ManualDailyBase> {
  const businessDate = manualBaseDate(date);
  const updatedAt = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const { data: row, error } = await getSupabaseAdmin().from('manual_daily_bases').upsert({ business_date: businessDate, file_name: fileName, payload: data, uploaded_by: uploadedBy, updated_at: updatedAt }).select('business_date, file_name, payload, uploaded_by, updated_at').single();
    if (error || !row) throw new Error(error?.message || 'Nao foi possivel salvar a base diaria.');
    return mapManualBase(row as { business_date: string; file_name: string; payload: ManualProductionData; uploaded_by: string; updated_at: string });
  }
  const record = { businessDate, fileName, data, uploadedBy, updatedAt };
  manualDailyBases.set(businessDate, record);
  return record;
}

export async function deleteManualDailyBase(date?: string): Promise<boolean> {
  const businessDate = manualBaseDate(date);
  if (isSupabaseConfigured()) {
    const { error, count } = await getSupabaseAdmin().from('manual_daily_bases').delete({ count: 'exact' }).eq('business_date', businessDate);
    if (error) throw new Error(error.message);
    return Boolean(count);
  }
  return manualDailyBases.delete(businessDate);
}
