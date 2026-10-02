import 'dotenv/config';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { acceptOltRegionRequest, addCustomOperationalRegion, addObservation, addRole, addSupervisor, addTechnician, addUser, cancelCall, captureUnknownOltRequestsFromCalls, clearD0Base, decideActivation, deleteAllCalls, deleteCall, deleteManualDailyBase, deleteSupervisor, deleteTechnician, deleteUser, findExistingCallIdentifiers, finishCall, findLocalUserByEmail, findLocalUserById, getAuthUser, getCall, getD0BaseSummary, getDashboardMetrics, getManualDailyBase, getObservationAttachment, getRoleById, getSupervisorIdForUser, getSettings, getUserByEmail, ignoreOltRegionRequest, insertHistoricalCalls, insertWorkbookCalls, listActivations, listAuditLogs, listCalls, listCallsPage, listCustomOperationalRegions, listImports, listNotifications, listObservations, listOltRegionMappings, listOltRegionRequests, listPermissions, listRoles, listSupervisors, listTechnicians, listUsers, receiveActivation, reopenCall, replaceD0Base, saveImport, saveManualDailyBase, saveOltRegionMappings, shouldUseLocalDatabase, updateCall, updateRole, updateSettings, updateSupervisor, updateTechnician, updateUser, validatePassword } from './store.js';
import { extractOperationalData, parseIncomingMessage } from './integrations/wuzapi/client.js';
import { analyzeOperationalMessage, interpretWithGemini } from './integrations/wuzapi/semantic.js';
import { calculateIgpMetrics } from './igp.js';
import { parseImport } from './imports/parser.js';
import { findHistoricalTechnician, normalizeHistoricalIdentifier, parseHistoricalActivationWorkbook, type HistoricalActivationCandidate } from './imports/historical-activations.js';
import { parseCurrentCallsWorkbook, type CurrentCallsCandidate } from './imports/current-calls.js';
import { hasD0Identifiers } from './imports/d0.js';
import { syncCallsFromDrive } from './integrations/google-drive.js';
import { authenticateSupabaseUser, checkSupabaseConnection, getSupabaseProfile, isSupabaseConfigured, isSupabaseRuntime } from './integrations/supabase/client.js';
import type { AuthUser, CallObservationAttachmentInput, CallStatus, PermissionCode } from './types.js';

