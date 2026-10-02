import bcrypt from 'bcryptjs';
import { getDatabaseClient, isDatabaseConfigured } from './db.js';
import { cancelSupabaseCall, createSupabaseActivation, createSupabaseSupervisor, createSupabaseTechnician, createSupabaseUser, decideSupabaseActivation, deleteSupabaseTechnician, finishSupabaseCall, getSupabaseRole, getSupabaseAdmin, isSupabaseConfigured, listSupabaseActivations, listSupabaseCalls, listSupabaseRoles, listSupabaseSupervisors, listSupabaseTechnicians, listSupabaseUsers, reopenSupabaseCall, updateSupabaseCall, updateSupabaseSupervisor, updateSupabaseTechnician, updateSupabaseUser } from './integrations/supabase/client.js';
import { getDefaultOltRegionMap, getManualOltRegionMap, identifyAtreladas, normalizeOltCode, replaceManualOltRegionMap, resolveOltRegion } from './integrations/wuzapi/noc-consolidation.js';
import { matchD0Rows, type D0Row } from './imports/d0.js';
import type { Activation, ActivationAnalysis, ActivationStatus, AuthUser, Call, CallAuditLog, CallObservation, CallObservationAttachment, CallObservationAttachmentInput, CallStatus, DashboardMetrics, EditableCallFields, ImportRecord, ManualDailyBase, ManualProductionData, PermissionCode, Role, StoredCallObservationAttachment, Supervisor, SystemSettings, Technician, User } from './types.js';

const permissionDescriptions: Record<PermissionCode, string> = {
  'dashboard.view': 'Visualizar o dashboard operacional',
  'users.view': 'Visualizar usuarios',
  'users.create': 'Criar usuarios',
  'users.edit': 'Editar usuarios',
  'roles.view': 'Visualizar cargos',
  'roles.manage': 'Gerenciar cargos e permissoes',
  'technicians.view': 'Visualizar tecnicos',
  'technicians.create': 'Cadastrar tecnicos',
  'technicians.edit': 'Editar tecnicos',
  'supervisors.view': 'Visualizar supervisores',
  'supervisors.create': 'Cadastrar supervisores',
  'supervisors.edit': 'Editar supervisores',
  'calls.view': 'Visualizar chamados',
  'calls.create': 'Criar chamados',
  'calls.edit': 'Editar chamados',
  'calls.assign': 'Atribuir chamados',
  'calls.finish': 'Finalizar chamados',
  'calls.cancel': 'Cancelar chamados',
  'calls.delete': 'Apagar chamados de teste',
  'calls.reopen': 'Reabrir chamados encerrados',
  'calls.view_logs': 'Visualizar auditoria de chamados',
  'calls.add_observation': 'Adicionar observacoes em chamados',
  'activations.view': 'Visualizar acionamentos',
  'activations.decide': 'Aceitar ou recusar acionamentos',
  'imports.view': 'Visualizar importacoes',
  'imports.create': 'Criar e confirmar importacoes',
  'settings.manage': 'Gerenciar configuracoes'
};

const allPermissions = Object.keys(permissionDescriptions) as PermissionCode[];
const now = new Date().toISOString();
const adminRole: Role = { id: 'role-admin', name: 'Administrador', description: 'Acesso administrativo da plataforma', permissions: allPermissions };
const operatorRole: Role = { id: 'role-operator', name: 'Operador', description: 'Operacao de chamados e remanejamentos', permissions: ['dashboard.view', 'calls.view', 'calls.create', 'calls.edit', 'calls.assign', 'calls.finish', 'calls.cancel', 'calls.reopen', 'calls.view_logs', 'calls.add_observation', 'activations.view', 'activations.decide', 'imports.view', 'imports.create', 'technicians.view', 'supervisors.view'] };
const supervisorRole: Role = { id: 'role-supervisor', name: 'Supervisor', description: 'Visao restrita da propria equipe', permissions: ['dashboard.view', 'calls.view', 'technicians.view', 'supervisors.view'] };
const counterRole: Role = { id: 'role-counter', name: 'Mesario', description: 'Aceite e recusa de acionamentos', permissions: ['activations.view', 'activations.decide'] };
const viewerRole: Role = { id: 'role-viewer', name: 'Visualizacao', description: 'Consulta sem alteracao', permissions: ['dashboard.view', 'calls.view', 'technicians.view', 'supervisors.view'] };

const roles: Role[] = [adminRole, operatorRole, supervisorRole, counterRole, viewerRole];
const users = new Map<string, User & { passwordHash: string }>([
  ['user-admin', { id: 'user-admin', name: 'Administrador JH', email: 'admin@jhtelecom.com', roleId: adminRole.id, active: true, createdAt: now, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) }],
  ['user-matheus', { id: 'user-matheus', name: 'Matheus Terra', email: 'matheus@jhtelecom.com', roleId: operatorRole.id, active: true, createdAt: now, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) }],
  ['user-joao', { id: 'user-joao', name: 'Joao da Silva', email: 'joao@jhtelecom.com', roleId: supervisorRole.id, active: true, createdAt: now, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) }],
  ['user-maria', { id: 'user-maria', name: 'Maria Oliveira', email: 'maria@jhtelecom.com', roleId: supervisorRole.id, active: true, createdAt: now, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) }]
]);
const supervisors = new Map<string, Supervisor>([
  ['supervisor-joao', { id: 'supervisor-joao', userId: 'user-joao', name: 'Joao da Silva', region: 'Sul', active: true, technicianCount: 3 }],
  ['supervisor-maria', { id: 'supervisor-maria', userId: 'user-maria', name: 'Maria Oliveira', region: 'Leste', active: true, technicianCount: 2 }]
]);
const technicians = new Map<string, Technician>([
  ['tech-carlos', { id: 'tech-carlos', supervisorId: 'supervisor-joao', name: 'Carlos Mendes', registration: 'TEC-1042', supervisorName: 'Joao da Silva', region: 'Sul', shift: '07:00 - 16:00', currentStatus: 'Em campo', active: true, teamRole: 'Tecnico', leadTechnicianId: undefined }],
  ['tech-pedro', { id: 'tech-pedro', supervisorId: 'supervisor-joao', name: 'Pedro Santos', registration: 'TEC-1088', supervisorName: 'Joao da Silva', region: 'Sul', shift: '08:00 - 17:00', currentStatus: 'Disponivel', active: true, teamRole: 'Tecnico', leadTechnicianId: undefined }],
  ['tech-lucas', { id: 'tech-lucas', supervisorId: 'supervisor-joao', name: 'Lucas Reis', registration: 'TEC-1103', supervisorName: 'Joao da Silva', region: 'Sul', shift: '08:00 - 17:00', currentStatus: 'Disponivel', active: true, teamRole: 'Tecnico', leadTechnicianId: undefined }],
  ['tech-andre', { id: 'tech-andre', supervisorId: 'supervisor-maria', name: 'Andre Costa', registration: 'TEC-1150', supervisorName: 'Maria Oliveira', region: 'Leste', shift: '09:00 - 18:00', currentStatus: 'Em campo', active: true, teamRole: 'Tecnico', leadTechnicianId: undefined }],
  ['tech-bruno', { id: 'tech-bruno', supervisorId: 'supervisor-maria', name: 'Bruno Lima', registration: 'TEC-1171', supervisorName: 'Maria Oliveira', region: 'Leste', shift: '09:00 - 18:00', currentStatus: 'Indisponivel', active: false, teamRole: 'Tecnico', leadTechnicianId: undefined }]
]);
const calls = new Map<string, Call>([
  ['call-240918-01', { id: 'call-240918-01', orderNumber: 'RF-240918', bdesk: 'BD-88421', officeTrack: 'OT-72014', client: 'Condominio Jardim Sul', type: 'NOC ACESSO', reason: 'Perda de sinal', region: 'Sul', city: 'Sao Paulo', olt: 'VIP-CT1-SPO-OHW-01', slotPon: '3/7', status: 'Aberto', openedAt: '2026-09-18T08:12:00-03:00', notes: 'Acionamento recebido pelo grupo operacional.' }],
  ['call-240918-02', { id: 'call-240918-02', orderNumber: 'RF-240917', bdesk: 'BD-88408', officeTrack: 'OT-71998', client: 'Rede Residencial Vila Nova', type: 'ACIONAMENTO FIELD', reason: 'Rompimento de cabo', region: 'Leste', city: 'Guarulhos', olt: 'VIP-GZ1-SPO-OHW-02', slotPon: '1/12', status: 'Aberto', openedAt: '2026-09-18T07:45:00-03:00', notes: 'Necessario validar acesso ao local.' }],
  ['call-240917-01', { id: 'call-240917-01', orderNumber: 'RF-240917', bdesk: 'BD-88376', officeTrack: 'OT-71942', client: 'JH Telecom B2C', type: 'NOC TX', reason: 'Afetacao massiva', region: 'Sul', city: 'Diadema', olt: 'VIP-CT2-SPO-OHW-02', slotPon: '8/2', status: 'Atribuido', technicianId: 'tech-carlos', technicianName: 'Carlos Mendes', supervisorName: 'Joao da Silva', openedAt: '2026-09-17T16:20:00-03:00', assignedAt: '2026-09-17T16:55:00-03:00', notes: 'Equipe acionada para diagnostico.' }],
  ['call-240916-01', { id: 'call-240916-01', orderNumber: 'RF-240916', bdesk: 'BD-88291', officeTrack: 'OT-71882', client: 'Edificio Central', type: 'BAIXA TECNICA', reason: 'Cliente sem conexao', region: 'Leste', city: 'Suzano', olt: 'VIP-SMP-SPO-ONK-01', slotPon: '4/9', status: 'Em campo', technicianId: 'tech-andre', technicianName: 'Andre Costa', supervisorName: 'Maria Oliveira', openedAt: '2026-09-16T10:05:00-03:00', assignedAt: '2026-09-16T10:42:00-03:00', notes: 'Tecnico em deslocamento para a CTO.' }]
]);
const observations = new Map<string, CallObservation>();
const observationAttachments = new Map<string, StoredCallObservationAttachment>();
const auditLogs = new Map<string, CallAuditLog>();
const activations = new Map<string, Activation>([
  ['activation-demo-01', { id: 'activation-demo-01', source: 'grupo_acionamentos_rede', originalMessage: 'VALIDAR COM NOC ACESSO\n- ORDEM: RF-240919\n- BDESK: BD-88455\n- MOTIVO: perda de sinal\n- OLT: VIP-CT1-SPO-OHW-01\n- SLOT/PON: 3/7', receivedAt: '2026-09-18T09:10:00-03:00', status: 'Pendente', extractedData: { orderNumber: 'RF-240919', bdesk: 'BD-88455', type: 'NOC ACESSO', reason: 'perda de sinal', olt: 'VIP-CT1-SPO-OHW-01', slotPon: '3/7' } }]
]);
const imports = new Map<string, ImportRecord>();
const oltRegionRequests = new Map<string, OltRegionRequest>();
const customOperationalRegions = new Map<string, string>();
const d0BaseRows: Array<{ fileName: string; rowNumber: number; payload: D0Row; uploadedBy: string; importedAt: string }> = [];
const manualDailyBases = new Map<string, ManualDailyBase>();
const settings: SystemSettings = { autoRefresh: true, refreshIntervalSeconds: 60, slaAlertHours: 8, defaultRegion: 'Todas' };

function isDemoDataEnabled() {
  return process.env.REDEFLOW_DEMO_DATA === 'true';
}

function ensureDemoData() {
  if (!isDemoDataEnabled()) {
    users.clear();
    supervisors.clear();
    technicians.clear();
    calls.clear();
    observations.clear();
    observationAttachments.clear();
    auditLogs.clear();
    activations.clear();
    imports.clear();
    oltRegionRequests.clear();
    d0BaseRows.length = 0;
    manualDailyBases.clear();
    return;
  }

  if (users.size > 0 || supervisors.size > 0 || technicians.size > 0 || calls.size > 0 || observations.size > 0 || auditLogs.size > 0 || activations.size > 0 || imports.size > 0 || oltRegionRequests.size > 0 || manualDailyBases.size > 0) {
    return;
  }

  const currentTime = new Date().toISOString();
  users.set('user-admin', { id: 'user-admin', name: 'Administrador JH', email: 'admin@jhtelecom.com', roleId: adminRole.id, active: true, createdAt: currentTime, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) });
  users.set('user-matheus', { id: 'user-matheus', name: 'Matheus Terra', email: 'matheus@jhtelecom.com', roleId: operatorRole.id, active: true, createdAt: currentTime, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) });
  users.set('user-joao', { id: 'user-joao', name: 'Joao da Silva', email: 'joao@jhtelecom.com', roleId: supervisorRole.id, active: true, createdAt: currentTime, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) });
  users.set('user-maria', { id: 'user-maria', name: 'Maria Oliveira', email: 'maria@jhtelecom.com', roleId: supervisorRole.id, active: true, createdAt: currentTime, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) });

  supervisors.set('supervisor-joao', { id: 'supervisor-joao', userId: 'user-joao', name: 'Joao da Silva', region: 'Sul', active: true, technicianCount: 3 });
  supervisors.set('supervisor-maria', { id: 'supervisor-maria', userId: 'user-maria', name: 'Maria Oliveira', region: 'Leste', active: true, technicianCount: 2 });

  technicians.set('tech-carlos', { id: 'tech-carlos', supervisorId: 'supervisor-joao', name: 'Carlos Mendes', registration: 'TEC-1042', supervisorName: 'Joao da Silva', region: 'Sul', shift: '07:00 - 16:00', currentStatus: 'Em campo', active: true, teamRole: 'Tecnico', leadTechnicianId: undefined });
  technicians.set('tech-pedro', { id: 'tech-pedro', supervisorId: 'supervisor-joao', name: 'Pedro Santos', registration: 'TEC-1088', supervisorName: 'Joao da Silva', region: 'Sul', shift: '08:00 - 17:00', currentStatus: 'Disponivel', active: true, teamRole: 'Tecnico', leadTechnicianId: undefined });
  technicians.set('tech-lucas', { id: 'tech-lucas', supervisorId: 'supervisor-joao', name: 'Lucas Reis', registration: 'TEC-1103', supervisorName: 'Joao da Silva', region: 'Sul', shift: '08:00 - 17:00', currentStatus: 'Disponivel', active: true, teamRole: 'Tecnico', leadTechnicianId: undefined });
  technicians.set('tech-andre', { id: 'tech-andre', supervisorId: 'supervisor-maria', name: 'Andre Costa', registration: 'TEC-1150', supervisorName: 'Maria Oliveira', region: 'Leste', shift: '09:00 - 18:00', currentStatus: 'Em campo', active: true, teamRole: 'Tecnico', leadTechnicianId: undefined });
  technicians.set('tech-bruno', { id: 'tech-bruno', supervisorId: 'supervisor-maria', name: 'Bruno Lima', registration: 'TEC-1171', supervisorName: 'Maria Oliveira', region: 'Leste', shift: '09:00 - 18:00', currentStatus: 'Indisponivel', active: false, teamRole: 'Tecnico', leadTechnicianId: undefined });

  calls.set('call-240918-01', { id: 'call-240918-01', orderNumber: 'RF-240918', bdesk: 'BD-88421', officeTrack: 'OT-72014', client: 'Condominio Jardim Sul', type: 'NOC ACESSO', reason: 'Perda de sinal', region: 'Sul', city: 'Sao Paulo', olt: 'VIP-CT1-SPO-OHW-01', slotPon: '3/7', status: 'Aberto', openedAt: '2026-09-18T08:12:00-03:00', notes: 'Acionamento recebido pelo grupo operacional.' });
  calls.set('call-240918-02', { id: 'call-240918-02', orderNumber: 'RF-240917', bdesk: 'BD-88408', officeTrack: 'OT-71998', client: 'Rede Residencial Vila Nova', type: 'ACIONAMENTO FIELD', reason: 'Rompimento de cabo', region: 'Leste', city: 'Guarulhos', olt: 'VIP-GZ1-SPO-OHW-02', slotPon: '1/12', status: 'Aberto', openedAt: '2026-09-18T07:45:00-03:00', notes: 'Necessario validar acesso ao local.' });
  calls.set('call-240917-01', { id: 'call-240917-01', orderNumber: 'RF-240917', bdesk: 'BD-88376', officeTrack: 'OT-71942', client: 'JH Telecom B2C', type: 'NOC TX', reason: 'Afetacao massiva', region: 'Sul', city: 'Diadema', olt: 'VIP-CT2-SPO-OHW-02', slotPon: '8/2', status: 'Atribuido', technicianId: 'tech-carlos', technicianName: 'Carlos Mendes', supervisorName: 'Joao da Silva', openedAt: '2026-09-17T16:20:00-03:00', assignedAt: '2026-09-17T16:55:00-03:00', notes: 'Equipe acionada para diagnostico.' });
  calls.set('call-240916-01', { id: 'call-240916-01', orderNumber: 'RF-240916', bdesk: 'BD-88291', officeTrack: 'OT-71882', client: 'Edificio Central', type: 'BAIXA TECNICA', reason: 'Cliente sem conexao', region: 'Leste', city: 'Suzano', olt: 'VIP-SMP-SPO-ONK-01', slotPon: '4/9', status: 'Em campo', technicianId: 'tech-andre', technicianName: 'Andre Costa', supervisorName: 'Maria Oliveira', openedAt: '2026-09-16T10:05:00-03:00', assignedAt: '2026-09-16T10:42:00-03:00', notes: 'Tecnico em deslocamento para a CTO.' });

  activations.set('activation-demo-01', { id: 'activation-demo-01', source: 'grupo_acionamentos_rede', originalMessage: 'VALIDAR COM NOC ACESSO\n- ORDEM: RF-240919\n- BDESK: BD-88455\n- MOTIVO: perda de sinal\n- OLT: VIP-CT1-SPO-OHW-01\n- SLOT/PON: 3/7', receivedAt: '2026-09-18T09:10:00-03:00', status: 'Pendente', extractedData: { orderNumber: 'RF-240919', bdesk: 'BD-88455', type: 'NOC ACESSO', reason: 'perda de sinal', olt: 'VIP-CT1-SPO-OHW-01', slotPon: '3/7' } });
}

