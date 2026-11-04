import bcrypt from "bcryptjs";
import { type D0Row } from "../imports/d0.js";
import type { Activation, Call, CallAuditLog, CallObservation, ImportRecord, ManualDailyBase, PermissionCode, Role, StoredCallObservationAttachment, Supervisor, SystemSettings, Technician, User } from "../types.js";
import { type OltRegionRequest } from "./settings.js";

export const permissionDescriptions: Record<PermissionCode, string> = {
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

export const allPermissions = Object.keys(permissionDescriptions) as PermissionCode[];

export const now = new Date().toISOString();

export const adminRole: Role = { id: 'role-admin', name: 'Administrador', description: 'Acesso administrativo da plataforma', permissions: allPermissions };

export const operatorRole: Role = { id: 'role-operator', name: 'Operador', description: 'Operacao de chamados e remanejamentos', permissions: ['dashboard.view', 'calls.view', 'calls.create', 'calls.edit', 'calls.assign', 'calls.finish', 'calls.cancel', 'calls.reopen', 'calls.view_logs', 'calls.add_observation', 'activations.view', 'activations.decide', 'imports.view', 'imports.create', 'technicians.view', 'supervisors.view'] };

export const supervisorRole: Role = { id: 'role-supervisor', name: 'Supervisor', description: 'Visao restrita da propria equipe', permissions: ['dashboard.view', 'calls.view', 'technicians.view', 'supervisors.view'] };

export const counterRole: Role = { id: 'role-counter', name: 'Mesario', description: 'Aceite e recusa de acionamentos', permissions: ['activations.view', 'activations.decide'] };

export const viewerRole: Role = { id: 'role-viewer', name: 'Visualizacao', description: 'Consulta sem alteracao', permissions: ['dashboard.view', 'calls.view', 'technicians.view', 'supervisors.view'] };

export const roles: Role[] = [adminRole, operatorRole, supervisorRole, counterRole, viewerRole];

export const users = new Map<string, User & { passwordHash: string }>([
  ['user-admin', { id: 'user-admin', name: 'Administrador JH', email: 'admin@jhtelecom.com', roleId: adminRole.id, active: true, createdAt: now, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) }],
  ['user-matheus', { id: 'user-matheus', name: 'Matheus Terra', email: 'matheus@jhtelecom.com', roleId: operatorRole.id, active: true, createdAt: now, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) }],
  ['user-joao', { id: 'user-joao', name: 'Joao da Silva', email: 'joao@jhtelecom.com', roleId: supervisorRole.id, active: true, createdAt: now, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) }],
  ['user-maria', { id: 'user-maria', name: 'Maria Oliveira', email: 'maria@jhtelecom.com', roleId: supervisorRole.id, active: true, createdAt: now, passwordHash: bcrypt.hashSync('RedeFlow@2026', 10) }]
]);

export const supervisors = new Map<string, Supervisor>([
  ['supervisor-joao', { id: 'supervisor-joao', userId: 'user-joao', name: 'Joao da Silva', region: 'Sul', active: true, technicianCount: 3 }],
  ['supervisor-maria', { id: 'supervisor-maria', userId: 'user-maria', name: 'Maria Oliveira', region: 'Leste', active: true, technicianCount: 2 }]
]);

export const technicians = new Map<string, Technician>([
  ['tech-carlos', { id: 'tech-carlos', supervisorId: 'supervisor-joao', name: 'Carlos Mendes', registration: 'TEC-1042', supervisorName: 'Joao da Silva', region: 'Sul', shift: '07:00 - 16:00', currentStatus: 'Em campo', active: true, teamRole: 'Tecnico', leadTechnicianId: undefined }],
  ['tech-pedro', { id: 'tech-pedro', supervisorId: 'supervisor-joao', name: 'Pedro Santos', registration: 'TEC-1088', supervisorName: 'Joao da Silva', region: 'Sul', shift: '08:00 - 17:00', currentStatus: 'Disponivel', active: true, teamRole: 'Tecnico', leadTechnicianId: undefined }],
  ['tech-lucas', { id: 'tech-lucas', supervisorId: 'supervisor-joao', name: 'Lucas Reis', registration: 'TEC-1103', supervisorName: 'Joao da Silva', region: 'Sul', shift: '08:00 - 17:00', currentStatus: 'Disponivel', active: true, teamRole: 'Tecnico', leadTechnicianId: undefined }],
  ['tech-andre', { id: 'tech-andre', supervisorId: 'supervisor-maria', name: 'Andre Costa', registration: 'TEC-1150', supervisorName: 'Maria Oliveira', region: 'Leste', shift: '09:00 - 18:00', currentStatus: 'Em campo', active: true, teamRole: 'Tecnico', leadTechnicianId: undefined }],
  ['tech-bruno', { id: 'tech-bruno', supervisorId: 'supervisor-maria', name: 'Bruno Lima', registration: 'TEC-1171', supervisorName: 'Maria Oliveira', region: 'Leste', shift: '09:00 - 18:00', currentStatus: 'Indisponivel', active: false, teamRole: 'Tecnico', leadTechnicianId: undefined }]
]);

