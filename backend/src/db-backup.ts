import { gunzipSync, gzipSync } from 'node:zlib';
import { getSupabaseAdmin, isSupabaseConfigured } from './integrations/supabase/client.js';
import { listIntegrationEvents, recordIntegrationEvent } from './store/integration-events.js';
import { OPERATIONAL_TIME_ZONE, toOperationalDate } from './timezone.js';

// Backup diario do banco (Supabase gratuito nao guarda backup). Todo dia a partir das 03:00 (Sao Paulo) o servidor
// le todas as tabelas, compacta (JSON + gzip) e manda para um Apps Script na conta Google do usuario, que guarda
// na pasta "JH RedeFlow - Backups" do Drive e apaga os com mais de 90 dias.
// Config no Render: BACKUP_DRIVE_URL (link do app da Web do Apps Script) e BACKUP_DRIVE_SECRET (o mesmo segredo
// que esta no codigo do script). Sem as duas, nao faz nada. Resultado de cada backup: integration_events db_backup.

// Tabelas do schema public (11/11/2026). Tabela nova precisa entrar aqui para ir no backup.
export const BACKUP_TABLES = [
  'calls', 'call_logs', 'call_observations', 'call_observation_attachments', 'activations', 'activation_processing',
  'technicians', 'technician_users', 'supervisors', 'profiles', 'roles', 'permissions', 'role_permissions',
  'user_avatars', 'user_notifications', 'operational_regions', 'olt_region_overrides', 'olt_region_requests',
  'ofs_workzone_clusters', 'manual_daily_bases', 'd0_base_records', 'checklist_templates', 'integration_events',
  'google_drive_sync_runs', 'google_drive_call_snapshots', 'wa_shared_themes',
] as const;

const NO_ID_TABLES = new Set(['manual_daily_bases', 'ofs_workzone_clusters', 'olt_region_overrides', 'operational_regions', 'role_permissions', 'technician_users', 'user_avatars']);

export const BACKUP_RETENTION_DAYS = 90;
export const BACKUP_HOUR = 3;
const PAGE = 1000;
const MAX_ATTEMPTS_PER_DAY = 4;
const RETRY_AFTER_MS = 30 * 60_000;

export type BackupFile = { name: string; gzip: Buffer; counts: Record<string, number>; rawBytes: number; createdAt: string };
export type BackupConfig = { url: string; secret: string };

export function backupConfig(env: NodeJS.ProcessEnv = process.env): BackupConfig | null {
  const url = (env.BACKUP_DRIVE_URL || '').trim();
  const secret = (env.BACKUP_DRIVE_SECRET || '').trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) && secret.length >= 16 ? { url, secret } : null;
}

// "redeflow-backup-2026-11-11-0300.json.gz" (horario de Sao Paulo).
export function backupFileName(date = new Date()) {
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: OPERATIONAL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace(':', '');
  return `redeflow-backup-${toOperationalDate(date)}-${time}.json.gz`;
}

export function packBackup(tables: Record<string, unknown[]>, users: unknown[], date = new Date()): BackupFile {
  const counts: Record<string, number> = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]));
  counts['auth.users'] = users.length;
  const json = JSON.stringify({ format: 'jh-redeflow-backup', version: 1, createdAt: date.toISOString(), counts, tables, authUsers: users });
  return { name: backupFileName(date), gzip: gzipSync(json, { level: 9 }), counts, rawBytes: Buffer.byteLength(json), createdAt: date.toISOString() };
}

// Para conferir/restaurar: abre o arquivo do Drive.
export function unpackBackup(gzip: Buffer) {
  return JSON.parse(gunzipSync(gzip).toString('utf8')) as { format: string; version: number; createdAt: string; counts: Record<string, number>; tables: Record<string, unknown[]>; authUsers: unknown[] };
}

// Hora de rodar? Depois das 03:00 de Sao Paulo, sem backup certo hoje, ate 4 tentativas por dia com 30 min entre elas.
export type BackupState = { lastSuccessDay: string | null; failedDay: string | null; attempts: number; lastAttemptAt: number };
export function shouldRunBackup(state: BackupState, now = new Date()) {
  const day = toOperationalDate(now);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: OPERATIONAL_TIME_ZONE, hour: '2-digit', hour12: false }).format(now));
  if (hour < BACKUP_HOUR || state.lastSuccessDay === day) return false;
  if (state.failedDay !== day) return true;
  return state.attempts < MAX_ATTEMPTS_PER_DAY && now.getTime() - state.lastAttemptAt >= RETRY_AFTER_MS;
}