ensureDemoData();

export function shouldUseLocalDatabase() {
  return process.env.REDEFLOW_RUNTIME === 'local' && isDatabaseConfigured();
}

export async function findLocalUserByEmail(email: string): Promise<(User & { passwordHash: string; role?: Role }) | undefined> {
  if (!shouldUseLocalDatabase()) return undefined;
  const client = await getDatabaseClient();
  const result = await client.query<{ id: string; name: string; email: string; role_id: string; active: boolean; created_at: string; password_hash: string }>(
    `SELECT u.id, u.name, u.email, u.role_id, u.active, u.created_at, u.password_hash
     FROM users u
     WHERE LOWER(u.email) = LOWER($1) AND u.deleted_at IS NULL
     LIMIT 1`,
    [email],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  const role = await getRoleById(row.role_id) ?? { id: row.role_id, name: 'Sem cargo', description: '', permissions: [] as PermissionCode[] };
  return { id: row.id, name: row.name, email: row.email, roleId: row.role_id, active: row.active, createdAt: row.created_at, passwordHash: row.password_hash, role };
}

export async function findLocalUserById(id: string): Promise<(User & { passwordHash: string; role?: Role }) | undefined> {
  if (!shouldUseLocalDatabase()) return undefined;
  const client = await getDatabaseClient();
  const result = await client.query<{ id: string; name: string; email: string; role_id: string; active: boolean; created_at: string; password_hash: string }>(
    `SELECT u.id, u.name, u.email, u.role_id, u.active, u.created_at, u.password_hash
     FROM users u
     WHERE u.id = $1 AND u.deleted_at IS NULL
     LIMIT 1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  const role = await getRoleById(row.role_id) ?? { id: row.role_id, name: 'Sem cargo', description: '', permissions: [] as PermissionCode[] };
  return { id: row.id, name: row.name, email: row.email, roleId: row.role_id, active: row.active, createdAt: row.created_at, passwordHash: row.password_hash, role };
}

export function getRole(roleId: string): Role | undefined { return roles.find((role) => role.id === roleId); }
export async function getRoleById(roleId: string): Promise<Role | undefined> {
  if (isSupabaseConfigured()) {
    try {
      const supabaseRole = await getSupabaseRole(roleId) as Role | undefined;
      if (supabaseRole) return supabaseRole;
    } catch {
      // fall through to the built-in role catalog when Supabase is configured but unreachable
    }
  }
  const fallbackRole = getRole(roleId);
  if (fallbackRole) return fallbackRole;
  if (!shouldUseLocalDatabase()) return undefined;
  const client = await getDatabaseClient();
  const result = await client.query<{ id: string; name: string; description: string | null; permissions: string[] }>(
    `SELECT r.id, r.name, r.description,
            COALESCE(json_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '[]'::json) AS permissions
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     WHERE r.id = $1 AND r.deleted_at IS NULL
     GROUP BY r.id, r.name, r.description`,
    [roleId],
  );
  const row = result.rows[0];
  return row ? { id: row.id, name: row.name, description: row.description ?? '', permissions: Array.isArray(row.permissions) ? row.permissions as PermissionCode[] : [] } : undefined;
}
export async function listRoles(): Promise<Role[]> {
  if (isSupabaseConfigured()) {
    try {
      return await listSupabaseRoles() as Role[];
    } catch {
      // use the local catalog while Supabase is temporarily unavailable
    }
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; name: string; description: string; permissions: string[] }>(
      `SELECT r.id, r.name, r.description,
              COALESCE(json_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '[]'::json) AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE r.deleted_at IS NULL
       GROUP BY r.id, r.name, r.description
       ORDER BY r.name`,
    );
    return result.rows.map((row) => ({ id: row.id, name: row.name, description: row.description, permissions: Array.isArray(row.permissions) ? row.permissions as PermissionCode[] : [] }));
  }
  return roles;
}
export function listPermissions() { return allPermissions.map((code) => ({ code, description: permissionDescriptions[code] })); }
export async function listUsers(): Promise<User[]> {
  ensureDemoData();
  if (isSupabaseConfigured()) return await listSupabaseUsers() as User[];
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; name: string; email: string; role_id: string; active: boolean; created_at: string }>(
      `SELECT id, name, email, role_id, active, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC`,
    );
    const roleMap = new Map((await listRoles()).map((role) => [role.id, role]));
    return result.rows.map((row) => ({ id: row.id, name: row.name, email: row.email, roleId: row.role_id, active: row.active, createdAt: row.created_at, role: roleMap.get(row.role_id) }));
  }
  return [...users.values()].map(({ passwordHash: _passwordHash, ...user }) => ({ ...user, role: getRole(user.roleId) }));
}
export function getUserByEmail(email: string) {
  ensureDemoData();
  return [...users.values()].find((user) => user.email.toLowerCase() === email.toLowerCase());
}
export function getAuthUser(user: User): AuthUser {
  const { passwordHash: _passwordHash, ...safeUser } = user as User & { passwordHash?: string };
  const role = user.role ?? getRole(user.roleId) ?? { id: user.roleId, name: 'Sem cargo', description: '', permissions: [] as PermissionCode[] };
  return { ...safeUser, role };
}
export function validatePassword(user: User & { passwordHash: string }, password: string) { return bcrypt.compareSync(password, user.passwordHash); }
export async function addUser(input: { name: string; email: string; roleId: string; password: string }): Promise<User> {
  if (isSupabaseConfigured()) return await createSupabaseUser(input);
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const passwordHash = bcrypt.hashSync(input.password, 10);
    const result = await client.query<{ id: string; name: string; email: string; role_id: string; active: boolean; created_at: string }>(
      `INSERT INTO users (name, email, role_id, password_hash, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, now(), now())
       RETURNING id, name, email, role_id, active, created_at`,
      [input.name, input.email, input.roleId, passwordHash],
    );
    const row = result.rows[0];
    return { id: row.id, name: row.name, email: row.email, roleId: row.role_id, active: row.active, createdAt: row.created_at, role: await getRoleById(row.role_id) };
  }
  const id = `user-${crypto.randomUUID()}`;
  const user = { id, name: input.name, email: input.email, roleId: input.roleId, active: true, createdAt: new Date().toISOString(), passwordHash: bcrypt.hashSync(input.password, 10) };
  users.set(id, user);
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
export async function updateUser(id: string, input: { name?: string; email?: string; roleId?: string; active?: boolean; password?: string }): Promise<User | undefined> {
  if (isSupabaseConfigured()) return await updateSupabaseUser(id, input);
  if (shouldUseLocalDatabase()) {
    const current = await findLocalUserById(id);
    if (!current) return undefined;
    const client = await getDatabaseClient();
    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    if (input.name) { sets.push(`name = $${index++}`); values.push(input.name); }
    if (input.email) { sets.push(`email = $${index++}`); values.push(input.email); }
    if (input.roleId) { sets.push(`role_id = $${index++}`); values.push(input.roleId); }
    if (input.active !== undefined) { sets.push(`active = $${index++}`); values.push(input.active); }
    if (input.password) { sets.push(`password_hash = $${index++}`); values.push(bcrypt.hashSync(input.password, 10)); }
    if (!sets.length) return { ...current, role: current.role };
    sets.push(`updated_at = now()`);
    values.push(id);
    const result = await client.query<{ id: string; name: string; email: string; role_id: string; active: boolean; created_at: string }>(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${index} AND deleted_at IS NULL RETURNING id, name, email, role_id, active, created_at`,
      values,
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return { id: row.id, name: row.name, email: row.email, roleId: row.role_id, active: row.active, createdAt: row.created_at, role: await getRoleById(row.role_id) };
  }
  const current = users.get(id);
  if (!current) return undefined;
  const updated = { ...current, ...input, passwordHash: input.password ? bcrypt.hashSync(input.password, 10) : current.passwordHash };
  delete (updated as { password?: string }).password;
  users.set(id, updated);
  const { passwordHash: _passwordHash, ...safeUser } = updated;
  return { ...safeUser, role: getRole(updated.roleId) };
}
export async function deleteUser(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin()
      .from('profiles')
      .update({ active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);
    if (error) throw new Error(error.message || 'Nao foi possivel remover o usuario.');
    return true;
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string }>(
      `UPDATE users SET deleted_at = now(), active = false, updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return Boolean(result.rowCount && result.rowCount > 0);
  }
  return users.delete(id);
}
export async function addRole(input: { name: string; description: string; permissions: PermissionCode[] }): Promise<Role> {
  if (isSupabaseConfigured()) {
    try {
      const admin = getSupabaseAdmin();
      const { data: roleData, error: roleError } = await admin.from('roles').insert({ name: input.name, description: input.description }).select('id, name, description').single();
      if (roleError || !roleData) throw new Error(roleError?.message || 'Nao foi possivel criar o cargo no Supabase.');

      if (input.permissions.length) {
        const { data: permissionRows, error: permissionError } = await admin.from('permissions').select('id, code').in('code', input.permissions);
        if (permissionError) throw new Error(permissionError.message || 'Nao foi possivel carregar as permissoes do cargo.');
        const permissionIds = permissionRows?.map((row) => row.id) || [];
        for (const permissionId of permissionIds) {
          const { error: linkError } = await admin.from('role_permissions').insert({ role_id: roleData.id, permission_id: permissionId }).select();
          if (linkError && !String(linkError.message).includes('duplicate key')) throw new Error(linkError.message || 'Nao foi possivel vincular a permissao ao cargo.');
        }
      }

      return { id: roleData.id, name: roleData.name, description: roleData.description || '', permissions: input.permissions };
    } catch (error) {
      if (shouldUseLocalDatabase()) {
        // falls through to the local database when configured as a local runtime with DB access
      } else {
        const message = error instanceof Error && error.message ? error.message : 'Nao foi possivel criar o cargo no Supabase.';
        throw new Error(`Supabase indisponivel ao criar o cargo. ${message}`);
      }
    }
  }

  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; name: string; description: string }>(
      `INSERT INTO roles (name, description, created_at, updated_at)
       VALUES ($1, $2, now(), now())
       RETURNING id, name, description`,
      [input.name, input.description],
    );
    const row = result.rows[0];
    for (const permission of input.permissions) {
      const permissionRow = await client.query<{ id: string }>(`SELECT id FROM permissions WHERE code = $1`, [permission]);
      const permissionId = permissionRow.rows[0]?.id;
      if (permissionId) await client.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [row.id, permissionId]);
    }
    return { id: row.id, name: row.name, description: row.description, permissions: input.permissions };
  }
  const role: Role = { id: `role-${crypto.randomUUID()}`, name: input.name, description: input.description, permissions: input.permissions };
  roles.push(role);
  return role;
}
export async function updateRole(id: string, input: { name?: string; description?: string; permissions?: PermissionCode[] }): Promise<Role | undefined> {
  if (isSupabaseConfigured()) {
    try {
      const admin = getSupabaseAdmin();

      if (input.name !== undefined || input.description !== undefined) {
        const updatePayload: Record<string, string> = {};
        if (input.name !== undefined) updatePayload.name = input.name;
        if (input.description !== undefined) updatePayload.description = input.description;
        const { error: updateRoleError } = await admin.from('roles').update(updatePayload).eq('id', id).is('deleted_at', null);
        if (updateRoleError) throw new Error(updateRoleError.message || 'Nao foi possivel atualizar o cargo no Supabase.');
      }

      if (input.permissions) {
        const { error: deleteError } = await admin.from('role_permissions').delete().eq('role_id', id);
        if (deleteError) throw new Error(deleteError.message || 'Nao foi possivel limpar as permissoes do cargo.');

        if (input.permissions.length) {
          const { data: permissionRows, error: permissionError } = await admin.from('permissions').select('id, code').in('code', input.permissions);
          if (permissionError) throw new Error(permissionError.message || 'Nao foi possivel carregar as permissoes do cargo.');
          const permissionIds = permissionRows?.map((row) => row.id) || [];
          for (const permissionId of permissionIds) {
            const { error: linkError } = await admin.from('role_permissions').insert({ role_id: id, permission_id: permissionId });
            if (linkError && !String(linkError.message).includes('duplicate key')) throw new Error(linkError.message || 'Nao foi possivel vincular a permissao ao cargo.');
          }
        }
      }

      const refreshed = await getSupabaseRole(id);
      if (!refreshed) return undefined;
      return refreshed;
    } catch (error) {
      if (shouldUseLocalDatabase()) {
        // falls through to the local database when configured as a local runtime with DB access
      } else {
        const message = error instanceof Error && error.message ? error.message : 'Nao foi possivel atualizar o cargo no Supabase.';
        throw new Error(`Supabase indisponivel ao atualizar o cargo. ${message}`);
      }
    }
  }

  if (shouldUseLocalDatabase()) {
    try {
      const client = await getDatabaseClient();
      if (input.name !== undefined) await client.query(`UPDATE roles SET name = $1, updated_at = now() WHERE id = $2 AND deleted_at IS NULL`, [input.name, id]);
      if (input.description !== undefined) await client.query(`UPDATE roles SET description = $1, updated_at = now() WHERE id = $2 AND deleted_at IS NULL`, [input.description, id]);
      if (input.permissions) {
        await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [id]);
        for (const permission of input.permissions) {
          const permissionRow = await client.query<{ id: string }>(`SELECT id FROM permissions WHERE code = $1`, [permission]);
          const permissionId = permissionRow.rows[0]?.id;
          if (permissionId) await client.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, permissionId]);
        }
      }
      const refreshed = await client.query<{ id: string; name: string; description: string }>(`SELECT id, name, description FROM roles WHERE id = $1 AND deleted_at IS NULL`, [id]);
      const row = refreshed.rows[0];
      if (!row) return undefined;
      const permissions = (await client.query<{ code: string }>(`SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = $1`, [id])).rows.map((item) => item.code as PermissionCode);
      return { id: row.id, name: row.name, description: row.description, permissions };
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Nao foi possivel atualizar o cargo.';
      throw new Error(`Nao foi possivel atualizar o cargo no banco local. ${message}`);
    }
  }
  const role = roles.find((item) => item.id === id);
  if (!role) return undefined;
  Object.assign(role, input);
  return role;
}
export function getSettings(): SystemSettings { return { ...settings }; }
export function updateSettings(input: Partial<SystemSettings>): SystemSettings { Object.assign(settings, input); return getSettings(); }
export type OltRegionMapping = { olt: string; region: string; defaultRegion?: string };
export type OltRegionRequest = { id: string; olt: string; source: string; status: 'Pendente' | 'Adicionada' | 'Ignorada'; occurrences: number; firstSeenAt: string; lastSeenAt: string; region?: string };

export async function listCustomOperationalRegions(): Promise<string[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('operational_regions').select('region').order('region', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((row) => row.region);
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ region: string }>('SELECT region FROM operational_regions ORDER BY region ASC');
    return result.rows.map((row) => row.region);
  }
  return [...customOperationalRegions.values()].sort((left, right) => left.localeCompare(right));
}

export async function addCustomOperationalRegion(value: string): Promise<string> {
  const region = value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
  if (!region || region.length > 160) throw new Error('Informe uma regiao com ate 160 caracteres.');
  const existing = await listCustomOperationalRegions();
  if (existing.some((item) => item.localeCompare(region, 'pt-BR', { sensitivity: 'accent' }) === 0)) {
    throw new Error('Esta regiao ja esta cadastrada.');
  }

  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin().from('operational_regions').insert({ region });
    if (error) throw new Error(error.message);
  } else if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    await client.query('INSERT INTO operational_regions (region) VALUES ($1)', [region]);
  } else {
    customOperationalRegions.set(region, region);
  }
  return region;
}

async function readManualOltRegionMap(): Promise<Record<string, string>> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('olt_region_overrides').select('olt, region').order('olt', { ascending: true });
    if (error) throw new Error(error.message);
    return Object.fromEntries((data || []).map((row) => [row.olt, row.region]));
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ olt: string; region: string }>('SELECT olt, region FROM olt_region_overrides ORDER BY olt ASC');
    return Object.fromEntries(result.rows.map((row) => [row.olt, row.region]));
  }
  return getManualOltRegionMap();
}

export async function listOltRegionMappings(): Promise<OltRegionMapping[]> {
  const defaults = getDefaultOltRegionMap();
  const overrides = await readManualOltRegionMap();
  replaceManualOltRegionMap(overrides);
  const merged = { ...defaults, ...overrides };
  return Object.entries(merged).map(([olt, region]) => ({ olt, region, defaultRegion: defaults[olt] })).sort((left, right) => left.olt.localeCompare(right.olt));
}

function mapOltRegionRequest(row: { id: string; olt: string; source: string; status: string; occurrences: number; first_seen_at: string; last_seen_at: string; region?: string | null }): OltRegionRequest {
  return { id: row.id, olt: row.olt, source: row.source, status: row.status as OltRegionRequest['status'], occurrences: row.occurrences, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, region: row.region || undefined };
}

export async function recordUnknownOltRequests(olts: Array<string | null | undefined>, source: string) {
  const unknown = [...new Set(olts.map((value) => normalizeOltCode(value)).filter((olt): olt is string => Boolean(olt) && !resolveOltRegion(olt).region))];
  if (!unknown.length) return 0;
  const now = new Date().toISOString();
  let recorded = 0;

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    for (const olt of unknown) {
      const { data: existing, error: readError } = await admin.from('olt_region_requests').select('id, status, occurrences').eq('olt', olt).maybeSingle();
      if (readError) throw new Error(readError.message);
      if (existing?.status === 'Pendente') {
        const { error } = await admin.from('olt_region_requests').update({ occurrences: Number(existing.occurrences || 1) + 1, last_seen_at: now, source }).eq('id', existing.id);
        if (error) throw new Error(error.message);
        recorded += 1;
      } else if (!existing) {
        const { error } = await admin.from('olt_region_requests').insert({ olt, source, status: 'Pendente', occurrences: 1, first_seen_at: now, last_seen_at: now });
        if (error && error.code !== '23505') throw new Error(error.message);
        if (!error) recorded += 1;
      }
    }
    return recorded;
  }

  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    for (const olt of unknown) {
      const result = await client.query<{ id: string }>(`INSERT INTO olt_region_requests (olt, source, status, occurrences, first_seen_at, last_seen_at) VALUES ($1, $2, 'Pendente', 1, $3, $3) ON CONFLICT (olt) DO UPDATE SET occurrences = olt_region_requests.occurrences + 1, last_seen_at = EXCLUDED.last_seen_at, source = EXCLUDED.source WHERE olt_region_requests.status = 'Pendente' RETURNING id`, [olt, source, now]);
      recorded += result.rowCount || 0;
    }
    return recorded;
  }

  ensureDemoData();
  for (const olt of unknown) {
    const existing = oltRegionRequests.get(olt);
    if (existing?.status === 'Ignorada' || existing?.status === 'Adicionada') continue;
    if (existing) {
      oltRegionRequests.set(olt, { ...existing, source, occurrences: existing.occurrences + 1, lastSeenAt: now });
    } else {
      oltRegionRequests.set(olt, { id: `olt-request-${crypto.randomUUID()}`, olt, source, status: 'Pendente', occurrences: 1, firstSeenAt: now, lastSeenAt: now });
    }
    recorded += 1;
  }
  return recorded;
}

export async function captureUnknownOltRequestsFromCalls() {
  try {
    const currentCalls = await listCalls();
    return await captureUnknownOltRequests(currentCalls.map((call) => call.olt), 'Chamados existentes');
  } catch (error) {
    console.error('[OLT] nao foi possivel procurar OLTs desconhecidas nos chamados:', error);
    return 0;
  }
}

export async function captureUnknownOltRequests(olts: Array<string | null | undefined>, source: string) {
  try {
    return await recordUnknownOltRequests(olts, source);
  } catch (error) {
    console.error(`[OLT] nao foi possivel registrar solicitacoes (${source}):`, error);
    return 0;
  }
}

export async function listOltRegionRequests(): Promise<OltRegionRequest[]> {
  let requests: OltRegionRequest[];
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('olt_region_requests').select('id, olt, source, status, occurrences, first_seen_at, last_seen_at, region').eq('status', 'Pendente').order('last_seen_at', { ascending: false });
    if (error) throw new Error(error.message);
    requests = (data || []).map(mapOltRegionRequest);
  } else if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; olt: string; source: string; status: string; occurrences: number; first_seen_at: string; last_seen_at: string; region: string | null }>(`SELECT id, olt, source, status, occurrences, first_seen_at, last_seen_at, region FROM olt_region_requests WHERE status = 'Pendente' ORDER BY last_seen_at DESC`);
    requests = result.rows.map(mapOltRegionRequest);
  } else {
    ensureDemoData();
    requests = [...oltRegionRequests.values()].filter((request) => request.status === 'Pendente').sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
  }
  return requests.filter((request) => !resolveOltRegion(request.olt).region);
}

export async function acceptOltRegionRequest(id: string, region: string) {
  const pending = (await listOltRegionRequests()).find((request) => request.id === id);
  if (!pending) throw new Error('A solicitação de OLT não está mais pendente.');
  const currentMappings = await listOltRegionMappings();
  const mappings = currentMappings.filter((mapping) => normalizeOltCode(mapping.olt) !== pending.olt);
  await saveOltRegionMappings([...mappings, { olt: pending.olt, region }]);
  const resolvedAt = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin().from('olt_region_requests').update({ status: 'Adicionada', region: region.trim(), resolved_at: resolvedAt }).eq('id', id).eq('status', 'Pendente');
    if (error) throw new Error(error.message);
  } else if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    await client.query(`UPDATE olt_region_requests SET status = 'Adicionada', region = $1, resolved_at = $2 WHERE id = $3 AND status = 'Pendente'`, [region.trim(), resolvedAt, id]);
  } else {
    oltRegionRequests.set(pending.olt, { ...pending, status: 'Adicionada', region: region.trim(), lastSeenAt: resolvedAt });
  }
  return { olt: pending.olt, region: region.trim() };
}

export async function ignoreOltRegionRequest(id: string) {
  const pending = (await listOltRegionRequests()).find((request) => request.id === id);
  if (!pending) throw new Error('A solicitação de OLT não está mais pendente.');
  const ignoredAt = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin().from('olt_region_requests').update({ status: 'Ignorada', resolved_at: ignoredAt }).eq('id', id).eq('status', 'Pendente');
    if (error) throw new Error(error.message);
  } else if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    await client.query(`UPDATE olt_region_requests SET status = 'Ignorada', resolved_at = $1 WHERE id = $2 AND status = 'Pendente'`, [ignoredAt, id]);
  } else {
    oltRegionRequests.set(pending.olt, { ...pending, status: 'Ignorada', lastSeenAt: ignoredAt });
  }
  return { ignored: true, olt: pending.olt };
}

export async function saveOltRegionMappings(mappings: Array<{ olt: string; region: string }>): Promise<OltRegionMapping[]> {
  const defaults = getDefaultOltRegionMap();
  const overrides: Record<string, string> = {};
  for (const mapping of mappings) {
    const olt = normalizeOltCode(mapping.olt);
    const region = mapping.region.trim();
    if (!olt || !region) throw new Error('Informe uma OLT e uma regiao para cada mapeamento.');
    if (overrides[olt]) throw new Error(`A OLT ${olt} foi informada mais de uma vez.`);
    if (defaults[olt] !== region) overrides[olt] = region;
  }

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { error: deleteError } = await admin.from('olt_region_overrides').delete().not('olt', 'is', null);
    if (deleteError) throw new Error(deleteError.message);
    const rows = Object.entries(overrides).map(([olt, region]) => ({ olt, region, updated_at: new Date().toISOString() }));
    if (rows.length) {
      const { error } = await admin.from('olt_region_overrides').insert(rows);
      if (error) throw new Error(error.message);
    }
  } else if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    await client.query('BEGIN');
    try {
      await client.query('DELETE FROM olt_region_overrides WHERE olt IS NOT NULL');
      for (const [olt, region] of Object.entries(overrides)) {
        await client.query('INSERT INTO olt_region_overrides (olt, region) VALUES ($1, $2)', [olt, region]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  replaceManualOltRegionMap(overrides);
  const merged = { ...defaults, ...overrides };
  return Object.entries(merged).map(([olt, region]) => ({ olt, region, defaultRegion: defaults[olt] })).sort((left, right) => left.olt.localeCompare(right.olt));
}

export async function listSupervisors(): Promise<Supervisor[]> {
  ensureDemoData();
  if (isSupabaseConfigured()) {
    const supervisors = await listSupabaseSupervisors();
    const technicians = await listSupabaseTechnicians();
    return supervisors.map((supervisor) => ({ ...supervisor, technicianCount: technicians.filter((technician) => technician.supervisorId === supervisor.id).length }));
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; user_id: string | null; name: string; region: string | null; active: boolean }>(`SELECT id, user_id, name, region, active FROM supervisors WHERE deleted_at IS NULL ORDER BY name ASC`);
    const technicians = await listTechnicians();
    return result.rows.map((row) => ({ id: row.id, userId: row.user_id ?? undefined, name: row.name, region: row.region ?? '', active: row.active, technicianCount: technicians.filter((tech) => tech.supervisorId === row.id).length }));
  }
  return [...supervisors.values()].map((supervisor) => ({ ...supervisor, technicianCount: [...technicians.values()].filter((technician) => technician.supervisorId === supervisor.id).length }));
}
function isWithinTechnicianShift(shift: string) {
  const match = shift.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  return start <= end ? current >= start && current < end : current >= start || current < end;
}
function resolveTechnicianActive(technician: Technician) {
  if (technician.activeOverride) return technician.active;
  if (!technician.active) return false;
  return isWithinTechnicianShift(technician.shift) ?? true;
}
export async function listTechnicians(): Promise<Technician[]> {
  ensureDemoData();
  if (isSupabaseConfigured()) return (await listSupabaseTechnicians()).map((technician) => ({ ...technician, active: resolveTechnicianActive(technician), employmentStatus: technician.employmentStatus ?? 'Trabalhando' }));
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; supervisor_id: string | null; lead_technician_id: string | null; name: string; registration: string; region: string | null; shift: string | null; current_status: string; active: boolean; active_override: boolean; employment_status: string; team_role: string }>(`SELECT id, supervisor_id, lead_technician_id, name, registration, region, shift, current_status, active, active_override, employment_status, team_role FROM technicians WHERE deleted_at IS NULL ORDER BY name ASC`);
    const supervisorRows = await client.query<{ id: string; name: string }>(`SELECT id, name FROM supervisors WHERE deleted_at IS NULL`);
    const supervisorMap = new Map(supervisorRows.rows.map((row) => [row.id, row.name]));
    const names = new Map(result.rows.map((row) => [row.id, row.name]));
    return result.rows.map((row) => { const technician = { id: row.id, supervisorId: row.supervisor_id ?? undefined, leadTechnicianId: row.lead_technician_id ?? undefined, leadTechnicianName: row.lead_technician_id ? names.get(row.lead_technician_id) : undefined, name: row.name, registration: row.registration, supervisorName: row.supervisor_id ? supervisorMap.get(row.supervisor_id) : undefined, region: row.region ?? '', shift: row.shift ?? '', currentStatus: row.current_status as Technician['currentStatus'], active: row.active, activeOverride: row.active_override, employmentStatus: row.employment_status as NonNullable<Technician['employmentStatus']>, teamRole: row.team_role as Technician['teamRole'] }; return { ...technician, active: resolveTechnicianActive(technician) }; });
  }
  return [...technicians.values()].map((technician) => ({ ...technician, active: resolveTechnicianActive(technician), employmentStatus: technician.employmentStatus ?? 'Trabalhando', supervisorName: technician.supervisorId ? supervisors.get(technician.supervisorId)?.name : undefined }));
}
export async function addTechnician(input: Omit<Technician, 'id' | 'supervisorName'>): Promise<Technician> {
  if (isSupabaseConfigured()) return await createSupabaseTechnician(input);
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; supervisor_id: string | null; lead_technician_id: string | null; name: string; registration: string; region: string | null; shift: string | null; current_status: string; active: boolean; active_override: boolean; employment_status: string; team_role: string }>(
      `INSERT INTO technicians (supervisor_id, lead_technician_id, team_role, name, registration, region, shift, current_status, active, active_override, employment_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, now(), now())
       RETURNING id, supervisor_id, lead_technician_id, team_role, name, registration, region, shift, current_status, active, active_override, employment_status`,
      [input.supervisorId ?? null, input.leadTechnicianId ?? null, input.teamRole, input.name, input.registration, input.region, input.shift, input.currentStatus, input.active, input.employmentStatus ?? 'Trabalhando'],
    );
    const row = result.rows[0];
    const supervisorName = row.supervisor_id ? (await client.query<{ name: string }>(`SELECT name FROM supervisors WHERE id = $1 LIMIT 1`, [row.supervisor_id])).rows[0]?.name : undefined;
    return { id: row.id, supervisorId: row.supervisor_id ?? undefined, leadTechnicianId: row.lead_technician_id ?? undefined, name: row.name, registration: row.registration, supervisorName, region: row.region ?? '', shift: row.shift ?? '', currentStatus: row.current_status as Technician['currentStatus'], active: row.active, activeOverride: row.active_override, employmentStatus: row.employment_status as NonNullable<Technician['employmentStatus']>, teamRole: row.team_role as Technician['teamRole'] };
  }
  const technician = { ...input, employmentStatus: input.employmentStatus ?? 'Trabalhando', id: `tech-${crypto.randomUUID()}` };
  technicians.set(technician.id, technician);
  return { ...technician, supervisorName: technician.supervisorId ? supervisors.get(technician.supervisorId)?.name : undefined };
}
export async function updateTechnician(id: string, input: { name?: string; registration?: string; region?: string; shift?: string; supervisorId?: string; currentStatus?: Technician['currentStatus']; active?: boolean; employmentStatus?: Technician['employmentStatus']; teamRole?: Technician['teamRole']; leadTechnicianId?: string | null }): Promise<Technician | undefined> {
  ensureDemoData();
  if (input.registration !== undefined) {
    const registration = input.registration.trim().toLocaleUpperCase();
    const duplicate = (await listTechnicians()).find((technician) => technician.id !== id && technician.registration.trim().toLocaleUpperCase() === registration);
    if (duplicate) throw new Error('Esta matricula ja esta cadastrada.');
  }
  if (isSupabaseConfigured()) return await updateSupabaseTechnician(id, input);
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    if (input.name !== undefined) { sets.push(`name = $${index++}`); values.push(input.name); }
    if (input.registration !== undefined) { sets.push(`registration = $${index++}`); values.push(input.registration); }
    if (input.region !== undefined) { sets.push(`region = $${index++}`); values.push(input.region); }
    if (input.shift !== undefined) { sets.push(`shift = $${index++}`); values.push(input.shift); }
    if (input.supervisorId !== undefined) { sets.push(`supervisor_id = $${index++}`); values.push(input.supervisorId || null); }
    if (input.currentStatus) { sets.push(`current_status = $${index++}`); values.push(input.currentStatus); }
    if (input.active !== undefined) { sets.push(`active = $${index++}`); values.push(input.active); sets.push(`active_override = true`); }
    else if (input.currentStatus !== undefined) {
      sets.push(`active = $${index++}`); values.push(input.currentStatus !== 'Indisponivel');
      sets.push(`active_override = true`);
    }
    if (input.teamRole !== undefined) { sets.push(`team_role = $${index++}`); values.push(input.teamRole); }
    if (input.leadTechnicianId !== undefined) { sets.push(`lead_technician_id = $${index++}`); values.push(input.leadTechnicianId || null); }
    if (input.employmentStatus !== undefined) { sets.push(`employment_status = $${index++}`); values.push(input.employmentStatus); }
    if (!sets.length) return (await listTechnicians()).find((tech) => tech.id === id);
    sets.push(`updated_at = now()`);
    values.push(id);
    const result = await client.query<{ id: string; supervisor_id: string | null; lead_technician_id: string | null; name: string; registration: string; region: string | null; shift: string | null; current_status: string; active: boolean; active_override: boolean; employment_status: string; team_role: string }>(
      `UPDATE technicians SET ${sets.join(', ')} WHERE id = $${index} AND deleted_at IS NULL RETURNING id, supervisor_id, lead_technician_id, team_role, name, registration, region, shift, current_status, active, active_override, employment_status`,
      values,
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const supervisorName = row.supervisor_id ? (await client.query<{ name: string }>(`SELECT name FROM supervisors WHERE id = $1 LIMIT 1`, [row.supervisor_id])).rows[0]?.name : undefined;
    return { id: row.id, supervisorId: row.supervisor_id ?? undefined, leadTechnicianId: row.lead_technician_id ?? undefined, name: row.name, registration: row.registration, supervisorName, region: row.region ?? '', shift: row.shift ?? '', currentStatus: row.current_status as Technician['currentStatus'], active: row.active, activeOverride: row.active_override, employmentStatus: row.employment_status as NonNullable<Technician['employmentStatus']>, teamRole: row.team_role as Technician['teamRole'] };
  }
  const current = technicians.get(id);
  if (!current) return undefined;
  const nextActive = input.active !== undefined ? input.active : input.currentStatus === 'Indisponivel' ? false : current.active;
  const updated = { ...current, ...input, employmentStatus: input.employmentStatus ?? current.employmentStatus ?? 'Trabalhando', active: nextActive, activeOverride: input.active !== undefined || input.currentStatus !== undefined ? true : current.activeOverride };
  technicians.set(id, updated);
  return { ...updated, active: resolveTechnicianActive(updated), supervisorName: updated.supervisorId ? supervisors.get(updated.supervisorId)?.name : undefined };
}
export async function deleteTechnician(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) return await deleteSupabaseTechnician(id);
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    await client.query('BEGIN');
    try {
      await client.query('UPDATE technicians SET lead_technician_id = NULL, updated_at = now() WHERE lead_technician_id = $1 AND deleted_at IS NULL', [id]);
      const result = await client.query<{ id: string }>('UPDATE technicians SET deleted_at = now(), active = false, updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [id]);
      await client.query('COMMIT');
      return Boolean(result.rowCount);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  if (!technicians.has(id)) return false;
  for (const technician of technicians.values()) if (technician.leadTechnicianId === id) technician.leadTechnicianId = undefined;
  technicians.delete(id);
  return true;
}
export async function addSupervisor(input: Omit<Supervisor, 'id' | 'technicianCount'>): Promise<Supervisor> {
  if (isSupabaseConfigured()) return await createSupabaseSupervisor(input);
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; user_id: string | null; name: string; region: string | null; active: boolean }>(
      `INSERT INTO supervisors (user_id, name, region, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())
       RETURNING id, user_id, name, region, active`,
      [input.userId ?? null, input.name, input.region, input.active],
    );
    const row = result.rows[0];
    return { id: row.id, userId: row.user_id ?? undefined, name: row.name, region: row.region ?? '', active: row.active, technicianCount: 0 };
  }
  const supervisor = { ...input, id: `supervisor-${crypto.randomUUID()}`, technicianCount: 0 };
  supervisors.set(supervisor.id, supervisor);
  return supervisor;
}
export async function updateSupervisor(id: string, input: { userId?: string | null; name?: string; region?: string; active?: boolean }): Promise<Supervisor | undefined> {
  if (isSupabaseConfigured()) return await updateSupabaseSupervisor(id, input);
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    if (input.userId !== undefined) { sets.push(`user_id = $${index++}`); values.push(input.userId || null); }
    if (input.name !== undefined) { sets.push(`name = $${index++}`); values.push(input.name); }
    if (input.region !== undefined) { sets.push(`region = $${index++}`); values.push(input.region); }
    if (input.active !== undefined) { sets.push(`active = $${index++}`); values.push(input.active); }
    if (!sets.length) return (await listSupervisors()).find((item) => item.id === id);
    sets.push(`updated_at = now()`);
    values.push(id);
    const result = await client.query<{ id: string; user_id: string | null; name: string; region: string | null; active: boolean }>(`UPDATE supervisors SET ${sets.join(', ')} WHERE id = $${index} AND deleted_at IS NULL RETURNING id, user_id, name, region, active`, values);
    const row = result.rows[0];
    if (!row) return undefined;
    const technicianCount = (await listTechnicians()).filter((technician) => technician.supervisorId === row.id).length;
    return { id: row.id, userId: row.user_id ?? undefined, name: row.name, region: row.region ?? '', active: row.active, technicianCount };
  }
  const current = supervisors.get(id);
  if (!current) return undefined;
  const updated = { ...current, ...input, userId: input.userId === null ? undefined : input.userId ?? current.userId };
  supervisors.set(id, updated);
  return updated;
}
export async function deleteSupervisor(id: string): Promise<{ deleted: boolean; technicianCount: number }> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { count, error: countError } = await admin.from('technicians').select('id', { count: 'exact', head: true }).eq('supervisor_id', id).is('deleted_at', null);
    if (countError) throw new Error(countError.message);
    if (count) return { deleted: false, technicianCount: count };
    const { data, error } = await admin.from('supervisors').update({ active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null).select('id').maybeSingle();
    if (error) throw new Error(error.message);
    return { deleted: Boolean(data), technicianCount: 0 };
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    await client.query('BEGIN');
    try {
      const existing = await client.query<{ id: string }>('SELECT id FROM supervisors WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!existing.rowCount) { await client.query('ROLLBACK'); return { deleted: false, technicianCount: 0 }; }
      const linked = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM technicians WHERE supervisor_id = $1 AND deleted_at IS NULL', [id]);
      const technicianCount = Number(linked.rows[0]?.count || 0);
      if (technicianCount) { await client.query('ROLLBACK'); return { deleted: false, technicianCount }; }
      const result = await client.query('UPDATE supervisors SET active = false, deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL', [id]);
      await client.query('COMMIT');
      return { deleted: Boolean(result.rowCount), technicianCount: 0 };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  const supervisor = supervisors.get(id);
  if (!supervisor) return { deleted: false, technicianCount: 0 };
  const technicianCount = [...technicians.values()].filter((technician) => technician.supervisorId === id).length;
  if (technicianCount) return { deleted: false, technicianCount };
  supervisors.delete(id);
  return { deleted: true, technicianCount: 0 };
}
export type CallQuery = { id?: string; from?: string; to?: string; supervisorId?: string; status?: CallStatus | CallStatus[]; search?: string; region?: string; neighborhood?: string; olt?: string; page?: number; pageSize?: number; sort?: 'openedAt' | 'status' | 'region' | 'technicianName' | 'client' | 'orderNumber'; direction?: 'asc' | 'desc'; };
function matchesCallStatus(status: CallStatus, filter?: CallStatus | CallStatus[]) {
  return !filter || (Array.isArray(filter) ? filter : [filter]).includes(status);
}
function callReferenceDate(call: Call) {
  return (['Finalizado', 'Cancelado', 'Baixar'].includes(call.status) ? call.executedAt || call.openedAt : call.openedAt).slice(0, 10);
}
function isCallInDateRange(call: Call, query: CallQuery) {
  const referenceDate = callReferenceDate(call);
  return (!query.from || referenceDate >= query.from) && (!query.to || referenceDate <= query.to);
}
function normalizeQueryText(value: string | undefined) {
  return value?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() ?? '';
}
function matchesCallSearch(call: Call, search: string | undefined) {
  if (!search) return true;
  const haystack = normalizeQueryText([call.orderNumber, call.client, call.bdesk, call.region, call.city, call.bairro, call.address, call.type, call.technicianName, call.supervisorName, call.olt].join(' '));
  return haystack.includes(normalizeQueryText(search));
}
function sortCalls(calls: Call[], query: CallQuery) {
  const direction = query.direction === 'asc' ? 1 : -1;
  const key = query.sort ?? 'openedAt';
  const values = [...calls];
  values.sort((left, right) => {
    const leftValue = key === 'openedAt' ? new Date(left.openedAt).getTime() : key === 'status' ? left.status : key === 'region' ? left.region : key === 'technicianName' ? (left.technicianName || '').toLowerCase() : key === 'client' ? left.client.toLowerCase() : left.orderNumber.toLowerCase();
    const rightValue = key === 'openedAt' ? new Date(right.openedAt).getTime() : key === 'status' ? right.status : key === 'region' ? right.region : key === 'technicianName' ? (right.technicianName || '').toLowerCase() : key === 'client' ? right.client.toLowerCase() : right.orderNumber.toLowerCase();
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction;
    return String(leftValue).localeCompare(String(rightValue)) * direction;
  });
  return values;
}
export async function getSupervisorIdForUser(userId: string): Promise<string | undefined> {
  ensureDemoData();
  if (isSupabaseConfigured()) return (await listSupabaseSupervisors()).find((item) => item.userId === userId)?.id;
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string }>('SELECT id FROM supervisors WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1', [userId]);
    return result.rows[0]?.id;
  }
  return [...supervisors.values()].find((item) => item.userId === userId)?.id;
}
export async function listCalls(status?: CallStatus | CallStatus[], query: CallQuery = {}): Promise<Call[]> {
  ensureDemoData();
  const baseStatus = status ?? query.status;
  const baseQuery = { ...query, status: baseStatus };
  if (isSupabaseConfigured()) {
    const rows = await listSupabaseCalls(baseStatus, { from: baseQuery.from, to: baseQuery.to, supervisorId: baseQuery.supervisorId, id: baseQuery.id });
    return sortCalls(rows.filter((call) => (!baseQuery.id || call.id === baseQuery.id) && matchesCallSearch(call, baseQuery.search) && (!baseQuery.region || call.region === baseQuery.region) && (!baseQuery.neighborhood || call.bairro === baseQuery.neighborhood) && (!baseQuery.olt || normalizeQueryText(call.olt) === normalizeQueryText(baseQuery.olt)) && (!baseQuery.supervisorId || call.supervisorName === supervisors.get(baseQuery.supervisorId)?.name || (call.technicianId ? technicians.get(call.technicianId)?.supervisorId === baseQuery.supervisorId : false)) && matchesCallStatus(call.status, baseQuery.status) && isCallInDateRange(call, baseQuery)), baseQuery);
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; order_number: string; bdesk: string; office_track: string; client: string; type: string; reason: string; region: string; city: string; address: string | null; bairro: string | null; ofs_status: string | null; olt: string; slot_pon: string; status: string; technician_id: string | null; technician_name: string | null; supervisor_name: string | null; opened_at: string; assigned_at: string | null; executed_at: string | null; result: string | null; cancellation_reason: string | null; notes: string; source: string | null; source_identity: string | null; source_identifiers: string[] | null; source_file_id: string | null; source_file_name: string | null; source_reference_date: string | null; source_fingerprint: string | null; source_processed_at: string | null; last_observation_at: string | null }>(
      `SELECT c.id, c.order_number, c.bdesk, c.office_track, c.client, c.type, c.reason, c.region, c.city, c.address, c.bairro, c.ofs_status, c.olt, c.slot_pon, c.status, c.technician_id, t.name AS technician_name, s.name AS supervisor_name, c.opened_at, c.assigned_at, c.executed_at, c.result, c.cancellation_reason, c.notes, c.source, c.source_identity, c.source_identifiers, c.source_file_id, c.source_file_name, c.source_reference_date, c.source_fingerprint, c.source_processed_at, latest_observation.created_at AS last_observation_at
       FROM calls c LEFT JOIN technicians t ON t.id = c.technician_id LEFT JOIN supervisors s ON s.id = t.supervisor_id
       LEFT JOIN LATERAL (SELECT created_at FROM call_observations WHERE call_id = c.id ORDER BY created_at DESC LIMIT 1) latest_observation ON true
      WHERE ($1::text[] IS NULL OR c.status = ANY($1::text[])) AND ($2::date IS NULL OR (CASE WHEN c.status IN ('Finalizado', 'Cancelado', 'Baixar') THEN COALESCE(c.executed_at, c.opened_at) ELSE c.opened_at END)::date >= $2::date) AND ($3::date IS NULL OR (CASE WHEN c.status IN ('Finalizado', 'Cancelado', 'Baixar') THEN COALESCE(c.executed_at, c.opened_at) ELSE c.opened_at END)::date <= $3::date) AND ($4::uuid IS NULL OR t.supervisor_id = $4::uuid) AND ($5::uuid IS NULL OR c.id = $5::uuid) ORDER BY c.opened_at DESC`,
      [baseStatus ? (Array.isArray(baseStatus) ? baseStatus : [baseStatus]) : null, baseQuery.from ?? null, baseQuery.to ?? null, baseQuery.supervisorId ?? null, baseQuery.id ?? null],
    );
    const rows = result.rows.map((row) => ({ id: row.id, orderNumber: row.order_number, bdesk: row.bdesk, officeTrack: row.office_track, client: row.client, type: row.type, reason: row.reason, region: row.region, city: row.city, address: row.address ?? '', bairro: row.bairro ?? '', ofsStatus: row.ofs_status ?? undefined, olt: row.olt, slotPon: row.slot_pon, status: row.status as CallStatus, technicianId: row.technician_id ?? undefined, technicianName: row.technician_name ?? undefined, supervisorName: row.supervisor_name ?? undefined, openedAt: row.opened_at, assignedAt: row.assigned_at ?? undefined, executedAt: row.executed_at ?? undefined, result: row.result ?? undefined, cancellationReason: row.cancellation_reason ?? undefined, notes: row.notes ?? '', lastObservationAt: row.last_observation_at ?? undefined, source: row.source ?? undefined, sourceIdentity: row.source_identity ?? undefined, sourceIdentifiers: row.source_identifiers ?? [], sourceFileId: row.source_file_id ?? undefined, sourceFileName: row.source_file_name ?? undefined, sourceReferenceDate: row.source_reference_date ?? undefined, sourceFingerprint: row.source_fingerprint ?? undefined, sourceProcessedAt: row.source_processed_at ?? undefined }));
    return sortCalls(rows.filter((call) => (!baseQuery.id || call.id === baseQuery.id) && matchesCallSearch(call, baseQuery.search) && (!baseQuery.region || call.region === baseQuery.region) && (!baseQuery.neighborhood || call.bairro === baseQuery.neighborhood) && (!baseQuery.olt || normalizeQueryText(call.olt) === normalizeQueryText(baseQuery.olt)) && (!baseQuery.supervisorId || call.supervisorName === supervisors.get(baseQuery.supervisorId)?.name || (call.technicianId ? technicians.get(call.technicianId)?.supervisorId === baseQuery.supervisorId : false)) && matchesCallStatus(call.status, baseQuery.status) && isCallInDateRange(call, baseQuery)), baseQuery);
  }
  const rows = [...calls.values()].map((call) => {
    const lastObservationAt = [...observations.values()].filter((observation) => observation.callId === call.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.createdAt;
    return { ...call, lastObservationAt };
  }).filter((call) => {
    if (baseQuery.id && call.id !== baseQuery.id) return false;
    if (!matchesCallStatus(call.status, baseStatus)) return false;
    if (!isCallInDateRange(call, baseQuery)) return false;
    if (baseQuery.region && call.region !== baseQuery.region) return false;
    if (baseQuery.neighborhood && call.bairro !== baseQuery.neighborhood) return false;
    if (baseQuery.olt && normalizeQueryText(call.olt) !== normalizeQueryText(baseQuery.olt)) return false;
    if (!matchesCallSearch(call, baseQuery.search)) return false;
    if (!baseQuery.supervisorId) return true;
    if (call.technicianId) {
      const technician = technicians.get(call.technicianId);
      return technician?.supervisorId === baseQuery.supervisorId;
    }
    if (call.supervisorName) {
      const target = supervisors.get(baseQuery.supervisorId);
      return target?.name === call.supervisorName;
    }
    return false;
  });
  return sortCalls(rows, baseQuery);
}

function normalizeExternalCallIdentifier(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function findExistingCallIdentifiers(): Promise<Set<string>> {
  ensureDemoData();
  const identifiers = new Set<string>();
  const addRow = (row: { order_number?: string | null; bdesk?: string | null; office_track?: string | null }) => {
    [row.order_number, row.bdesk, row.office_track].forEach((value) => {
      const normalized = value ? normalizeExternalCallIdentifier(value) : '';
      if (normalized) identifiers.add(normalized);
    });
  };

  if (isSupabaseConfigured()) {
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await getSupabaseAdmin().from('calls').select('order_number, bdesk, office_track').range(from, from + pageSize - 1);
      if (error) throw new Error(error.message || 'Nao foi possivel verificar chamados existentes.');
      (data || []).forEach(addRow);
      if (!data || data.length < pageSize) break;
    }
    return identifiers;
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ order_number: string | null; bdesk: string | null; office_track: string | null }>('SELECT order_number, bdesk, office_track FROM calls');
    result.rows.forEach(addRow);
    return identifiers;
  }
  calls.forEach((call) => addRow({ order_number: call.orderNumber, bdesk: call.bdesk, office_track: call.officeTrack }));
  return identifiers;
}

export async function insertWorkbookCalls(importedCalls: Call[], sourceLabel: string): Promise<number> {
  if (!importedCalls.length) return 0;
  await captureUnknownOltRequests(importedCalls.map((call) => call.olt), sourceLabel);
  if (isSupabaseConfigured()) {
    let inserted = 0;
    for (let from = 0; from < importedCalls.length; from += 250) {
      const batch = importedCalls.slice(from, from + 250).map((call) => ({
        id: call.id,
        order_number: call.orderNumber,
        bdesk: call.bdesk || null,
        office_track: call.officeTrack || null,
        client: call.client || 'Cliente nao identificado',
        type: call.type,
        reason: call.reason,
        region: call.region,
        city: call.city || null,
        address: call.address || null,
        bairro: call.bairro || null,
        technician_id: call.technicianId || null,
        olt: call.olt || null,
        slot_pon: call.slotPon || null,
        status: call.status,
        opened_at: call.openedAt,
        assigned_at: call.assignedAt || null,
        executed_at: call.executedAt || null,
        result: call.result || null,
        notes: call.notes,
        cancellation_reason: null,
        source: call.source || null,
        source_identity: call.sourceIdentity || null,
        source_identifiers: call.sourceIdentifiers || [],
        source_file_name: call.sourceFileName || null,
        source_reference_date: call.sourceReferenceDate || null,
        source_fingerprint: call.sourceFingerprint || null,
        source_processed_at: call.sourceProcessedAt || null,
      }));
      const { data, error } = await getSupabaseAdmin().from('calls').upsert(batch, { onConflict: 'id', ignoreDuplicates: true }).select('id');
      if (error) throw new Error(error.message || 'Nao foi possivel importar chamados historicos.');
      inserted += data?.length || 0;
    }
    return inserted;
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    let inserted = 0;
    try {
      await client.query('BEGIN');
      for (let from = 0; from < importedCalls.length; from += 150) {
        const batch = importedCalls.slice(from, from + 150);
        const columns = ['id', 'order_number', 'bdesk', 'office_track', 'client', 'type', 'reason', 'region', 'city', 'address', 'bairro', 'technician_id', 'olt', 'slot_pon', 'status', 'opened_at', 'assigned_at', 'executed_at', 'result', 'notes', 'cancellation_reason', 'source', 'source_identity', 'source_identifiers', 'source_file_name', 'source_reference_date', 'source_fingerprint', 'source_processed_at'];
        const values = batch.flatMap((call) => [call.id, call.orderNumber, call.bdesk || null, call.officeTrack || null, call.client || 'Cliente nao identificado', call.type, call.reason, call.region, call.city || null, call.address || null, call.bairro || null, call.technicianId || null, call.olt || null, call.slotPon || null, call.status, call.openedAt, call.assignedAt || null, call.executedAt || null, call.result || null, call.notes, null, call.source || null, call.sourceIdentity || null, JSON.stringify(call.sourceIdentifiers || []), call.sourceFileName || null, call.sourceReferenceDate || null, call.sourceFingerprint || null, call.sourceProcessedAt || null]);
        const tuples = batch.map((_, rowIndex) => `(${columns.map((__, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(', ')})`).join(', ');
        const result = await client.query(`INSERT INTO calls (${columns.join(', ')}) VALUES ${tuples} ON CONFLICT (id) DO NOTHING`, values);
        inserted += result.rowCount || 0;
      }
      await client.query('COMMIT');
      return inserted;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  ensureDemoData();
  let inserted = 0;
  importedCalls.forEach((call) => {
    if (calls.has(call.id)) return;
    calls.set(call.id, call);
    inserted += 1;
  });
  return inserted;
}

export async function insertHistoricalCalls(historicalCalls: Call[]): Promise<number> {
  return insertWorkbookCalls(historicalCalls.map((call) => ({ ...call, status: 'Finalizado' })), 'Importacao historica');
}

export type DriveCallSource = { identity: string; identifiers: string[]; fileId: string; fileName: string; referenceDate?: string; fingerprint: string; payload: Record<string, string> };
const driveSyncRuns: Array<{ startedAt: string; result: Record<string, unknown> }> = [];
export async function createDriveCall(call: Call, sourceData: DriveCallSource): Promise<{ call: Call; created: boolean }> {
  await captureUnknownOltRequests([call.olt], 'Google Drive');
  const processedAt = new Date().toISOString();
  const sourcedCall: Call = { ...call, source: 'google-drive', sourceIdentity: sourceData.identity, sourceIdentifiers: sourceData.identifiers, sourceFileId: sourceData.fileId, sourceFileName: sourceData.fileName, sourceReferenceDate: sourceData.referenceDate, sourceFingerprint: sourceData.fingerprint, sourceProcessedAt: processedAt };
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('calls').insert({ id: sourcedCall.id, order_number: sourcedCall.orderNumber, bdesk: sourcedCall.bdesk || null, office_track: sourcedCall.officeTrack || null, client: sourcedCall.client || null, type: sourcedCall.type || null, reason: sourcedCall.reason || null, region: sourcedCall.region || null, city: sourcedCall.city || null, address: sourcedCall.address || null, bairro: sourcedCall.bairro || null, olt: sourcedCall.olt || null, slot_pon: sourcedCall.slotPon || null, status: sourcedCall.status, opened_at: sourcedCall.openedAt, executed_at: sourcedCall.executedAt || null, result: sourcedCall.result || null, notes: sourcedCall.notes, cancellation_reason: sourcedCall.cancellationReason || null, source: 'google-drive', source_identity: sourceData.identity, source_identifiers: sourceData.identifiers, source_file_id: sourceData.fileId, source_file_name: sourceData.fileName, source_reference_date: sourceData.referenceDate || null, source_payload: sourceData.payload, source_fingerprint: sourceData.fingerprint, source_processed_at: processedAt }).select('id').maybeSingle();
    if (error) {
      if (error.code === '23505') {
        const existing = (await listCalls()).find((item) => item.source === 'google-drive' && item.sourceIdentity === sourceData.identity);
        if (existing) return { call: existing, created: false };
      }
      throw new Error(error.message || 'Nao foi possivel persistir o chamado historico do Drive.');
    }
    if (!data) throw new Error('Nao foi possivel confirmar o chamado historico do Drive.');
    const { error: snapshotError } = await getSupabaseAdmin().from('google_drive_call_snapshots').insert({ call_id: sourcedCall.id, source_identity: sourceData.identity, file_id: sourceData.fileId, file_name: sourceData.fileName, reference_date: sourceData.referenceDate || null, fingerprint: sourceData.fingerprint, payload: sourceData.payload, processed_at: processedAt });
    if (snapshotError) throw new Error(snapshotError.message);
    return { call: sourcedCall, created: true };
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(`INSERT INTO calls (id, order_number, bdesk, office_track, client, type, reason, region, city, olt, slot_pon, status, opened_at, executed_at, result, notes, source, source_identity, source_identifiers, source_file_id, source_file_name, source_reference_date, source_payload, source_fingerprint, source_processed_at, cancellation_reason, address, bairro) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'google-drive', $17, $18::jsonb, $19, $20, $21, $22::jsonb, $23, $24, $25, $26, $27) ON CONFLICT (source, source_identity) WHERE source IS NOT NULL AND source_identity IS NOT NULL DO NOTHING RETURNING id`, [sourcedCall.id, sourcedCall.orderNumber, sourcedCall.bdesk || null, sourcedCall.officeTrack || null, sourcedCall.client || null, sourcedCall.type || null, sourcedCall.reason || null, sourcedCall.region || null, sourcedCall.city || null, sourcedCall.olt || null, sourcedCall.slotPon || null, sourcedCall.status, sourcedCall.openedAt, sourcedCall.executedAt || null, sourcedCall.result || null, sourcedCall.notes, sourceData.identity, JSON.stringify(sourceData.identifiers), sourceData.fileId, sourceData.fileName, sourceData.referenceDate || null, JSON.stringify(sourceData.payload), sourceData.fingerprint, processedAt, sourcedCall.cancellationReason || null, sourcedCall.address || null, sourcedCall.bairro || null]);
      if (!inserted.rows[0]) {
        await client.query('ROLLBACK');
        const existing = (await listCalls()).find((item) => item.source === 'google-drive' && item.sourceIdentity === sourceData.identity);
        if (!existing) throw new Error('Chave historica duplicada sem chamado recuperavel.');
        return { call: existing, created: false };
      }
      await client.query(`INSERT INTO google_drive_call_snapshots (call_id, source_identity, file_id, file_name, reference_date, fingerprint, payload, processed_at) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`, [sourcedCall.id, sourceData.identity, sourceData.fileId, sourceData.fileName, sourceData.referenceDate || null, sourceData.fingerprint, JSON.stringify(sourceData.payload), processedAt]);
      await client.query('COMMIT');
      return { call: sourcedCall, created: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const existing = [...calls.values()].find((item) => item.source === 'google-drive' && item.sourceIdentity === sourceData.identity);
  if (existing) return { call: existing, created: false };
  calls.set(sourcedCall.id, sourcedCall);
  return { call: sourcedCall, created: true };
}
export async function recordDriveCallSnapshot(callId: string, sourceData: DriveCallSource) {
  const processedAt = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const { error: updateError } = await getSupabaseAdmin().from('calls').update({ source: 'google-drive', source_identity: sourceData.identity, source_identifiers: sourceData.identifiers, source_file_id: sourceData.fileId, source_file_name: sourceData.fileName, source_reference_date: sourceData.referenceDate || null, source_payload: sourceData.payload, source_fingerprint: sourceData.fingerprint, source_processed_at: processedAt }).eq('id', callId);
    if (updateError) throw new Error(updateError.message);
    const { error } = await getSupabaseAdmin().from('google_drive_call_snapshots').insert({ call_id: callId, source_identity: sourceData.identity, file_id: sourceData.fileId, file_name: sourceData.fileName, reference_date: sourceData.referenceDate || null, fingerprint: sourceData.fingerprint, payload: sourceData.payload, processed_at: processedAt });
    if (error) throw new Error(error.message);
    return;
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    await client.query('BEGIN');
    try {
      await client.query(`UPDATE calls SET source = 'google-drive', source_identity = $1, source_identifiers = $2::jsonb, source_file_id = $3, source_file_name = $4, source_reference_date = $5, source_payload = $6::jsonb, source_fingerprint = $7, source_processed_at = $8, updated_at = now() WHERE id = $9`, [sourceData.identity, JSON.stringify(sourceData.identifiers), sourceData.fileId, sourceData.fileName, sourceData.referenceDate || null, JSON.stringify(sourceData.payload), sourceData.fingerprint, processedAt, callId]);
      await client.query(`INSERT INTO google_drive_call_snapshots (call_id, source_identity, file_id, file_name, reference_date, fingerprint, payload, processed_at) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`, [callId, sourceData.identity, sourceData.fileId, sourceData.fileName, sourceData.referenceDate || null, sourceData.fingerprint, JSON.stringify(sourceData.payload), processedAt]);
      await client.query('COMMIT');
      return;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const existing = calls.get(callId);
  if (existing) calls.set(callId, { ...existing, source: 'google-drive', sourceIdentity: sourceData.identity, sourceIdentifiers: sourceData.identifiers, sourceFileId: sourceData.fileId, sourceFileName: sourceData.fileName, sourceReferenceDate: sourceData.referenceDate, sourceFingerprint: sourceData.fingerprint, sourceProcessedAt: processedAt });
}
export async function recordDriveSyncRun(startedAt: string, result: { files: number; rows: number; processed: number; newRecords: number; updated: number; finalised: number; cancelled: number; unchanged: number; unmatched: number; skipped: number; errors: string[] }) {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseAdmin().from('google_drive_sync_runs').insert({ started_at: startedAt, finished_at: new Date().toISOString(), files: result.files, rows: result.rows, processed: result.processed, new_records: result.newRecords, updated: result.updated, finalised: result.finalised, cancelled: result.cancelled, unchanged: result.unchanged, unmatched: result.unmatched, skipped: result.skipped, errors: result.errors });
    if (error) throw new Error(error.message);
    return;
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    await client.query(`INSERT INTO google_drive_sync_runs (started_at, finished_at, files, rows, processed, new_records, updated, finalised, cancelled, unchanged, unmatched, skipped, errors) VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`, [startedAt, result.files, result.rows, result.processed, result.newRecords, result.updated, result.finalised, result.cancelled, result.unchanged, result.unmatched, result.skipped, JSON.stringify(result.errors)]);
    return;
  }
  driveSyncRuns.push({ startedAt, result: { ...result } });
}
export async function getCall(id: string, query: CallQuery = {}): Promise<Call | undefined> {
  ensureDemoData();
  if (isSupabaseConfigured() || shouldUseLocalDatabase()) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return undefined;
    return (await listCalls(undefined, { ...query, id }))[0];
  }
  const call = calls.get(id);
  if (!call) return undefined;
  if (query.supervisorId) {
    if (call.technicianId) {
      const technician = technicians.get(call.technicianId);
      if (technician?.supervisorId !== query.supervisorId) return undefined;
    } else if (call.supervisorName) {
      const target = supervisors.get(query.supervisorId);
      if (target?.name !== call.supervisorName) return undefined;
    } else {
      return undefined;
    }
  }
  if (query.from && call.openedAt.slice(0, 10) < query.from) return undefined;
  if (query.to && call.openedAt.slice(0, 10) > query.to) return undefined;
  return call;
}
export async function deleteCall(id: string): Promise<boolean> {
  ensureDemoData();
  if (isSupabaseConfigured()) {
    try {
      const admin = getSupabaseAdmin();
      const { error: logsError } = await admin.from('call_logs').delete().eq('call_id', id);
      if (logsError) throw new Error(logsError.message || 'Nao foi possivel remover os logs do chamado.');
      const { error: observationsError } = await admin.from('call_observations').delete().eq('call_id', id);
      if (observationsError) throw new Error(observationsError.message || 'Nao foi possivel remover as observacoes do chamado.');
      const { error } = await admin.from('calls').delete().eq('id', id).select('id').maybeSingle();
      if (error) throw new Error(error.message || 'Nao foi possivel apagar o chamado.');
      return true;
    } catch (error) {
      if (shouldUseLocalDatabase()) {
        // local fallback below
      } else {
        const removed = calls.delete(id);
        if (removed) {
          for (const [observationId, observation] of [...observations.entries()]) {
            if (observation.callId === id) observations.delete(observationId);
          }
          for (const [logId, log] of [...auditLogs.entries()]) {
            if (log.callId === id) auditLogs.delete(logId);
          }
          return true;
        }
        const message = error instanceof Error ? error.message : 'Nao foi possivel apagar o chamado.';
        throw new Error(`Supabase indisponivel ao apagar o chamado. ${message}`);
      }
    }
  }

  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM call_logs WHERE call_id = $1`, [id]);
      await client.query(`DELETE FROM call_observations WHERE call_id = $1`, [id]);
      const result = await client.query<{ id: string }>(`DELETE FROM calls WHERE id = $1 RETURNING id`, [id]);
      await client.query('COMMIT');
      return Boolean(result.rowCount && result.rowCount > 0);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  const removed = calls.delete(id);
  if (!removed) return false;
  for (const [observationId, observation] of [...observations.entries()]) {
    if (observation.callId === id) observations.delete(observationId);
  }
  for (const [logId, log] of [...auditLogs.entries()]) {
    if (log.callId === id) auditLogs.delete(logId);
  }
  return true;
}
export async function deleteAllCalls(): Promise<number> {
  ensureDemoData();
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().rpc('delete_all_calls');
    if (error) throw new Error(error.message || 'Nao foi possivel apagar os chamados.');
    return Number(data || 0);
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM call_logs WHERE call_id IS NOT NULL');
      await client.query('DELETE FROM call_observations WHERE call_id IS NOT NULL');
      const result = await client.query('DELETE FROM calls WHERE id IS NOT NULL');
      await client.query('COMMIT');
      return result.rowCount || 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const deleted = calls.size;
  calls.clear();
  observations.clear();
  auditLogs.clear();
  for (const activation of activations.values()) activation.createdCallId = undefined;
  return deleted;
}
export async function listNotifications(includeOperational = true) {
  const notifications = [] as { id: string; type: 'warning' | 'info'; title: string; detail: string; href: string }[];
  if (includeOperational) {
    const currentCalls = isSupabaseConfigured() || shouldUseLocalDatabase() ? await listCalls() : [...calls.values()];
    const unassigned = currentCalls.filter((call) => !call.technicianId && !['Finalizado', 'Cancelado', 'Baixar'].includes(call.status));
    if (unassigned.length) notifications.push({ id: 'unassigned-calls', type: 'warning', title: `${unassigned.length} chamados sem tecnico`, detail: 'Existem chamados aguardando atribuicao.', href: '/chamados/abertos' });
  }
  const currentActivations = isSupabaseConfigured() || shouldUseLocalDatabase() ? await listActivations() : [...activations.values()];
  const pending = currentActivations.filter((activation) => activation.status === 'Pendente');
  if (pending.length) notifications.push({ id: 'pending-activations', type: 'info', title: `${pending.length} acionamentos pendentes`, detail: 'Revise os dados recebidos para decidir.', href: '/acionamentos' });
  return notifications;
}
function normalizeTechnicianId(id?: string | null) {
  if (!id) return id;
  const candidate = id.replace(/^tech-/, '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : id;
}
function prepareCallUpdate(current: Call, input: Partial<EditableCallFields>): Partial<EditableCallFields> {
  const olt = input.olt ?? current.olt;
  return {
    ...input,
    region: resolveOltRegion(olt).region || input.region?.trim() || current.region,
    address: input.address?.trim() || current.address || '',
    bairro: input.bairro?.trim() || current.bairro || '',
  };
}
export async function updateCall(id: string, input: Partial<EditableCallFields>, actor: User): Promise<Call | undefined> {
  ensureDemoData();
  if (input.olt) await captureUnknownOltRequests([input.olt], 'Edicao manual');
  if (isSupabaseConfigured()) {
    const current = await getCall(id);
    if (!current) return undefined;
    return await updateSupabaseCall(id, prepareCallUpdate(current, input), actor);
  }
  if (shouldUseLocalDatabase()) {
    const current = await getCall(id);
    if (!current) return undefined;
    if (['Finalizado', 'Cancelado', 'Baixar'].includes(current.status) && actor.roleId !== 'system') return undefined;
    input = prepareCallUpdate(current, input);
    const client = await getDatabaseClient();
    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    const databaseFields: Record<string, string> = { orderNumber: 'order_number', bdesk: 'bdesk', officeTrack: 'office_track', client: 'client', type: 'type', reason: 'reason', region: 'region', city: 'city', address: 'address', bairro: 'bairro', ofsStatus: 'ofs_status', olt: 'olt', slotPon: 'slot_pon', status: 'status', executedAt: 'executed_at', result: 'result', cancellationReason: 'cancellation_reason', notes: 'notes' };
    for (const field of Object.keys(databaseFields)) {
      const value = input[field as keyof typeof input];
      if (value !== undefined) { sets.push(`${databaseFields[field]} = $${index++}`); values.push(value); }
    }
    if (input.technicianId !== undefined) {
      sets.push(`technician_id = $${index}`);
      values.push(normalizeTechnicianId(input.technicianId) || null);
      sets.push(`assigned_at = CASE WHEN $${index}::uuid IS NULL THEN NULL WHEN assigned_at IS NULL THEN now() ELSE assigned_at END`);
      index += 1;
    }
    if (input.notes !== undefined) { sets.push(`notes = $${index++}`); values.push(input.notes); }
    if (sets.length === 0) return current;
    sets.push(`updated_at = now()`);
    values.push(id);
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string }>(`UPDATE calls SET ${sets.join(', ')} WHERE id = $${index} RETURNING id`, values);
      if (!result.rows[0]) { await client.query('ROLLBACK'); return undefined; }
      const updated = await getCall(id);
      if (!updated) { await client.query('ROLLBACK'); return undefined; }
        const labels: Record<string, string> = { orderNumber: 'Ordem', bdesk: 'BDESK', officeTrack: 'Office Track', client: 'Tecnico B2C', type: 'Tipo', reason: 'Motivo', region: 'Regiao', city: 'Cidade', address: 'Endereco', bairro: 'Bairro', ofsStatus: 'Status OFS', olt: 'OLT', slotPon: 'Slot/PON', status: 'Status', technicianId: 'Tecnico', executedAt: 'Data de finalizacao', result: 'Resultado', cancellationReason: 'Motivo de cancelamento', notes: 'Observacoes' };
      for (const field of Object.keys(input)) {
        const previousValue = String(current[field as keyof Call] ?? '');
        const newValue = String(updated[field as keyof Call] ?? '');
        if (previousValue !== newValue) await client.query(`INSERT INTO call_logs (call_id, user_id, action, field, previous_value, new_value) VALUES ($1, $2, $3, $4, $5, $6)`, [id, actor.roleId === 'system' ? null : actor.id, `${labels[field] || field} alterado`, field, previousValue, newValue]);
      }
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const current = calls.get(id);
  if (!current) return undefined;
  input = prepareCallUpdate(current, input);
  const technician = input.technicianId ? technicians.get(input.technicianId) : undefined;
  const updated = { ...current, ...input, cancellationReason: input.cancellationReason === null ? undefined : input.cancellationReason ?? current.cancellationReason, technicianId: input.technicianId === null ? undefined : input.technicianId ?? current.technicianId, technicianName: input.technicianId === null ? undefined : technician?.name ?? current.technicianName, supervisorName: input.technicianId === null ? undefined : technician?.supervisorId ? supervisors.get(technician.supervisorId)?.name : current.supervisorName, assignedAt: input.technicianId && !current.assignedAt ? new Date().toISOString() : input.technicianId === null ? undefined : current.assignedAt };
  calls.set(id, updated);
  const labels: Record<string, string> = { orderNumber: 'Ordem', bdesk: 'BDESK', officeTrack: 'Office Track', client: 'Tecnico B2C', type: 'Tipo', reason: 'Motivo', region: 'Regiao', city: 'Cidade', address: 'Endereco', bairro: 'Bairro', ofsStatus: 'Status OFS', olt: 'OLT', slotPon: 'Slot/PON', status: 'Status', technicianId: 'Tecnico', executedAt: 'Data de finalizacao', result: 'Resultado', cancellationReason: 'Motivo de cancelamento', notes: 'Observacoes' };
  Object.keys(input).forEach((field) => {
    const previousValue = String(current[field as keyof Call] ?? '');
    const newValue = String(updated[field as keyof Call] ?? '');
    if (previousValue === newValue) return;
    const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId: id, userId: actor.id, userName: actor.name, action: `${labels[field] || field} alterado`, field, previousValue, newValue, createdAt: new Date().toISOString() };
    auditLogs.set(log.id, log);
  });
  return updated;
}
function mapObservationAttachment(row: { id: string; file_name: string; mime_type: string; size_bytes: number | string; created_at: string }): CallObservationAttachment {
  return { id: row.id, fileName: row.file_name, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes), createdAt: row.created_at };
}

export async function listObservations(callId: string): Promise<CallObservation[]> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('call_observations').select('id, call_id, user_id, text, created_at, profiles(name)').eq('call_id', callId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data || [];
    const attachmentsByObservation = new Map<string, CallObservationAttachment[]>();
    if (rows.length) {
      const { data: attachments, error: attachmentError } = await admin.from('call_observation_attachments').select('id, observation_id, file_name, mime_type, size_bytes, created_at').in('observation_id', rows.map((row: any) => row.id)).order('created_at', { ascending: true });
      if (attachmentError) throw new Error(attachmentError.message);
      for (const row of attachments || []) {
        const group = attachmentsByObservation.get(row.observation_id) || [];
        group.push(mapObservationAttachment(row));
        attachmentsByObservation.set(row.observation_id, group);
      }
    }
    return rows.map((row: any) => ({ id: row.id, callId: row.call_id, userId: row.user_id, userName: Array.isArray(row.profiles) ? row.profiles[0]?.name || 'Usuario' : row.profiles?.name || 'Usuario', text: row.text, createdAt: row.created_at, attachments: attachmentsByObservation.get(row.id) || [] }));
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; call_id: string; user_id: string; user_name: string; text: string; created_at: string }>(
      `SELECT o.id, o.call_id, o.user_id, u.name AS user_name, o.text, o.created_at
       FROM call_observations o JOIN users u ON u.id = o.user_id
       WHERE o.call_id = $1 ORDER BY o.created_at DESC`, [callId],
    );
    const observationIds = result.rows.map((row) => row.id);
    const attachmentResult = observationIds.length ? await client.query<{ id: string; observation_id: string; file_name: string; mime_type: string; size_bytes: number | string; created_at: string }>(
      `SELECT id, observation_id, file_name, mime_type, size_bytes, created_at FROM call_observation_attachments WHERE observation_id = ANY($1::uuid[]) ORDER BY created_at ASC`, [observationIds],
    ) : { rows: [] as Array<{ id: string; observation_id: string; file_name: string; mime_type: string; size_bytes: number | string; created_at: string }> };
    const attachmentsByObservation = new Map<string, CallObservationAttachment[]>();
    for (const row of attachmentResult.rows) {
      const group = attachmentsByObservation.get(row.observation_id) || [];
      group.push(mapObservationAttachment(row));
      attachmentsByObservation.set(row.observation_id, group);
    }
    return result.rows.map((row) => ({ id: row.id, callId: row.call_id, userId: row.user_id, userName: row.user_name, text: row.text, createdAt: row.created_at, attachments: attachmentsByObservation.get(row.id) || [] }));
  }
  return [...observations.values()].filter((item) => item.callId === callId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => ({ ...item, attachments: [...observationAttachments.values()].filter((attachment) => attachment.observationId === item.id).map(({ observationId: _observationId, contentBase64: _contentBase64, ...metadata }) => metadata) }));
}

