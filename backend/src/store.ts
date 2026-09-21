import bcrypt from 'bcryptjs';
import { getDatabaseClient, isDatabaseConfigured } from './db.js';
import { createSupabaseUser, getSupabaseRole, getSupabaseAdmin, isSupabaseConfigured, listSupabaseRoles } from './integrations/supabase/client.js';
import type { Activation, ActivationStatus, AuthUser, Call, CallAuditLog, CallObservation, CallStatus, DashboardMetrics, ImportRecord, PermissionCode, Role, Supervisor, SystemSettings, Technician, User } from './types.js';

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
const operatorRole: Role = { id: 'role-operator', name: 'Operador', description: 'Operacao de chamados e remanejamentos', permissions: ['dashboard.view', 'calls.view', 'calls.create', 'calls.edit', 'calls.assign', 'calls.finish', 'calls.cancel', 'calls.view_logs', 'calls.add_observation', 'activations.view', 'activations.decide', 'imports.view', 'imports.create', 'technicians.view', 'supervisors.view'] };
const supervisorRole: Role = { id: 'role-supervisor', name: 'Supervisor', description: 'Visao restrita da propria equipe', permissions: ['dashboard.view', 'calls.view', 'technicians.view', 'supervisors.view'] };
const counterRole: Role = { id: 'role-counter', name: 'Mesario', description: 'Aceite e recusa de acionamentos', permissions: ['activations.view', 'activations.decide'] };
const viewerRole: Role = { id: 'role-viewer', name: 'Visualizacao', description: 'Consulta sem alteracao', permissions: ['dashboard.view', 'calls.view', 'technicians.view', 'supervisors.view'] };

