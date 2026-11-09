import 'dotenv/config';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { acceptOltRegionRequest, addCustomOperationalRegion, addObservation, addRole, addSupervisor, addTechnician, addUser, cancelCall, captureUnknownOltRequestsFromCalls, changeUserPassword, clearD0Base, decideActivation, deleteAllCalls, deleteCall, deleteManualDailyBase, deleteSupervisor, deleteTechnician, deleteUser, deleteUserAvatar, findExistingCallIdentifiers, finishCall, getAuthUser, getCall, getD0BaseSummary, getDashboardMetrics, getManualDailyBase, getObservationAttachment, getRoleById, getSupervisorIdForUser, listAllAuditLogs, listAuditLogPage, listObservationsInRange, getSettings, getUserAvatar, getUserAvatars, getUserBanners, saveUserBanner, getUserPreferences, saveUserPreferences, getUserByEmail, ignoreOltRegionRequest, insertHistoricalCalls, insertWorkbookCalls, listActivations, getActivation, listAuditLogs, listCalls, listCallsPage, listCustomOperationalRegions, listImports, listNotifications, listObservations, listOltRegionMappings, listOltRegionRequests, listPermissions, listRoles, listSupervisors, listTechnicians, listUsers, receiveActivation, reopenCall, replaceD0Base, applyOfsRowsToCalls, saveImport, saveManualDailyBase, saveOltRegionMappings, saveUserAvatar, updateCall, updateCallEndDate, updateRole, updateSettings, updateSupervisor, updateTechnician, updateUser, validatePassword } from './store.js';
import { extractOperationalData, parseIncomingMessage } from './integrations/wuzapi/client.js';
import { analyzeOperationalMessage, interpretWithGemini } from './integrations/wuzapi/semantic.js';
import { calculateIgpMetrics, calculateIgpPlan, normalizeCluster } from './igp.js';
import { calculateSlaAnalysis, lateFinishedCalls } from './sla-analysis.js';
import { bottleneckReport, closingReasonsReport, comparePeriods, dailySummary, dailySummaryText, heatmapReport, productivityReport, repeatRanking } from './reports.js';
import { queueMap, repeatFlags, repeatHistory, technicianLoad } from './operations.js';
import { activeStatus, findMentions, monthHighlights } from './team.js';
import { ESCALATION_LABEL, escalations, escalationText, integrationOutage, outageText, recoveryText } from './alerts.js';
import { buildRiskModel, callRisk, massIncidents, suggestTechnicians, type RiskModel } from './assist.js';
import { checklistFor, checklistNote, FIELD_STATUSES, missingChecklistItems } from './field.js';
import { listChecklistTemplates, listTechnicianLinks, saveChecklistTemplates, setTechnicianUser, technicianIdForUser } from './store/field.js';
import { createUserNotifications, getUserStatuses, listUnreadNotifications, markNotificationsRead, saveUserStatus } from './store/team.js';
import { parseImport } from './imports/parser.js';
import { findHistoricalTechnician, normalizeHistoricalIdentifier, parseHistoricalActivationWorkbook, type HistoricalActivationCandidate } from './imports/historical-activations.js';
import { parseCurrentCallsWorkbook, type CurrentCallsCandidate } from './imports/current-calls.js';
import { hasD0Identifiers } from './imports/d0.js';
import { callsReadyToFinish, matchOfsClosing, pendingClosingOrders } from './imports/ofs-closing.js';
import { applyClusterExport, assignClustersFromWorkzones } from './store/clusters.js';
import { countRowsForDate, parseOfsActivityExport } from './imports/ofs-export.js';
import { registerMissingHistoricalTechnicians } from './imports/historical-technicians.js';
import { addDays, normalizeSaoPauloLocal, toOperationalDate } from './timezone.js';
import { timingSafeEqual } from 'node:crypto';
import { authenticateSupabaseUser, checkSupabaseConnection, getSupabaseProfile, isSupabaseConfigured, isSupabaseRuntime } from './integrations/supabase/client.js';
import type { ActivationAnalysis, AuthUser, CallObservationAttachmentInput, CallStatus, PermissionCode } from './types.js';
import { clearPresence, presenceOf, touchPresence } from './presence.js';
import { cacheReadModel, invalidateOnWrite } from './read-cache.js';
import { runDailyReset } from './daily-reset-job.js';
import { buildExtensionZip, extensionInfo } from './extension-package.js';
import { latestObservations } from './store/observations.js';
import { createPublicViewToken, extractAllSlotPons, extractNoticeAddresses, isNoticeOlt, isOltNoticeMessage, OLT_NOTICE_DEFAULT_CHAT, OLT_NOTICE_TEST_CHAT, publicViewExpired, readPublicViewToken } from './olt-notice.js';
import { dueSoonCalls } from './due-soon.js';
import { healthChecks, STUCK_REASON_LABEL, stuckOfsCalls } from './integration-health.js';
import { BELL_WINDOW_MINUTES, nearDeadlineCalls, WHATSAPP_WINDOW_MINUTES, whatsappAlertText } from './sla-alerts.js';
import { listIntegrationEvents, recordIntegrationEvent } from './store/integration-events.js';
import { sendWhatsAppText, whatsappConfig } from './integrations/wuzapi/sender.js';
import { deliverOltNotice } from './olt-notice-delivery.js';

const app = express();
const port = Number(process.env.PORT || 3333);
const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET || (!isProduction ? 'local-demo-secret-change-me' : undefined);
const wuzapiWebhookToken = process.env.WUZAPI_WEBHOOK_TOKEN || (!isProduction ? 'local-wuzapi-demo-token' : undefined);
const activationGroupIds = [...new Set((process.env.WUZAPI_ACTIVATION_GROUP_ID || '').split(',').map((groupId) => groupId.trim()).filter(Boolean))];
const wuzapiDebug = process.env.WUZAPI_DEBUG === 'true';
const skipWuzapiGroupFilter = process.env.WUZAPI_SKIP_GROUP_FILTER === 'true';
const ofsIngestToken = process.env.OFS_INGEST_TOKEN?.trim() || undefined;
const OFS_COLLECTOR_SCOPE = 'ofs-collector';
const corsOrigins = [...new Set(['https://jh-rede.vercel.app', ...(process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((origin) => origin.trim()).filter(Boolean)])];
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
type PendingHistoricalImport = { userId: string; fileName: string; candidates: HistoricalActivationCandidate[]; expiresAt: number };
const pendingHistoricalImports = new Map<string, PendingHistoricalImport>();
type PendingCurrentCallsImport = { userId: string; fileName: string; candidates: CurrentCallsCandidate[]; expiresAt: number };
const pendingCurrentCallsImports = new Map<string, PendingCurrentCallsImport>();
const processedWebhookMessages = new Map<string, { activationId: string; expiresAt: number }>();
const webhookDeduplicationWindowMs = 24 * 60 * 60 * 1000;
const loginAttemptWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 5;
if (isProduction && (!jwtSecret || !wuzapiWebhookToken || (!activationGroupIds.length && !skipWuzapiGroupFilter))) {
  throw new Error('JWT_SECRET, WUZAPI_WEBHOOK_TOKEN e WUZAPI_ACTIVATION_GROUP_ID sao obrigatorios em producao.');
}
if (isSupabaseConfigured() && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_ANON_KEY)) {
  throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios quando o Supabase estiver configurado.');
}
app.disable('x-powered-by');
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
// ETag exposto: o navegador pergunta "mudou algo?" (If-None-Match) e recebe 304 sem corpo quando nada mudou.
app.use(cors({ origin: corsOrigins, credentials: true, exposedHeaders: ['ETag', 'Content-Disposition'] }));
app.use((request, response, next) => {
  if (request.method === 'GET' && request.path.startsWith('/api/')) {
    response.setHeader('Cache-Control', 'private, no-cache');
    // Com If-None-Match o fetch do navegador acrescenta "Cache-Control: no-cache" sozinho, e isso faria o Express
    // ignorar o ETag. Quem perguntou "mudou algo?" quer exatamente a revalidacao: o ETag decide.
    if (request.headers['if-none-match']) { delete request.headers['cache-control']; delete request.headers.pragma; }
  }
  next();
});
app.use(invalidateOnWrite);
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

function normalizeWuzApiBody(request: Request): unknown {
  if (request.body && typeof request.body === 'string') {
    try {
      return JSON.parse(request.body);
    } catch {
      return request.body;
    }
  }
  if (request.body && typeof request.body === 'object') {
    const body = request.body as Record<string, unknown>;
    if (body.jsonData && typeof body.jsonData === 'string') {
      try {
        return JSON.parse(body.jsonData);
      } catch {
        return body.jsonData;
      }
    }
    return body;
  }
  return request.body;
}

function redactWuzApiPayload(request: Request, body: unknown) {
  const payload = body && typeof body === 'object' ? structuredClone(body) as Record<string, unknown> : body;
  const headers = { ...request.headers } as Record<string, unknown>;
  if (headers.authorization) headers.authorization = '[REDACTED]';
  if (headers['x-wuzapi-token']) headers['x-wuzapi-token'] = '[REDACTED]';
  if (headers['x-webhook-token']) headers['x-webhook-token'] = '[REDACTED]';
  const redact = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['token', 'authorization', 'Authorization', 'x-wuzapi-token', 'x-webhook-token'].includes(key.toLowerCase())) {
        (value as Record<string, unknown>)[key] = '[REDACTED]';
      } else {
        redact(child);
      }
    }
  };
  if (payload && typeof payload === 'object') {
    redact(payload);
  }
  return { headers, body: payload };
}

function extractWuzApiToken(request: Request, body: unknown): string | undefined {
  const source = (body && typeof body === 'object' ? body as Record<string, unknown> : {}) as Record<string, unknown>;
  const rawToken = request.headers['x-wuzapi-token'] || request.headers['x-webhook-token'] || request.headers['x-api-key'] || request.headers.apikey || request.headers.token || request.query.token || source.token || source.webhookToken || request.headers.authorization?.replace(/^Bearer\s+/i, '');
  return typeof rawToken === 'string' ? rawToken : undefined;
}

function logWuzApiDecision(stage: string, details: Record<string, unknown>) {
  if (wuzapiDebug) console.log(`[WuzAPI] ${stage}`, JSON.stringify(details));
}

type AuthRequest = Request & { authUser?: AuthUser };
async function auth(request: AuthRequest, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) return response.status(401).json({ message: 'Sessao nao encontrada.' });
  try {
    const payload = jwt.verify(token, jwtSecret!) as { sub: string; scope?: string };
    // Sessao da extensao (30 dias) so serve para enviar o export do OFS.
    if (payload.scope === OFS_COLLECTOR_SCOPE) return response.status(401).json({ message: 'Sessao da extensao nao vale para o sistema.' });
    if (isSupabaseConfigured()) {
      const supabaseUser = await getSupabaseProfile(payload.sub);
      if (!supabaseUser || !supabaseUser.active) return response.status(401).json({ message: 'Sessao invalida.' });
      request.authUser = supabaseUser;
    } else {
      const localUsers = await listUsers();
      const localUser = localUsers.find((item) => item.id === payload.sub);
      if (!localUser || !localUser.active) return response.status(401).json({ message: 'Sessao invalida.' });
      request.authUser = getAuthUser(localUser);
    }
    if (request.authUser.mustChangePassword && request.path !== '/api/auth/me' && request.path !== '/api/auth/change-password') {
      return response.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Troque sua senha para continuar.' });
    }
    touchPresence(request.authUser.id);
    next();
  } catch { return response.status(401).json({ message: 'Sessao expirada ou invalida.' }); }
}
function requirePermission(permission: PermissionCode) {
  return (request: AuthRequest, response: Response, next: NextFunction) => {
    if (!request.authUser?.role.permissions.includes(permission)) return response.status(403).json({ message: 'Voce nao possui essa permissao.' });
    next();
  };
}
async function getScopedCallQuery(request: AuthRequest, scopeToSupervisor = false) {
  const from = typeof request.query.from === 'string' ? request.query.from : undefined;
  const to = typeof request.query.to === 'string' ? request.query.to : undefined;
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) throw new Error('Periodo invalido.');
  if (scopeToSupervisor && request.authUser?.role.name === 'Supervisor') {
    const supervisorId = await getSupervisorIdForUser(request.authUser.id);
    if (!supervisorId) throw new Error('Supervisor sem equipe vinculada.');
    return { from, to, supervisorId };
  }
  return { from, to };
}
function getLoginAttemptKey(request: Request, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const remoteAddress = request.ip || request.socket?.remoteAddress || 'unknown';
  return `${remoteAddress}:${normalizedEmail}`;
}
function isLoginRateLimited(request: Request, email: string) {
  const key = getLoginAttemptKey(request, email);
  const now = Date.now();
  const current = loginAttempts.get(key);

  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + loginAttemptWindowMs });
    return false;
  }

  const nextCount = current.count + 1;
  loginAttempts.set(key, { count: nextCount, resetAt: current.resetAt });
  return nextCount > maxLoginAttempts;
}
function clearLoginAttempts(request: Request, email: string) {
  loginAttempts.delete(getLoginAttemptKey(request, email));
}