export async function addObservation(callId: string, actor: User, text: string, attachments: CallObservationAttachmentInput[] = []): Promise<CallObservation> {
  const auditValue = text || `Anexos: ${attachments.map((attachment) => attachment.fileName).join(', ')}`;
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('call_observations').insert({ call_id: callId, user_id: actor.id, text }).select('id, call_id, user_id, text, created_at, profiles(name)').single();
    if (error || !data) throw new Error(error?.message || 'Nao foi possivel adicionar a observacao.');
    const savedAttachments: CallObservationAttachment[] = [];
    if (attachments.length) {
      const { data: savedRows, error: attachmentError } = await admin.from('call_observation_attachments').insert(attachments.map((attachment) => ({ observation_id: data.id, file_name: attachment.fileName, mime_type: attachment.mimeType, size_bytes: attachment.sizeBytes, content_base64: attachment.contentBase64 }))).select('id, file_name, mime_type, size_bytes, created_at');
      if (attachmentError) {
        await admin.from('call_observations').delete().eq('id', data.id);
        throw new Error(attachmentError.message);
      }
      savedAttachments.push(...(savedRows || []).map(mapObservationAttachment));
    }
    const observation: CallObservation = { id: data.id, callId: data.call_id, userId: data.user_id, userName: actor.name, text: data.text, createdAt: data.created_at, attachments: savedAttachments };
    const { error: logError } = await admin.from('call_logs').insert({ call_id: callId, user_id: actor.id, action: 'Observacao adicionada', field: 'observations', previous_value: '', new_value: auditValue });
    if (logError) throw new Error(logError.message);
    return observation;
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; call_id: string; user_id: string; user_name: string; text: string; created_at: string }>(
        `WITH inserted AS (
           INSERT INTO call_observations (call_id, user_id, text) VALUES ($1, $2, $3)
           RETURNING id, call_id, user_id, text, created_at
         ) SELECT inserted.id, inserted.call_id, inserted.user_id, users.name AS user_name, inserted.text, inserted.created_at
         FROM inserted JOIN users ON users.id = inserted.user_id`, [callId, actor.id, text],
      );
      const row = result.rows[0];
      const savedAttachments: CallObservationAttachment[] = [];
      for (const attachment of attachments) {
        const insertedAttachment = await client.query<{ id: string; file_name: string; mime_type: string; size_bytes: number | string; created_at: string }>(
          `INSERT INTO call_observation_attachments (observation_id, file_name, mime_type, size_bytes, content_base64) VALUES ($1, $2, $3, $4, $5) RETURNING id, file_name, mime_type, size_bytes, created_at`,
          [row.id, attachment.fileName, attachment.mimeType, attachment.sizeBytes, attachment.contentBase64],
        );
        savedAttachments.push(mapObservationAttachment(insertedAttachment.rows[0]));
      }
      await client.query(`INSERT INTO call_logs (call_id, user_id, action, field, previous_value, new_value) VALUES ($1, $2, $3, $4, $5, $6)`, [callId, actor.id, 'Observacao adicionada', 'observations', '', auditValue]);
      await client.query('COMMIT');
      return { id: row.id, callId: row.call_id, userId: row.user_id, userName: row.user_name, text: row.text, createdAt: row.created_at, attachments: savedAttachments };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const observation: CallObservation = { id: `obs-${crypto.randomUUID()}`, callId, userId: actor.id, userName: actor.name, text, createdAt: new Date().toISOString(), attachments: [] };
  observations.set(observation.id, observation);
  for (const attachment of attachments) {
    const saved: StoredCallObservationAttachment = { id: `attachment-${crypto.randomUUID()}`, observationId: observation.id, fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, contentBase64: attachment.contentBase64, createdAt: observation.createdAt };
    observationAttachments.set(saved.id, saved);
    observation.attachments.push({ id: saved.id, fileName: saved.fileName, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes, createdAt: saved.createdAt });
  }
  const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId, userId: actor.id, userName: actor.name, action: 'Observacao adicionada', field: 'observations', previousValue: '', newValue: auditValue, createdAt: observation.createdAt };
  auditLogs.set(log.id, log);
  return observation;
}

