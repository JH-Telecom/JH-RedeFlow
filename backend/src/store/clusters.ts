import { normalizeCluster } from '../igp.js';
import { matchRowsToCalls, rowWorkzone, type D0Row } from '../imports/d0.js';
import { getSupabaseAdmin, isSupabaseConfigured } from '../integrations/supabase/client.js';
import type { Call } from '../types.js';
import { listCalls } from './calls.js';
import { calls as demoCalls } from './demo-data.js';

// Cluster do OFS (C08 SP, C09 ABC, C11 Alto Tiete, C12 GRU) em cada chamado.
// - Export de um balde de cluster: as ordens que estao nele recebem o cluster e ensinam Workzone -> cluster.
// - Export do JH TELECOM REDES (todas as ordens, inclusive as ja atribuidas): o cluster vem pela Workzone aprendida.

const demoWorkzones = new Map<string, string>();

export type ClusterSyncResult = { rows: number; matchedCalls: number; updatedCalls: number; learnedWorkzones: number };

export async function loadWorkzoneClusters(): Promise<Map<string, string>> {
  if (!isSupabaseConfigured()) return new Map(demoWorkzones);
  const { data, error } = await getSupabaseAdmin().from('ofs_workzone_clusters').select('workzone, cluster');
  if (error) throw new Error(error.message);
  return new Map((data || []).map((row: { workzone: string; cluster: string }) => [row.workzone, row.cluster]));
}

async function saveWorkzoneClusters(pairs: Map<string, string>) {
  if (!pairs.size) return;
  if (!isSupabaseConfigured()) { pairs.forEach((cluster, workzone) => demoWorkzones.set(workzone, cluster)); return; }
  const updatedAt = new Date().toISOString();
  const rows = [...pairs].map(([workzone, cluster]) => ({ workzone, cluster, updated_at: updatedAt }));
  const { error } = await getSupabaseAdmin().from('ofs_workzone_clusters').upsert(rows, { onConflict: 'workzone' });
  if (error) throw new Error(error.message);
}

async function setCallClusters(updates: Array<{ call: Call; cluster: string }>) {
  const changed = updates.filter(({ call, cluster }) => call.cluster !== cluster);
  if (!changed.length) return 0;
  if (!isSupabaseConfigured()) {
    changed.forEach(({ call, cluster }) => { const stored = demoCalls.get(call.id); if (stored) demoCalls.set(call.id, { ...stored, cluster }); });
    return changed.length;
  }
  const byCluster = new Map<string, string[]>();
  changed.forEach(({ call, cluster }) => byCluster.set(cluster, [...(byCluster.get(cluster) || []), call.id]));
  for (const [cluster, ids] of byCluster) {
    for (let offset = 0; offset < ids.length; offset += 200) {
      const { error } = await getSupabaseAdmin().from('calls').update({ cluster }).in('id', ids.slice(offset, offset + 200));
      if (error) throw new Error(error.message);
    }
  }
  return changed.length;
}

// Export de um balde de cluster (ex.: "CLUSTER_C08"): toda linha e desse cluster.
export async function applyClusterExport(rows: D0Row[], bucket: string): Promise<ClusterSyncResult> {
  const cluster = normalizeCluster(bucket);
  if (!cluster) throw new Error(`Balde sem cluster reconhecivel: ${bucket}`);
  const learned = new Map<string, string>();
  rows.forEach((row) => { const workzone = rowWorkzone(row); if (workzone) learned.set(workzone, cluster); });
  await saveWorkzoneClusters(learned);
  const matches = matchRowsToCalls(rows, await listCalls());
  const updatedCalls = await setCallClusters(matches.map(({ call }) => ({ call, cluster })));
  return { rows: rows.length, matchedCalls: matches.length, updatedCalls, learnedWorkzones: learned.size };
}

// Export do JH TELECOM REDES: chamados ainda sem cluster recebem o da sua Workzone (se ja aprendida).
export async function assignClustersFromWorkzones(rows: D0Row[]): Promise<number> {
  const workzones = await loadWorkzoneClusters();
  if (!workzones.size) return 0;
  const matches = matchRowsToCalls(rows, await listCalls());
  const updates = matches
    .filter(({ call }) => !call.cluster)
    .map(({ row, call }) => ({ call, cluster: workzones.get(rowWorkzone(row)) || '' }))
    .filter((item) => item.cluster);
  return setCallClusters(updates);
}