const roles: Role[] = [adminRole, operatorRole, supervisorRole, counterRole, viewerRole];
const users = new Map<string, User & { passwordHash: string }>([
  ['user-admin', { id: 'user-admin', name: 'Administrador JH', email: 'admin@jhtelecom.com', roleId: adminRole.id, active: true, createdAt: now, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) }],
  ['user-matheus', { id: 'user-matheus', name: 'Matheus Terra', email: 'matheus@jhtelecom.com', roleId: operatorRole.id, active: true, createdAt: now, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) }]
]);
const supervisors = new Map<string, Supervisor>([
  ['supervisor-joao', { id: 'supervisor-joao', userId: 'user-admin', name: 'Joao da Silva', region: 'Sul', active: true, technicianCount: 3 }],
  ['supervisor-maria', { id: 'supervisor-maria', name: 'Maria Oliveira', region: 'Leste', active: true, technicianCount: 2 }]
]);
const technicians = new Map<string, Technician>([
  ['tech-carlos', { id: 'tech-carlos', supervisorId: 'supervisor-joao', name: 'Carlos Mendes', registration: 'TEC-1042', supervisorName: 'Joao da Silva', region: 'Sul', shift: '07:00 - 16:00', currentStatus: 'Em campo', active: true }],
  ['tech-pedro', { id: 'tech-pedro', supervisorId: 'supervisor-joao', name: 'Pedro Santos', registration: 'TEC-1088', supervisorName: 'Joao da Silva', region: 'Sul', shift: '08:00 - 17:00', currentStatus: 'Disponivel', active: true }],
  ['tech-lucas', { id: 'tech-lucas', supervisorId: 'supervisor-joao', name: 'Lucas Reis', registration: 'TEC-1103', supervisorName: 'Joao da Silva', region: 'Sul', shift: '08:00 - 17:00', currentStatus: 'Disponivel', active: true }],
  ['tech-andre', { id: 'tech-andre', supervisorId: 'supervisor-maria', name: 'Andre Costa', registration: 'TEC-1150', supervisorName: 'Maria Oliveira', region: 'Leste', shift: '09:00 - 18:00', currentStatus: 'Em campo', active: true }],
  ['tech-bruno', { id: 'tech-bruno', supervisorId: 'supervisor-maria', name: 'Bruno Lima', registration: 'TEC-1171', supervisorName: 'Maria Oliveira', region: 'Leste', shift: '09:00 - 18:00', currentStatus: 'Indisponivel', active: false }]
]);
const calls = new Map<string, Call>([
  ['call-240918-01', { id: 'call-240918-01', orderNumber: 'RF-240918', bdesk: 'BD-88421', officeTrack: 'OT-72014', client: 'Condominio Jardim Sul', type: 'NOC ACESSO', reason: 'Perda de sinal', region: 'Sul', city: 'Sao Paulo', olt: 'VIP-CT1-SPO-OHW-01', slotPon: '3/7', status: 'Aberto', openedAt: '2026-09-18T08:12:00-03:00', notes: 'Acionamento recebido pelo grupo operacional.' }],
  ['call-240918-02', { id: 'call-240918-02', orderNumber: 'RF-240917', bdesk: 'BD-88408', officeTrack: 'OT-71998', client: 'Rede Residencial Vila Nova', type: 'ACIONAMENTO FIELD', reason: 'Rompimento de cabo', region: 'Leste', city: 'Guarulhos', olt: 'VIP-GZ1-SPO-OHW-02', slotPon: '1/12', status: 'Aberto', openedAt: '2026-09-18T07:45:00-03:00', notes: 'Necessario validar acesso ao local.' }],
  ['call-240917-01', { id: 'call-240917-01', orderNumber: 'RF-240917', bdesk: 'BD-88376', officeTrack: 'OT-71942', client: 'JH Telecom B2C', type: 'NOC TX', reason: 'Afetacao massiva', region: 'Sul', city: 'Diadema', olt: 'VIP-CT2-SPO-OHW-02', slotPon: '8/2', status: 'Atribuido', technicianId: 'tech-carlos', technicianName: 'Carlos Mendes', supervisorName: 'Joao da Silva', openedAt: '2026-09-17T16:20:00-03:00', assignedAt: '2026-09-17T16:55:00-03:00', notes: 'Equipe acionada para diagnostico.' }],
  ['call-240916-01', { id: 'call-240916-01', orderNumber: 'RF-240916', bdesk: 'BD-88291', officeTrack: 'OT-71882', client: 'Edificio Central', type: 'BAIXA TECNICA', reason: 'Cliente sem conexao', region: 'Leste', city: 'Suzano', olt: 'VIP-SMP-SPO-ONK-01', slotPon: '4/9', status: 'Em campo', technicianId: 'tech-andre', technicianName: 'Andre Costa', supervisorName: 'Maria Oliveira', openedAt: '2026-09-16T10:05:00-03:00', assignedAt: '2026-09-16T10:42:00-03:00', notes: 'Tecnico em deslocamento para a CTO.' }]
]);
const observations = new Map<string, CallObservation>();
const auditLogs = new Map<string, CallAuditLog>();
const activations = new Map<string, Activation>([
  ['activation-demo-01', { id: 'activation-demo-01', source: 'grupo_acionamentos_rede', originalMessage: 'VALIDAR COM NOC ACESSO\n- ORDEM: RF-240919\n- BDESK: BD-88455\n- MOTIVO: perda de sinal\n- OLT: VIP-CT1-SPO-OHW-01\n- SLOT/PON: 3/7', receivedAt: '2026-09-18T09:10:00-03:00', status: 'Pendente', extractedData: { orderNumber: 'RF-240919', bdesk: 'BD-88455', type: 'NOC ACESSO', reason: 'perda de sinal', olt: 'VIP-CT1-SPO-OHW-01', slotPon: '3/7' } }]
]);
const imports = new Map<string, ImportRecord>();
const settings: SystemSettings = { autoRefresh: true, refreshIntervalSeconds: 60, slaAlertHours: 8, defaultRegion: 'Todas' };
const demoDataEnabled = process.env.REDEFLOW_DEMO_DATA === 'true';