export async function getObservationAttachment(callId: string, observationId: string, attachmentId: string): Promise<StoredCallObservationAttachment | undefined> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin();
    const { data: observation, error: observationError } = await admin.from('call_observations').select('id').eq('id', observationId).eq('call_id', callId).maybeSingle();
    if (observationError) throw new Error(observationError.message);
    if (!observation) return undefined;
    const { data, error } = await admin.from('call_observation_attachments').select('id, observation_id, file_name, mime_type, size_bytes, content_base64, created_at').eq('id', attachmentId).eq('observation_id', observationId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { id: data.id, observationId: data.observation_id, fileName: data.file_name, mimeType: data.mime_type, sizeBytes: Number(data.size_bytes), contentBase64: data.content_base64, createdAt: data.created_at } : undefined;
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; observation_id: string; file_name: string; mime_type: string; size_bytes: number | string; content_base64: string; created_at: string }>(
      `SELECT a.id, a.observation_id, a.file_name, a.mime_type, a.size_bytes, a.content_base64, a.created_at
       FROM call_observation_attachments a JOIN call_observations o ON o.id = a.observation_id
       WHERE o.call_id = $1 AND o.id = $2 AND a.id = $3 LIMIT 1`, [callId, observationId, attachmentId],
    );
    const row = result.rows[0];
    return row ? { id: row.id, observationId: row.observation_id, fileName: row.file_name, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes), contentBase64: row.content_base64, createdAt: row.created_at } : undefined;
  }
  const observation = observations.get(observationId);
  const attachment = observationAttachments.get(attachmentId);
  return observation?.callId === callId && attachment?.observationId === observationId ? attachment : undefined;
}
export async function listAuditLogs(callId: string): Promise<CallAuditLog[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('call_logs').select('id, call_id, user_id, action, field, previous_value, new_value, created_at, profiles(name)').eq('call_id', callId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map((row: any) => ({ id: row.id, callId: row.call_id, userId: row.user_id || '', userName: Array.isArray(row.profiles) ? row.profiles[0]?.name || 'Google Drive - Base historica operacional' : row.profiles?.name || 'Google Drive - Base historica operacional', action: row.action, field: row.field, previousValue: row.previous_value || '', newValue: row.new_value || '', createdAt: row.created_at }));
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
     const result = await client.query<{ id: string; call_id: string; user_id: string | null; user_name: string | null; action: string; field: string; previous_value: string | null; new_value: string | null; created_at: string }>(
      `SELECT l.id, l.call_id, l.user_id, u.name AS user_name, l.action, l.field, l.previous_value, l.new_value, l.created_at
       FROM call_logs l LEFT JOIN users u ON u.id = l.user_id
       WHERE l.call_id = $1 ORDER BY l.created_at DESC`, [callId],
    );
     return result.rows.map((row) => ({ id: row.id, callId: row.call_id, userId: row.user_id ?? '', userName: row.user_name ?? 'Google Drive - Base historica operacional', action: row.action, field: row.field, previousValue: row.previous_value ?? '', newValue: row.new_value ?? '', createdAt: row.created_at }));
  }
  return [...auditLogs.values()].filter((item) => item.callId === callId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function listActivations(status?: ActivationStatus): Promise<Activation[]> {
  if (isSupabaseConfigured()) return await listSupabaseActivations(status);
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; source: string; original_message: string; received_at: string; status: string; decision_by: string | null; decision_at: string | null; created_call_id: string | null; rejection_reason: string | null; extracted_data: Record<string, unknown> }>(
      `SELECT a.id, a.source, a.original_message, a.received_at, a.status, a.decision_by, a.decision_at, a.created_call_id, a.rejection_reason, COALESCE(p.extracted_data, '{}'::jsonb) AS extracted_data
       FROM activations a LEFT JOIN LATERAL (
         SELECT extracted_data FROM activation_processing WHERE activation_id = a.id ORDER BY created_at DESC LIMIT 1
       ) p ON true
       WHERE ($1::text IS NULL OR a.status = $1) ORDER BY a.received_at DESC`,
      [status ?? null],
    );
    return result.rows.map((row) => {
      const { _analysis: analysis, ...extractedData } = row.extracted_data ?? {};
      return { id: row.id, source: row.source, originalMessage: row.original_message, receivedAt: row.received_at, status: row.status as ActivationStatus, decisionBy: row.decision_by ?? undefined, decisionAt: row.decision_at ?? undefined, createdCallId: row.created_call_id ?? undefined, rejectionReason: row.rejection_reason ?? undefined, extractedData: extractedData as Record<string, string>, analysis: analysis as ActivationAnalysis | undefined };
    });
  }
  return [...activations.values()].filter((item) => !status || item.status === status).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}
