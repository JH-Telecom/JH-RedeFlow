import bcrypt from 'bcryptjs';
import type { AuthUser, Call, CallAuditLog, CallObservation, CallStatus, PermissionCode, Role, Supervisor, Technician, User } from './types.js';

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
  'settings.manage': 'Gerenciar configuracoes'
};

const allPermissions = Object.keys(permissionDescriptions) as PermissionCode[];
const now = new Date().toISOString();
const adminRole: Role = { id: 'role-admin', name: 'Administrador', description: 'Acesso administrativo da plataforma', permissions: allPermissions };
const operatorRole: Role = { id: 'role-operator', name: 'Operador', description: 'Operacao de chamados e remanejamentos', permissions: ['dashboard.view', 'calls.view', 'calls.create', 'calls.edit', 'calls.assign', 'calls.finish', 'calls.cancel', 'calls.view_logs', 'calls.add_observation', 'technicians.view', 'supervisors.view'] };
const supervisorRole: Role = { id: 'role-supervisor', name: 'Supervisor', description: 'Visao restrita da propria equipe', permissions: ['dashboard.view', 'calls.view', 'technicians.view', 'supervisors.view'] };
const counterRole: Role = { id: 'role-counter', name: 'Mesario', description: 'Aceite e recusa de acionamentos', permissions: [] };
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

export function getRole(roleId: string): Role | undefined { return roles.find((role) => role.id === roleId); }
export function listRoles(): Role[] { return roles; }
export function listPermissions() { return allPermissions.map((code) => ({ code, description: permissionDescriptions[code] })); }
export function listUsers(): User[] { return [...users.values()].map(({ passwordHash: _passwordHash, ...user }) => user); }
export function getUserByEmail(email: string) { return [...users.values()].find((user) => user.email.toLowerCase() === email.toLowerCase()); }
export function getAuthUser(user: User): AuthUser {
  const { passwordHash: _passwordHash, ...safeUser } = user as User & { passwordHash?: string };
  return { ...safeUser, role: getRole(user.roleId)! };
}
export function validatePassword(user: User & { passwordHash: string }, password: string) { return bcrypt.compareSync(password, user.passwordHash); }
export function addUser(input: { name: string; email: string; roleId: string; password: string }): User {
  const id = `user-${crypto.randomUUID()}`;
  const user = { id, name: input.name, email: input.email, roleId: input.roleId, active: true, createdAt: new Date().toISOString(), passwordHash: bcrypt.hashSync(input.password, 10) };
  users.set(id, user);
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
export function listSupervisors(): Supervisor[] {
  return [...supervisors.values()].map((supervisor) => ({ ...supervisor, technicianCount: [...technicians.values()].filter((technician) => technician.supervisorId === supervisor.id).length }));
}
export function listTechnicians(): Technician[] {
  return [...technicians.values()].map((technician) => ({ ...technician, supervisorName: technician.supervisorId ? supervisors.get(technician.supervisorId)?.name : undefined }));
}
export function addTechnician(input: Omit<Technician, 'id' | 'supervisorName'>): Technician {
  const technician = { ...input, id: `tech-${crypto.randomUUID()}` };
  technicians.set(technician.id, technician);
  return { ...technician, supervisorName: technician.supervisorId ? supervisors.get(technician.supervisorId)?.name : undefined };
}
export function addSupervisor(input: Omit<Supervisor, 'id' | 'technicianCount'>): Supervisor {
  const supervisor = { ...input, id: `supervisor-${crypto.randomUUID()}`, technicianCount: 0 };
  supervisors.set(supervisor.id, supervisor);
  return supervisor;
}
export function listCalls(status?: CallStatus): Call[] { return [...calls.values()].filter((call) => !status || call.status === status); }
export function getCall(id: string): Call | undefined { return calls.get(id); }
export function updateCall(id: string, input: Partial<Pick<Call, 'status' | 'technicianId' | 'notes'>>, actor: User): Call | undefined {
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
export function listObservations(callId: string): CallObservation[] { return [...observations.values()].filter((item) => item.callId === callId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export function addObservation(callId: string, actor: User, text: string): CallObservation { const observation: CallObservation = { id: `obs-${crypto.randomUUID()}`, callId, userId: actor.id, userName: actor.name, text, createdAt: new Date().toISOString() }; observations.set(observation.id, observation); return observation; }
export function listAuditLogs(callId: string): CallAuditLog[] { return [...auditLogs.values()].filter((item) => item.callId === callId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export function finishCall(id: string, input: { result: string; executedAt: string; notes: string }, actor: User): { call?: Call; missing: string[] } {
  const current = calls.get(id);
  if (!current) return { missing: ['Chamado nao encontrado'] };
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
export function cancelCall(id: string, reason: string, actor: User): Call | undefined {
  const current = calls.get(id);
  if (!current) return undefined;
  const updated = { ...current, status: 'Cancelado' as const, cancellationReason: reason };
  calls.set(id, updated);
  const log: CallAuditLog = { id: `log-${crypto.randomUUID()}`, callId: id, userId: actor.id, userName: actor.name, action: 'Chamado cancelado', field: 'cancellationReason', previousValue: '', newValue: reason, createdAt: new Date().toISOString() };
  auditLogs.set(log.id, log);
  return updated;
}