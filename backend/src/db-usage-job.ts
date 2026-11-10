import { currentMode, exportUsage, importUsage, takeDirty, usageDay, usageReport, type UsageMode, type UsageState } from './db-usage.js';
import { getSupabaseAdmin, isSupabaseConfigured } from './integrations/supabase/client.js';
import { listIntegrationEvents, recordIntegrationEvent } from './store/integration-events.js';

// Guarda a medicao do trafego do Supabase em integration_events (kind db_usage): uma linha por dia, atualizada
// a cada 5 min, com o historico dos ultimos 35 dias dentro (a tabela apaga linhas com mais de 14 dias).
// Tambem avisa (painel da integracao e WhatsApp dos avisos) quando o sistema entra ou sai do modo economia.
let loaded = false;
let row: { id: string; day: string } | null = null;
let alertedMode: UsageMode = 'normal';
let running = false;

const MODE_TEXT: Record<UsageMode, string> = {
  normal: 'normal',
  economia: 'economia (60% do limite do Supabase em 30 dias)',
  economia_forte: 'economia forte (85% do limite do Supabase em 30 dias)',
};

export async function loadDbUsage() {
  if (loaded || !isSupabaseConfigured()) return;
  try {
    const [latest] = await listIntegrationEvents(14 * 24, ['db_usage']);
    if (latest) {
      importUsage(latest.details.state as UsageState);
      if (typeof latest.details.alertedMode === 'string') alertedMode = latest.details.alertedMode as UsageMode;
      if (latest.details.day === usageDay()) row = { id: latest.id, day: latest.details.day as string };
    }
    loaded = true;
  } catch (error) {
    console.warn(`[Trafego do banco] nao foi possivel ler a medicao salva: ${error instanceof Error ? error.message : error}`);
  }
}

export async function runDbUsageJob(notify?: (text: string) => Promise<void>) {
  if (running || !isSupabaseConfigured()) return;
  running = true;
  try {
    await loadDbUsage();
    if (!loaded) return;
    const mode = currentMode();
    if (mode !== alertedMode) {
      const report = usageReport();
      const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(2).replace('.', ',');
      const text = `Banco de dados (Supabase): modo ${MODE_TEXT[mode]}. Uso estimado nos ultimos 30 dias: ${gb(report.last30DaysBytes)} GB de ${gb(report.limitBytes)} GB (${report.percent.toString().replace('.', ',')}%).${mode === 'normal' ? '' : ' O sistema passou a consultar o banco menos vezes; as telas podem demorar um pouco mais para mostrar mudancas feitas por rotinas automaticas.'}`;
      await recordIntegrationEvent('db_alert', true, text, { mode });
      if (notify && mode !== 'normal') await notify(`⚠️ ${text}`).catch((error) => console.warn(`[Trafego do banco] aviso no WhatsApp falhou: ${error instanceof Error ? error.message : error}`));
      console.log(`[Trafego do banco] ${text}`);
      alertedMode = mode;
      takeDirty();
      await save(true);
      return;
    }
    if (takeDirty()) await save(false);
  } catch (error) {
    console.warn(`[Trafego do banco] erro: ${error instanceof Error ? error.message : error}`);
  } finally {
    running = false;
  }
}

async function save(force: boolean) {
  const day = usageDay();
  const details = { day, alertedMode, state: exportUsage() };
  const summary = `Trafego do banco: ${(usageReport().today.bytes / 1024 ** 2).toFixed(1)} MB hoje`;
  if (row && row.day === day) {
    const { error } = await getSupabaseAdmin().from('integration_events').update({ summary, details }).eq('id', row.id);
    if (!error) return;
    if (!force) console.warn(`[Trafego do banco] nao atualizou a medicao: ${error.message}`);
  }
  await recordIntegrationEvent('db_usage', true, summary, details);
  const [latest] = await listIntegrationEvents(1, ['db_usage']);
  row = latest ? { id: latest.id, day } : null;
}

// Antes de desligar (deploy novo), grava o que foi medido desde o ultimo salvamento.
export async function flushDbUsage() {
  if (!loaded || !isSupabaseConfigured() || !takeDirty()) return;
  try { await save(false); } catch { /* desligando */ }
}