export async function receiveActivation(input: { source: string; originalMessage: string; extractedData: Record<string, string>; analysis?: ActivationAnalysis }): Promise<Activation> {
  await captureUnknownOltRequests([input.extractedData.olt, input.analysis?.olt], 'WuzAPI');
  if (isSupabaseConfigured()) return await createSupabaseActivation(input);
  const comparable = (value: string | undefined) => value?.trim().toLowerCase() || '';
  const incomingKeys = [input.originalMessage, input.extractedData.bdesk, input.extractedData.officeTrack, input.extractedData.orderNumber].map(comparable).filter(Boolean);
  const existing = [...activations.values()].find((activation) => activation.status !== 'Recusado' && [activation.originalMessage, activation.extractedData.bdesk, activation.extractedData.officeTrack, activation.extractedData.orderNumber].map(comparable).some((key) => incomingKeys.includes(key)));
  if (existing) return existing;
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const existingActivations = await listActivations();
    const enrichedAnalysis = input.analysis ? { ...input.analysis, atreladas: identifyAtreladas(input.analysis, existingActivations.map((activation) => ({ id: activation.id, analysis: activation.analysis }))) } : input.analysis;
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; source: string; original_message: string; received_at: string; status: string }>(
        `INSERT INTO activations (source, original_message, received_at, status)
         VALUES ($1, $2, now(), 'Pendente')
         RETURNING id, source, original_message, received_at, status`, [input.source, input.originalMessage],
      );
      const row = result.rows[0];
      await client.query(`INSERT INTO activation_processing (activation_id, extracted_data, processor) VALUES ($1, $2, 'gemini-semantic')`, [row.id, JSON.stringify({ ...input.extractedData, _analysis: enrichedAnalysis })]);
      await client.query('COMMIT');
      return { id: row.id, source: row.source, originalMessage: row.original_message, receivedAt: row.received_at, status: row.status as ActivationStatus, extractedData: input.extractedData, analysis: enrichedAnalysis };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const enrichedAnalysis = input.analysis ? { ...input.analysis, atreladas: identifyAtreladas(input.analysis, [...activations.values()].map((activation) => ({ id: activation.id, analysis: activation.analysis }))) } : input.analysis;
  const activation: Activation = { id: `activation-${crypto.randomUUID()}`, source: input.source, originalMessage: input.originalMessage, receivedAt: new Date().toISOString(), status: 'Pendente', extractedData: input.extractedData, analysis: enrichedAnalysis }; activations.set(activation.id, activation); return activation;
}
export async function decideActivation(id: string, decision: 'Aceito' | 'Recusado', actor: User, rejectionReason?: string): Promise<{ activation?: Activation; call?: Call }> {
  if (isSupabaseConfigured()) return await decideSupabaseActivation(id, decision, actor.id, rejectionReason);
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; source: string; original_message: string; received_at: string; status: string; decision_by: string | null; decision_at: string | null; created_call_id: string | null; rejection_reason: string | null; extracted_data: Record<string, string> }>(
        `SELECT a.id, a.source, a.original_message, a.received_at, a.status, a.decision_by, a.decision_at, a.created_call_id, a.rejection_reason, COALESCE(p.extracted_data, '{}'::jsonb) AS extracted_data
         FROM activations a LEFT JOIN LATERAL (SELECT extracted_data FROM activation_processing WHERE activation_id = a.id ORDER BY created_at DESC LIMIT 1) p ON true
         WHERE a.id = $1 AND a.status = 'Pendente' FOR UPDATE`, [id],
      );
      const activationRow = result.rows[0];
      if (!activationRow) { await client.query('ROLLBACK'); return {}; }
      let call: Call | undefined;
      if (decision === 'Aceito') {
        const data = activationRow.extracted_data ?? {};
        const structured = (data._analysis || {}) as Partial<ActivationAnalysis>;
        const olt = structured.olt || String(data.olt || '');
        const callResult = await client.query<{ id: string; order_number: string; bdesk: string; office_track: string; client: string; type: string; reason: string; region: string; city: string; address: string | null; bairro: string | null; olt: string; slot_pon: string; status: string; technician_id: string | null; opened_at: string; assigned_at: string | null; executed_at: string | null; result: string | null; cancellation_reason: string | null; notes: string }>(
          `INSERT INTO calls (order_number, bdesk, office_track, client, type, reason, region, city, olt, slot_pon, status, opened_at, notes, created_at, updated_at, address, bairro)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Aberto', now(), 'Criado a partir de acionamento aceito.', now(), now(), $11, $12)
           RETURNING id, order_number, bdesk, office_track, client, type, reason, region, city, address, bairro, olt, slot_pon, status, technician_id, opened_at, assigned_at, executed_at, result, cancellation_reason, notes`,
          [data.orderNumber || `PEND-${id.slice(-6)}`, data.bdesk || '', structured.office_track || structured.os_ot || data.orderNumber || '', data.client || 'Cliente nao identificado', structured.tipo_registro || data.type || 'NOC ACESSO', structured.motivo || data.reason || 'Acionamento recebido', resolveOltRegion(olt).region || data.region || 'Nao informada', data.city || 'Nao informada', olt, Array.isArray(structured.slot_pon) ? structured.slot_pon.join(', ') : data.slotPon || '', structured.endereco_principal || '', structured.bairro_principal || ''],
        );
        const callRow = callResult.rows[0];
        await client.query(`UPDATE activations SET status = 'Aceito', decision_by = $1, decision_at = now(), created_call_id = $2 WHERE id = $3`, [actor.id, callRow.id, id]);
        call = { id: callRow.id, orderNumber: callRow.order_number, bdesk: callRow.bdesk, officeTrack: callRow.office_track, client: callRow.client, type: callRow.type, reason: callRow.reason, region: callRow.region, city: callRow.city, address: callRow.address ?? '', bairro: callRow.bairro ?? '', olt: callRow.olt, slotPon: callRow.slot_pon, status: callRow.status as CallStatus, technicianId: callRow.technician_id ?? undefined, openedAt: callRow.opened_at, assignedAt: callRow.assigned_at ?? undefined, executedAt: callRow.executed_at ?? undefined, result: callRow.result ?? undefined, cancellationReason: callRow.cancellation_reason ?? undefined, notes: callRow.notes ?? '' };
      } else {
        await client.query(`UPDATE activations SET status = 'Recusado', decision_by = $1, decision_at = now(), rejection_reason = $2 WHERE id = $3`, [actor.id, rejectionReason ?? null, id]);
      }
      await client.query('COMMIT');
      return { activation: { id: activationRow.id, source: activationRow.source, originalMessage: activationRow.original_message, receivedAt: activationRow.received_at, status: decision, extractedData: activationRow.extracted_data ?? {}, decisionBy: actor.id, decisionAt: new Date().toISOString(), createdCallId: call?.id, rejectionReason }, call };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const activation = activations.get(id);
  if (!activation || activation.status !== 'Pendente') return {};
  activation.status = decision; activation.decisionBy = actor.id; activation.decisionAt = new Date().toISOString(); activation.rejectionReason = rejectionReason;
  if (decision === 'Aceito') {
    const data = activation.extractedData;
    const analysis = activation.analysis;
    const olt = data.olt || analysis?.olt || '';
    const mappedRegion = resolveOltRegion(olt).region;
    const call: Call = { id: `call-${crypto.randomUUID()}`, orderNumber: data.orderNumber || `PEND-${id.slice(-6)}`, bdesk: data.bdesk || '', officeTrack: data.orderNumber || '', client: data.client || 'Cliente nao identificado', type: data.type || analysis?.tipo_registro || 'NOC ACESSO', reason: data.reason || analysis?.motivo || 'Acionamento recebido', region: mappedRegion || data.region || 'Nao informada', city: data.city || '', olt, slotPon: data.slotPon || analysis?.slot_pon?.join(', ') || '', address: analysis?.endereco_principal || '', bairro: analysis?.bairro_principal || '', status: 'Aberto', openedAt: new Date().toISOString(), notes: 'Criado a partir de acionamento aceito.' };
    calls.set(call.id, call); activation.createdCallId = call.id;
    return { activation, call };
  }
  return { activation };
}
export async function finishCall(id: string, input: { result: string; executedAt: string; notes: string }, actor: User): Promise<{ call?: Call; missing: string[] }> {
  if (isSupabaseConfigured()) {
    const current = await getCall(id);
    if (!current) return { missing: ['Chamado nao encontrado'] };
    if (['Finalizado', 'Cancelado', 'Baixar'].includes(current.status)) return { missing: ['Chamado ja encerrado'] };
    const missing = [!current.technicianId && 'Tecnico', !current.reason && 'Motivo', !input.result.trim() && 'Resultado', !input.executedAt && 'Data e hora de execucao', !input.notes.trim() && 'Observacao'].filter(Boolean) as string[];
    if (missing.length) return { missing };
    const call = await finishSupabaseCall(id, input, actor);
    return call ? { call, missing: [] } : { missing: ['Chamado ja encerrado'] };
  }
  if (shouldUseLocalDatabase()) {
    const current = await getCall(id);
    if (!current) return { missing: ['Chamado nao encontrado'] };
    if (['Finalizado', 'Cancelado', 'Baixar'].includes(current.status)) return { missing: ['Chamado ja encerrado'] };
    const missing = [!current.technicianId && 'Tecnico', !current.reason && 'Motivo', !input.result.trim() && 'Resultado', !input.executedAt && 'Data e hora de execucao', !input.notes.trim() && 'Observacao'].filter(Boolean) as string[];
    if (missing.length) return { missing };
    const client = await getDatabaseClient();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string }>(`UPDATE calls SET result = $1, executed_at = $2, notes = $3, status = 'Finalizado', updated_at = now() WHERE id = $4 AND status NOT IN ('Finalizado', 'Cancelado', 'Baixar') RETURNING id`, [input.result, input.executedAt, input.notes, id]);
      if (!result.rows[0]) { await client.query('ROLLBACK'); return { missing: ['Chamado ja encerrado'] }; }
      const updated = await getCall(id);
      if (!updated) { await client.query('ROLLBACK'); return { missing: ['Chamado nao encontrado'] }; }
      for (const field of ['status', 'result', 'executedAt', 'notes'] as const) {
        const previousValue = String(current[field as keyof Call] ?? '');
        const newValue = String(updated[field] ?? '');
        if (previousValue !== newValue) { const labels: Record<string, string> = { status: 'Status', result: 'Resultado', executedAt: 'Data de execucao', notes: 'Observacoes' }; await client.query(`INSERT INTO call_logs (call_id, user_id, action, field, previous_value, new_value) VALUES ($1, $2, $3, $4, $5, $6)`, [id, actor.id, `${labels[field]} alterado`, field, previousValue, newValue]); }
      }
      await client.query('COMMIT');
      return { call: updated, missing: [] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const current = calls.get(id);
  if (!current) return { missing: ['Chamado nao encontrado'] };
  if (['Finalizado', 'Cancelado', 'Baixar'].includes(current.status)) return { missing: ['Chamado ja encerrado'] };
  const missing = [!current.technicianId && 'Tecnico', !current.reason && 'Motivo', !input.result.trim() && 'Resultado', !input.executedAt && 'Data e hora de execucao', !input.notes.trim() && 'Observacao'].filter(Boolean) as string[];
  if (missing.length) return { missing };
  const updated = { ...current, ...input, status: 'Finalizado' as const };
  calls.set(id, updated);
  (['status', 'result', 'executedAt', 'notes'] as const).forEach((field) => {
    const previousValue = String(current[field as keyof Call] ?? '');
    const newValue = String(updated[field] ?? '');
    if (previousValue === newValue) return;
    const labels: Record<string, string> = { status: 'Status', result: 'Resultado', executedAt: 'Data de execucao', notes: 'Observacoes' };
    const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId: id, userId: actor.id, userName: actor.name, action: `${labels[field]} alterado`, field, previousValue, newValue, createdAt: new Date().toISOString() };
    auditLogs.set(log.id, log);
  });
  return { call: updated, missing: [] };
}
export async function cancelCall(id: string, reason: string, actor: User): Promise<Call | undefined> {
  if (isSupabaseConfigured()) return await cancelSupabaseCall(id, reason, actor);
  if (shouldUseLocalDatabase()) {
    const current = await getCall(id);
    if (!current || ['Finalizado', 'Cancelado', 'Baixar'].includes(current.status)) return undefined;
    const client = await getDatabaseClient();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string }>(`UPDATE calls SET status = 'Cancelado', cancellation_reason = $1, updated_at = now() WHERE id = $2 AND status NOT IN ('Finalizado', 'Cancelado', 'Baixar') RETURNING id`, [reason, id]);
      if (!result.rows[0]) { await client.query('ROLLBACK'); return undefined; }
      const updated = await getCall(id);
      if (!updated) { await client.query('ROLLBACK'); return undefined; }
      await client.query(`INSERT INTO call_logs (call_id, user_id, action, field, previous_value, new_value) VALUES ($1, $2, $3, $4, $5, $6)`, [id, actor.id, 'Chamado cancelado', 'cancellationReason', current.cancellationReason ?? '', reason]);
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const current = calls.get(id);
  if (!current) return undefined;
  if (['Finalizado', 'Cancelado', 'Baixar'].includes(current.status) && actor.roleId !== 'system') return undefined;
  const updated = { ...current, status: 'Cancelado' as const, cancellationReason: reason };
  calls.set(id, updated);
  const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId: id, userId: actor.id, userName: actor.name, action: 'Chamado cancelado', field: 'cancellationReason', previousValue: '', newValue: reason, createdAt: new Date().toISOString() };
  auditLogs.set(log.id, log);
  return updated;
}
export async function reopenCall(id: string, actor: User): Promise<Call | undefined> {
  if (isSupabaseConfigured()) return await reopenSupabaseCall(id, actor);
  const current = calls.get(id);
  if (!current || !['Finalizado', 'Cancelado', 'Baixar'].includes(current.status)) return undefined;
  const updated = { ...current, status: 'Aberto' as const, result: undefined, executedAt: undefined, cancellationReason: undefined };
  calls.set(id, updated);
  const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId: id, userId: actor.id, userName: actor.name, action: 'Chamado reaberto', field: 'status', previousValue: current.status, newValue: 'Aberto', createdAt: new Date().toISOString() };
  auditLogs.set(log.id, log);
  return updated;
}
export async function listImports(): Promise<ImportRecord[]> {
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; file_name: string; file_type: string; sheet_name: string | null; columns: string[]; total_rows: number; valid_rows: number; errors: string[]; status: string; imported_by: string | null; created_at: string }>(
      `SELECT id, file_name, file_type, sheet_name, columns, total_rows, valid_rows, errors, status, imported_by, created_at FROM imports ORDER BY created_at DESC`,
    );
    return result.rows.map((row) => ({ id: row.id, fileName: row.file_name, fileType: row.file_type as 'csv' | 'xlsx', sheetName: row.sheet_name ?? '', columns: row.columns ?? [], preview: [], totalRows: row.total_rows, validRows: row.valid_rows, errors: row.errors ?? [], status: row.status as ImportRecord['status'], importedBy: row.imported_by ?? 'Sistema', createdAt: row.created_at }));
  }
  return [...imports.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function saveImport(record: ImportRecord): Promise<ImportRecord> {
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; file_name: string; file_type: string; sheet_name: string | null; columns: string[]; total_rows: number; valid_rows: number; errors: string[]; status: string; imported_by: string; created_at: string }>(
      `INSERT INTO imports (id, file_name, file_type, sheet_name, columns, total_rows, valid_rows, errors, status, imported_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET file_name = EXCLUDED.file_name, file_type = EXCLUDED.file_type, sheet_name = EXCLUDED.sheet_name, columns = EXCLUDED.columns, total_rows = EXCLUDED.total_rows, valid_rows = EXCLUDED.valid_rows, errors = EXCLUDED.errors, status = EXCLUDED.status, imported_by = EXCLUDED.imported_by, created_at = EXCLUDED.created_at
       RETURNING id, file_name, file_type, sheet_name, columns, total_rows, valid_rows, errors, status, imported_by, created_at`,
      [record.id, record.fileName, record.fileType, record.sheetName || null, record.columns, record.totalRows, record.validRows, record.errors, record.status, record.importedBy, record.createdAt],
    );
    const row = result.rows[0];
    return { id: row.id, fileName: row.file_name, fileType: row.file_type as 'csv' | 'xlsx', sheetName: row.sheet_name ?? '', columns: row.columns ?? [], preview: record.preview, totalRows: row.total_rows, validRows: row.valid_rows, errors: row.errors ?? [], status: row.status as ImportRecord['status'], importedBy: row.imported_by, createdAt: row.created_at };
  }
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
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const [countResult, latestResult] = await Promise.all([
      client.query<{ row_count: number }>('SELECT COUNT(*)::integer AS row_count FROM d0_base_records'),
      client.query<{ file_name: string; uploaded_by: string; imported_at: string }>('SELECT file_name, uploaded_by, imported_at FROM d0_base_records ORDER BY imported_at DESC LIMIT 1'),
    ]);
    const latest = latestResult.rows[0];
    return { fileName: latest?.file_name, rowCount: countResult.rows[0]?.row_count || 0, uploadedBy: latest?.uploaded_by, uploadedAt: latest?.imported_at };
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
  } else if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    await client.query('BEGIN');
    try {
      await client.query('DELETE FROM d0_base_records WHERE id IS NOT NULL');
      for (let offset = 0; offset < records.length; offset += 500) {
        const batch = records.slice(offset, offset + 500);
        const values = batch.flatMap((record) => [record.fileName, record.rowNumber, JSON.stringify(record.payload), record.uploadedBy, record.importedAt]);
        const tuples = batch.map((_, index) => {
          const position = index * 5;
          return `($${position + 1}, $${position + 2}, $${position + 3}::jsonb, $${position + 4}, $${position + 5})`;
        });
        await client.query(`INSERT INTO d0_base_records (file_name, row_number, payload, uploaded_by, imported_at) VALUES ${tuples.join(', ')}`, values);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } else {
    d0BaseRows.splice(0, d0BaseRows.length, ...records);
  }

  const currentCalls = await listCalls();
  const { matches, unmatchedRows } = matchD0Rows(rows, currentCalls);
  const callsById = new Map(currentCalls.map((call) => [call.id, call]));
  const actor: User = { id: 'system-d0-import', name: 'Importacao D-0', email: 'system-d0@jhtelecom.com', roleId: 'system', active: true, createdAt: importedAt };
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
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: number }>('DELETE FROM d0_base_records WHERE id IS NOT NULL RETURNING id');
    return result.rowCount || 0;
  }
  const deleted = d0BaseRows.length;
  d0BaseRows.length = 0;
  return deleted;
}

