import type { IntegrationEvent } from './integration-health.js';

// Pagina de status (11/11/2026): servidor, banco, coleta do OFS, WhatsApp e backup, para a equipe saber o que caiu.
// Aberta sem login (quando o banco cai, o login tambem cai): so situacao e textos curtos, nada sensivel.
export type StatusLevel = 'ok' | 'warn' | 'down' | 'unknown';
export type StatusComponent = { key: string; label: string; status: StatusLevel; detail: string; checkedAt: string };
export type StatusInputs = {
  now: number;
  uptimeSeconds: number;
  version: string | null;
  database: { configured: boolean; ok: boolean; ms: number | null; error?: string; economyMode?: string };
  events: IntegrationEvent[];
  whatsapp: { configured: boolean; connected: boolean | null; loggedIn: boolean | null; error?: string; lastMessageAt: string | null };
  backupConfigured: boolean;
};

const ago = (iso: string, now: number) => {
  const minutes = (now - Date.parse(iso)) / 60_000;
  return minutes < 1 ? 'agora' : minutes < 60 ? `há ${Math.round(minutes)} min` : minutes < 1440 ? `há ${Math.round(minutes / 60)} h` : `há ${Math.round(minutes / 1440)} dia(s)`;
};
const duration = (seconds: number) => (seconds < 3600 ? `${Math.max(1, Math.round(seconds / 60))} min` : seconds < 86_400 ? `${Math.round(seconds / 3600)} h` : `${Math.round(seconds / 86_400)} dia(s)`);
// Coleta do OFS roda de hora em hora no horario de trabalho; de madrugada e normal ficar parada.
const isQuietHour = (now: number) => { const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date(now))) % 24; return hour < 7 || hour >= 22; };

export function buildSystemStatus(input: StatusInputs) {
  const checkedAt = new Date(input.now).toISOString();
  const components: StatusComponent[] = [];

  components.push({ key: 'server', label: 'Servidor (API)', status: 'ok', detail: `No ar há ${duration(input.uptimeSeconds)}${input.version ? ` · versão ${input.version}` : ''}.`, checkedAt });

  const db = input.database;
  components.push(!db.configured
    ? { key: 'database', label: 'Banco de dados', status: 'unknown', detail: 'Ambiente de demonstração (sem banco).', checkedAt }
    : !db.ok
      ? { key: 'database', label: 'Banco de dados', status: 'down', detail: `Sem resposta do banco${db.error ? `: ${db.error}` : ''}. Login e telas não carregam.`, checkedAt }
      : { key: 'database', label: 'Banco de dados', status: db.economyMode && db.economyMode !== 'normal' ? 'warn' : db.ms !== null && db.ms > 2000 ? 'warn' : 'ok', detail: `Respondeu em ${db.ms ?? '?'} ms.${db.economyMode && db.economyMode !== 'normal' ? ' Em modo economia (perto do limite de tráfego): as telas podem demorar a mostrar mudanças.' : ''}`, checkedAt });

  const exports = input.events.filter((event) => event.kind === 'export' && event.details?.stage !== 'alert').sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const lastOk = exports.find((event) => event.ok);
  const lastTry = exports[0];
  if (!lastTry) components.push({ key: 'ofs', label: 'Coleta do OFS (extensão)', status: 'unknown', detail: 'Nenhum envio do OFS registrado ainda.', checkedAt });
  else {
    const minutes = lastOk ? (input.now - Date.parse(lastOk.createdAt)) / 60_000 : Infinity;
    const quiet = isQuietHour(input.now);
    const status: StatusLevel = minutes <= 90 ? (lastTry.ok ? 'ok' : 'warn') : quiet ? 'ok' : minutes <= 180 ? 'warn' : 'down';
    const base = lastOk ? `Último envio certo ${ago(lastOk.createdAt, input.now)}.` : 'Nenhum envio certo recente.';
    const failure = !lastTry.ok ? ` A última tentativa falhou ${ago(lastTry.createdAt, input.now)}.` : '';
    const hint = status === 'down' ? ' Confira o computador da coleta (Chrome aberto, OFS logado).' : quiet && minutes > 90 ? ' Fora do horário de coleta.' : '';
    components.push({ key: 'ofs', label: 'Coleta do OFS (extensão)', status, detail: base + failure + hint, checkedAt });
  }

  const wa = input.whatsapp;
  const lastMessage = wa.lastMessageAt ? ` Última mensagem recebida ${ago(wa.lastMessageAt, input.now)}.` : '';
  components.push(!wa.configured
    ? { key: 'whatsapp', label: 'WhatsApp (acionamentos e avisos)', status: 'unknown', detail: 'WhatsApp não configurado neste servidor.', checkedAt }
    : wa.connected === null
      ? { key: 'whatsapp', label: 'WhatsApp (acionamentos e avisos)', status: 'warn', detail: `Não foi possível consultar o WuzAPI${wa.error ? ` (${wa.error})` : ''}.${lastMessage}`, checkedAt }
      : wa.connected && wa.loggedIn
        ? { key: 'whatsapp', label: 'WhatsApp (acionamentos e avisos)', status: 'ok', detail: `Conectado.${lastMessage}`, checkedAt }
        : { key: 'whatsapp', label: 'WhatsApp (acionamentos e avisos)', status: 'down', detail: `${wa.connected ? 'Conectado, mas sem login no WhatsApp (precisa ler o QR Code de novo).' : 'Desconectado.'} Acionamentos não chegam e avisos não saem.${lastMessage}`, checkedAt });

  const backups = input.events.filter((event) => event.kind === 'db_backup').sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const lastBackup = backups.find((event) => event.ok);
  components.push(!input.backupConfigured
    ? { key: 'backup', label: 'Backup diário do banco', status: 'unknown', detail: 'Backup no Google Drive ainda não configurado (Configurações → Backup do banco).', checkedAt }
    : lastBackup && input.now - Date.parse(lastBackup.createdAt) <= 30 * 3_600_000
      ? { key: 'backup', label: 'Backup diário do banco', status: backups[0].ok ? 'ok' : 'warn', detail: `Último backup certo ${ago(lastBackup.createdAt, input.now)}.`, checkedAt }
      : { key: 'backup', label: 'Backup diário do banco', status: 'warn', detail: lastBackup ? `Último backup certo ${ago(lastBackup.createdAt, input.now)} (mais de um dia).` : 'Nenhum backup certo ainda.', checkedAt });

  const order: StatusLevel[] = ['down', 'warn', 'ok', 'unknown'];
  const worst = components.filter((item) => item.status !== 'unknown').map((item) => item.status).sort((left, right) => order.indexOf(left) - order.indexOf(right))[0] ?? 'ok';
  return { status: worst, checkedAt, components };
}