export const calls = new Map<string, Call>([
  ['call-240918-01', { id: 'call-240918-01', orderNumber: 'RF-240918', bdesk: 'BD-88421', officeTrack: 'OT-72014', client: 'Condominio Jardim Sul', type: 'NOC ACESSO', reason: 'Perda de sinal', region: 'Sul', city: 'Sao Paulo', olt: 'VIP-CT1-SPO-OHW-01', slotPon: '3/7', status: 'Aberto', openedAt: '2026-09-18T08:12:00-03:00', notes: 'Acionamento recebido pelo grupo operacional.' }],
  ['call-240918-02', { id: 'call-240918-02', orderNumber: 'RF-240917', bdesk: 'BD-88408', officeTrack: 'OT-71998', client: 'Rede Residencial Vila Nova', type: 'ACIONAMENTO FIELD', reason: 'Rompimento de cabo', region: 'Leste', city: 'Guarulhos', olt: 'VIP-GZ1-SPO-OHW-02', slotPon: '1/12', status: 'Aberto', openedAt: '2026-09-18T07:45:00-03:00', notes: 'Necessario validar acesso ao local.' }],
  ['call-240917-01', { id: 'call-240917-01', orderNumber: 'RF-240917', bdesk: 'BD-88376', officeTrack: 'OT-71942', client: 'JH Telecom B2C', type: 'NOC TX', reason: 'Afetacao massiva', region: 'Sul', city: 'Diadema', olt: 'VIP-CT2-SPO-OHW-02', slotPon: '8/2', status: 'Atribuido', technicianId: 'tech-carlos', technicianName: 'Carlos Mendes', supervisorName: 'Joao da Silva', openedAt: '2026-09-17T16:20:00-03:00', assignedAt: '2026-09-17T16:55:00-03:00', notes: 'Equipe acionada para diagnostico.' }],
  ['call-240916-01', { id: 'call-240916-01', orderNumber: 'RF-240916', bdesk: 'BD-88291', officeTrack: 'OT-71882', client: 'Edificio Central', type: 'BAIXA TECNICA', reason: 'Cliente sem conexao', region: 'Leste', city: 'Suzano', olt: 'VIP-SMP-SPO-ONK-01', slotPon: '4/9', status: 'Em campo', technicianId: 'tech-andre', technicianName: 'Andre Costa', supervisorName: 'Maria Oliveira', openedAt: '2026-09-16T10:05:00-03:00', assignedAt: '2026-09-16T10:42:00-03:00', notes: 'Tecnico em deslocamento para a CTO.' }]
]);

export const observations = new Map<string, CallObservation>();

export const observationAttachments = new Map<string, StoredCallObservationAttachment>();

export const userBanners = new Map<string, string>();
export const userAvatars = new Map<string, string>();

export const auditLogs = new Map<string, CallAuditLog>();

export const activations = new Map<string, Activation>([
  ['activation-demo-01', { id: 'activation-demo-01', source: 'grupo_acionamentos_rede', originalMessage: 'VALIDAR COM NOC ACESSO\n- ORDEM: RF-240919\n- BDESK: BD-88455\n- MOTIVO: perda de sinal\n- OLT: VIP-CT1-SPO-OHW-01\n- SLOT/PON: 3/7', receivedAt: '2026-09-18T09:10:00-03:00', status: 'Pendente', extractedData: { orderNumber: 'RF-240919', bdesk: 'BD-88455', type: 'NOC ACESSO', reason: 'perda de sinal', olt: 'VIP-CT1-SPO-OHW-01', slotPon: '3/7' } }]
]);

export const imports = new Map<string, ImportRecord>();

export const oltRegionRequests = new Map<string, OltRegionRequest>();

export const customOperationalRegions = new Map<string, string>();

export const d0BaseRows: Array<{ fileName: string; rowNumber: number; payload: D0Row; uploadedBy: string; importedAt: string }> = [];

export const manualDailyBases = new Map<string, ManualDailyBase>();

export const settings: SystemSettings = { autoRefresh: true, refreshIntervalSeconds: 60, slaAlertHours: 8, defaultRegion: 'Todas' };

export function isDemoDataEnabled() {
  return process.env.REDEFLOW_DEMO_DATA === 'true';
}

export function ensureDemoData() {
  if (!isDemoDataEnabled()) {
    users.clear();
    supervisors.clear();
    technicians.clear();
    calls.clear();
    observations.clear();
    observationAttachments.clear();
    userAvatars.clear();
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