function manualBaseDate(date?: string) {
  return date || new Date().toISOString().slice(0, 10);
}
function mapManualBase(row: { business_date: string; file_name: string; payload: ManualProductionData; uploaded_by: string; updated_at: string }): ManualDailyBase {
  return { businessDate: row.business_date, fileName: row.file_name, data: row.payload, uploadedBy: row.uploaded_by, updatedAt: row.updated_at };
}
export async function getManualDailyBase(date?: string): Promise<ManualDailyBase | undefined> {
  const businessDate = manualBaseDate(date);
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin().from('manual_daily_bases').select('business_date, file_name, payload, uploaded_by, updated_at').eq('business_date', businessDate).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapManualBase(data as { business_date: string; file_name: string; payload: ManualProductionData; uploaded_by: string; updated_at: string }) : undefined;
  }
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ business_date: string; file_name: string; payload: ManualProductionData; uploaded_by: string; updated_at: string }>('SELECT business_date, file_name, payload, uploaded_by, updated_at FROM manual_daily_bases WHERE business_date = $1', [businessDate]);
    return result.rows[0] ? mapManualBase(result.rows[0]) : undefined;
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
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ business_date: string; file_name: string; payload: ManualProductionData; uploaded_by: string; updated_at: string }>(`INSERT INTO manual_daily_bases (business_date, file_name, payload, uploaded_by, updated_at) VALUES ($1, $2, $3::jsonb, $4, $5) ON CONFLICT (business_date) DO UPDATE SET file_name = EXCLUDED.file_name, payload = EXCLUDED.payload, uploaded_by = EXCLUDED.uploaded_by, updated_at = EXCLUDED.updated_at RETURNING business_date, file_name, payload, uploaded_by, updated_at`, [businessDate, fileName, JSON.stringify(data), uploadedBy, updatedAt]);
    return mapManualBase(result.rows[0]);
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
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query('DELETE FROM manual_daily_bases WHERE business_date = $1', [businessDate]);
    return Boolean(result.rowCount);
  }
  return manualDailyBases.delete(businessDate);
}
export async function getDashboardMetrics(query: CallQuery = {}): Promise<DashboardMetrics> {
  if (query.from || query.to || query.supervisorId) {
    const allCalls = await listCalls(undefined, query);
    const activations = await listActivations();
    const countBy = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((accumulator, value) => { accumulator[value] = (accumulator[value] || 0) + 1; return accumulator; }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    return { receivedToday: allCalls.filter((call) => call.openedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length, open: allCalls.filter((call) => call.status === 'Aberto').length, unassigned: allCalls.filter((call) => !call.technicianId && !['Finalizado', 'Cancelado'].includes(call.status)).length, inProgress: allCalls.filter((call) => ['Atribuido', 'Deslocamento', 'Em campo'].includes(call.status)).length, finished: allCalls.filter((call) => call.status === 'Finalizado').length, cancelled: allCalls.filter((call) => call.status === 'Cancelado').length, pendingActivations: activations.filter((activation) => activation.status === 'Pendente').length, byStatus: countBy(allCalls.map((call) => call.status)), byRegion: countBy(allCalls.map((call) => call.region)), byNeighborhood: countBy(allCalls.map((call) => call.bairro || '').filter(Boolean)), byTechnician: countBy(allCalls.filter((call) => call.technicianName).map((call) => call.technicianName!)), byType: countBy(allCalls.map((call) => call.type)) };
  }
  if (isSupabaseConfigured()) {
    const allCalls = await listSupabaseCalls();
    const activations = await listSupabaseActivations();
    const today = new Date().toISOString().slice(0, 10);
    const countBy = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((accumulator, value) => { accumulator[value] = (accumulator[value] || 0) + 1; return accumulator; }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    return { receivedToday: allCalls.filter((call) => call.openedAt.slice(0, 10) === today).length, open: allCalls.filter((call) => call.status === 'Aberto').length, unassigned: allCalls.filter((call) => !call.technicianId && !['Finalizado', 'Cancelado'].includes(call.status)).length, inProgress: allCalls.filter((call) => ['Atribuido', 'Deslocamento', 'Em campo'].includes(call.status)).length, finished: allCalls.filter((call) => call.status === 'Finalizado').length, cancelled: allCalls.filter((call) => call.status === 'Cancelado').length, pendingActivations: activations.filter((activation) => activation.status === 'Pendente').length, byStatus: countBy(allCalls.map((call) => call.status)), byRegion: countBy(allCalls.map((call) => call.region)), byNeighborhood: countBy(allCalls.map((call) => call.bairro || '').filter(Boolean)), byTechnician: countBy(allCalls.filter((call) => call.technicianName).map((call) => call.technicianName!)), byType: countBy(allCalls.map((call) => call.type)) };
  }
  if (shouldUseLocalDatabase()) {
    const allCalls = await listCalls();
    const activations = await listActivations();
    const today = new Date().toISOString().slice(0, 10);
    const countBy = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((accumulator, value) => { accumulator[value] = (accumulator[value] || 0) + 1; return accumulator; }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    return { receivedToday: allCalls.filter((call) => call.openedAt.slice(0, 10) === today).length, open: allCalls.filter((call) => call.status === 'Aberto').length, unassigned: allCalls.filter((call) => !call.technicianId && !['Finalizado', 'Cancelado'].includes(call.status)).length, inProgress: allCalls.filter((call) => ['Atribuido', 'Deslocamento', 'Em campo'].includes(call.status)).length, finished: allCalls.filter((call) => call.status === 'Finalizado').length, cancelled: allCalls.filter((call) => call.status === 'Cancelado').length, pendingActivations: activations.filter((activation) => activation.status === 'Pendente').length, byStatus: countBy(allCalls.map((call) => call.status)), byRegion: countBy(allCalls.map((call) => call.region)), byNeighborhood: countBy(allCalls.map((call) => call.bairro || '').filter(Boolean)), byTechnician: countBy(allCalls.filter((call) => call.technicianName).map((call) => call.technicianName!)), byType: countBy(allCalls.map((call) => call.type)) };
  }
  const allCalls = [...calls.values()];
  const today = new Date().toISOString().slice(0, 10);
  const countBy = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((accumulator, value) => { accumulator[value] = (accumulator[value] || 0) + 1; return accumulator; }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  return { receivedToday: allCalls.filter((call) => call.openedAt.slice(0, 10) === today).length, open: allCalls.filter((call) => call.status === 'Aberto').length, unassigned: allCalls.filter((call) => !call.technicianId && !['Finalizado', 'Cancelado'].includes(call.status)).length, inProgress: allCalls.filter((call) => ['Atribuido', 'Deslocamento', 'Em campo'].includes(call.status)).length, finished: allCalls.filter((call) => call.status === 'Finalizado').length, cancelled: allCalls.filter((call) => call.status === 'Cancelado').length, pendingActivations: [...activations.values()].filter((activation) => activation.status === 'Pendente').length, byStatus: countBy(allCalls.map((call) => call.status)), byRegion: countBy(allCalls.map((call) => call.region)), byNeighborhood: countBy(allCalls.map((call) => call.bairro || '').filter(Boolean)), byTechnician: countBy(allCalls.filter((call) => call.technicianName).map((call) => call.technicianName!)), byType: countBy(allCalls.map((call) => call.type)) };
}