async function readTable(name: string) {
  const admin = getSupabaseAdmin();
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    // Paginas ordenadas pelo id; as tabelas sem coluna id sao pequenas (menos de 1000 linhas) e vem numa pagina so.
    const query = admin.from(name).select('*');
    const { data, error } = await (NO_ID_TABLES.has(name) ? query : query.order('id', { ascending: true })).range(from, from + PAGE - 1);
    if (error) {
      if (/does not exist|Could not find the table/i.test(error.message)) return null;
      throw new Error(`${name}: ${error.message}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

// Logins (auth.users): so dados de cadastro, sem senha. Numa restauracao cada pessoa redefine a senha.
async function readAuthUsers() {
  const users: unknown[] = [];
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth.users: ${error.message}`);
    users.push(...data.users.map((user) => ({ id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at, user_metadata: user.user_metadata, app_metadata: user.app_metadata })));
    if (data.users.length < 1000) break;
  }
  return users;
}

export async function buildBackup(date = new Date()): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const name of BACKUP_TABLES) {
    const rows = await readTable(name);
    if (rows) tables[name] = rows;
  }
  return packBackup(tables, await readAuthUsers(), date);
}

// Manda para o Apps Script. O Google responde com um redirecionamento (302) para o resultado: o fetch segue.
export async function sendBackupToDrive(file: BackupFile, config: BackupConfig, fetcher: typeof fetch = fetch) {
  const response = await fetcher(config.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ segredo: config.secret, nome: file.name, conteudo: file.gzip.toString('base64'), dias: BACKUP_RETENTION_DAYS }),
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  let body: { ok?: boolean; erro?: string; id?: string; nome?: string; tamanho?: number; apagados?: number } = {};
  try { body = JSON.parse(text); } catch { throw new Error(`Apps Script respondeu HTTP ${response.status} sem JSON (confira se foi implantado como app da Web com acesso "Qualquer pessoa").`); }
  if (!response.ok || !body.ok) throw new Error(body.erro === 'segredo' ? 'Segredo diferente do que esta no Apps Script (BACKUP_DRIVE_SECRET).' : `Apps Script: ${body.erro || `HTTP ${response.status}`}`);
  return { fileId: body.id || '', size: body.tamanho || file.gzip.length, removed: body.apagados || 0 };
}

const state: BackupState = { lastSuccessDay: null, failedDay: null, attempts: 0, lastAttemptAt: 0 };
let loaded = false;
let running = false;

async function loadState() {
  if (loaded) return;
  const events = await listIntegrationEvents(48, ['db_backup']);
  const success = events.find((event) => event.ok);
  if (success) state.lastSuccessDay = toOperationalDate(success.createdAt);
  loaded = true;
}