if (!demoDataEnabled) {
  users.clear();
  supervisors.clear();
  technicians.clear();
  calls.clear();
  observations.clear();
  auditLogs.clear();
  activations.clear();
  imports.clear();
}

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
export function getUserByEmail(email: string) { return [...users.values()].find((user) => user.email.toLowerCase() === email.toLowerCase()); }
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
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    if (input.name) await client.query(`UPDATE roles SET name = $1, updated_at = now() WHERE id = $2 AND deleted_at IS NULL`, [input.name, id]);
    if (input.description) await client.query(`UPDATE roles SET description = $1, updated_at = now() WHERE id = $2 AND deleted_at IS NULL`, [input.description, id]);
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
  }
  const role = roles.find((item) => item.id === id);
  if (!role) return undefined;
  Object.assign(role, input);
  return role;
}
export function getSettings(): SystemSettings { return { ...settings }; }
export function updateSettings(input: Partial<SystemSettings>): SystemSettings { Object.assign(settings, input); return getSettings(); }
export async function listSupervisors(): Promise<Supervisor[]> {
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; user_id: string | null; name: string; region: string | null; active: boolean }>(`SELECT id, user_id, name, region, active FROM supervisors WHERE deleted_at IS NULL ORDER BY name ASC`);
    const technicians = await listTechnicians();
    return result.rows.map((row) => ({ id: row.id, userId: row.user_id ?? undefined, name: row.name, region: row.region ?? '', active: row.active, technicianCount: technicians.filter((tech) => tech.supervisorId === row.id).length }));
  }
  return [...supervisors.values()].map((supervisor) => ({ ...supervisor, technicianCount: [...technicians.values()].filter((technician) => technician.supervisorId === supervisor.id).length }));
}
export async function listTechnicians(): Promise<Technician[]> {
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; supervisor_id: string | null; name: string; registration: string; region: string | null; shift: string | null; current_status: string; active: boolean }>(`SELECT id, supervisor_id, name, registration, region, shift, current_status, active FROM technicians WHERE deleted_at IS NULL ORDER BY name ASC`);
    const supervisorRows = await client.query<{ id: string; name: string }>(`SELECT id, name FROM supervisors WHERE deleted_at IS NULL`);
    const supervisorMap = new Map(supervisorRows.rows.map((row) => [row.id, row.name]));
    return result.rows.map((row) => ({ id: row.id, supervisorId: row.supervisor_id ?? undefined, name: row.name, registration: row.registration, supervisorName: row.supervisor_id ? supervisorMap.get(row.supervisor_id) : undefined, region: row.region ?? '', shift: row.shift ?? '', currentStatus: row.current_status as Technician['currentStatus'], active: row.active }));
  }
  return [...technicians.values()].map((technician) => ({ ...technician, supervisorName: technician.supervisorId ? supervisors.get(technician.supervisorId)?.name : undefined }));
}
export async function addTechnician(input: Omit<Technician, 'id' | 'supervisorName'>): Promise<Technician> {
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; supervisor_id: string | null; name: string; registration: string; region: string | null; shift: string | null; current_status: string; active: boolean }>(
      `INSERT INTO technicians (supervisor_id, name, registration, region, shift, current_status, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
       RETURNING id, supervisor_id, name, registration, region, shift, current_status, active`,
      [input.supervisorId ?? null, input.name, input.registration, input.region, input.shift, input.currentStatus, input.active],
    );
    const row = result.rows[0];
    const supervisorName = row.supervisor_id ? (await client.query<{ name: string }>(`SELECT name FROM supervisors WHERE id = $1 LIMIT 1`, [row.supervisor_id])).rows[0]?.name : undefined;
    return { id: row.id, supervisorId: row.supervisor_id ?? undefined, name: row.name, registration: row.registration, supervisorName, region: row.region ?? '', shift: row.shift ?? '', currentStatus: row.current_status as Technician['currentStatus'], active: row.active };
  }
  const technician = { ...input, id: `tech-${crypto.randomUUID()}` };
  technicians.set(technician.id, technician);
  return { ...technician, supervisorName: technician.supervisorId ? supervisors.get(technician.supervisorId)?.name : undefined };
}
export async function updateTechnician(id: string, input: { currentStatus?: Technician['currentStatus']; active?: boolean }): Promise<Technician | undefined> {
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    if (input.currentStatus) { sets.push(`current_status = $${index++}`); values.push(input.currentStatus); }
    if (input.active !== undefined) { sets.push(`active = $${index++}`); values.push(input.active); }
    if (!sets.length) return (await listTechnicians()).find((tech) => tech.id === id);
    sets.push(`updated_at = now()`);
    values.push(id);
    const result = await client.query<{ id: string; supervisor_id: string | null; name: string; registration: string; region: string | null; shift: string | null; current_status: string; active: boolean }>(
      `UPDATE technicians SET ${sets.join(', ')} WHERE id = $${index} AND deleted_at IS NULL RETURNING id, supervisor_id, name, registration, region, shift, current_status, active`,
      values,
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const supervisorName = row.supervisor_id ? (await client.query<{ name: string }>(`SELECT name FROM supervisors WHERE id = $1 LIMIT 1`, [row.supervisor_id])).rows[0]?.name : undefined;
    return { id: row.id, supervisorId: row.supervisor_id ?? undefined, name: row.name, registration: row.registration, supervisorName, region: row.region ?? '', shift: row.shift ?? '', currentStatus: row.current_status as Technician['currentStatus'], active: row.active };
  }
  const current = technicians.get(id);
  if (!current) return undefined;
  const updated = { ...current, ...input };
  technicians.set(id, updated);
  return { ...updated, supervisorName: updated.supervisorId ? supervisors.get(updated.supervisorId)?.name : undefined };
}
export async function addSupervisor(input: Omit<Supervisor, 'id' | 'technicianCount'>): Promise<Supervisor> {
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
export async function listCalls(status?: CallStatus): Promise<Call[]> {
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; order_number: string; bdesk: string; office_track: string; client: string; type: string; reason: string; region: string; city: string; olt: string; slot_pon: string; status: string; technician_id: string | null; technician_name: string | null; supervisor_name: string | null; opened_at: string; assigned_at: string | null; executed_at: string | null; result: string | null; cancellation_reason: string | null; notes: string }>(
      `SELECT c.id, c.order_number, c.bdesk, c.office_track, c.client, c.type, c.reason, c.region, c.city, c.olt, c.slot_pon, c.status, c.technician_id, t.name AS technician_name, s.name AS supervisor_name, c.opened_at, c.assigned_at, c.executed_at, c.result, c.cancellation_reason, c.notes
       FROM calls c LEFT JOIN technicians t ON t.id = c.technician_id LEFT JOIN supervisors s ON s.id = t.supervisor_id
       WHERE ($1::text IS NULL OR c.status = $1) ORDER BY c.opened_at DESC`,
      [status ?? null],
    );
    return result.rows.map((row) => ({ id: row.id, orderNumber: row.order_number, bdesk: row.bdesk, officeTrack: row.office_track, client: row.client, type: row.type, reason: row.reason, region: row.region, city: row.city, olt: row.olt, slotPon: row.slot_pon, status: row.status as CallStatus, technicianId: row.technician_id ?? undefined, technicianName: row.technician_name ?? undefined, supervisorName: row.supervisor_name ?? undefined, openedAt: row.opened_at, assignedAt: row.assigned_at ?? undefined, executedAt: row.executed_at ?? undefined, result: row.result ?? undefined, cancellationReason: row.cancellation_reason ?? undefined, notes: row.notes ?? '' }));
  }
  return [...calls.values()].filter((call) => !status || call.status === status);
}
export async function getCall(id: string): Promise<Call | undefined> {
  if (shouldUseLocalDatabase()) {
    const callsList = await listCalls();
    return callsList.find((call) => call.id === id);
  }
  return calls.get(id);
}
export async function listNotifications() {
  const notifications = [] as { id: string; type: 'warning' | 'info'; title: string; detail: string; href: string }[];
  const currentCalls = shouldUseLocalDatabase() ? await listCalls() : [...calls.values()];
  const unassigned = currentCalls.filter((call) => !call.technicianId && !['Finalizado', 'Cancelado'].includes(call.status));
  if (unassigned.length) notifications.push({ id: 'unassigned-calls', type: 'warning', title: `${unassigned.length} chamados sem tecnico`, detail: 'Existem chamados aguardando atribuicao.', href: '/chamados/abertos' });
  const currentActivations = shouldUseLocalDatabase() ? await listActivations() : [...activations.values()];
  const pending = currentActivations.filter((activation) => activation.status === 'Pendente');
  if (pending.length) notifications.push({ id: 'pending-activations', type: 'info', title: `${pending.length} acionamentos pendentes`, detail: 'Revise os dados recebidos para decidir.', href: '/acionamentos' });
  return notifications;
}
export async function updateCall(id: string, input: Partial<Pick<Call, 'status' | 'technicianId' | 'notes'>>, actor: User): Promise<Call | undefined> {
  if (shouldUseLocalDatabase()) {
    const current = await getCall(id);
    if (!current) return undefined;
    const client = await getDatabaseClient();
    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    if (input.status) { sets.push(`status = $${index++}`); values.push(input.status); }
    if (input.technicianId !== undefined) {
      sets.push(`technician_id = $${index}`);
      values.push(input.technicianId || null);
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
      const labels: Record<string, string> = { status: 'Status', technicianId: 'Tecnico', notes: 'Observacoes' };
      for (const field of Object.keys(input)) {
        const previousValue = String(current[field as keyof Call] ?? '');
        const newValue = String(updated[field as keyof Call] ?? '');
        if (previousValue !== newValue) await client.query(`INSERT INTO call_logs (call_id, user_id, action, field, previous_value, new_value) VALUES ($1, $2, $3, $4, $5, $6)`, [id, actor.id, `${labels[field] || field} alterado`, field, previousValue, newValue]);
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
  const technician = input.technicianId ? technicians.get(input.technicianId) : undefined;
  const updated = { ...current, ...input, technicianName: technician?.name ?? current.technicianName, supervisorName: technician?.supervisorId ? supervisors.get(technician.supervisorId)?.name : current.supervisorName, assignedAt: input.technicianId && !current.assignedAt ? new Date().toISOString() : current.assignedAt };
  calls.set(id, updated);
  const labels: Record<string, string> = { status: 'Status', technicianId: 'Tecnico', notes: 'Observacoes' };
  Object.keys(input).forEach((field) => {
    const previousValue = String(current[field as keyof Call] ?? '');
    const newValue = String(updated[field as keyof Call] ?? '');
    if (previousValue === newValue) return;
    const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId: id, userId: actor.id, userName: actor.name, action: `${labels[field] || field} alterado`, field, previousValue, newValue, createdAt: new Date().toISOString() };
    auditLogs.set(log.id, log);
  });
  return updated;
}
export async function listObservations(callId: string): Promise<CallObservation[]> {
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; call_id: string; user_id: string; user_name: string; text: string; created_at: string }>(
      `SELECT o.id, o.call_id, o.user_id, u.name AS user_name, o.text, o.created_at
       FROM call_observations o JOIN users u ON u.id = o.user_id
       WHERE o.call_id = $1 ORDER BY o.created_at DESC`, [callId],
    );
    return result.rows.map((row) => ({ id: row.id, callId: row.call_id, userId: row.user_id, userName: row.user_name, text: row.text, createdAt: row.created_at }));
  }
  return [...observations.values()].filter((item) => item.callId === callId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function addObservation(callId: string, actor: User, text: string): Promise<CallObservation> {
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
      await client.query(`INSERT INTO call_logs (call_id, user_id, action, field, previous_value, new_value) VALUES ($1, $2, $3, $4, $5, $6)`, [callId, actor.id, 'Observacao adicionada', 'observations', '', text]);
      await client.query('COMMIT');
      return { id: row.id, callId: row.call_id, userId: row.user_id, userName: row.user_name, text: row.text, createdAt: row.created_at };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const observation: CallObservation = { id: `obs-${crypto.randomUUID()}`, callId, userId: actor.id, userName: actor.name, text, createdAt: new Date().toISOString() };
  observations.set(observation.id, observation);
  const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId, userId: actor.id, userName: actor.name, action: 'Observacao adicionada', field: 'observations', previousValue: '', newValue: text, createdAt: observation.createdAt };
  auditLogs.set(log.id, log);
  return observation;
}
export async function listAuditLogs(callId: string): Promise<CallAuditLog[]> {
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; call_id: string; user_id: string; user_name: string; action: string; field: string; previous_value: string | null; new_value: string | null; created_at: string }>(
      `SELECT l.id, l.call_id, l.user_id, u.name AS user_name, l.action, l.field, l.previous_value, l.new_value, l.created_at
       FROM call_logs l JOIN users u ON u.id = l.user_id
       WHERE l.call_id = $1 ORDER BY l.created_at DESC`, [callId],
    );
    return result.rows.map((row) => ({ id: row.id, callId: row.call_id, userId: row.user_id, userName: row.user_name, action: row.action, field: row.field, previousValue: row.previous_value ?? '', newValue: row.new_value ?? '', createdAt: row.created_at }));
  }
  return [...auditLogs.values()].filter((item) => item.callId === callId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function listActivations(status?: ActivationStatus): Promise<Activation[]> {
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    const result = await client.query<{ id: string; source: string; original_message: string; received_at: string; status: string; decision_by: string | null; decision_at: string | null; created_call_id: string | null; rejection_reason: string | null; extracted_data: Record<string, string> }>(
      `SELECT a.id, a.source, a.original_message, a.received_at, a.status, a.decision_by, a.decision_at, a.created_call_id, a.rejection_reason, COALESCE(p.extracted_data, '{}'::jsonb) AS extracted_data
       FROM activations a LEFT JOIN LATERAL (
         SELECT extracted_data FROM activation_processing WHERE activation_id = a.id ORDER BY created_at DESC LIMIT 1
       ) p ON true
       WHERE ($1::text IS NULL OR a.status = $1) ORDER BY a.received_at DESC`,
      [status ?? null],
    );
    return result.rows.map((row) => ({ id: row.id, source: row.source, originalMessage: row.original_message, receivedAt: row.received_at, status: row.status as ActivationStatus, decisionBy: row.decision_by ?? undefined, decisionAt: row.decision_at ?? undefined, createdCallId: row.created_call_id ?? undefined, rejectionReason: row.rejection_reason ?? undefined, extractedData: row.extracted_data ?? {} }));
  }
  return [...activations.values()].filter((item) => !status || item.status === status).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}