const app = express();
const port = Number(process.env.PORT || 3333);
const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET || (!isProduction ? 'local-demo-secret-change-me' : undefined);
const wuzapiWebhookToken = process.env.WUZAPI_WEBHOOK_TOKEN || (!isProduction ? 'local-wuzapi-demo-token' : undefined);
const activationGroupId = process.env.WUZAPI_ACTIVATION_GROUP_ID?.trim();
const wuzapiDebug = process.env.WUZAPI_DEBUG === 'true';
const skipWuzapiGroupFilter = process.env.WUZAPI_SKIP_GROUP_FILTER === 'true';
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
type PendingHistoricalImport = { userId: string; fileName: string; candidates: HistoricalActivationCandidate[]; expiresAt: number };
const pendingHistoricalImports = new Map<string, PendingHistoricalImport>();
type PendingCurrentCallsImport = { userId: string; fileName: string; candidates: CurrentCallsCandidate[]; expiresAt: number };
const pendingCurrentCallsImports = new Map<string, PendingCurrentCallsImport>();
const processedWebhookMessages = new Map<string, { activationId: string; expiresAt: number }>();
const webhookDeduplicationWindowMs = 24 * 60 * 60 * 1000;
const loginAttemptWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 5;
if (isProduction && (!jwtSecret || !wuzapiWebhookToken || (!activationGroupId && !skipWuzapiGroupFilter))) {
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
app.use(cors({ origin: corsOrigins, credentials: true }));
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
    const payload = jwt.verify(token, jwtSecret!) as { sub: string };
    if (isSupabaseConfigured()) {
      const supabaseUser = await getSupabaseProfile(payload.sub);
      if (!supabaseUser || !supabaseUser.active) return response.status(401).json({ message: 'Sessao invalida.' });
      request.authUser = supabaseUser;
    } else if (shouldUseLocalDatabase()) {
      const localUser = await findLocalUserById(payload.sub);
      if (!localUser || !localUser.active) return response.status(401).json({ message: 'Sessao invalida.' });
      request.authUser = getAuthUser(localUser);
    } else {
      const localUsers = await listUsers();
      const localUser = localUsers.find((item) => item.id === payload.sub);
      if (!localUser || !localUser.active) return response.status(401).json({ message: 'Sessao invalida.' });
      request.authUser = getAuthUser(localUser);
    }
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
app.post('/api/auth/login', async (request, response) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Informe e-mail e senha validos.' });
  if (isLoginRateLimited(request, parsed.data.email)) return response.status(429).json({ message: 'Muitas tentativas de login. Tente novamente mais tarde.' });
  if (isSupabaseConfigured()) {
    try {
      const supabaseUser = await authenticateSupabaseUser(parsed.data.email, parsed.data.password);
      if (!supabaseUser) return response.status(401).json({ message: 'E-mail, senha ou perfil incorretos.' });
      clearLoginAttempts(request, parsed.data.email);
      const token = jwt.sign({ sub: supabaseUser.id }, jwtSecret!, { expiresIn: '8h' });
      return response.json({ token, user: supabaseUser });
    } catch {
      return response.status(401).json({ message: 'Nao foi possivel autenticar no Supabase.' });
    }
  }
  if (shouldUseLocalDatabase()) {
    const user = await findLocalUserByEmail(parsed.data.email);
    if (!user || !user.active || !validatePassword(user, parsed.data.password)) return response.status(401).json({ message: 'E-mail ou senha incorretos.' });
    clearLoginAttempts(request, parsed.data.email);
    const token = jwt.sign({ sub: user.id }, jwtSecret!, { expiresIn: '8h' });
    return response.json({ token, user: getAuthUser(user) });
  }
  const user = getUserByEmail(parsed.data.email);
  if (!user || !user.active || !validatePassword(user, parsed.data.password)) return response.status(401).json({ message: 'E-mail ou senha incorretos.' });
  clearLoginAttempts(request, parsed.data.email);
  const token = jwt.sign({ sub: user.id }, jwtSecret!, { expiresIn: '8h' });
  return response.json({ token, user: getAuthUser(user) });
});
app.get('/api/auth/me', auth, (request: AuthRequest, response) => response.json({ user: request.authUser }));
app.get('/api/dashboards/operacao', auth, requirePermission('dashboard.view'), async (request: AuthRequest, response) => {
  try { return response.json({ metrics: await getDashboardMetrics(await getScopedCallQuery(request)) }); }
  catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar o dashboard.' }); }
});
app.get('/api/dashboards/igp', auth, requirePermission('dashboard.view'), async (request: AuthRequest, response) => {
  const parsed = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).safeParse(request.query.month);
  if (!parsed.success) return response.status(400).json({ message: 'Informe um mes valido no formato AAAA-MM.' });
  const parsedArea = z.enum(['ALL', 'SP', 'GRU', 'ALTO_TIETE']).safeParse(request.query.area ?? 'ALL');
  if (!parsedArea.success) return response.status(400).json({ message: 'Selecione Todas, SP, GRU ou Alto Tiete para o IGP.' });
  const [year, monthNumber] = parsed.data.split('-').map(Number);
  const from = `${parsed.data}-01`;
  const to = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  try {
    const scopedQuery = await getScopedCallQuery(request, true);
    const calls = await listCalls('Finalizado', { ...scopedQuery, from, to });
    return response.json({ igp: calculateIgpMetrics(calls, parsed.data, parsedArea.data) });
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
  return response.json({ notifications: await listNotifications(includeOperational) });
});
app.get('/api/users', auth, requirePermission('users.view'), async (_request, response) => response.json({ users: await listUsers() }));
app.post('/api/users', auth, requirePermission('users.create'), async (request, response) => {
  const parsed = z.object({ name: z.string().min(2), email: z.string().email(), roleId: z.string(), password: z.string().min(8) }).safeParse(request.body);
  if (!parsed.success || !(await getRoleById(parsed.success ? parsed.data.roleId : ''))) return response.status(400).json({ message: 'Dados de usuario invalidos.' });
  const existingUser = shouldUseLocalDatabase() ? await findLocalUserByEmail(parsed.data.email) : getUserByEmail(parsed.data.email);
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
  const parsed = z.object({ name: z.string().min(2), description: z.string().min(2), permissions: z.array(z.string()) }).safeParse(request.body);
  if (!parsed.success || parsed.data.permissions.some((code) => !listPermissions().some((permission) => permission.code === code))) return response.status(400).json({ message: 'Dados de cargo invalidos.' });
  const roles = await listRoles();
  if (roles.some((role) => role.name.toLowerCase() === parsed.data.name.toLowerCase())) return response.status(409).json({ message: 'Este cargo ja existe.' });
  return response.status(201).json({ role: await addRole({ ...parsed.data, permissions: parsed.data.permissions as PermissionCode[] }) });
});
app.patch('/api/roles/:id', auth, requirePermission('roles.manage'), async (request, response) => {
  const parsed = z.object({ name: z.string().min(2).optional(), description: z.string().min(2).optional(), permissions: z.array(z.string()).optional() }).safeParse(request.body);
  if (!parsed.success || parsed.data.permissions?.some((code) => !listPermissions().some((permission) => permission.code === code))) return response.status(400).json({ message: 'Dados de cargo invalidos.' });
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
  const validStatuses: CallStatus[] = ['Aberto', 'Atribuido', 'Deslocamento', 'Em campo', 'Finalizado', 'Cancelado', 'Baixar'];
  const statuses = (Array.isArray(rawStatus) ? rawStatus.flatMap((value) => String(value).split(',')) : typeof rawStatus === 'string' ? rawStatus.split(',') : []).map((value) => value.trim()).filter(Boolean);
  if (statuses.some((status) => !validStatuses.includes(status as CallStatus))) return response.status(400).json({ message: 'Status de chamado invalido.' });
  const page = Math.max(1, Math.floor(Number(request.query.page ?? 1)));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(request.query.pageSize ?? 50))));
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : undefined;
  const region = typeof request.query.region === 'string' && request.query.region.trim() ? request.query.region.trim() : undefined;
  const neighborhood = typeof request.query.neighborhood === 'string' && request.query.neighborhood.trim() ? request.query.neighborhood.trim() : undefined;
  const olt = typeof request.query.olt === 'string' && request.query.olt.trim() ? request.query.olt.trim() : undefined;
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
    const result = await listCallsPage(statuses.length ? statuses as CallStatus[] : undefined, { ...scopedQuery, search, region, neighborhood, olt, sort, direction }, page, pageSize);
    return response.json(result);
  } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Nao foi possivel carregar os chamados.' }); }
});
app.get('/api/chamados/:id', auth, requirePermission('calls.view'), async (request, response) => {
  const call = await getCall(String(request.params.id), await getScopedCallQuery(request as AuthRequest, request.query.teamScope === 'true'));
  if (!call) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  return response.json({ call });
});
app.patch('/api/chamados/:id', auth, requirePermission('calls.edit'), async (request: AuthRequest, response) => {
  const optionalText = (max: number, min = 0) => z.preprocess((value) => value == null ? undefined : String(value), z.string().trim().min(min).max(max).optional());
  const parsed = z.object({ orderNumber: optionalText(100, 1), bdesk: optionalText(100), officeTrack: optionalText(100), client: optionalText(180), type: optionalText(100), reason: optionalText(5000), region: optionalText(100), city: optionalText(100), address: optionalText(5000), bairro: optionalText(160), olt: optionalText(120), slotPon: optionalText(10000), status: z.preprocess((value) => value == null ? undefined : String(value), z.enum(['Aberto', 'Atribuido', 'Deslocamento', 'Em campo', 'Finalizado', 'Cancelado', 'Baixar']).optional()), technicianId: z.preprocess((value) => value == null || value === '' ? null : String(value), z.string().nullable().optional()), executedAt: z.preprocess((value) => value == null ? undefined : String(value), z.string().datetime().optional()), result: optionalText(255), notes: optionalText(5000) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: `Dados de chamado invalidos: ${parsed.error.issues.map((issue) => issue.path.join('.') || 'payload').join(', ')}.` });
  const technicians = await listTechnicians();
  if (parsed.data.technicianId && !technicians.some((technician) => technician.id === parsed.data.technicianId && technician.teamRole === 'Tecnico' && technician.active && technician.employmentStatus !== 'Demitido')) return response.status(422).json({ message: 'Somente tecnicos trabalhando e ativos podem receber chamados.' });
  const existing = await getCall(String(request.params.id));
  if (!existing) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  const call = await updateCall(String(request.params.id), parsed.data, request.authUser!);
  if (!call) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  return response.json({ call });
});
app.post('/api/chamados/:id/finalizar', auth, requirePermission('calls.finish'), async (request: AuthRequest, response) => {
  const parsed = z.object({ result: z.string(), executedAt: z.string(), notes: z.string() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: 'Informe resultado, data de execucao e observacao.' });
  const outcome = await finishCall(String(request.params.id), parsed.data, request.authUser!);
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
  return response.json({ observations: await listObservations(call.id) });
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
  return response.status(201).json({ observation: await addObservation(String(request.params.id), request.authUser!, parsed.data.text, decodedAttachments) });
});
app.get('/api/chamados/:id/observacoes/:observationId/anexos/:attachmentId', auth, requirePermission('calls.view'), async (request: AuthRequest, response) => {
  const callId = String(request.params.id);
  const call = await getCall(callId, await getScopedCallQuery(request, request.query.teamScope === 'true'));
  if (!call) return response.status(404).json({ message: 'Chamado nao encontrado.' });
  const attachment = await getObservationAttachment(callId, String(request.params.observationId), String(request.params.attachmentId));
  if (!attachment) return response.status(404).json({ message: 'Anexo nao encontrado.' });
  return response.json({ attachment });
});
app.get('/api/chamados/:id/logs', auth, requirePermission('calls.view_logs'), async (request, response) => response.json({ logs: await listAuditLogs(String(request.params.id)) }));
app.post('/api/integrations/wuzapi/webhook', async (request, response) => {
  const body = normalizeWuzApiBody(request);
  if (wuzapiDebug) console.log('[WuzAPI] JSON recebido:', JSON.stringify(redactWuzApiPayload(request, body), null, 2));
  const providedToken = extractWuzApiToken(request, body);
  if (providedToken !== wuzapiWebhookToken) return response.status(401).json({ message: 'Webhook nao autorizado.' });
  if (!activationGroupId && !skipWuzapiGroupFilter) return response.status(503).json({ status: 'ignored' });
  const message = parseIncomingMessage(body);
  logWuzApiDecision('mensagem normalizada', { id: message.id, chatId: message.chatId, isGroup: message.isGroup, eventType: message.eventType, hasText: Boolean(message.message?.trim()), hasQuotedText: Boolean(message.quotedMessage?.trim()), isFromMe: message.isFromMe });
  if (message.id) {
    const previous = processedWebhookMessages.get(message.id);
    if (previous && previous.expiresAt > Date.now()) return response.status(202).json({ activationId: previous.activationId, status: 'Pendente', duplicate: true });
    processedWebhookMessages.delete(message.id);
  }
  if (!skipWuzapiGroupFilter && activationGroupId && (message.isGroup !== true || !message.chatId || message.chatId !== activationGroupId)) {
    const reason = message.isGroup !== true
      ? 'Mensagem privada nao autorizada.'
      : !message.chatId
        ? 'Chat nao identificado.'
        : 'Grupo nao autorizado.';
    console.warn(`[WuzAPI] acionamento ignorado: grupo esperado="${activationGroupId}" chatId recebido="${message.chatId || 'nenhum'}" sender="${message.sender || 'nenhum'}" isGroup=${String(message.isGroup)}`);
    logWuzApiDecision('ignorado por grupo', { reason, expectedGroup: activationGroupId, receivedGroup: message.chatId || null });
    return response.status(202).json({ status: 'ignored', reason, chatId: message.chatId || null, isGroup: message.isGroup ?? false });
  }
  const eventType = message.eventType?.toLowerCase() || '';
  const knownMessageEvent = ['message', 'messages.upsert', 'message.upsert', 'message.new', 'messages.new'].includes(eventType);
  const knownNonMessageEvent = ['connected', 'connection', 'presence', 'presence.update', 'receipt', 'message.ack', 'logout'].includes(eventType);
  if (knownNonMessageEvent || (eventType && !knownMessageEvent && !message.message?.trim())) { logWuzApiDecision('ignorado por tipo', { eventType }); return response.status(202).json({ status: 'ignored', reason: 'Evento nao e uma mensagem.' }); }
  if (message.isFromMe) { logWuzApiDecision('ignorado propria mensagem', { id: message.id }); return response.status(202).json({ status: 'ignored', reason: 'Mensagem enviada pelo proprio bot.' }); }
  if (!message.message?.trim() && !message.quotedMessage?.trim()) { logWuzApiDecision('ignorado sem texto', { id: message.id }); return response.status(202).json({ status: 'ignored', reason: 'Mensagem sem texto analisavel.' }); }
  const analysisMessage = message.message?.trim() && analyzeOperationalMessage(message).eh_acionamento ? message : { ...message, message: message.quotedMessage };
  const fallbackAnalysis = analyzeOperationalMessage(analysisMessage);
  if (!fallbackAnalysis.eh_acionamento) { logWuzApiDecision('ignorado sem sinais operacionais', { id: message.id }); return response.status(202).json({ status: 'ignored', reason: 'Mensagem sem sinais de acionamento.' }); }
  const analysis = await interpretWithGemini(analysisMessage, fallbackAnalysis);
  if (!analysis.eh_acionamento) { logWuzApiDecision('ignorado pela analise', { id: message.id }); return response.status(202).json({ status: 'ignored', reason: 'Mensagem classificada como nao operacional.' }); }
  const operationalText = analysisMessage.message || '';
  const legacyData = extractOperationalData(operationalText);
  try {
    const activation = await receiveActivation({ source: message.source || 'wuzapi', originalMessage: operationalText, extractedData: legacyData, analysis });
    logWuzApiDecision('acionamento registrado', { id: message.id, activationId: activation.id, status: activation.status });
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
    const duplicateRows = [...groups.values()].filter((group) => group.length > 1).reduce((total, group) => total + group.length, 0);
    const uniqueCandidates = [...groups.values()].filter((group) => group.length === 1).map((group) => group[0]);
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
    const canWrite = isSupabaseConfigured() || shouldUseLocalDatabase();
    const target = isSupabaseConfigured() ? 'Supabase ativo' : shouldUseLocalDatabase() ? 'PostgreSQL local' : 'Demo em memoria';
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
  if (!isSupabaseConfigured() && !shouldUseLocalDatabase()) return response.status(409).json({ message: 'Esta instancia esta em modo demo e nao grava no banco ativo. Abra esta importacao no ambiente conectado ao banco de destino.' });
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
    const canWrite = isSupabaseConfigured() || shouldUseLocalDatabase();
    const target = isSupabaseConfigured() ? 'Supabase ativo' : shouldUseLocalDatabase() ? 'PostgreSQL local' : 'Demo em memória';
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
  if (!isSupabaseConfigured() && !shouldUseLocalDatabase()) return response.status(409).json({ message: 'Esta instancia esta em modo demo e nao grava no banco ativo. Abra esta importacao no sistema conectado ao banco de producao.' });
  const unmatchedTechnicians = [...new Set(pending.candidates.filter((candidate) => candidate.call.technicianName && !candidate.call.technicianId).map((candidate) => candidate.call.technicianName!))];
  if (unmatchedTechnicians.length) return response.status(409).json({ message: `Cadastre ou corrija os tecnicos antes de confirmar a importacao: ${unmatchedTechnicians.join(', ')}.` });
  try {
    const existingIdentifiers = await findExistingCallIdentifiers();
    const toInsert = pending.candidates.map((candidate) => candidate.call).filter((call) => ![call.orderNumber, call.officeTrack, call.bdesk].filter(Boolean).some((identifier) => existingIdentifiers.has(normalizeHistoricalIdentifier(identifier))));
    const imported = await insertHistoricalCalls(toInsert);
    pendingHistoricalImports.delete(String(request.params.previewId));
    return response.json({ imported, skippedAlreadyPresent: pending.candidates.length - toInsert.length, fileName: pending.fileName });
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
app.post('/api/integrations/google-drive/sync', auth, requirePermission('imports.create'), async (_request, response) => {
  try { return response.json({ sync: await syncCallsFromDrive() }); }
  catch (error) { return response.status(500).json({ message: error instanceof Error ? error.message : 'Nao foi possivel sincronizar o Google Drive.' }); }
});

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => response.status(500).json({ message: error.message || 'Erro interno.' }));
let lastDriveSyncDate = '';
function startDriveSchedule() {
  if (process.env.GOOGLE_DRIVE_SYNC_ENABLED !== 'true') return;
  const syncHour = Number(process.env.GOOGLE_DRIVE_SYNC_HOUR || 9);
  const timezone = process.env.GOOGLE_DRIVE_TIMEZONE || 'America/Sao_Paulo';
  const check = async () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date());
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    if (Number(get('hour')) < syncHour || lastDriveSyncDate === date) return;
    lastDriveSyncDate = date;
    try { console.log('[Google Drive] sincronizacao iniciada:', JSON.stringify(await syncCallsFromDrive())); }
    catch (error) { console.error('[Google Drive] falha na sincronizacao:', error); lastDriveSyncDate = ''; }
  };
  void check();
  setInterval(() => void check(), 60_000);
}
startDriveSchedule();
async function startServer() {
  try { await listOltRegionMappings(); }
  catch (error) { console.error('[Configuracoes] nao foi possivel carregar os overrides de OLT:', error); }
  await captureUnknownOltRequestsFromCalls();
  app.listen(port, () => console.log(`JH RedeFlow API running on http://localhost:${port}`));
}
void startServer();