app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'jh-redeflow-api' }));
app.get('/health/supabase', async (_request, response) => {
  const result = await checkSupabaseConnection();
  return response.status(result.connected ? 200 : 503).json({ configured: result.configured, connected: result.connected, error: result.connected ? undefined : result.error });
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
type CredentialResult = { user: AuthUser } | { status: number; message: string };
// E-mail e senha do sistema (Supabase ou demo), com o mesmo limite de tentativas do login.
async function checkCredentials(request: Request, email: string, password: string): Promise<CredentialResult> {
  if (isLoginRateLimited(request, email)) return { status: 429, message: 'Muitas tentativas de login. Tente novamente mais tarde.' };
  if (isSupabaseConfigured()) {
    try {
      const supabaseUser = await authenticateSupabaseUser(email, password);
      if (!supabaseUser) return { status: 401, message: 'E-mail, senha ou perfil incorretos.' };
      clearLoginAttempts(request, email);
      return { user: supabaseUser };
    } catch {
      return { status: 401, message: 'Nao foi possivel autenticar no Supabase.' };
    }
  }
  const user = getUserByEmail(email);
  if (!user || !user.active || !validatePassword(user, password)) return { status: 401, message: 'E-mail ou senha incorretos.' };
  clearLoginAttempts(request, email);
  return { user: getAuthUser(user) };
}
app.post('/api/auth/login', async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Informe e-mail e senha validos.' });
  const result = await checkCredentials(request, parsed.data.email, parsed.data.password);
  if (!('user' in result)) return response.status(result.status).json({ message: result.message });
  const token = jwt.sign({ sub: result.user.id }, jwtSecret!, { expiresIn: '8h' });
  return response.json({ token, user: result.user });
});
app.get('/api/auth/me', auth, (request: AuthRequest, response) => response.json({ user: request.authUser }));
app.get('/api/auth/avatar', auth, async (request: AuthRequest, response) => {
  try { return response.json({ avatarDataUrl: await getUserAvatar(request.authUser!.id) }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar a foto de perfil.' }); }
});
app.put('/api/auth/avatar', auth, async (request: AuthRequest, response) => {
  // Foto: JPEG/PNG/WebP ja reduzida (ate 350 KB). GIF animado vai sem reducao: ate 2 MB (~2,8 MB em base64).
  const parsed = z.object({ avatarDataUrl: z.string().regex(/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/).refine((value) => value.length <= (value.startsWith('data:image/gif') ? 2_800_000 : 350_000)) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Envie uma foto JPEG, PNG ou WebP com ate 350 KB depois da compactacao.' });
  try {
    const saved = await saveUserAvatar(request.authUser!.id, parsed.data.avatarDataUrl);
    if (!saved) return response.status(404).json({ message: 'Usuario nao encontrado.' });
    return response.json({ avatarDataUrl: parsed.data.avatarDataUrl });
  } catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel salvar a foto de perfil.' }); }
});
app.delete('/api/auth/avatar', auth, async (request: AuthRequest, response) => {
  try {
    await deleteUserAvatar(request.authUser!.id);
    return response.json({ deleted: true });
  } catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel remover a foto de perfil.' }); }
});
// Preferencias do perfil: apelido opcional (so aparece para a propria pessoa) e tema de cor.
const PALETTE_IDS = ['padrao', 'jh-azul', 'ardosia', 'nevoa', 'flor', 'aurora', 'neon'] as const;
app.get('/api/auth/preferences', auth, async (request: AuthRequest, response) => {
  try { return response.json(await getUserPreferences(request.authUser!.id)); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar o perfil.' }); }
});
app.put('/api/auth/preferences', auth, async (request: AuthRequest, response) => {
  const parsed = z.object({
    nickname: z.string().trim().max(40).nullish().transform((value) => value || null),
    palette: z.enum(PALETTE_IDS).nullish().transform((value) => (value && value !== 'padrao' ? value : null)),
  }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Apelido com ate 40 caracteres e um tema valido.' });
  try { return response.json(await saveUserPreferences(request.authUser!.id, parsed.data)); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel salvar o perfil.' }); }
});

// Status personalizado (como no Discord): emoji + texto, opcionalmente ate uma hora. Aparece na aba Pessoas.
app.get('/api/auth/status', auth, async (request: AuthRequest, response) => {
  try { return response.json({ status: activeStatus((await getUserStatuses([request.authUser!.id]))[request.authUser!.id]) }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar o status.' }); }
});
app.put('/api/auth/status', auth, async (request: AuthRequest, response) => {
  const parsed = z.object({ text: z.string().trim().max(60).default(''), emoji: z.string().trim().max(16).default(''), until: z.string().datetime().nullish() }).nullable().safeParse(request.body?.status === null ? null : request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Status com ate 60 caracteres.' });
  const status = parsed.data && (parsed.data.text || parsed.data.emoji) ? { text: parsed.data.text, emoji: parsed.data.emoji, until: parsed.data.until ?? null } : null;
  if (status?.until && Date.parse(status.until) <= Date.now()) return response.status(400).json({ message: 'O horario para limpar o status ja passou.' });
  try { await saveUserStatus(request.authUser!.id, status); return response.json({ status }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel salvar o status.' }); }
});

// LGPD (art. 18): a propria pessoa baixa os dados pessoais que o sistema guarda sobre ela. So os proprios dados;
// as alteracoes que ela fez em chamados vao do ultimo ano (ate 2.000), sem dados de clientes alem do numero da ordem.
app.get('/api/auth/meus-dados', auth, async (request: AuthRequest, response) => {
  const user = request.authUser!;
  try {
    const toIso = new Date().toISOString();
    const fromIso = new Date(Date.now() - 365 * 86_400_000).toISOString();
    const [preferences, statuses, avatar, banners, technicianId, audit] = await Promise.all([
      getUserPreferences(user.id),
      getUserStatuses([user.id]),
      getUserAvatar(user.id),
      getUserBanners([user.id]),
      technicianIdForUser(user.id),
      listAuditLogPage({ fromIso, toIso }, { userId: user.id }, 1, 2000),
    ]);
    return response.json({
      generatedAt: toIso,
      account: { id: user.id, name: user.name, email: user.email, role: user.role?.name ?? null, permissions: user.role?.permissions ?? [], active: user.active },
      preferences,
      status: activeStatus(statuses[user.id]) ?? null,
      profilePhoto: avatar ?? null,
      banner: banners[user.id] ?? null,
      linkedTechnicianId: technicianId ?? null,
      presence: presenceOf(user.id),
      changesLastYear: { total: audit.total, items: audit.logs.map((log) => ({ at: log.createdAt, orderNumber: log.orderNumber, field: log.field })) },
    });
  } catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel reunir os seus dados.' }); }
});

// Banner do perfil (1 imagem larga JPEG/PNG/WebP, ja reduzida no navegador).
app.get('/api/auth/banner', auth, async (request: AuthRequest, response) => {
  try { return response.json({ bannerDataUrl: (await getUserBanners([request.authUser!.id]))[request.authUser!.id] ?? null }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar o banner.' }); }
});
app.put('/api/auth/banner', auth, async (request: AuthRequest, response) => {
  // Foto: JPEG/PNG/WebP ja reduzida (ate 700 KB). GIF animado vai sem reducao: ate 3 MB (~4,2 MB em base64).
  const parsed = z.object({ bannerDataUrl: z.string().regex(/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/).refine((value) => value.length <= (value.startsWith('data:image/gif') ? 4_200_000 : 700_000)) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Envie um banner JPEG, PNG ou WebP com ate 700 KB depois da compactacao, ou um GIF de ate 3 MB.' });
  try {
    await saveUserBanner(request.authUser!.id, parsed.data.bannerDataUrl);
    return response.json({ bannerDataUrl: parsed.data.bannerDataUrl });
  } catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel salvar o banner.' }); }
});
app.delete('/api/auth/banner', auth, async (request: AuthRequest, response) => {
  try { await saveUserBanner(request.authUser!.id, null); return response.json({ deleted: true }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel remover o banner.' }); }
});
app.post('/api/auth/change-password', auth, async (request: AuthRequest, response) => {
  if (!request.authUser?.mustChangePassword) return response.status(409).json({ message: 'A troca inicial de senha ja foi concluida.' });
  const parsed = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Informe sua senha atual e uma nova senha com pelo menos 8 caracteres.' });
  const result = await changeUserPassword(request.authUser.id, parsed.data.currentPassword, parsed.data.newPassword);
  if (result.error === 'invalid-current-password') return response.status(400).json({ message: 'A senha atual esta incorreta.' });
  if (result.error === 'same-password') return response.status(400).json({ message: 'A nova senha deve ser diferente da senha atual.' });
  if (!result.user) return response.status(404).json({ message: 'Usuario nao encontrado.' });
  return response.json({ user: result.user });
});
app.get('/api/dashboards/operacao', auth, requirePermission('dashboard.view'), cacheReadModel, async (request: AuthRequest, response) => {
  try { return response.json({ metrics: await getDashboardMetrics(await getScopedCallQuery(request)) }); }
  catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar o dashboard.' }); }
});
// Analise de prazo: tecnicos/bairros que mais perdem, horario de abertura, entrantes e estudo noturno (18h-06h).
app.get('/api/dashboards/prazo', auth, requirePermission('dashboard.view'), cacheReadModel, async (request: AuthRequest, response) => {
  const parsed = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), area: z.enum(['ALL', 'SP', 'GRU', 'ALTO_TIETE', 'ABC', 'OUTRAS']).default('ALL') }).safeParse(request.query);
  if (!parsed.success || parsed.data.from > parsed.data.to) return response.status(400).json({ message: 'Informe um periodo valido (de/ate no formato AAAA-MM-DD).' });
  try {
    const scopedQuery = await getScopedCallQuery(request, true);
    const calls = await listCalls(undefined, scopedQuery);
    return response.json({ analysis: calculateSlaAnalysis(calls, parsed.data.from, parsed.data.to, parsed.data.area) });
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel calcular a analise de prazo.' });
  }
});
// Relatorios. "fora-do-prazo": finalizados no periodo (Data Fim) com mais de 6h entre abertura e fim.
// Relatorios do lote 2: produtividade, motivos de fechamento, comparar periodos e resumo do dia. Mesmo escopo
// de supervisor dos outros relatorios. A lista vem sem filtro de data (o periodo e aplicado pela Data Fim/abertura
// em reports.ts, e o "periodo anterior" fica fora de from/to).
const reportQuery = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), area: z.enum(['ALL', 'SP', 'GRU', 'ALTO_TIETE', 'ABC', 'OUTRAS']).default('ALL') });
async function reportCalls(request: AuthRequest, statuses?: CallStatus[]) {
  const scope = await getScopedCallQuery(request, true);
  return listCalls(statuses, { supervisorId: 'supervisorId' in scope ? scope.supervisorId : undefined });
}
function reportRoute(path: string, statuses: CallStatus[] | undefined, build: (calls: Awaited<ReturnType<typeof listCalls>>, from: string, to: string, area: z.infer<typeof reportQuery>['area']) => unknown) {
  app.get(path, auth, requirePermission('dashboard.view'), cacheReadModel, async (request: AuthRequest, response) => {
    const parsed = reportQuery.safeParse(request.query);
    if (!parsed.success || parsed.data.from > parsed.data.to) return response.status(400).json({ message: 'Informe um periodo valido (de/ate no formato AAAA-MM-DD).' });
    try { return response.json(build(await reportCalls(request, statuses), parsed.data.from, parsed.data.to, parsed.data.area)); }
    catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel gerar o relatorio.' }); }
  });
}
reportRoute('/api/relatorios/produtividade', ['Finalizado'], productivityReport);
reportRoute('/api/relatorios/motivos', ['Finalizado'], closingReasonsReport);
reportRoute('/api/relatorios/comparar', undefined, comparePeriods);
reportRoute('/api/relatorios/gargalos', ['Finalizado'], bottleneckReport);
reportRoute('/api/relatorios/mapa-de-calor', undefined, heatmapReport);
reportRoute('/api/relatorios/reincidencia-tecnico', undefined, repeatRanking);
// (14) Exportacao completa (Configuracoes, so administrador): chamados abertos ou finalizados no periodo, todas as
// observacoes e todo o historico de alteracoes do periodo. Ate 366 dias por vez; a planilha e montada no navegador.
app.get('/api/exportacao', auth, requirePermission('settings.manage'), async (request, response) => {
  const parsed = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(request.query);
  if (!parsed.success || parsed.data.from > parsed.data.to) return response.status(400).json({ message: 'Informe um periodo valido (de/ate no formato AAAA-MM-DD).' });
  const days = (Date.parse(`${parsed.data.to}T12:00:00Z`) - Date.parse(`${parsed.data.from}T12:00:00Z`)) / 86_400_000 + 1;
  if (days > 366) return response.status(400).json({ message: 'Exporte no maximo 366 dias por vez.' });
  try {
    const fromIso = new Date(`${parsed.data.from}T00:00:00-03:00`).toISOString();
    const toIso = new Date(`${parsed.data.to}T23:59:59.999-03:00`).toISOString();
    const inRange = (iso?: string | null) => Boolean(iso) && iso! >= fromIso && iso! <= toIso;
    const [calls, observations, logs] = await Promise.all([listCalls(), listObservationsInRange({ fromIso, toIso }), listAllAuditLogs({ fromIso, toIso }, 50_000)]);
    const scoped = calls.filter((call) => inRange(call.openedAt) || inRange(call.executedAt));
    return response.json({ calls: scoped.map(({ lastObservationAt: _last, ...call }) => call), observations: observations.rows, logs: logs.logs, truncated: observations.truncated || logs.truncated });
  } catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel exportar.' }); }
});
app.get('/api/relatorios/resumo-dia', auth, requirePermission('dashboard.view'), cacheReadModel, async (request: AuthRequest, response) => {
  const date = typeof request.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(request.query.date) ? request.query.date : addDays(toOperationalDate(), -1);
  try {
    const summary = dailySummary(await reportCalls(request), date);
    const config = whatsappConfig();
    return response.json({ summary, text: dailySummaryText(summary), whatsapp: { configured: Boolean(config), sendsAt: '07:00' } });
  } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel gerar o resumo.' }); }
});

// Lote 3 (operacao): mapa da fila por regiao/bairro, carga dos tecnicos e reincidencia. Escopo do supervisor.
const ACTIVE_STATUSES: CallStatus[] = ['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo'];
app.get('/api/operacao/mapa', auth, requirePermission('calls.view'), cacheReadModel, async (request: AuthRequest, response) => {
  try { return response.json(queueMap(await reportCalls(request, ACTIVE_STATUSES))); }
  catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel montar o mapa.' }); }
});
app.get('/api/operacao/carga', auth, requirePermission('calls.view'), cacheReadModel, async (request: AuthRequest, response) => {
  try {
    const scope = await getScopedCallQuery(request, true);
    const supervisorId = 'supervisorId' in scope ? scope.supervisorId : undefined;
    const technicians = (await listTechnicians()).filter((tech) => !supervisorId || tech.supervisorId === supervisorId);
    return response.json(technicianLoad(technicians, await reportCalls(request)));
  } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel montar a carga.' }); }
});
// Lote B: sugestao de tecnico, risco de estourar o prazo e incidentes em massa por OLT.
// O historico (todos os chamados) fica em cache por 5 min e o modelo de risco por 30 min: os dois sao pesados.
let historyCache: { at: number; calls: Promise<Awaited<ReturnType<typeof listCalls>>> } | null = null;
function cachedAllCalls() {
  if (!historyCache || Date.now() - historyCache.at > 5 * 60_000) historyCache = { at: Date.now(), calls: listCalls().catch((error) => { historyCache = null; throw error; }) };
  return historyCache.calls;
}
let riskCache: { at: number; model: RiskModel } | null = null;
async function riskModel() {
  if (!riskCache || Date.now() - riskCache.at > 30 * 60_000) riskCache = { at: Date.now(), model: buildRiskModel(await cachedAllCalls()) };
  return riskCache.model;
}
app.get('/api/chamados/:id/sugestoes', auth, requirePermission('calls.assign'), async (request: AuthRequest, response) => {
  try {
    const call = await getCall(String(request.params.id));
    if (!call) return response.status(404).json({ message: 'Chamado nao encontrado.' });
    const [history, active, technicians] = await Promise.all([cachedAllCalls(), listCalls(ACTIVE_STATUSES), listTechnicians()]);
    // Carga atual sempre fresca; historico do cache.
    const merged = [...history.filter((item) => item.status === 'Finalizado'), ...active];
    return response.json({ suggestions: suggestTechnicians(call, technicians, merged) });
  } catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel sugerir tecnicos.' }); }
});
app.post('/api/chamados/risco', auth, requirePermission('calls.view'), async (request: AuthRequest, response) => {
  const parsed = z.object({ ids: z.array(z.string().min(1).max(100)).max(300) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Envie os ids dos chamados.' });
  try {
    const wanted = new Set(parsed.data.ids);
    const [model, active] = await Promise.all([riskModel(), reportCalls(request, ACTIVE_STATUSES)]);
    const risks: Record<string, ReturnType<typeof callRisk>> = {};
    for (const call of active) if (wanted.has(call.id)) { const risk = callRisk(call, model); if (risk) risks[call.id] = risk; }
    return response.json({ risks, samples: model.samples });
  } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel calcular o risco.' }); }
});
app.get('/api/operacao/incidentes', auth, requirePermission('calls.view'), cacheReadModel, async (request: AuthRequest, response) => {
  try { return response.json({ incidents: massIncidents(await reportCalls(request, ACTIVE_STATUSES)) }); }
  catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel montar os incidentes.' }); }
});
// Acao em lote nos chamados de um incidente: atribuir o mesmo tecnico, a mesma observacao, ou finalizar todos.
// Cada acao pede a permissao de sempre; o resultado volta chamado a chamado.
app.post('/api/operacao/incidentes/acao', auth, async (request: AuthRequest, response) => {
  const parsed = z.object({
    callIds: z.array(z.string().min(1).max(100)).min(1).max(50),
    action: z.enum(['assign', 'observe', 'finish']),
    technicianId: z.string().max(100).optional(),
    text: z.string().trim().max(5000).optional(),
    executedAt: z.string().optional(),
  }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Acao invalida.' });
  const { callIds, action, technicianId, text, executedAt } = parsed.data;
  const permission = action === 'assign' ? 'calls.assign' : action === 'observe' ? 'calls.add_observation' : 'calls.finish';
  if (!request.authUser!.role.permissions.includes(permission)) return response.status(403).json({ message: 'Sem permissao para esta acao.' });
  if (action === 'assign') {
    const technicians = await listTechnicians();
    if (!technicianId || !technicians.some((tech) => tech.id === technicianId && tech.teamRole === 'Tecnico' && tech.active && tech.employmentStatus !== 'Demitido')) return response.status(422).json({ message: 'Escolha um tecnico trabalhando e ativo.' });
  }
  if ((action === 'observe' || action === 'finish') && !text) return response.status(400).json({ message: action === 'finish' ? 'Informe o resultado e a observacao.' : 'Escreva a observacao.' });
  if (action === 'finish' && (!executedAt || !Number.isFinite(Date.parse(normalizeSaoPauloLocal(executedAt))))) return response.status(400).json({ message: 'Informe a data e hora de execucao.' });
  const results: { callId: string; ok: boolean; message?: string }[] = [];
  for (const callId of callIds) {
    try {
      const existing = await getCall(callId, await getScopedCallQuery(request, true));
      if (!existing) { results.push({ callId, ok: false, message: 'Chamado nao encontrado.' }); continue; }
      if (['Finalizado', 'Cancelado', 'Baixar'].includes(existing.status)) { results.push({ callId, ok: false, message: 'Chamado encerrado.' }); continue; }
      if (action === 'assign') {
        await updateCall(callId, { technicianId, ...(existing.status === 'Aberto' ? { status: 'Atribuido' as const } : {}) }, request.authUser!);
      } else if (action === 'observe') {
        await addObservation(callId, request.authUser!, text!);
      } else {
        const full = text!.trim();
        const result = (full.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || full).slice(0, 255);
        const outcome = await finishCall(callId, { result, notes: full, executedAt: normalizeSaoPauloLocal(executedAt!) }, request.authUser!);
        if (outcome.missing.length) { results.push({ callId, ok: false, message: `Falta: ${outcome.missing.join(', ')}` }); continue; }
      }
      results.push({ callId, ok: true });
    } catch (error) { results.push({ callId, ok: false, message: error instanceof Error ? error.message : 'Erro.' }); }
  }
  return response.json({ results, ok: results.filter((item) => item.ok).length });
});

app.post('/api/chamados/reincidencia', auth, requirePermission('calls.view'), async (request: AuthRequest, response) => {
  const parsed = z.object({ ids: z.array(z.string().min(1).max(100)).max(300) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Envie os ids dos chamados.' });
  try { return response.json({ flags: repeatFlags(parsed.data.ids, await reportCalls(request)) }); }
  catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel verificar a reincidencia.' }); }
});
app.get('/api/chamados/:id/reincidencia', auth, requirePermission('calls.view'), async (request: AuthRequest, response) => {
  try {
    const calls = await reportCalls(request);
    const call = calls.find((item) => item.id === String(request.params.id));
    if (!call) return response.status(404).json({ message: 'Chamado nao encontrado.' });
    return response.json(repeatHistory(call, calls));
  } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar o historico.' }); }
});

app.get('/api/relatorios/fora-do-prazo', auth, requirePermission('dashboard.view'), cacheReadModel, async (request: AuthRequest, response) => {
  const parsed = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), area: z.enum(['ALL', 'SP', 'GRU', 'ALTO_TIETE', 'ABC', 'OUTRAS']).default('ALL') }).safeParse(request.query);
  if (!parsed.success || parsed.data.from > parsed.data.to) return response.status(400).json({ message: 'Informe um periodo valido (de/ate no formato AAAA-MM-DD).' });
  try {
    const calls = await listCalls(['Finalizado'], await getScopedCallQuery(request, true));
    return response.json({ calls: lateFinishedCalls(calls, parsed.data.from, parsed.data.to, parsed.data.area) });
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel gerar o relatorio.' });
  }
});
app.get('/api/dashboards/igp', auth, requirePermission('dashboard.view'), cacheReadModel, async (request: AuthRequest, response) => {
  const parsed = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).safeParse(request.query.month);
  if (!parsed.success) return response.status(400).json({ message: 'Informe um mes valido no formato AAAA-MM.' });
  const parsedArea = z.enum(['ALL', 'SP', 'GRU', 'ALTO_TIETE', 'ABC']).safeParse(request.query.area ?? 'ALL');
  if (!parsedArea.success) return response.status(400).json({ message: 'Selecione Todas, SP, GRU ou Alto Tiete para o IGP.' });
  const [year, monthNumber] = parsed.data.split('-').map(Number);
  const from = `${parsed.data}-01`;
  const to = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  try {
    const scopedQuery = await getScopedCallQuery(request, true);
    const calls = await listCalls('Finalizado', { ...scopedQuery, from, to });
    const igp = calculateIgpMetrics(calls, parsed.data, parsedArea.data);
    return response.json({ igp, plan: calculateIgpPlan(igp.total, parsed.data) });
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel calcular o IGP.' });
  }
});
app.get('/api/dashboards/painel-diario/base', auth, requirePermission('dashboard.view'), async (request, response) => {
  return response.json({ base: await getManualDailyBase(typeof request.query.date === 'string' ? request.query.date : undefined) });
});
app.put('/api/dashboards/painel-diario/base', auth, requirePermission('imports.create'), async (request: AuthRequest, response) => {
  const parsed = z.object({ fileName: z.string().trim().min(1).max(255), data: z.object({
    activities: z.array(z.object({ type: z.string(), pending: z.number(), enRoute: z.number(), started: z.number(), concluded: z.number(), cancelled: z.number(), suspended: z.number(), total: z.number() })),
    technicians: z.array(z.object({ name: z.string(), pending: z.number(), enRoute: z.number(), started: z.number(), concluded: z.number(), cancelled: z.number(), suspended: z.number(), total: z.number() })),
    orders: z.array(z.object({ order: z.string(), technician: z.string(), inicio: z.string(), tempo: z.string() })),
    records: z.array(z.object({ activityType: z.string(), technician: z.string(), status: z.string(), order: z.string(), inicio: z.string(), tempo: z.string() })).optional(),
    updatedAt: z.string(),
  }) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Dados da base diaria invalidos.' });
  return response.json({ base: await saveManualDailyBase(parsed.data.fileName, parsed.data.data, request.authUser!.name, typeof request.query.date === 'string' ? request.query.date : undefined) });
});
app.delete('/api/dashboards/painel-diario/base', auth, requirePermission('imports.create'), async (request, response) => {
  return response.json({ deleted: await deleteManualDailyBase(typeof request.query.date === 'string' ? request.query.date : undefined) });
});
app.get('/api/notificacoes', auth, async (request: AuthRequest, response) => {
  const includeOperational = Boolean(request.authUser?.role.permissions.includes('dashboard.view'));
  const notifications = await listNotifications(includeOperational);
  // Aviso antecipado do prazo de 6h: chamados ativos com menos de 2h restantes (no escopo do supervisor).
  if (includeOperational && request.authUser?.role.permissions.includes('calls.view')) {
    try {
      const near = nearDeadlineCalls(await listCalls(['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo'], await getScopedCallQuery(request, true)), BELL_WINDOW_MINUTES);
      if (near.length) notifications.unshift({ id: 'near-deadline', type: 'warning', title: `${near.length} chamado(s) vencem em menos de 2h`, detail: `Mais perto: ${near[0].orderNumber}, faltam ${near[0].minutesLeft} min.`, href: '/chamados/atendimento', count: near.length });
    } catch { /* supervisor sem equipe: sem o aviso */ }
  }
  // Avisos da propria pessoa (mencoes), ate marcar como lido.
  try {
    for (const item of await listUnreadNotifications(request.authUser!.id)) notifications.unshift({ id: `user:${item.id}`, type: 'info', title: item.title, detail: item.detail, href: item.href, count: 1 });
  } catch { /* tabela ainda nao criada: sem os avisos pessoais */ }
  return response.json({ notifications });
});
app.post('/api/notificacoes/lidas', auth, async (request: AuthRequest, response) => {
  const parsed = z.object({ ids: z.array(z.string().max(80)).max(100).optional() }).safeParse(request.body || {});
  if (!parsed.success) return response.status(400).json({ message: 'Ids invalidos.' });
  const ids = parsed.data.ids?.map((id) => id.replace(/^user:/, ''));
  try { return response.json({ read: await markNotificationsRead(request.authUser!.id, ids) }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel marcar como lido.' }); }
});
// Destaques do mes (aba Pessoas e Modo TV): mais finalizados no prazo, melhor % no prazo e melhor supervisor.
app.get('/api/destaques', auth, async (request: AuthRequest, response) => {
  const month = typeof request.query.month === 'string' && /^\d{4}-\d{2}$/.test(request.query.month) ? request.query.month : toOperationalDate().slice(0, 7);
  try {
    const [calls, technicians, supervisors] = await Promise.all([listCalls(['Finalizado']), listTechnicians(), listSupervisors()]);
    return response.json({ month, highlights: monthHighlights(calls, technicians, supervisors, month) });
  } catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel calcular os destaques.' }); }
});
app.get('/api/users', auth, requirePermission('users.view'), async (_request, response) => response.json({ users: (await listUsers()).map((user) => ({ ...user, ...presenceOf(user.id) })) }));
// Pessoas: diretorio SO DE LEITURA para qualquer usuario logado (nome, cargo, e-mail, foto, banner e se esta online).
// Nao ha rota de escrita aqui: criar e editar contas continua so em /api/users, com as permissoes de Usuarios.
// Contas inativas ficam de fora; o apelido nao aparece (ele e so para a propria pessoa).
type PersonCard = { id: string; name: string; email: string; roleName: string; online: boolean; lastSeenAt?: string; createdAt: string };
function personCard(user: Awaited<ReturnType<typeof listUsers>>[number]): PersonCard {
  const presence = presenceOf(user.id);
  return { id: user.id, name: user.name, email: user.email, roleName: user.role?.name || 'Sem cargo', online: presence.online, lastSeenAt: presence.lastSeenAt, createdAt: user.createdAt };
}
app.get('/api/people', auth, async (_request, response) => {
  try {
    const people = (await listUsers()).filter((user) => user.active).map(personCard).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'pt-BR'));
    const [avatars, statuses] = await Promise.all([
      getUserAvatars(people.map((person) => person.id)).catch(() => ({})),
      getUserStatuses(people.map((person) => person.id)).catch(() => ({} as Awaited<ReturnType<typeof getUserStatuses>>)),
    ]);
    const status = Object.fromEntries(Object.entries(statuses).map(([id, value]) => [id, activeStatus(value)]).filter(([, value]) => value));
    return response.json({ people, avatars, status });
  } catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar as pessoas.' }); }
});
app.get('/api/people/:id', auth, async (request, response) => {
  try {
    const user = (await listUsers()).find((item) => item.id === request.params.id && item.active);
    if (!user) return response.status(404).json({ message: 'Pessoa nao encontrada.' });
    const [avatars, banners, statuses] = await Promise.all([getUserAvatars([user.id]).catch(() => ({} as Record<string, string>)), getUserBanners([user.id]).catch(() => ({} as Record<string, string>)), getUserStatuses([user.id]).catch(() => ({} as Awaited<ReturnType<typeof getUserStatuses>>))]);
    return response.json({ person: personCard(user), avatar: avatars[user.id] ?? null, banner: banners[user.id] ?? null, status: activeStatus(statuses[user.id]) });
  } catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar o perfil.' }); }
});

// Logout: tira o usuario da lista de online na hora (o token continua so no navegador, que o apaga).
app.post('/api/auth/logout', auth, (request: AuthRequest, response) => {
  clearPresence(request.authUser!.id);
  response.status(204).end();
});
app.post('/api/users', auth, requirePermission('users.create'), async (request, response) => {
  const parsed = z.object({ name: z.string().min(2), email: z.string().email(), roleId: z.string(), password: z.string().min(8) }).safeParse(request.body);
  if (!parsed.success || !(await getRoleById(parsed.success ? parsed.data.roleId : ''))) return response.status(400).json({ message: 'Dados de usuario invalidos.' });
  const existingUser = getUserByEmail(parsed.data.email);
  if (existingUser) return response.status(409).json({ message: 'Este e-mail ja esta cadastrado.' });
  return response.status(201).json({ user: await addUser(parsed.data) });
});
app.patch('/api/users/:id', auth, requirePermission('users.edit'), async (request, response) => {
  const parsed = z.object({ name: z.string().min(2).optional(), email: z.string().email().optional(), roleId: z.string().optional(), active: z.boolean().optional(), password: z.string().min(8).optional() }).safeParse(request.body);
  if (!parsed.success || (parsed.data.roleId && !(await getRoleById(parsed.data.roleId)))) return response.status(400).json({ message: 'Dados de usuario invalidos.' });
  const allUsers = await listUsers();
  if (parsed.data.email && allUsers.some((user) => user.email.toLowerCase() === parsed.data.email!.toLowerCase() && user.id !== String(request.params.id))) return response.status(409).json({ message: 'Este e-mail ja esta cadastrado.' });
  const user = await updateUser(String(request.params.id), parsed.data);
  if (!user) return response.status(404).json({ message: 'Usuario nao encontrado.' });
  return response.json({ user });
});
app.delete('/api/users/:id', auth, requirePermission('users.edit'), async (request: AuthRequest, response) => {
  const userId = String(request.params.id);
  if (request.authUser?.id === userId) return response.status(400).json({ message: 'Voce nao pode remover o proprio usuario.' });
  const deleted = await deleteUser(userId);
  if (!deleted) return response.status(404).json({ message: 'Usuario nao encontrado.' });
  return response.json({ deleted: true });
});
app.get('/api/roles', auth, requirePermission('roles.view'), async (_request, response) => response.json({ roles: await listRoles(), permissions: listPermissions() }));
app.post('/api/roles', auth, requirePermission('roles.manage'), async (request, response) => {
  const parsed = z.object({ name: z.string().min(2), description: z.string().min(2), permissions: z.array(z.string()), hiddenTabs: z.array(z.string().regex(/^\/[a-z0-9\-/]*$/)).max(40).optional() }).safeParse(request.body);
  if (!parsed.success || parsed.data.permissions.some((code) => !listPermissions().some((permission) => permission.code === code))) return response.status(400).json({ message: 'Dados de cargo invalidos.' });
  const roles = await listRoles();
  if (roles.some((role) => role.name.toLowerCase() === parsed.data.name.toLowerCase())) return response.status(409).json({ message: 'Este cargo ja existe.' });
  return response.status(201).json({ role: await addRole({ ...parsed.data, permissions: parsed.data.permissions as PermissionCode[] }) });
});
app.patch('/api/roles/:id', auth, requirePermission('roles.manage'), async (request: AuthRequest, response) => {
  const parsed = z.object({ name: z.string().min(2).optional(), description: z.string().min(2).optional(), permissions: z.array(z.string()).optional(), hiddenTabs: z.array(z.string().regex(/^\/[a-z0-9\-/]*$/)).max(40).optional() }).safeParse(request.body);
  if (!parsed.success || parsed.data.permissions?.some((code) => !listPermissions().some((permission) => permission.code === code))) return response.status(400).json({ message: 'Dados de cargo invalidos.' });
  // Nao deixa o proprio cargo esconder Cargos e permissoes (senao ninguem com ele consegue desfazer).
  if (String(request.params.id) === request.authUser!.roleId && parsed.data.hiddenTabs?.includes('/cargos')) return response.status(409).json({ message: 'Voce nao pode ocultar Cargos e permissoes do seu proprio cargo.' });
  const role = await updateRole(String(request.params.id), { ...parsed.data, permissions: parsed.data.permissions as PermissionCode[] | undefined });
  if (!role) return response.status(404).json({ message: 'Cargo nao encontrado.' });
  return response.json({ role });
});
app.get('/api/configuracoes', auth, requirePermission('settings.manage'), (_request, response) => response.json({ settings: getSettings() }));
app.patch('/api/configuracoes', auth, requirePermission('settings.manage'), async (request, response) => {
  const parsed = z.object({ autoRefresh: z.boolean().optional(), refreshIntervalSeconds: z.number().int().min(10).max(3600).optional(), slaAlertHours: z.number().min(1).max(72).optional(), defaultRegion: z.string().min(1).optional() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Configuracoes invalidas.' });
  return response.json({ settings: updateSettings(parsed.data) });
});
app.get('/api/configuracoes/regioes', auth, requirePermission('settings.manage'), async (_request, response) => {
  try { return response.json({ regions: await listCustomOperationalRegions() }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar as regioes.' }); }
});
app.post('/api/configuracoes/regioes', auth, requirePermission('settings.manage'), async (request, response) => {
  const parsed = z.object({ region: z.string().trim().min(2).max(160) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Informe uma regiao valida.' });
  try { return response.status(201).json({ region: await addCustomOperationalRegion(parsed.data.region) }); }
  catch (error) { return response.status(422).json({ message: error instanceof Error ? error.message : 'Nao foi possivel cadastrar a regiao.' }); }
});
app.get('/api/configuracoes/olt-regioes', auth, requirePermission('settings.manage'), async (_request, response) => {
  try { return response.json({ mappings: await listOltRegionMappings() }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar o mapa de OLTs.' }); }
});
app.put('/api/configuracoes/olt-regioes', auth, requirePermission('settings.manage'), async (request, response) => {
  const parsed = z.object({ mappings: z.array(z.object({ olt: z.string().trim().min(2).max(120), region: z.string().trim().min(1).max(160) })).max(500) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Informe OLTs e regioes validas.' });
  const normalizedOlts = parsed.data.mappings.map(({ olt }) => olt.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, ''));
  if (new Set(normalizedOlts).size !== normalizedOlts.length) return response.status(400).json({ message: 'Cada OLT deve aparecer apenas uma vez.' });
  try { return response.json({ mappings: await saveOltRegionMappings(parsed.data.mappings) }); }
  catch (error) { return response.status(422).json({ message: error instanceof Error ? error.message : 'Nao foi possivel salvar o mapa de OLTs.' }); }
});
app.get('/api/configuracoes/olt-regioes/solicitacoes', auth, requirePermission('settings.manage'), async (_request, response) => {
  try { return response.json({ requests: await listOltRegionRequests() }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar as solicitacoes de OLT.' }); }
});
app.post('/api/configuracoes/olt-regioes/solicitacoes/:id/adicionar', auth, requirePermission('settings.manage'), async (request, response) => {
  const parsed = z.object({ region: z.string().trim().min(1).max(160) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Selecione uma regiao para esta OLT.' });
  try { return response.json(await acceptOltRegionRequest(String(request.params.id), parsed.data.region)); }
  catch (error) { return response.status(422).json({ message: error instanceof Error ? error.message : 'Nao foi possivel adicionar a OLT.' }); }
});
app.post('/api/configuracoes/olt-regioes/solicitacoes/:id/ignorar', auth, requirePermission('settings.manage'), async (request, response) => {
  try { return response.json(await ignoreOltRegionRequest(String(request.params.id))); }
  catch (error) { return response.status(422).json({ message: error instanceof Error ? error.message : 'Nao foi possivel ignorar a solicitacao.' }); }
});
app.get('/api/tecnicos', auth, requirePermission('technicians.view'), async (_request, response) => response.json({ technicians: await listTechnicians() }));
app.post('/api/tecnicos', auth, requirePermission('technicians.create'), async (request, response) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(160), registration: z.string().trim().min(2).max(80), supervisorId: z.string().optional(), teamRole: z.enum(['Tecnico', 'Auxiliar']).default('Tecnico'), leadTechnicianId: z.string().optional(), region: z.string().trim().max(100).default(''), shift: z.string().trim().min(2).max(80), currentStatus: z.enum(['Disponivel', 'Em campo', 'Indisponivel']).default('Disponivel'), active: z.boolean().default(true), employmentStatus: z.enum(['Trabalhando', 'Demitido']).default('Trabalhando') }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Dados de tecnico invalidos.' });
  return response.status(201).json({ technician: await addTechnician(parsed.data) });
});
app.patch('/api/tecnicos/:id', auth, requirePermission('technicians.edit'), async (request, response) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(160).optional(), registration: z.string().trim().min(2).max(80).optional(), region: z.string().trim().max(100).optional(), shift: z.string().trim().min(2).max(80).optional(), supervisorId: z.string().optional(), teamRole: z.enum(['Tecnico', 'Auxiliar']).optional(), leadTechnicianId: z.string().nullable().optional(), currentStatus: z.enum(['Disponivel', 'Em campo', 'Indisponivel']).optional(), active: z.boolean().optional(), employmentStatus: z.enum(['Trabalhando', 'Demitido']).optional() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Dados de tecnico invalidos.' });
  try {
    const technician = await updateTechnician(String(request.params.id), parsed.data);
    if (!technician) return response.status(404).json({ message: 'Tecnico nao encontrado.' });
    return response.json({ technician });
  } catch (error) {
    return response.status(422).json({ message: error instanceof Error ? error.message : 'Nao foi possivel atualizar o tecnico.' });
  }
});
app.delete('/api/tecnicos/:id', auth, requirePermission('technicians.edit'), async (request, response) => {
  const deleted = await deleteTechnician(String(request.params.id));
  if (!deleted) return response.status(404).json({ message: 'Tecnico nao encontrado.' });
  return response.json({ deleted: true });
});
app.get('/api/supervisores', auth, requirePermission('supervisors.view'), async (_request, response) => response.json({ supervisors: await listSupervisors(), technicians: await listTechnicians() }));
app.post('/api/supervisores', auth, requirePermission('supervisors.create'), async (request, response) => {
  const parsed = z.object({ name: z.string().min(2), userId: z.string().optional(), region: z.string().min(2), active: z.boolean().default(true) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Dados de supervisor invalidos.' });
  return response.status(201).json({ supervisor: await addSupervisor(parsed.data) });
});
app.patch('/api/supervisores/:id', auth, requirePermission('supervisors.edit'), async (request, response) => {
  const parsed = z.object({ name: z.string().min(2).optional(), userId: z.string().nullable().optional(), region: z.string().min(2).optional(), active: z.boolean().optional() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Dados de supervisor invalidos.' });
  const supervisor = await updateSupervisor(String(request.params.id), parsed.data);
  if (!supervisor) return response.status(404).json({ message: 'Supervisor nao encontrado.' });
  return response.json({ supervisor });
});
app.delete('/api/supervisores/:id', auth, requirePermission('supervisors.edit'), async (request, response) => {
  try {
    const result = await deleteSupervisor(String(request.params.id));
    if (result.technicianCount) return response.status(409).json({ message: 'Desvincule os tecnicos antes de excluir o supervisor.', technicianCount: result.technicianCount });
    if (!result.deleted) return response.status(404).json({ message: 'Supervisor nao encontrado.' });
    return response.json({ deleted: true });
  } catch (error) {
    return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel excluir o supervisor.' });
  }
});
app.get('/api/chamados', auth, requirePermission('calls.view'), async (request: AuthRequest, response) => {
  const rawStatus = request.query.status;
  const validStatuses: CallStatus[] = ['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo', 'Finalizado', 'Cancelado', 'Baixar'];
  const statuses = (Array.isArray(rawStatus) ? rawStatus.flatMap((value) => String(value).split(',')) : typeof rawStatus === 'string' ? rawStatus.split(',') : []).map((value) => value.trim()).filter(Boolean);
  if (statuses.some((status) => !validStatuses.includes(status as CallStatus))) return response.status(400).json({ message: 'Status de chamado invalido.' });
  const page = Math.max(1, Math.floor(Number(request.query.page ?? 1)));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(request.query.pageSize ?? 50))));
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : undefined;
  const region = typeof request.query.region === 'string' && request.query.region.trim() ? request.query.region.trim() : undefined;
  const neighborhood = typeof request.query.neighborhood === 'string' && request.query.neighborhood.trim() ? request.query.neighborhood.trim() : undefined;
  const olt = typeof request.query.olt === 'string' && request.query.olt.trim() ? request.query.olt.trim() : undefined;
  const rawArea = typeof request.query.area === 'string' ? request.query.area.trim().toUpperCase() : '';
  if (rawArea && !['SP', 'GRU', 'ALTO_TIETE', 'ABC'].includes(rawArea)) return response.status(400).json({ message: 'Area invalida.' });
  const area = rawArea ? rawArea as 'SP' | 'GRU' | 'ALTO_TIETE' | 'ABC' : undefined;
  const rawHasTechnician = request.query.hasTechnician;
  if (rawHasTechnician !== undefined && rawHasTechnician !== 'true' && rawHasTechnician !== 'false') return response.status(400).json({ message: 'Filtro de tecnico invalido.' });
  const hasTechnician = rawHasTechnician === undefined ? undefined : rawHasTechnician === 'true';
  const sortOptions = ['openedAt', 'status', 'region', 'technicianName', 'client', 'orderNumber'] as const;
  type CallSortKey = typeof sortOptions[number];
  const sort: CallSortKey = typeof request.query.sort === 'string' && (sortOptions as readonly string[]).includes(request.query.sort)
    ? request.query.sort as CallSortKey
    : 'openedAt';
  const directionOptions = ['asc', 'desc'] as const;
  type CallSortDirection = typeof directionOptions[number];
  const direction: CallSortDirection = typeof request.query.direction === 'string' && (directionOptions as readonly string[]).includes(request.query.direction)
    ? request.query.direction as CallSortDirection
    : 'desc';
  try {
    const scopedQuery = await getScopedCallQuery(request, request.query.teamScope === 'true');
    const result = await listCallsPage(statuses.length ? statuses as CallStatus[] : undefined, { ...scopedQuery, search, region, neighborhood, olt, hasTechnician, area, sort, direction }, page, pageSize);
    return response.json(result);
  } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar os chamados.' }); }
});
// Faixa de alerta: chamados ativos que estouram as 6h nos proximos 30 min (respeita o escopo do supervisor).
app.get('/api/chamados/vencendo', auth, requirePermission('calls.view'), async (request: AuthRequest, response) => {
  try {
    const scopedQuery = await getScopedCallQuery(request, true);
    const calls = await listCalls(['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo'], { ...scopedQuery, from: undefined, to: undefined });
    return response.json(dueSoonCalls(calls));
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel listar os chamados vencendo.' });
  }
});
// Ultima observacao de cada chamado da pagina da fila (ate 100 ids), numa chamada so. Respeita o escopo do supervisor.
app.get('/api/chamados/ultimas-observacoes', auth, requirePermission('calls.view'), async (request: AuthRequest, response) => {
  const ids = [...new Set(String(request.query.ids || '').split(',').map((id) => id.trim()).filter(Boolean))];
  if (ids.length > 100) return response.status(400).json({ message: 'Envie no maximo 100 chamados por vez.' });
  try {
    const scope = await getScopedCallQuery(request, request.query.teamScope === 'true');
    let allowed = ids;
    if ('supervisorId' in scope && scope.supervisorId) {
      const visible = new Set((await listCalls(undefined, scope)).map((call) => call.id));
      allowed = ids.filter((id) => visible.has(id));
    }
    return response.json({ observations: await latestObservations(allowed) });
  } catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar as observacoes.' }); }
});
app.get('/api/chamados/:id', auth, requirePermission('calls.view'), async (request, response) => {
  const call = await getCall(String(request.params.id), await getScopedCallQuery(request as AuthRequest, request.query.teamScope === 'true'));
  if (!call) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  return response.json({ call });
});
// Corrigir so a Data Fim, inclusive com o chamado encerrado (Finalizado/Baixar/Cancelado), sem reabrir. Fica no
// historico como "Data de finalizacao alterado" e, a partir dai, a sincronizacao do OFS nao sobrescreve essa data.
app.put('/api/chamados/:id/data-fim', auth, requirePermission('calls.edit'), async (request: AuthRequest, response) => {
  const parsed = z.object({ executedAt: z.string().min(10).max(40) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Informe a data e hora de fim.' });
  const executedAt = normalizeSaoPauloLocal(parsed.data.executedAt);
  const executedMs = Date.parse(executedAt);
  if (!Number.isFinite(executedMs)) return response.status(400).json({ message: 'Data e hora de fim invalidas.' });
  const existing = await getCall(String(request.params.id));
  if (!existing) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  if (executedMs < Date.parse(existing.openedAt)) return response.status(422).json({ message: 'A Data Fim nao pode ser antes da abertura do chamado.' });
  if (executedMs > Date.now() + 5 * 60_000) return response.status(422).json({ message: 'A Data Fim nao pode estar no futuro.' });
  const call = await updateCallEndDate(existing.id, executedAt, request.authUser!);
  if (!call) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  return response.json({ call });
});
app.patch('/api/chamados/:id', auth, requirePermission('calls.edit'), async (request: AuthRequest, response) => {
  const optionalText = (max: number, min = 0) => z.preprocess((value) => value == null ? undefined : String(value), z.string().trim().min(min).max(max).optional());
  const parsed = z.object({ orderNumber: optionalText(100, 1), bdesk: optionalText(100), officeTrack: optionalText(100), client: optionalText(180), type: optionalText(100), reason: optionalText(5000), region: optionalText(100), city: optionalText(100), address: optionalText(5000), bairro: optionalText(160), olt: optionalText(120), slotPon: optionalText(10000), status: z.preprocess((value) => value == null ? undefined : String(value), z.enum(['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo', 'Finalizado', 'Cancelado', 'Baixar']).optional()), technicianId: z.preprocess((value) => value === undefined ? undefined : value === null || value === '' ? null : String(value), z.string().nullable().optional()), openedAt: z.string().datetime().optional(), executedAt: z.preprocess((value) => value == null ? undefined : String(value), z.string().datetime().optional()), result: optionalText(255), notes: optionalText(5000) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: `Dados de chamado invalidos: ${parsed.error.issues.map((issue) => issue.path.join('.') || 'payload').join(', ')}.` });
  const technicians = await listTechnicians();
  if (parsed.data.technicianId && !technicians.some((technician) => technician.id === parsed.data.technicianId && technician.teamRole === 'Tecnico' && technician.active && technician.employmentStatus !== 'Demitido')) return response.status(422).json({ message: 'Somente tecnicos trabalhando e ativos podem receber chamados.' });
  const existing = await getCall(String(request.params.id));
  if (!existing) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  // Status de atendimento sem tecnico deixava o chamado fora de Chamados abertos e de Em atendimento.
  const nextStatus = parsed.data.status ?? existing.status;
  const nextTechnician = parsed.data.technicianId !== undefined ? parsed.data.technicianId : existing.technicianId;
  const touchesAssignment = (parsed.data.status !== undefined && parsed.data.status !== existing.status) || parsed.data.technicianId !== undefined;
  // Encerrado (Finalizado/Cancelado/Baixar): so a troca de status e permitida; antes respondia 404 "nao encontrado".
  if (['Finalizado', 'Cancelado', 'Baixar'].includes(existing.status) && (parsed.data.status === undefined || parsed.data.status === existing.status)) return response.status(409).json({ message: 'Chamado encerrado: so o status pode ser alterado (por exemplo, Baixar para Finalizado ou reabrir).' });
  if (touchesAssignment && ['Atribuido', 'Atrelado', 'Deslocamento', 'Em campo'].includes(nextStatus) && !nextTechnician) return response.status(422).json({ message: `Atribua um tecnico antes de colocar o chamado como ${nextStatus}.` });
  const call = await updateCall(String(request.params.id), parsed.data, request.authUser!);
  if (!call) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  return response.json({ call });
});
// ---------- Lote E: checklist (9) e tela do tecnico em campo (8) ----------
app.get('/api/checklists', auth, async (_request, response) => {
  try { return response.json({ templates: await listChecklistTemplates() }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar os checklists.' }); }
});
app.put('/api/checklists', auth, requirePermission('settings.manage'), async (request, response) => {
  const parsed = z.object({ templates: z.array(z.object({ id: z.string().max(60).optional(), name: z.string().trim().min(2).max(80), callTypes: z.array(z.string().trim().min(1).max(100)).max(20).default([]), items: z.array(z.string().trim().min(2).max(200)).min(1).max(20), active: z.boolean().default(true) })).max(30) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Cada checklist precisa de nome e de 1 a 20 itens.' });
  try { return response.json({ templates: await saveChecklistTemplates(parsed.data.templates) }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel salvar os checklists.' }); }
});
// Vinculo tecnico <-> usuario (tela Tecnicos): o usuario ligado ve os proprios chamados em "Meus chamados".
app.get('/api/tecnicos/vinculos', auth, requirePermission('technicians.view'), async (_request, response) => {
  try { return response.json({ links: await listTechnicianLinks() }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar os vinculos.' }); }
});
app.put('/api/tecnicos/:id/usuario', auth, requirePermission('technicians.edit'), async (request, response) => {
  const parsed = z.object({ userId: z.string().min(1).max(100).nullable() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Usuario invalido.' });
  const technicianId = String(request.params.id);
  if (!(await listTechnicians()).some((tech) => tech.id === technicianId)) return response.status(404).json({ message: 'Tecnico nao encontrado.' });
  if (parsed.data.userId && !(await listUsers()).some((user) => user.id === parsed.data.userId && user.active)) return response.status(422).json({ message: 'Escolha um usuario ativo.' });
  try { await setTechnicianUser(technicianId, parsed.data.userId); return response.json({ ok: true }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel salvar o vinculo.' }); }
});

// Tela do tecnico (Meus chamados): so para o usuario ligado a um tecnico, e so nos chamados desse tecnico.
// Nao depende de cargo/permissao: o cargo "Tecnico" pode nao ter nenhuma permissao alem disso.
async function fieldTechnician(request: AuthRequest) {
  const technicianId = await technicianIdForUser(request.authUser!.id);
  if (!technicianId) return null;
  return (await listTechnicians()).find((tech) => tech.id === technicianId) ?? null;
}
async function ownCall(request: AuthRequest, response: Response) {
  const technician = await fieldTechnician(request);
  if (!technician) { response.status(403).json({ message: 'Seu usuario nao esta ligado a um tecnico.' }); return null; }
  const call = await getCall(String(request.params.id));
  if (!call || call.technicianId !== technician.id) { response.status(404).json({ message: 'Chamado nao encontrado entre os seus.' }); return null; }
  if (['Finalizado', 'Cancelado', 'Baixar'].includes(call.status)) { response.status(409).json({ message: 'Chamado ja encerrado.' }); return null; }
  return { technician, call };
}
app.get('/api/campo/eu', auth, async (request: AuthRequest, response) => {
  const technician = await fieldTechnician(request).catch(() => null);
  return response.json({ technician: technician ? { id: technician.id, name: technician.name } : null });
});
app.get('/api/campo/chamados', auth, async (request: AuthRequest, response) => {
  const technician = await fieldTechnician(request);
  if (!technician) return response.status(403).json({ message: 'Seu usuario nao esta ligado a um tecnico.' });
  const today = toOperationalDate();
  const calls = (await listCalls()).filter((call) => call.technicianId === technician.id && (ACTIVE_STATUSES.includes(call.status) || (call.status === 'Finalizado' && call.executedAt && toOperationalDate(call.executedAt) === today)));
  const templates = await listChecklistTemplates();
  return response.json({
    technician: { id: technician.id, name: technician.name },
    calls: calls.sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt)).map((call) => ({ ...call, checklist: checklistFor(call.type, templates) })),
  });
});
app.post('/api/campo/chamados/:id/status', auth, async (request: AuthRequest, response) => {
  const parsed = z.object({ status: z.enum(FIELD_STATUSES) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Status invalido.' });
  const own = await ownCall(request, response);
  if (!own) return;
  const call = await updateCall(own.call.id, { status: parsed.data.status }, request.authUser!);
  return response.json({ call });
});
const fieldPhoto = z.object({ fileName: z.string().trim().min(1).max(255), mimeType: z.string().regex(/^image\/(jpeg|png|webp)$/), sizeBytes: z.number().int().min(1).max(3 * 1024 * 1024), contentBase64: z.string().min(4).max(4_200_000) });
app.post('/api/campo/chamados/:id/observacao', auth, async (request: AuthRequest, response) => {
  const parsed = z.object({ text: z.string().trim().max(5000).default(''), photos: z.array(fieldPhoto).max(4).default([]) }).safeParse(request.body);
  if (!parsed.success || (!parsed.data.text && !parsed.data.photos.length)) return response.status(400).json({ message: 'Escreva algo ou anexe uma foto (JPG, PNG ou WebP, ate 3 MB).' });
  for (const photo of parsed.data.photos) {
    const bytes = Buffer.from(photo.contentBase64, 'base64');
    if (bytes.byteLength !== photo.sizeBytes || bytes.toString('base64').replace(/=+$/, '') !== photo.contentBase64.replace(/=+$/, '')) return response.status(400).json({ message: `A foto ${photo.fileName} veio corrompida.` });
  }
  const own = await ownCall(request, response);
  if (!own) return;
  const observation = await addObservation(own.call.id, request.authUser!, parsed.data.text, parsed.data.photos.map((photo) => ({ ...photo, fileName: photo.fileName.replace(/[\\/\r\n]/g, '_') })));
  return response.status(201).json({ observation });
});
app.post('/api/campo/chamados/:id/finalizar', auth, async (request: AuthRequest, response) => {
  const parsed = z.object({ text: z.string().trim().min(3).max(5000), executedAt: z.string().optional(), checklist: z.array(z.string().max(200)).max(50).default([]) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Escreva o resultado e a observacao.' });
  const own = await ownCall(request, response);
  if (!own) return;
  const template = checklistFor(own.call.type, await listChecklistTemplates());
  const missingItems = missingChecklistItems(template, parsed.data.checklist);
  if (missingItems.length) return response.status(422).json({ message: `Marque o checklist: ${missingItems.join(', ')}.` });
  const full = parsed.data.text;
  const result = (full.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || full).slice(0, 255);
  const executedAt = parsed.data.executedAt ? normalizeSaoPauloLocal(parsed.data.executedAt) : new Date().toISOString();
  const outcome = await finishCall(own.call.id, { result, notes: template ? `${full}\n${checklistNote(template)}` : full, executedAt }, request.authUser!);
  if (outcome.missing.length) return response.status(422).json({ message: `Nao da para finalizar: falta ${outcome.missing.join(', ')}.` });
  return response.json({ call: outcome.call });
});

app.post('/api/chamados/:id/finalizar', auth, requirePermission('calls.finish'), async (request: AuthRequest, response) => {
  const parsed = z.object({ result: z.string(), executedAt: z.string(), notes: z.string(), checklist: z.array(z.string().max(200)).max(50).optional() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Informe resultado, data de execucao e observacao.' });
  // Checklist do tipo do chamado (Configuracoes): todos os itens precisam estar marcados.
  const target = await getCall(String(request.params.id));
  const template = target ? checklistFor(target.type, await listChecklistTemplates()) : null;
  const missingItems = missingChecklistItems(template, parsed.data.checklist);
  if (missingItems.length) return response.status(422).json({ message: `Marque o checklist antes de finalizar: ${missingItems.join(', ')}.`, missing: missingItems.map((item) => `Checklist: ${item}`) });
  const { checklist: _checklist, ...finishInput } = parsed.data;
  const notes = template ? `${finishInput.notes}\n${checklistNote(template)}` : finishInput.notes;
  // Data sem fuso (datetime-local) e horario de Sao Paulo.
  const outcome = await finishCall(String(request.params.id), { ...finishInput, notes, executedAt: normalizeSaoPauloLocal(finishInput.executedAt) }, request.authUser!);
  if (outcome.missing.includes('Chamado nao encontrado')) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  if (outcome.missing.length) return response.status(422).json({ message: 'Nao e possivel finalizar este chamado.', missing: outcome.missing });
  return response.json({ call: outcome.call });
});
app.post('/api/chamados/:id/cancelar', auth, requirePermission('calls.cancel'), async (request: AuthRequest, response) => {
  const parsed = z.object({ reason: z.string().trim().min(3) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Informe o motivo do cancelamento.' });
  const call = await cancelCall(String(request.params.id), parsed.data.reason, request.authUser!);
  if (!call) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  return response.json({ call });
});
app.delete('/api/chamados', auth, requirePermission('calls.delete'), async (_request: AuthRequest, response) => {
  const deleted = await deleteAllCalls();
  return response.json({ deleted });
});
app.delete('/api/chamados/:id', auth, requirePermission('calls.delete'), async (request: AuthRequest, response) => {
  const deleted = await deleteCall(String(request.params.id));
  if (!deleted) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  return response.json({ deleted: true });
});
app.post('/api/chamados/:id/reabrir', auth, requirePermission('calls.reopen'), async (request: AuthRequest, response) => {
  const call = await reopenCall(String(request.params.id), request.authUser!);
  if (!call) return response.status(409).json({ message: 'Somente chamados finalizados, cancelados ou marcados para baixar podem ser reabertos.' });
  return response.json({ call });
});
app.get('/api/chamados/:id/observacoes', auth, requirePermission('calls.view'), async (request: AuthRequest, response) => {
  const call = await getCall(String(request.params.id), await getScopedCallQuery(request, request.query.teamScope === 'true'));
  if (!call) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  const observations = await listObservations(call.id);
  // Banner de cada autor, uma vez so por pessoa (fundo das observacoes).
  const banners = await getUserBanners(observations.map((item) => item.userId)).catch(() => ({}));
  return response.json({ observations, banners });
});
app.post('/api/chamados/:id/observacoes', auth, requirePermission('calls.add_observation'), async (request: AuthRequest, response) => {
  const parsed = z.object({
    text: z.string().trim().max(5000).optional().default(''),
    attachments: z.array(z.object({ fileName: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(1).max(255), sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024), contentBase64: z.string().min(4).max(7_000_000) })).max(8).default([]),
  }).safeParse(request.body);
  if (!parsed.success || (!parsed.data.text && !parsed.data.attachments.length)) return response.status(400).json({ message: 'Informe um texto ou anexe pelo menos um arquivo.' });
  const decodedAttachments: CallObservationAttachmentInput[] = [];
  let totalBytes = 0;
  for (const attachment of parsed.data.attachments) {
    const decodedContent = Buffer.from(attachment.contentBase64, 'base64');
    const canonicalBase64 = decodedContent.toString('base64').replace(/=+$/, '');
    if (!canonicalBase64 || canonicalBase64 !== attachment.contentBase64.replace(/=+$/, '')) return response.status(400).json({ message: `O arquivo ${attachment.fileName} possui conteudo invalido.` });
    const sizeBytes = decodedContent.byteLength;
    if (sizeBytes !== attachment.sizeBytes) return response.status(400).json({ message: `O tamanho do arquivo ${attachment.fileName} nao corresponde ao conteudo.` });
    totalBytes += sizeBytes;
    decodedAttachments.push({ ...attachment, fileName: attachment.fileName.replace(/[\\/\r\n]/g, '_'), mimeType: attachment.mimeType || 'application/octet-stream' });
  }
  if (totalBytes > 10 * 1024 * 1024) return response.status(413).json({ message: 'O total de anexos por observacao nao pode ultrapassar 10 MB.' });
  const existing = await getCall(String(request.params.id), await getScopedCallQuery(request, request.query.teamScope === 'true'));
  if (!existing) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  if (['Finalizado', 'Cancelado', 'Baixar'].includes(existing.status)) return response.status(409).json({ message: 'Chamado encerrado. Reabra o chamado antes de adicionar observacoes.' });
  const observation = await addObservation(String(request.params.id), request.authUser!, parsed.data.text, decodedAttachments);
  // Mencoes (@Nome Completo): cada pessoa mencionada recebe um aviso no sino ate abrir.
  if (parsed.data.text.includes('@')) {
    try {
      const users = await listUsers();
      const mentioned = findMentions(parsed.data.text, users, request.authUser!.id).filter((id) => users.find((user) => user.id === id)?.role?.permissions?.includes('calls.view'));
      const snippet = parsed.data.text.replace(/\s+/g, ' ').slice(0, 140);
      await createUserNotifications(mentioned.map((userId) => ({ userId, kind: 'mention', title: `${request.authUser!.name} mencionou você`, detail: `${existing.orderNumber}: ${snippet}`, href: `/chamados/${existing.id}` })));
    } catch (error) { console.warn(`[Mencoes] nao foi possivel avisar: ${error instanceof Error ? error.message : error}`); }
  }
  return response.status(201).json({ observation });
});
app.get('/api/chamados/:id/observacoes/:observationId/anexos/:attachmentId', auth, requirePermission('calls.view'), async (request: AuthRequest, response) => {
  const callId = String(request.params.id);
  const call = await getCall(callId, await getScopedCallQuery(request, request.query.teamScope === 'true'));
  if (!call) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  const attachment = await getObservationAttachment(callId, String(request.params.observationId), String(request.params.attachmentId));
  if (!attachment) return response.status(404).json({ message: 'Anexo nao encontrado.' });
  return response.json({ attachment });
});
// Historico de alteracoes de todos os chamados (quem mudou o que e quando), por periodo. Mesma permissao da aba
// Auditoria do chamado. Ate 2000 registros por consulta (o aviso "truncated" pede um periodo menor).
app.get('/api/auditoria', auth, requirePermission('calls.view_logs'), async (request, response) => {
  // 100 por pagina (pageSize maior so para o Excel, ate 2000), filtros de pessoa, campo e busca no banco.
  const parsed = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    page: z.coerce.number().int().min(1).max(100_000).default(1), pageSize: z.coerce.number().int().min(1).max(2000).default(100),
    field: z.string().max(60).optional(), userId: z.string().max(100).optional(), q: z.string().max(100).optional(),
  }).safeParse(request.query);
  if (!parsed.success || parsed.data.from > parsed.data.to) return response.status(400).json({ message: 'Informe um periodo valido (de/ate no formato AAAA-MM-DD).' });
  try {
    const fromIso = new Date(`${parsed.data.from}T00:00:00-03:00`).toISOString();
    const toIso = new Date(`${parsed.data.to}T23:59:59.999-03:00`).toISOString();
    const { page, pageSize, field, userId, q } = parsed.data;
    const result = await listAuditLogPage({ fromIso, toIso }, { field: field || undefined, userId: userId || undefined, q: q || undefined }, page, pageSize);
    return response.json({ ...result, page, pageSize, totalPages: Math.max(1, Math.ceil(result.total / pageSize)), truncated: false });
  } catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar o historico.' }); }
});
app.get('/api/chamados/:id/logs', auth, requirePermission('calls.view_logs'), async (request, response) => response.json({ logs: await listAuditLogs(String(request.params.id)) }));
// Coletor OFS (extensao do Chrome): recebe o mesmo CSV que a pessoa subiria no Painel diario e faz os dois passos do
// envio manual — salva o painel do dia e atualiza a base D-0/Status OFS dos chamados. Autenticado por token de maquina.
let ofsIngestRunning = false;
function hasValidOfsToken(request: Request) {
  if (!ofsIngestToken) return false;
  const provided = Buffer.from(String(request.headers['x-redeflow-ofs-token'] || ''));
  const expected = Buffer.from(ofsIngestToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
// Login da extensao com o usuario do sistema: gera uma sessao de 30 dias que so vale para enviar o export do OFS
// (a coleta automatica roda de hora em hora, inclusive de madrugada). Exige a permissao de importar.
const OFS_COLLECTOR_PERMISSION: PermissionCode = 'imports.create';
async function loadActiveUser(userId: string): Promise<AuthUser | undefined> {
  if (isSupabaseConfigured()) {
    const user = await getSupabaseProfile(userId);
    return user && user.active ? user : undefined;
  }
  const user = (await listUsers()).find((item) => item.id === userId);
  return user && user.active ? getAuthUser(user) : undefined;
}
app.post('/api/integrations/ofs/login', async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Informe e-mail e senha validos.' });
  const result = await checkCredentials(request, parsed.data.email, parsed.data.password);
  if (!('user' in result)) return response.status(result.status).json({ message: result.message });
  if (result.user.mustChangePassword) return response.status(403).json({ message: 'Troque sua senha no sistema antes de entrar na extensao.' });
  if (!result.user.role.permissions.includes(OFS_COLLECTOR_PERMISSION)) return response.status(403).json({ message: 'Seu perfil nao tem permissao para enviar dados do OFS (Importacoes).' });
  const token = jwt.sign({ sub: result.user.id, scope: OFS_COLLECTOR_SCOPE }, jwtSecret!, { expiresIn: '30d' });
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  return response.json({ token, expiresAt, user: { id: result.user.id, name: result.user.name, email: result.user.email } });
});
// Quem esta enviando: o usuario logado na extensao (sessao do coletor) ou o token de maquina antigo.
async function ofsCollectorIdentity(request: Request): Promise<{ label: string } | { status: number; message: string }> {
  const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  if (bearer) {
    let payload: { sub?: string; scope?: string };
    try { payload = jwt.verify(bearer, jwtSecret!) as { sub?: string; scope?: string }; }
    catch { return { status: 401, message: 'Sessao da extensao expirada. Entre novamente.' }; }
    const user = payload.sub ? await loadActiveUser(payload.sub) : undefined;
    if (!user) return { status: 401, message: 'Usuario inativo ou removido. Entre novamente.' };
    if (!user.role.permissions.includes(OFS_COLLECTOR_PERMISSION)) return { status: 403, message: 'Seu perfil nao tem permissao para enviar dados do OFS (Importacoes).' };
    return { label: user.name };
  }
  if (request.headers['x-redeflow-ofs-token']) {
    if (!ofsIngestToken) return { status: 503, message: 'Token de maquina do Coletor OFS nao configurado no servidor (OFS_INGEST_TOKEN).' };
    return hasValidOfsToken(request) ? { label: '' } : { status: 401, message: 'Token do Coletor OFS invalido.' };
  }
  return { status: 401, message: 'Entre na extensao com seu usuario do JH RedeFlow.' };
}
app.post('/api/integrations/ofs/export', async (request, response) => {
  const identity = await ofsCollectorIdentity(request);
  if (!('label' in identity)) return response.status(identity.status).json({ message: identity.message });
  const parsed = z.object({ csv: z.string().min(1).max(14_000_000), nome: z.string().trim().max(255).optional(), maquina: z.string().trim().max(120).optional(), data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Envie o CSV exportado do OFS.' });
  const today = toOperationalDate();
  // `data` (opcional) = dia exportado; dias anteriores ate 31 dias atras. Sem `data`, e o dia de hoje.
  const businessDate = parsed.data.data || today;
  if (businessDate > today || businessDate < addDays(today, -31)) return response.status(400).json({ message: 'A data do export deve ser hoje ou um dos ultimos 31 dias.' });
  const isToday = businessDate === today;
  const dateCheck = countRowsForDate(parsed.data.csv, businessDate);
  if (dateCheck.hasDateColumn && !dateCheck.matching) return response.status(422).json({ message: `Nenhuma linha do CSV e de ${businessDate}; nada foi gravado.` });
  if (ofsIngestRunning) return response.status(409).json({ message: 'Outro envio do Coletor OFS esta sendo processado. Tente no proximo ciclo.' });
  ofsIngestRunning = true;
  try {
    const data = parseOfsActivityExport(parsed.data.csv);
    if (!data.records?.length) return response.status(422).json({ message: 'O CSV nao tem atividades de manutencao de rede; o Painel diario nao foi alterado.' });
    const fileName = parsed.data.nome || `ofs-${businessDate}.csv`;
    const uploadedBy = `Coletor OFS${identity.label ? ` – ${identity.label}` : ''}${parsed.data.maquina ? ` (${parsed.data.maquina})` : ''}`;
    const base = await saveManualDailyBase(fileName, data, uploadedBy, businessDate);
    let d0: { rows: number; matchedCalls: number; updatedCalls: number; unmatchedRows: number } | undefined;
    let d0Error: string | undefined;
    let clusteredCalls = 0;
    try {
      const d0File = parseImport(fileName, Buffer.from(parsed.data.csv, 'utf8').toString('base64'));
      if (d0File.errors.length) d0Error = d0File.errors.join(' ');
      else if (!hasD0Identifiers(d0File.rows)) d0Error = 'O CSV nao tem OS, BDESK, Office Track ou Contrato para cruzar os chamados.';
      // Hoje: substitui a base D-0 (snapshot do dia) e atualiza os chamados. Dia anterior: so atualiza os chamados
      // (Status OFS, Data Fim etc.), sem sobrescrever a D-0 de hoje.
      else {
        d0 = isToday ? await replaceD0Base(fileName, uploadedBy, d0File.rows) : await applyOfsRowsToCalls(d0File.rows, uploadedBy);
        // Ordens ja atribuidas nao estao nos baldes de cluster: o cluster vem pela Workzone aprendida.
        clusteredCalls = await assignClustersFromWorkzones(d0File.rows).catch(() => 0);
      }
    } catch (error) {
      d0Error = error instanceof Error ? error.message : 'Nao foi possivel atualizar a base D-0.';
    }
    console.log(`[Coletor OFS] ${uploadedBy}: ${data.records.length} atividades de rede no painel de ${businessDate}; chamados ${d0 ? `${d0.matchedCalls} cruzados, ${d0.updatedCalls} atualizados, ${clusteredCalls} com cluster pela Workzone` : `nao atualizados (${d0Error})`}`);
    void recordIntegrationEvent('export', !d0Error, `${data.records.length} atividades de ${businessDate}; ${d0 ? `${d0.matchedCalls} chamados cruzados, ${d0.updatedCalls} atualizados` : `chamados não atualizados (${d0Error})`}`, { businessDate, by: uploadedBy, records: data.records.length, ...(d0 || {}), d0Error });
    return response.json({ ok: true, painel: { businessDate: base.businessDate, records: data.records.length, technicians: data.technicians.length, orders: data.orders.length }, d0, d0Error, clusteredCalls });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nao foi possivel processar o CSV do OFS.';
    void recordIntegrationEvent('export', false, `Export recusado: ${message}`, { businessDate });
    return response.status(422).json({ message });
  } finally {
    ofsIngestRunning = false;
  }
});
// Export de um balde de cluster (CLUSTER_C08, C09, C11, C12): marca o cluster das ordens que estao nele e aprende
// Workzone -> cluster. Nao mexe no Painel diario nem na base D-0 (sao so as ordens daquele balde).
app.post('/api/integrations/ofs/cluster', async (request, response) => {
  const identity = await ofsCollectorIdentity(request);
  if (!('label' in identity)) return response.status(identity.status).json({ message: identity.message });
  const parsed = z.object({ csv: z.string().min(1).max(14_000_000), balde: z.string().trim().min(2).max(80), nome: z.string().trim().max(255).optional() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Envie o CSV e o nome do balde do cluster.' });
  if (!normalizeCluster(parsed.data.balde)) return response.status(400).json({ message: `Balde sem cluster reconhecivel: ${parsed.data.balde}` });
  try {
    const file = parseImport(parsed.data.nome || `${parsed.data.balde}.csv`, Buffer.from(parsed.data.csv, 'utf8').toString('base64'));
    if (file.errors.length) return response.status(422).json({ message: file.errors.join(' ') });
    const result = await applyClusterExport(file.rows, parsed.data.balde);
    console.log(`[Coletor OFS] ${identity.label || 'token'}: ${parsed.data.balde} ${result.rows} linhas, ${result.matchedCalls} chamados, ${result.updatedCalls} com cluster novo, ${result.learnedWorkzones} workzones`);
    void recordIntegrationEvent('cluster', true, `${parsed.data.balde}: ${result.matchedCalls} chamados, ${result.updatedCalls} com cluster novo`, { balde: parsed.data.balde, ...result });
    return response.json({ ok: true, cluster: normalizeCluster(parsed.data.balde), ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nao foi possivel processar o CSV do cluster.';
    void recordIntegrationEvent('cluster', false, `${parsed.data.balde}: ${message}`, { balde: parsed.data.balde });
    return response.status(422).json({ message });
  }
});
// Fechamento do OFS (Motivo, Submotivo, Tipo do Cabo): nao vem no CSV. A extensao pergunta quais chamados ja
// terminaram e ainda nao tem o Submotivo, abre cada atividade concluida no OFS e devolve os tres campos.
const ofsClosingActor = (label: string) => {
  const name = `Coletor OFS${label ? ` – ${label}` : ''}`;
  return { id: 'system-ofs-closing', name, email: 'system-ofs@jhtelecom.com', roleId: 'system', active: true, createdAt: new Date().toISOString() };
};
// Finaliza os chamados que ja tem tudo do OFS (ver callsReadyToFinish). Roda a cada ciclo da extensao.
async function finishCallsReadyFromOfs(label: string) {
  const ready = callsReadyToFinish(await listCalls(['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo']));
  const actor = ofsClosingActor(label);
  const finished: string[] = [];
  for (const item of ready) if (await updateCall(item.callId, item.fields, actor)) finished.push(item.orderNumber);
  if (finished.length) console.log(`[Coletor OFS] ${actor.name}: ${finished.length} chamados finalizados pelo fechamento do OFS (${finished.join(', ')})`);
  return finished;
}
app.get('/api/integrations/ofs/fechamentos/pendentes', async (request, response) => {
  const identity = await ofsCollectorIdentity(request);
  if (!('label' in identity)) return response.status(identity.status).json({ message: identity.message });
  const finalizados = await finishCallsReadyFromOfs(identity.label);
  const ordens = pendingClosingOrders(await listCalls());
  void recordIntegrationEvent('closing', true, `Ciclo iniciado: ${ordens.length} ordem(ns) para ler${finalizados.length ? `, ${finalizados.length} finalizada(s)` : ''}`, { stage: 'poll', pendentes: ordens.length, finalizados });
  return response.json({ ordens, finalizados });
});
app.post('/api/integrations/ofs/fechamentos', async (request, response) => {
  const identity = await ofsCollectorIdentity(request);
  if (!('label' in identity)) return response.status(identity.status).json({ message: identity.message });
  const field = z.string().trim().max(500).nullish();
  const parsed = z.object({ itens: z.array(z.object({ ordem: z.string().trim().min(1).max(60), motivo: field, submotivo: field, tipoCabo: field, semFechamento: z.boolean().nullish() })).max(100) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Envie os fechamentos lidos do OFS.' });
  const { matches, unmatched } = matchOfsClosing(parsed.data.itens, await listCalls());
  const actor = ofsClosingActor(identity.label);
  let updated = 0;
  for (const match of matches) if (await updateCall(match.callId, match.fields, actor)) updated += 1;
  const finalizados = await finishCallsReadyFromOfs(identity.label);
  console.log(`[Coletor OFS] ${actor.name}: fechamentos recebidos ${parsed.data.itens.length}, atualizados ${updated}, finalizados ${finalizados.length}, sem chamado ${unmatched.length}`);
  void recordIntegrationEvent('closing', true, `${parsed.data.itens.length} fechamento(s) recebidos, ${updated} atualizados, ${finalizados.length} finalizados${unmatched.length ? `, ${unmatched.length} sem chamado` : ''}`, { stage: 'post', recebidos: parsed.data.itens.length, atualizados: updated, finalizados, semChamado: unmatched });
  return response.json({ recebidos: parsed.data.itens.length, atualizados: updated, finalizados, semChamado: unmatched });
});
// Relato da extensao ao fim de cada ciclo (v1.3.4+): o que deu certo ou errado do lado do navegador (aba do OFS,
// login, export), que o servidor nao ve sozinho. Vai para o painel Integracao OFS.
app.post('/api/integrations/ofs/relato', async (request, response) => {
  const identity = await ofsCollectorIdentity(request);
  if (!('label' in identity)) return response.status(identity.status).json({ message: identity.message });
  const text = z.string().trim().max(500);
  const parsed = z.object({
    tipo: z.enum(['export', 'closing', 'cluster']),
    ok: z.boolean(),
    resumo: text.optional(),
    erro: text.optional(),
    versao: z.string().trim().max(20).optional(),
    falhas: z.array(z.object({ ordem: z.string().trim().max(60), tipo: z.string().trim().max(20).optional(), motivo: text })).max(50).optional(),
  }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Relato invalido.' });
  const { tipo, ok, resumo, erro, versao, falhas = [] } = parsed.data;
  const errors = falhas.filter((item) => item.tipo === 'erro').length;
  const summary = ok ? (resumo || 'Ciclo concluído') + (errors ? ` (${errors} ordem(ns) com erro de leitura)` : '') : (erro || 'Falhou sem mensagem');
  // O ciclo vale pelo resultado geral; ordens com erro de leitura ficam no resumo (e o semaforo vira Atencao).
  await recordIntegrationEvent(tipo, ok, summary, { stage: 'extension', by: identity.label, versao, falhas, orderErrors: errors });
  return response.json({ ok: true });
});
const maskChat = (chat: string) => (chat.length > 8 ? `${chat.slice(0, 4)}…${chat.slice(-6)}` : '…');
app.get('/api/integracoes/saude', auth, requirePermission('imports.view'), async (_request, response) => {
  try {
    const [events, active, d0] = await Promise.all([
      listIntegrationEvents(72),
      listCalls(['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo']),
      getD0BaseSummary().catch(() => undefined),
    ]);
    const stuck = stuckOfsCalls(active);
    const whatsapp = whatsappConfig();
    return response.json({
      checks: healthChecks(events, stuck),
      stuck,
      reasonLabels: STUCK_REASON_LABEL,
      events: events.filter((event) => ['export', 'cluster', 'closing', 'extension', 'integration_alert', 'daily_report'].includes(event.kind)).slice(0, 60),
      d0: d0 ? { fileName: d0.fileName, rowCount: d0.rowCount, uploadedAt: d0.uploadedAt, uploadedBy: d0.uploadedBy } : null,
      whatsapp: { configured: Boolean(whatsapp), chat: whatsapp ? maskChat(whatsapp.chat) : null, alerts: events.filter((event) => event.kind === 'sla_alert').slice(0, 10) },
    });
  } catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel montar o painel da integracao.' }); }
});

// Aviso no WhatsApp 1h antes do prazo de 6h. So roda com WUZAPI_API_URL, WUZAPI_USER_TOKEN e WUZAPI_ALERT_CHAT
// configurados. Cada chamado e avisado uma vez (os ja avisados ficam em integration_events, kind sla_alert).
let slaAlertRunning = false;
async function runWhatsAppSlaAlerts() {
  const config = whatsappConfig();
  if (!config || slaAlertRunning) return;
  slaAlertRunning = true;
  try {
    const near = nearDeadlineCalls(await listCalls(['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo']), WHATSAPP_WINDOW_MINUTES);
    if (!near.length) return;
    const alreadySent = new Set((await listIntegrationEvents(12, ['sla_alert'])).filter((event) => event.ok).flatMap((event) => (Array.isArray(event.details.callIds) ? event.details.callIds as string[] : [])));
    const fresh = near.filter((call) => !alreadySent.has(call.id));
    if (!fresh.length) return;
    try {
      await sendWhatsAppText(config, whatsappAlertText(fresh, process.env.APP_PUBLIC_URL || 'https://jh-rede.vercel.app'));
      await recordIntegrationEvent('sla_alert', true, `Aviso enviado: ${fresh.map((call) => call.orderNumber).join(', ')}`, { callIds: fresh.map((call) => call.id) });
      console.log(`[Aviso de prazo] WhatsApp enviado para ${fresh.length} chamado(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordIntegrationEvent('sla_alert', false, `Falha ao enviar o aviso: ${message}`, { callIds: fresh.map((call) => call.id) });
      console.warn(`[Aviso de prazo] falha no WhatsApp: ${message}`);
    }
  } catch (error) {
    console.warn(`[Aviso de prazo] erro: ${error instanceof Error ? error.message : error}`);
  } finally {
    slaAlertRunning = false;
  }
}

// Informativo de acionamento para o Casa Cliente: card de uma OLT da lista -> resumo no grupo do Casa Cliente
// (WUZAPI_INFORMATIVO_CHAT, padrao o grupo da planilha) com link so de leitura. Uma vez por acionamento
// (integration_events, kind olt_notice). Sem WhatsApp configurado, nao faz nada.
// A analise (Gemini ou regras) as vezes deixa campo vazio que a leitura simples do card achou.
function withCardFallback(analysis: Partial<ActivationAnalysis>, extracted: Record<string, string> = {}): Partial<ActivationAnalysis> {
  return {
    ...analysis,
    tipo_card: analysis.tipo_card || extracted.type || null,
    bdesk: analysis.bdesk || analysis.ticket || extracted.bdesk || null,
    office_track: analysis.office_track || analysis.os_ot || extracted.officeTrack || extracted.orderNumber || null,
    tipo_falha: analysis.tipo_falha || analysis.motivo || extracted.reason || null,
    olt: analysis.olt || extracted.olt || null,
    placa_pon: analysis.placa_pon || extracted.slotPon || null,
  };
}

async function sendOltNotice(activationId: string, analysis: Partial<ActivationAnalysis>, originalMessage: string) {
  const config = whatsappConfig();
  if (!config || !isNoticeOlt(analysis.olt)) return;
  try {
    const already = (await listIntegrationEvents(72, ['olt_notice'])).some((event) => event.ok && event.details.activationId === activationId);
    if (already) return;
    const chat = process.env.WUZAPI_INFORMATIVO_CHAT?.trim() || OLT_NOTICE_DEFAULT_CHAT;
    const appUrl = (process.env.APP_PUBLIC_URL || 'https://jh-rede.vercel.app').replace(/\/+$/, '');
    const link = `${appUrl}/consulta/${createPublicViewToken(activationId, jwtSecret!)}`;
    const mode = await deliverOltNotice({ ...config, chat }, analysis, originalMessage, link);
    await recordIntegrationEvent('olt_notice', true, `Informativo enviado ${mode === 'botao' ? 'com botão' : 'com link no texto'}: OLT ${analysis.olt}, BDESK ${analysis.bdesk || '-'}`, { activationId, olt: analysis.olt, chat, mode });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordIntegrationEvent('olt_notice', false, `Falha ao enviar o informativo (OLT ${analysis.olt}): ${message}`, { activationId, olt: analysis.olt });
    console.warn(`[Informativo] falha: ${message}`);
  }
}

app.post('/api/integracoes/informativo/teste', auth, requirePermission('settings.manage'), async (_request: AuthRequest, response) => {
  const config = whatsappConfig();
  if (!config) return response.status(409).json({ message: 'WhatsApp não configurado no servidor (WUZAPI_API_URL, WUZAPI_USER_TOKEN e WUZAPI_ALERT_CHAT).' });
  const chat = process.env.WUZAPI_INFORMATIVO_TEST_CHAT?.trim() || OLT_NOTICE_TEST_CHAT;
  try {
    const latest = (await listActivations())[0];
    const appUrl = (process.env.APP_PUBLIC_URL || 'https://jh-rede.vercel.app').replace(/\/+$/, '');
    const link = latest ? `${appUrl}/consulta/${createPublicViewToken(latest.id, jwtSecret!)}` : appUrl;
    const sample: Partial<ActivationAnalysis> = { tipo_card: 'TESTE (pode ignorar)', bdesk: '000000', office_track: '000000000000000', tipo_falha: 'Teste do botão', afetados: 1, olt: 'VIP-ITA-SPO-OHW-04' };
    const mode = await deliverOltNotice({ ...config, chat }, sample, 'Endereços:\nRUA DE TESTE, 1 SAO PAULO - SP\nSLOT/PON: 01/01', link);
    await recordIntegrationEvent('olt_notice', true, `Informativo de TESTE enviado ${mode === 'botao' ? 'com botão' : 'com link no texto'}`, { test: true, chat, mode });
    return response.json({ mode, chat });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordIntegrationEvent('olt_notice', false, `Falha no informativo de TESTE: ${message}`, { test: true });
    return response.status(502).json({ message: `Não foi possível enviar: ${message}` });
  }
});

// Extensao do Chrome para instalar nos computadores (Configuracoes): versao atual e o .zip montado na hora.
app.get('/api/extensao', auth, (_request, response) => {
  const info = extensionInfo();
  if (!info) return response.status(404).json({ message: 'A pasta da extensão não está neste servidor.' });
  return response.json(info);
});
app.get('/api/extensao/download', auth, (_request, response) => {
  const info = extensionInfo();
  const zip = buildExtensionZip();
  if (!info || !zip) return response.status(404).json({ message: 'A pasta da extensão não está neste servidor.' });
  response.setHeader('Content-Type', 'application/zip');
  response.setHeader('Content-Disposition', `attachment; filename="${info.fileName}"`);
  response.setHeader('Cache-Control', 'no-store');
  return response.end(zip);
});

// Consulta publica (link do informativo): so leitura, so este acionamento/chamado, sem login.
app.get('/api/public/consulta/:token', async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const activationId = readPublicViewToken(String(request.params.token), jwtSecret!);
  if (!activationId) return response.status(404).json({ message: 'Link inválido. Confira se ele foi copiado inteiro.' });
  try {
    const activation = await getActivation(activationId);
    if (!activation) return response.status(404).json({ message: 'Acionamento não encontrado.' });
    const call = activation.createdCallId ? await getCall(activation.createdCallId) : undefined;
    const closedStatuses = ['Finalizado', 'Cancelado', 'Baixar'];
    const closedAt = call ? (closedStatuses.includes(call.status) ? call.executedAt || activation.decisionAt : null) : activation.status === 'Recusado' ? activation.decisionAt : null;
    if (publicViewExpired({ receivedAt: activation.receivedAt, closedAt })) return response.status(410).json({ message: 'Este link expirou. Ele vale até 7 dias depois do encerramento do chamado.' });
    const analysis = withCardFallback((activation.analysis || {}) as Partial<ActivationAnalysis>, activation.extractedData);
    const card = {
      tipo: analysis.tipo_card || null,
      bdesk: analysis.bdesk || analysis.ticket || null,
      officeTrack: analysis.office_track || analysis.os_ot || null,
      evento: analysis.tipo_falha || analysis.motivo || null,
      afetacao: analysis.afetados ?? null,
      olt: analysis.olt || null,
      placaPon: extractAllSlotPons(activation.originalMessage).join(', ') || analysis.placa_pon || null,
      enderecos: extractNoticeAddresses(activation.originalMessage).split('\n').map((line) => line.replace(/^•\s*/, '')).filter(Boolean),
      recebidoEm: activation.receivedAt,
    };
    if (!call) return response.json({ state: activation.status === 'Recusado' ? 'recusado' : 'aguardando', card, decidedAt: activation.decisionAt || null });
    const [observations, logs] = await Promise.all([listObservations(call.id), listAuditLogs(call.id)]);
    const timeline = [
      { at: activation.receivedAt, text: 'Acionamento recebido' },
      { at: activation.decisionAt || call.openedAt, text: 'Chamado aberto' },
      ...logs.filter((log) => log.field === 'status' && log.newValue).map((log) => ({ at: log.createdAt, text: `Status: ${log.newValue}` })),
    ].filter((item) => item.at).sort((a, b) => a.at.localeCompare(b.at));
    return response.json({
      state: 'chamado',
      card,
      call: { orderNumber: call.orderNumber, status: call.status, ofsStatus: call.ofsStatus || null, technicianName: call.technicianName || null, openedAt: call.openedAt, executedAt: closedStatuses.includes(call.status) ? call.executedAt || null : null, type: call.type, region: call.region, bairro: call.bairro, olt: call.olt, slotPon: call.slotPon, result: call.result || null },
      observations: observations.filter((item) => item.text?.trim()).map((item) => ({ text: item.text.trim(), userName: item.userName, createdAt: item.createdAt })),
      timeline,
    });
  } catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Não foi possível carregar o chamado.' }); }
});

// Resumo de ontem no WhatsApp as 7h (Sao Paulo), uma vez por dia. Vai para WUZAPI_REPORT_CHAT (ou, sem ela,
// para o mesmo WUZAPI_ALERT_CHAT dos avisos). Registro em integration_events (kind daily_report).
const spHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' });
let dailyReportRunning = false;
async function runDailySummaryReport(now = new Date()) {
  const config = whatsappConfig();
  if (!config || dailyReportRunning || Number(spHour.format(now)) < 7) return;
  dailyReportRunning = true;
  const date = addDays(toOperationalDate(now.toISOString()), -1);
  try {
    const sent = (await listIntegrationEvents(36, ['daily_report'])).some((event) => event.ok && event.details.date === date);
    if (sent) return;
    const chat = process.env.WUZAPI_REPORT_CHAT?.trim() || config.chat;
    const text = dailySummaryText(dailySummary(await listCalls(), date));
    try {
      await sendWhatsAppText({ ...config, chat }, text);
      await recordIntegrationEvent('daily_report', true, `Resumo de ${date} enviado`, { date });
      console.log(`[Resumo diario] WhatsApp enviado (${date}).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordIntegrationEvent('daily_report', false, `Falha ao enviar o resumo de ${date}: ${message}`, { date });
      console.warn(`[Resumo diario] falha no WhatsApp: ${message}`);
    }
  } catch (error) {
    console.warn(`[Resumo diario] erro: ${error instanceof Error ? error.message : error}`);
  } finally {
    dailyReportRunning = false;
  }
}

// (15) Coleta do OFS parada: mais de 2h sem envio certo de export ou fechamentos. Avisa uma vez no WhatsApp
// (grupo dos avisos) quando para e outra quando volta. Estado guardado em integration_events (integration_alert).
let outageRunning = false;
async function runIntegrationWatch() {
  const config = whatsappConfig();
  if (!config || outageRunning) return;
  outageRunning = true;
  try {
    const events = await listIntegrationEvents(48);
    const outage = integrationOutage(events);
    if (!outage.known) return;
    const lastAlert = events.filter((event) => event.kind === 'integration_alert' && event.ok).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    const alerted = lastAlert?.details.state === 'down';
    if (outage.down === alerted) return; // nada mudou desde o ultimo aviso
    const appUrl = process.env.APP_PUBLIC_URL || 'https://jh-rede.vercel.app';
    try {
      await sendWhatsAppText(config, outage.down ? outageText(outage, appUrl) : recoveryText(appUrl));
      await recordIntegrationEvent('integration_alert', true, outage.down ? 'Aviso de coleta parada enviado' : 'Aviso de coleta de volta enviado', { state: outage.down ? 'down' : 'up', lastOkAt: outage.lastOkAt });
    } catch (error) {
      await recordIntegrationEvent('integration_alert', false, `Falha ao avisar a coleta parada: ${error instanceof Error ? error.message : error}`, { state: outage.down ? 'down' : 'up' });
    }
  } catch (error) {
    console.warn(`[Coleta parada] erro: ${error instanceof Error ? error.message : error}`);
  } finally {
    outageRunning = false;
  }
}

// (3) Escalonamento: sem tecnico ha mais de 5h vai para quem atribui chamados (calls.assign); com tecnico e sem
// observacao ha mais de 2h vai para o supervisor do tecnico (ou, sem usuario de supervisor, para quem atribui).
// Aviso no sino sempre; no WhatsApp tambem, se ligado. Cada chamado e escalado uma vez por regra a cada 24h.
let escalationRunning = false;
async function runEscalations() {
  if (escalationRunning) return;
  escalationRunning = true;
  try {
    const found = escalations(await listCalls(['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo']));
    if (!found.length) return;
    const done = new Set((await listIntegrationEvents(24, ['escalation'])).map((event) => `${event.details.callId}|${event.details.rule}`));
    const fresh = found.filter((item) => !done.has(`${item.callId}|${item.rule}`));
    if (!fresh.length) return;
    const [users, technicians, supervisors] = await Promise.all([listUsers(), listTechnicians(), listSupervisors()]);
    const assigners = users.filter((user) => user.active && user.role?.permissions?.includes('calls.assign')).map((user) => user.id);
    const notifications = fresh.flatMap((item) => {
      const supervisorId = item.technicianId ? technicians.find((tech) => tech.id === item.technicianId)?.supervisorId : undefined;
      const supervisorUser = supervisorId ? supervisors.find((sup) => sup.id === supervisorId)?.userId : undefined;
      const targets = item.rule === 'sem-observacao' && supervisorUser ? [supervisorUser] : assigners;
      return targets.map((userId) => ({ userId, kind: 'escalation', title: `Escalado: ${item.orderNumber}`, detail: `${ESCALATION_LABEL[item.rule]}${item.technicianName ? ` · ${item.technicianName}` : ''}${item.region ? ` · ${item.region}` : ''}`, href: `/chamados/${item.callId}` }));
    });
    await createUserNotifications(notifications).catch((error) => console.warn(`[Escalonamento] sino: ${error instanceof Error ? error.message : error}`));
    const config = whatsappConfig();
    let whatsapp: string | undefined;
    if (config) {
      try { await sendWhatsAppText(config, escalationText(fresh, process.env.APP_PUBLIC_URL || 'https://jh-rede.vercel.app')); whatsapp = 'enviado'; }
      catch (error) { whatsapp = `falhou: ${error instanceof Error ? error.message : error}`; }
    }
    for (const item of fresh) await recordIntegrationEvent('escalation', true, `${item.orderNumber}: ${ESCALATION_LABEL[item.rule]}`, { callId: item.callId, rule: item.rule, whatsapp });
    console.log(`[Escalonamento] ${fresh.length} chamado(s) escalado(s)${whatsapp ? `; WhatsApp ${whatsapp}` : ''}.`);
  } catch (error) {
    console.warn(`[Escalonamento] erro: ${error instanceof Error ? error.message : error}`);
  } finally {
    escalationRunning = false;
  }
}

// Diagnostico dos grupos: quais grupos mandam mensagens e quantas parecem acionamento. Ajuda a achar o ID
// certo para WUZAPI_ACTIVATION_GROUP_ID quando o grupo muda (novo grupo, numero removido etc.).
type WuzApiGroupSighting = { chatId: string; authorized: boolean; messages: number; activationLike: number; lastAt: string; lastSender?: string; lastActivationAt?: string };
const wuzapiGroupSightings = new Map<string, WuzApiGroupSighting>();
const unauthorizedGroupWarnings = new Map<string, number>();
function recordWuzApiGroupSighting(message: ReturnType<typeof parseIncomingMessage>) {
  const chatId = message.chatId!;
  const current = wuzapiGroupSightings.get(chatId) || { chatId, authorized: activationGroupIds.includes(chatId), messages: 0, activationLike: 0, lastAt: '' };
  const text = message.message?.trim() || message.quotedMessage?.trim() || '';
  const activationLike = Boolean(text) && Boolean(analyzeOperationalMessage(text).tipo_card);
  current.messages += 1;
  current.lastAt = new Date().toISOString();
  current.lastSender = message.senderName || message.sender || current.lastSender;
  if (activationLike) { current.activationLike += 1; current.lastActivationAt = current.lastAt; }
  wuzapiGroupSightings.set(chatId, current);
  if (activationLike && !current.authorized) console.warn(`[WuzAPI] card de acionamento recebido de grupo NAO configurado: ${chatId} (${current.activationLike} ate agora). Se for o grupo de acionamentos, adicione em WUZAPI_ACTIVATION_GROUP_ID.`);
  if (wuzapiGroupSightings.size > 300) wuzapiGroupSightings.delete(wuzapiGroupSightings.keys().next().value!);
}
// Um aviso por grupo nao autorizado a cada hora, em vez de um por mensagem.
function shouldWarnUnauthorizedGroup(chatId?: string) {
  if (!chatId) return true;
  const last = unauthorizedGroupWarnings.get(chatId) || 0;
  if (Date.now() - last < 3_600_000) return false;
  unauthorizedGroupWarnings.set(chatId, Date.now());
  return true;
}
app.get('/api/integrations/wuzapi/grupos', auth, requirePermission('settings.manage'), (_request, response) => response.json({
  configured: activationGroupIds,
  filterDisabled: skipWuzapiGroupFilter,
  groups: [...wuzapiGroupSightings.values()].sort((left, right) => right.activationLike - left.activationLike || right.messages - left.messages),
}));
app.post('/api/integrations/wuzapi/webhook', async (request, response) => {
  const body = normalizeWuzApiBody(request);
  if (wuzapiDebug) console.log('[WuzAPI] JSON recebido:', JSON.stringify(redactWuzApiPayload(request, body), null, 2));
  const providedToken = extractWuzApiToken(request, body);
  if (providedToken !== wuzapiWebhookToken) return response.status(401).json({ message: 'Webhook nao autorizado.' });
  if (!activationGroupIds.length && !skipWuzapiGroupFilter) return response.status(503).json({ status: 'ignored' });
  const message = parseIncomingMessage(body);
  logWuzApiDecision('mensagem normalizada', { id: message.id, chatId: message.chatId, isGroup: message.isGroup, eventType: message.eventType, hasText: Boolean(message.message?.trim()), hasQuotedText: Boolean(message.quotedMessage?.trim()), isFromMe: message.isFromMe });
  if (message.id) {
    const previous = processedWebhookMessages.get(message.id);
    if (previous && previous.expiresAt > Date.now()) return response.status(202).json({ activationId: previous.activationId, status: 'Pendente', duplicate: true });
    processedWebhookMessages.delete(message.id);
  }
  // Recibos, presenca e afins saem antes do filtro de grupo (nao poluem o log com "chatId nenhum").
  const eventType = message.eventType?.toLowerCase() || '';
  const knownMessageEvent = ['message', 'messages.upsert', 'message.upsert', 'message.new', 'messages.new'].includes(eventType);
  const knownNonMessageEvent = ['connected', 'connection', 'presence', 'presence.update', 'receipt', 'message.ack', 'logout'].includes(eventType);
  if (knownNonMessageEvent || (eventType && !knownMessageEvent && !message.message?.trim())) { logWuzApiDecision('ignorado por tipo', { eventType }); return response.status(202).json({ status: 'ignored', reason: 'Evento nao e uma mensagem.' }); }
  if (message.chatId && message.isGroup === true) recordWuzApiGroupSighting(message);
  if (!skipWuzapiGroupFilter && activationGroupIds.length && (message.isGroup !== true || !message.chatId || !activationGroupIds.includes(message.chatId))) {
    const reason = message.isGroup !== true
      ? 'Mensagem privada nao autorizada.'
      : !message.chatId
        ? 'Chat nao identificado.'
        : 'Grupo nao autorizado.';
    if (reason !== 'Grupo nao autorizado.' || shouldWarnUnauthorizedGroup(message.chatId)) console.warn(`[WuzAPI] acionamento ignorado: grupos esperados="${activationGroupIds.join(',')}" chatId recebido="${message.chatId || 'nenhum'}" sender="${message.sender || 'nenhum'}" isGroup=${String(message.isGroup)}`);
    logWuzApiDecision('ignorado por grupo', { reason, expectedGroups: activationGroupIds, receivedGroup: message.chatId || null });
    return response.status(202).json({ status: 'ignored', reason, chatId: message.chatId || null, isGroup: message.isGroup ?? false });
  }
  // Grupo autorizado: toda decisao vai para o log (sem precisar de WUZAPI_DEBUG), para dar para acompanhar no Render.
  const groupLog = (decision: string) => console.log(`[WuzAPI] grupo ${message.chatId || '-'}${message.isFromMe ? ' (enviada pelo numero conectado)' : ''}: ${decision}`);
  if (!message.message?.trim() && !message.quotedMessage?.trim()) { groupLog('ignorada, sem texto'); return response.status(202).json({ status: 'ignored', reason: 'Mensagem sem texto analisavel.' }); }
  // Informativo de acionamento (mandado pelo proprio sistema ou pela planilha) nao e card novo.
  if (isOltNoticeMessage(message.message)) { groupLog('ignorada, e informativo de acionamento'); return response.status(202).json({ status: 'ignored', reason: 'Informativo de acionamento.' }); }
  const analysisMessage = message.message?.trim() && analyzeOperationalMessage(message).eh_acionamento ? message : { ...message, message: message.quotedMessage };
  const fallbackAnalysis = analyzeOperationalMessage(analysisMessage);
  if (!fallbackAnalysis.eh_acionamento) { groupLog(`ignorada, sem sinais de acionamento: "${(analysisMessage.message || '').replace(/\s+/g, ' ').slice(0, 80)}"`); return response.status(202).json({ status: 'ignored', reason: 'Mensagem sem sinais de acionamento.' }); }
  const analysis = await interpretWithGemini(analysisMessage, fallbackAnalysis);
  if (!analysis.eh_acionamento) { groupLog('ignorada pela analise (Gemini)'); return response.status(202).json({ status: 'ignored', reason: 'Mensagem classificada como nao operacional.' }); }
  const operationalText = analysisMessage.message || '';
  const legacyData = extractOperationalData(operationalText);
  try {
    const activation = await receiveActivation({ source: message.source || 'wuzapi', originalMessage: operationalText, extractedData: legacyData, analysis });
    groupLog(`acionamento registrado ${activation.id} (${analysis.tipo_card || 'sem tipo'}, BDESK ${analysis.bdesk || '-'})`);
    void sendOltNotice(activation.id, withCardFallback(analysis, legacyData), operationalText);
    if (message.id) processedWebhookMessages.set(message.id, { activationId: activation.id, expiresAt: Date.now() + webhookDeduplicationWindowMs });
    return response.status(202).json({ activationId: activation.id, status: activation.status });
  } catch (error) {
    console.error('[WuzAPI] falha ao registrar acionamento:', error);
    return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel registrar o acionamento.' });
  }
});
app.get('/api/acionamentos', auth, requirePermission('activations.view'), async (request, response) => response.json({ activations: await listActivations(request.query.status as 'Pendente' | 'Aceito' | 'Recusado' | undefined) }));
app.post('/api/acionamentos/:id/aceitar', auth, requirePermission('activations.decide'), async (request: AuthRequest, response) => {
  try {
    const result = await decideActivation(String(request.params.id), 'Aceito', request.authUser!);
    if (!result.activation) return response.status(404).json({ message: 'Acionamento nao encontrado ou ja processado.' });
    return response.json(result);
  } catch (error) { return response.status(422).json({ message: error instanceof Error ? `Nao foi possivel aceitar o acionamento. ${error.message}` : 'Nao foi possivel aceitar o acionamento.' }); }
});
app.post('/api/acionamentos/:id/recusar', auth, requirePermission('activations.decide'), async (request: AuthRequest, response) => {
  const parsed = z.object({ reason: z.string().trim().min(3) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Informe o motivo da recusa.' });
  const result = await decideActivation(String(request.params.id), 'Recusado', request.authUser!, parsed.data.reason);
  if (!result.activation) return response.status(404).json({ message: 'Acionamento nao encontrado ou ja processado.' });
  return response.json(result);
});
app.get('/api/importacoes', auth, requirePermission('imports.view'), async (_request, response) => response.json({ imports: await listImports() }));
app.get('/api/importacoes/d0', auth, requirePermission('imports.view'), async (_request, response) => response.json({ base: await getD0BaseSummary() }));
app.post('/api/importacoes/d0', auth, requirePermission('imports.create'), async (request: AuthRequest, response) => {
  const parsed = z.object({ fileName: z.string().min(1), content: z.string().min(1) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Arquivo D-0 invalido.' });
  try {
    const parsedFile = parseImport(parsed.data.fileName, parsed.data.content);
    if (parsedFile.errors.length) return response.status(400).json({ message: parsedFile.errors.join(' ') });
    if (!hasD0Identifiers(parsedFile.rows)) return response.status(400).json({ message: 'A planilha precisa conter OS, BDESK, Office Track, OS Casa Cliente ou Contrato para cruzar os chamados.' });
    const sync = await replaceD0Base(parsed.data.fileName, request.authUser!.name, parsedFile.rows);
    return response.json({ sync, base: await getD0BaseSummary() });
  } catch (error) {
    return response.status(422).json({ message: error instanceof Error ? error.message : 'Nao foi possivel sincronizar a base D-0.' });
  }
});
app.delete('/api/importacoes/d0', auth, requirePermission('imports.create'), async (_request, response) => {
  try { return response.json({ deleted: await clearD0Base(), base: await getD0BaseSummary() }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel limpar a base D-0.' }); }
});
app.post('/api/importacoes/chamados-atuais/preview', auth, requirePermission('imports.create'), requirePermission('calls.create'), async (request: AuthRequest, response) => {
  const parsed = z.object({ fileName: z.string().trim().min(1).max(255), contentBase64: z.string().min(1) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Envie uma planilha de chamados atuais valida.' });
  try {
    const buffer = Buffer.from(parsed.data.contentBase64, 'base64');
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) return response.status(413).json({ message: 'A planilha deve ter ate 10 MB.' });
    const result = parseCurrentCallsWorkbook(parsed.data.fileName, buffer);
    const groups = new Map<string, CurrentCallsCandidate[]>();
    for (const candidate of result.candidates) {
      const key = normalizeHistoricalIdentifier(candidate.call.orderNumber);
      const group = groups.get(key) || [];
      group.push(candidate);
      groups.set(key, group);
    }
    // Mesma ordem em mais de uma linha (ex.: dois tecnicos no mesmo evento): entra um chamado so, com o tecnico da
    // primeira linha; os demais tecnicos ficam registrados nas observacoes.
    const duplicateRows = [...groups.values()].filter((group) => group.length > 1).reduce((total, group) => total + group.length - 1, 0);
    const uniqueCandidates = [...groups.values()].map((group) => {
      const [first, ...others] = group;
      const otherTechnicians = [...new Set(others.map((candidate) => candidate.call.technicianName).filter((name): name is string => Boolean(name) && name !== first.call.technicianName))];
      if (otherTechnicians.length) first.call.notes = `Também acionado: ${otherTechnicians.join(', ')}.\n${first.call.notes}`;
      first.identifiers = [...new Set(group.flatMap((candidate) => candidate.identifiers))];
      return first;
    });
    const existingIdentifiers = await findExistingCallIdentifiers();
    const candidates = uniqueCandidates.filter((candidate) => !candidate.identifiers.some((identifier) => existingIdentifiers.has(normalizeHistoricalIdentifier(identifier))));
    const registeredTechnicians = await listTechnicians();
    const unmatchedTechnicians = new Set<string>();
    for (const candidate of candidates) {
      const name = candidate.call.technicianName;
      if (!name) continue;
      const technician = findHistoricalTechnician(name, registeredTechnicians);
      if (technician) {
        candidate.call.technicianId = technician.id;
        candidate.call.technicianName = technician.name;
      } else unmatchedTechnicians.add(name);
    }
    const alreadyInSystem = uniqueCandidates.length - candidates.length;
    const previewId = crypto.randomUUID();
    const expiresAt = Date.now() + 30 * 60 * 1000;
    for (const [id, pending] of pendingCurrentCallsImports) if (pending.expiresAt < Date.now()) pendingCurrentCallsImports.delete(id);
    pendingCurrentCallsImports.set(previewId, { userId: request.authUser!.id, fileName: parsed.data.fileName, candidates, expiresAt });
    const canWrite = isSupabaseConfigured();
    const target = isSupabaseConfigured() ? 'Supabase ativo' : 'Demo em memoria';
    const byStatus: Record<string, number> = {};
    candidates.forEach(({ call }) => { byStatus[call.status] = (byStatus[call.status] || 0) + 1; });
    return response.json({
      previewId,
      fileName: parsed.data.fileName,
      sheetName: result.sheetName,
      target,
      canWrite,
      totalRows: result.totalRows,
      parsedRows: result.candidates.length,
      importableRows: candidates.length,
      alreadyInSystem,
      duplicateRows,
      invalidRows: result.invalidRows,
      missingFinishRows: result.missingFinishRows,
      ignoredFinishRows: result.ignoredFinishRows,
      unmatchedTechnicians: [...unmatchedTechnicians].sort((left, right) => left.localeCompare(right)),
      byStatus,
      sample: candidates.slice(0, 12).map(({ rowNumber, call }) => ({ rowNumber, orderNumber: call.orderNumber, status: call.status, openedAt: call.openedAt, executedAt: call.executedAt, region: call.region, technicianName: call.technicianName })),
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (error) {
    return response.status(422).json({ message: error instanceof Error ? error.message : 'Nao foi possivel analisar a planilha de chamados atuais.' });
  }
});
app.post('/api/importacoes/chamados-atuais/:previewId/confirmar', auth, requirePermission('imports.create'), requirePermission('calls.create'), async (request: AuthRequest, response) => {
  const previewId = String(request.params.previewId);
  const pending = pendingCurrentCallsImports.get(previewId);
  if (!pending || pending.userId !== request.authUser!.id || pending.expiresAt < Date.now()) {
    pendingCurrentCallsImports.delete(previewId);
    return response.status(410).json({ message: 'A previa expirou ou nao pertence a esta sessao. Gere uma previa nova.' });
  }
  if (!isSupabaseConfigured()) return response.status(409).json({ message: 'Esta instancia esta em modo demo e nao grava no banco ativo. Abra esta importacao no ambiente conectado ao banco de destino.' });
  const unmatchedTechnicians = [...new Set(pending.candidates.filter((candidate) => candidate.call.technicianName && !candidate.call.technicianId).map((candidate) => candidate.call.technicianName!))];
  if (unmatchedTechnicians.length) return response.status(409).json({ message: `Cadastre ou corrija os tecnicos antes de confirmar a importacao: ${unmatchedTechnicians.join(', ')}.` });
  try {
    const existingIdentifiers = await findExistingCallIdentifiers();
    const toInsert = pending.candidates.filter((candidate) => !candidate.identifiers.some((identifier) => existingIdentifiers.has(normalizeHistoricalIdentifier(identifier)))).map((candidate) => candidate.call);
    const imported = await insertWorkbookCalls(toInsert, 'Importacao de chamados atuais');
    pendingCurrentCallsImports.delete(previewId);
    return response.json({ imported, skippedAlreadyPresent: pending.candidates.length - imported, fileName: pending.fileName });
  } catch (error) {
    return response.status(422).json({ message: error instanceof Error ? error.message : 'Nao foi possivel importar os chamados atuais.' });
  }
});
app.post('/api/importacoes/acionamentos-historicos/preview', auth, requirePermission('imports.create'), requirePermission('calls.create'), async (request: AuthRequest, response) => {
  const parsed = z.object({ fileName: z.string().trim().min(1).max(255), contentBase64: z.string().min(1) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Envie um arquivo XLSX historico valido.' });
  try {
    const buffer = Buffer.from(parsed.data.contentBase64, 'base64');
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) return response.status(413).json({ message: 'A planilha deve ter ate 10 MB.' });
    const result = parseHistoricalActivationWorkbook(parsed.data.fileName, buffer);
    const allIdentifiers = result.candidates.flatMap((candidate) => candidate.identifiers);
    const existingIdentifiers = await findExistingCallIdentifiers();
    const candidates = result.candidates.filter((candidate) => !candidate.identifiers.some((identifier) => existingIdentifiers.has(normalizeHistoricalIdentifier(identifier))));
    const registeredTechnicians = await listTechnicians();
    const unmatchedTechnicians = new Set<string>();
    for (const candidate of candidates) {
      const name = candidate.call.technicianName;
      if (!name) continue;
      const technician = findHistoricalTechnician(name, registeredTechnicians);
      if (technician) {
        candidate.call.technicianId = technician.id;
        candidate.call.technicianName = technician.name;
      } else unmatchedTechnicians.add(name);
    }
    const alreadyInSystem = result.candidates.length - candidates.length;
    const previewId = crypto.randomUUID();
    const expiresAt = Date.now() + 30 * 60 * 1000;
    for (const [id, pending] of pendingHistoricalImports) if (pending.expiresAt < Date.now()) pendingHistoricalImports.delete(id);
    pendingHistoricalImports.set(previewId, { userId: request.authUser!.id, fileName: parsed.data.fileName, candidates, expiresAt });
    const canWrite = isSupabaseConfigured();
    const target = isSupabaseConfigured() ? 'Supabase ativo' : 'Demo em memória';
    return response.json({
      previewId,
      fileName: parsed.data.fileName,
      sheetName: result.sheetName,
      target,
      canWrite,
      totalRows: result.totalRows,
      parsedRows: result.candidates.length,
      importableRows: candidates.length,
      alreadyInSystem,
      duplicatesWithinFile: result.duplicatesWithinFile,
      conflictingOrderRows: result.conflictingOrders,
      conflicts: result.conflicts,
      missingOpeningDate: result.missingOpeningDate,
      missingFinishedDate: result.missingFinishedDate,
      missingOrder: result.missingOrder,
      missingReason: result.missingReason,
      missingOlt: result.missingOlt,
      missingTechnician: result.missingTechnician,
      unmatchedTechnicians: [...unmatchedTechnicians].sort((left, right) => left.localeCompare(right)),
      omittedLongNeighborhood: result.omittedLongNeighborhood,
      omittedLongSlotPon: result.omittedLongSlotPon,
      byType: result.byType,
      sample: candidates.slice(0, 12).map(({ rowNumber, call }) => ({ rowNumber, orderNumber: call.orderNumber, type: call.type, status: call.status, openedAt: call.openedAt, executedAt: call.executedAt, region: call.region, technicianName: call.technicianName })),
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (error) {
    return response.status(422).json({ message: error instanceof Error ? error.message : 'Nao foi possivel analisar a planilha historica.' });
  }
});
app.post('/api/importacoes/acionamentos-historicos/:previewId/confirmar', auth, requirePermission('imports.create'), requirePermission('calls.create'), async (request: AuthRequest, response) => {
  const pending = pendingHistoricalImports.get(String(request.params.previewId));
  if (!pending || pending.userId !== request.authUser!.id || pending.expiresAt < Date.now()) {
    pendingHistoricalImports.delete(String(request.params.previewId));
    return response.status(410).json({ message: 'A previa expirou ou nao pertence a esta sessao. Gere uma previa nova.' });
  }
  if (!isSupabaseConfigured()) return response.status(409).json({ message: 'Esta instancia esta em modo demo e nao grava no banco ativo. Abra esta importacao no sistema conectado ao banco de producao.' });
  try {
    // Nomes da planilha sem cadastro: cadastra o tecnico automaticamente (inativo, matricula HIST-...) e vincula os chamados.
    const createdTechnicians = await registerMissingHistoricalTechnicians(pending.candidates.map((candidate) => candidate.call));
    const existingIdentifiers = await findExistingCallIdentifiers();
    const toInsert = pending.candidates.map((candidate) => candidate.call).filter((call) => ![call.orderNumber, call.officeTrack, call.bdesk].filter(Boolean).some((identifier) => existingIdentifiers.has(normalizeHistoricalIdentifier(identifier))));
    const imported = await insertHistoricalCalls(toInsert);
    pendingHistoricalImports.delete(String(request.params.previewId));
    return response.json({ imported, skippedAlreadyPresent: pending.candidates.length - toInsert.length, fileName: pending.fileName, createdTechnicians });
  } catch (error) {
    return response.status(422).json({ message: error instanceof Error ? error.message : 'Nao foi possivel importar os chamados historicos.' });
  }
});
app.post('/api/importacoes/preview', auth, requirePermission('imports.create'), async (request: AuthRequest, response) => {
  const parsed = z.object({ fileName: z.string().min(1), content: z.string().min(1) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Arquivo de importacao invalido.' });
  try {
    const parsedFile = parseImport(parsed.data.fileName, parsed.data.content);
    const record = await saveImport({ id: `import-${crypto.randomUUID()}`, fileName: parsed.data.fileName, fileType: parsedFile.fileType, sheetName: parsedFile.sheetName, columns: parsedFile.columns, preview: parsedFile.rows.slice(0, 10), totalRows: parsedFile.rows.length, validRows: Math.max(0, parsedFile.rows.length - parsedFile.errors.length), errors: parsedFile.errors, status: parsedFile.errors.length ? 'Falhou' : 'Previsualizada', importedBy: request.authUser!.name, createdAt: new Date().toISOString() });
    return response.status(201).json({ import: record });
  } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel ler o arquivo.' }); }
});
app.post('/api/importacoes/:id/confirmar', auth, requirePermission('imports.create'), async (request, response) => {
  const records = await listImports();
  const record = records.find((item) => item.id === String(request.params.id));
  if (!record) return response.status(404).json({ message: 'Importacao nao encontrada.' });
  if (record.status !== 'Previsualizada') return response.status(409).json({ message: 'Somente uma importacao previsualizada pode ser confirmada.' });
  return response.json({ import: await saveImport({ ...record, status: 'Confirmada' }) });
});


app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => response.status(500).json({ message: error.message || 'Erro interno.' }));
async function startServer() {
  try { await listOltRegionMappings(); }
  catch (error) { console.error('[Configuracoes] nao foi possivel carregar os overrides de OLT:', error); }
  await captureUnknownOltRequestsFromCalls();
  app.listen(port, () => console.log(`JH RedeFlow API running on http://localhost:${port}`));
  // Rotinas a cada 5 min: escalonamento (sino sempre) e, com WhatsApp configurado, aviso de prazo, resumo das 7h
  // e coleta parada. Nao rodam dentro dos testes automatizados.
  if (!process.env.NODE_TEST_CONTEXT) {
    if (whatsappConfig()) console.log('[Aviso de prazo] WhatsApp configurado: verificando a cada 5 min.');
    setInterval(() => { void runDailyReset(); void runWhatsAppSlaAlerts(); void runDailySummaryReport(); void runIntegrationWatch(); void runEscalations(); }, 5 * 60_000).unref();
  }
}
void startServer();