export async function receiveActivation(input: { source: string; originalMessage: string; extractedData: Record<string, string> }): Promise<Activation> {
  if (shouldUseLocalDatabase()) {
    const client = await getDatabaseClient();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; source: string; original_message: string; received_at: string; status: string }>(
        `INSERT INTO activations (source, original_message, received_at, status)
         VALUES ($1, $2, now(), 'Pendente')
         RETURNING id, source, original_message, received_at, status`, [input.source, input.originalMessage],
      );
      const row = result.rows[0];
      await client.query(`INSERT INTO activation_processing (activation_id, extracted_data, processor) VALUES ($1, $2, 'wuzapi')`, [row.id, input.extractedData]);
      await client.query('COMMIT');
      return { id: row.id, source: row.source, originalMessage: row.original_message, receivedAt: row.received_at, status: row.status as ActivationStatus, extractedData: input.extractedData };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const activation: Activation = { id: `activation-${crypto.randomUUID()}`, source: input.source, originalMessage: input.originalMessage, receivedAt: new Date().toISOString(), status: 'Pendente', extractedData: input.extractedData }; activations.set(activation.id, activation); return activation;
}
export async function decideActivation(id: string, decision: 'Aceito' | 'Recusado', actor: User, rejectionReason?: string): Promise<{ activation?: Activation; call?: Call }> {
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
        const callResult = await client.query<{ id: string; order_number: string; bdesk: string; office_track: string; client: string; type: string; reason: string; region: string; city: string; olt: string; slot_pon: string; status: string; technician_id: string | null; opened_at: string; assigned_at: string | null; executed_at: string | null; result: string | null; cancellation_reason: string | null; notes: string }>(
          `INSERT INTO calls (order_number, bdesk, office_track, client, type, reason, region, city, olt, slot_pon, status, opened_at, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Aberto', now(), 'Criado a partir de acionamento aceito.', now(), now())
           RETURNING id, order_number, bdesk, office_track, client, type, reason, region, city, olt, slot_pon, status, technician_id, opened_at, assigned_at, executed_at, result, cancellation_reason, notes`,
          [data.orderNumber || `PEND-${id.slice(-6)}`, data.bdesk || '', data.orderNumber || '', data.client || 'Cliente nao identificado', data.type || 'NOC ACESSO', data.reason || 'Acionamento recebido', data.region || 'Nao informada', data.city || 'Nao informada', data.olt || '', data.slotPon || ''],
        );
        const callRow = callResult.rows[0];
        await client.query(`UPDATE activations SET status = 'Aceito', decision_by = $1, decision_at = now(), created_call_id = $2 WHERE id = $3`, [actor.id, callRow.id, id]);
        call = { id: callRow.id, orderNumber: callRow.order_number, bdesk: callRow.bdesk, officeTrack: callRow.office_track, client: callRow.client, type: callRow.type, reason: callRow.reason, region: callRow.region, city: callRow.city, olt: callRow.olt, slotPon: callRow.slot_pon, status: callRow.status as CallStatus, technicianId: callRow.technician_id ?? undefined, openedAt: callRow.opened_at, assignedAt: callRow.assigned_at ?? undefined, executedAt: callRow.executed_at ?? undefined, result: callRow.result ?? undefined, cancellationReason: callRow.cancellation_reason ?? undefined, notes: callRow.notes ?? '' };
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
    const call: Call = { id: `call-${crypto.randomUUID()}`, orderNumber: data.orderNumber || `PEND-${id.slice(-6)}`, bdesk: data.bdesk || '', officeTrack: data.orderNumber || '', client: data.client || 'Cliente nao identificado', type: data.type || 'NOC ACESSO', reason: data.reason || 'Acionamento recebido', region: data.region || 'Nao informada', city: data.city || 'Nao informada', olt: data.olt || '', slotPon: data.slotPon || '', status: 'Aberto', openedAt: new Date().toISOString(), notes: 'Criado a partir de acionamento aceito.' };
    calls.set(call.id, call); activation.createdCallId = call.id;
    return { activation, call };
  }
  return { activation };
}
export async function finishCall(id: string, input: { result: string; executedAt: string; notes: string }, actor: User): Promise<{ call?: Call; missing: string[] }> {
  if (shouldUseLocalDatabase()) {
    const current = await getCall(id);
    if (!current) return { missing: ['Chamado nao encontrado'] };
    if (['Finalizado', 'Cancelado'].includes(current.status)) return { missing: ['Chamado ja encerrado'] };
    const missing = [!current.technicianId && 'Tecnico', !current.reason && 'Motivo', !input.result.trim() && 'Resultado', !input.executedAt && 'Data e hora de execucao', !input.notes.trim() && 'Observacao'].filter(Boolean) as string[];
    if (missing.length) return { missing };
    const client = await getDatabaseClient();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string }>(`UPDATE calls SET result = $1, executed_at = $2, notes = $3, status = 'Finalizado', updated_at = now() WHERE id = $4 AND status NOT IN ('Finalizado', 'Cancelado') RETURNING id`, [input.result, input.executedAt, input.notes, id]);
      if (!result.rows[0]) { await client.query('ROLLBACK'); return { missing: ['Chamado ja encerrado'] }; }
      const updated = await getCall(id);
      if (!updated) { await client.query('ROLLBACK'); return { missing: ['Chamado nao encontrado'] }; }
      for (const field of ['status', 'result', 'executedAt', 'notes'] as const) {
        const previousValue = String(current[field as keyof Call] ?? '');
        const newValue = String(updated[field] ?? '');
        if (previousValue !== newValue) await client.query(`INSERT INTO call_logs (call_id, user_id, action, field, previous_value, new_value) VALUES ($1, $2, $3, $4, $5, $6)`, [id, actor.id, `${field} alterado`, field, previousValue, newValue]);
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
  if (['Finalizado', 'Cancelado'].includes(current.status)) return { missing: ['Chamado ja encerrado'] };
  const missing = [!current.technicianId && 'Tecnico', !current.reason && 'Motivo', !input.result.trim() && 'Resultado', !input.executedAt && 'Data e hora de execucao', !input.notes.trim() && 'Observacao'].filter(Boolean) as string[];
  if (missing.length) return { missing };
  const updated = { ...current, ...input, status: 'Finalizado' as const };
  calls.set(id, updated);
  (['status', 'result', 'executedAt', 'notes'] as const).forEach((field) => {
    const previousValue = String(current[field as keyof Call] ?? '');
    const newValue = String(updated[field] ?? '');
    if (previousValue === newValue) return;
    const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId: id, userId: actor.id, userName: actor.name, action: `${field === 'status' ? 'Status' : field === 'result' ? 'Resultado' : field === 'executedAt' ? 'Data de execucao' : 'Observacoes'} alterado`, field, previousValue, newValue, createdAt: new Date().toISOString() };
    auditLogs.set(log.id, log);
  });
  return { call: updated, missing: [] };
}
export async function cancelCall(id: string, reason: string, actor: User): Promise<Call | undefined> {
  if (shouldUseLocalDatabase()) {
    const current = await getCall(id);
    if (!current || ['Finalizado', 'Cancelado'].includes(current.status)) return undefined;
    const client = await getDatabaseClient();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string }>(`UPDATE calls SET status = 'Cancelado', cancellation_reason = $1, updated_at = now() WHERE id = $2 AND status NOT IN ('Finalizado', 'Cancelado') RETURNING id`, [reason, id]);
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
  if (['Finalizado', 'Cancelado'].includes(current.status)) return undefined;
  const updated = { ...current, status: 'Cancelado' as const, cancellationReason: reason };
  calls.set(id, updated);
  const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId: id, userId: actor.id, userName: actor.name, action: 'Chamado cancelado', field: 'cancellationReason', previousValue: '', newValue: reason, createdAt: new Date().toISOString() };
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
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  if (shouldUseLocalDatabase()) {
    const allCalls = await listCalls();
    const activations = await listActivations();
    const today = new Date().toISOString().slice(0, 10);
    const countBy = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((accumulator, value) => { accumulator[value] = (accumulator[value] || 0) + 1; return accumulator; }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    return { receivedToday: allCalls.filter((call) => call.openedAt.slice(0, 10) === today).length, open: allCalls.filter((call) => call.status === 'Aberto').length, unassigned: allCalls.filter((call) => !call.technicianId && !['Finalizado', 'Cancelado'].includes(call.status)).length, inProgress: allCalls.filter((call) => ['Atribuido', 'Deslocamento', 'Em campo'].includes(call.status)).length, finished: allCalls.filter((call) => call.status === 'Finalizado').length, cancelled: allCalls.filter((call) => call.status === 'Cancelado').length, pendingActivations: activations.filter((activation) => activation.status === 'Pendente').length, byStatus: countBy(allCalls.map((call) => call.status)), byRegion: countBy(allCalls.map((call) => call.region)), byTechnician: countBy(allCalls.filter((call) => call.technicianName).map((call) => call.technicianName!)), byType: countBy(allCalls.map((call) => call.type)) };
  }
  const allCalls = [...calls.values()];
  const today = new Date().toISOString().slice(0, 10);
  const countBy = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((accumulator, value) => { accumulator[value] = (accumulator[value] || 0) + 1; return accumulator; }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  return { receivedToday: allCalls.filter((call) => call.openedAt.slice(0, 10) === today).length, open: allCalls.filter((call) => call.status === 'Aberto').length, unassigned: allCalls.filter((call) => !call.technicianId && !['Finalizado', 'Cancelado'].includes(call.status)).length, inProgress: allCalls.filter((call) => ['Atribuido', 'Deslocamento', 'Em campo'].includes(call.status)).length, finished: allCalls.filter((call) => call.status === 'Finalizado').length, cancelled: allCalls.filter((call) => call.status === 'Cancelado').length, pendingActivations: [...activations.values()].filter((activation) => activation.status === 'Pendente').length, byStatus: countBy(allCalls.map((call) => call.status)), byRegion: countBy(allCalls.map((call) => call.region)), byTechnician: countBy(allCalls.filter((call) => call.technicianName).map((call) => call.technicianName!)), byType: countBy(allCalls.map((call) => call.type)) };
}