export async function runBackupNow(notify?: (text: string) => Promise<void>) {
  const config = backupConfig();
  if (!config) throw new Error('Backup nao configurado: faltam BACKUP_DRIVE_URL e BACKUP_DRIVE_SECRET no Render.');
  if (!isSupabaseConfigured()) throw new Error('Sem banco configurado (modo demonstracao).');
  if (running) throw new Error('Ja tem um backup em andamento.');
  running = true;
  const started = Date.now();
  const day = toOperationalDate();
  try {
    const file = await buildBackup();
    const sent = await sendBackupToDrive(file, config);
    const mb = (file.gzip.length / 1024 ** 2).toFixed(1).replace('.', ',');
    const total = Object.values(file.counts).reduce((sum, value) => sum + value, 0);
    const summary = `Backup ${file.name}: ${mb} MB no Drive, ${total} linhas de ${Object.keys(file.counts).length} tabelas.`;
    await recordIntegrationEvent('db_backup', true, summary, { name: file.name, fileId: sent.fileId, gzipBytes: file.gzip.length, rawBytes: file.rawBytes, counts: file.counts, removed: sent.removed, ms: Date.now() - started });
    Object.assign(state, { lastSuccessDay: day, failedDay: null, attempts: 0 });
    console.log(`[Backup] ${summary}`);
    return { ok: true as const, summary, name: file.name, gzipBytes: file.gzip.length, counts: file.counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (state.failedDay !== day) Object.assign(state, { failedDay: day, attempts: 0 });
    state.attempts += 1;
    state.lastAttemptAt = Date.now();
    await recordIntegrationEvent('db_backup', false, `Backup falhou: ${message}`.slice(0, 500), { attempt: state.attempts });
    console.warn(`[Backup] falhou (tentativa ${state.attempts}): ${message}`);
    if (notify && state.attempts === MAX_ATTEMPTS_PER_DAY) await notify(`⚠️ Backup diario do banco falhou ${MAX_ATTEMPTS_PER_DAY} vezes hoje: ${message}`).catch(() => undefined);
    throw error;
  } finally {
    running = false;
  }
}

// Chamado a cada 5 min junto com as outras rotinas.
export async function runBackupJob(notify?: (text: string) => Promise<void>) {
  if (running || !backupConfig() || !isSupabaseConfigured()) return;
  try {
    await loadState();
    if (!shouldRunBackup(state)) return;
    await runBackupNow(notify);
  } catch { /* ja registrado em integration_events */ }
}

export async function backupStatus() {
  const events = await listIntegrationEvents(14 * 24, ['db_backup']);
  return {
    configured: Boolean(backupConfig()),
    retentionDays: BACKUP_RETENTION_DAYS,
    hour: BACKUP_HOUR,
    running,
    scriptTemplate: APPS_SCRIPT_TEMPLATE,
    history: events.slice(0, 20).map((event) => ({ ok: event.ok, summary: event.summary, createdAt: event.createdAt, gzipBytes: typeof event.details.gzipBytes === 'number' ? event.details.gzipBytes : null })),
  };
}

// Codigo do Apps Script que a pessoa cola na conta Google dela (Configuracoes > Backup). "__SEGREDO__" e trocado
// pelo segredo gerado na tela, que tambem vai em BACKUP_DRIVE_SECRET no Render.
export const APPS_SCRIPT_TEMPLATE = [
  '// JH RedeFlow - recebe o backup diario do banco e guarda no seu Google Drive.',
  '// Implantar > Nova implantacao > App da Web: Executar como "Eu", Quem pode acessar "Qualquer pessoa".',
  "const SEGREDO = '__SEGREDO__';",
  "const PASTA = 'JH RedeFlow - Backups';",
  '',
  'function doPost(e) {',
  '  try {',
  '    const corpo = JSON.parse(e.postData.contents);',
  "    if (corpo.segredo !== SEGREDO) return resposta({ ok: false, erro: 'segredo' });",
  "    if (!/^redeflow-backup-[0-9-]+\\.json\\.gz$/.test(corpo.nome || '')) return resposta({ ok: false, erro: 'nome invalido' });",
  '    const pasta = pegarPasta();',
  "    const arquivo = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(corpo.conteudo), 'application/gzip', corpo.nome));",
  '    const apagados = limpar(pasta, Number(corpo.dias) || 90);',
  '    return resposta({ ok: true, id: arquivo.getId(), nome: arquivo.getName(), tamanho: arquivo.getSize(), apagados: apagados });',
  '  } catch (erro) {',
  '    return resposta({ ok: false, erro: String((erro && erro.message) || erro) });',
  '  }',
  '}',
  '',
  'function pegarPasta() {',
  '  const pastas = DriveApp.getFoldersByName(PASTA);',
  '  return pastas.hasNext() ? pastas.next() : DriveApp.createFolder(PASTA);',
  '}',
  '',
  '// Manda para a lixeira os backups mais velhos que o prazo, mas sempre guarda os 7 mais novos.',
  'function limpar(pasta, dias) {',
  '  const limite = Date.now() - dias * 86400000;',
  '  const lista = [];',
  '  const arquivos = pasta.getFiles();',
  '  while (arquivos.hasNext()) {',
  '    const arquivo = arquivos.next();',
  '    if (/^redeflow-backup-/.test(arquivo.getName())) lista.push(arquivo);',
  '  }',
  '  lista.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });',
  '  let apagados = 0;',
  '  lista.slice(7).forEach(function (arquivo) {',
  '    if (arquivo.getDateCreated().getTime() < limite) { arquivo.setTrashed(true); apagados++; }',
  '  });',
  '  return apagados;',
  '}',
  '',
  'function resposta(objeto) {',
  '  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);',
  '}',
  '',
].join('\n');
