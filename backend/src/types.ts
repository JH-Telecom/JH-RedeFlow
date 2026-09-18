export type PermissionCode =
  | 'dashboard.view'
  | 'users.view'
  | 'users.create'
  | 'users.edit'
  | 'roles.view'
  | 'roles.manage'
  | 'technicians.view'
  | 'technicians.create'
  | 'technicians.edit'
  | 'supervisors.view'
  | 'supervisors.create'
  | 'supervisors.edit'
  | 'calls.view'
  | 'calls.create'
  | 'calls.edit'
  | 'calls.assign'
  | 'calls.finish'
  | 'calls.cancel'
  | 'calls.view_logs'
  | 'calls.add_observation'
  | 'settings.manage';

export type Role = {
  id: string;
  name: string;
  description: string;
  permissions: PermissionCode[];
};

export type User = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  active: boolean;
  createdAt: string;
};

export type AuthUser = User & { role: Role };

export type Supervisor = {
  id: string;
  userId?: string;
  name: string;
  region: string;
  active: boolean;
  technicianCount: number;
};

export type Technician = {
  id: string;
  supervisorId?: string;
  name: string;
  registration: string;
  supervisorName?: string;
  region: string;
  shift: string;
  currentStatus: 'Disponivel' | 'Em campo' | 'Indisponivel';
  active: boolean;
};

export type CallStatus = 'Aberto' | 'Atribuido' | 'Deslocamento' | 'Em campo' | 'Finalizado' | 'Cancelado';

export type Call = {
  id: string;
  orderNumber: string;
  bdesk: string;
  officeTrack: string;
  client: string;
  type: string;
  reason: string;
  region: string;
  city: string;
  olt: string;
  slotPon: string;
  status: CallStatus;
  technicianId?: string;
  technicianName?: string;
  supervisorName?: string;
  openedAt: string;
  assignedAt?: string;
  executedAt?: string;
  result?: string;
  cancellationReason?: string;
  notes: string;
};

export type CallObservation = { id: string; callId: string; userId: string; userName: string; text: string; createdAt: string };
export type CallAuditLog = { id: string; callId: string; userId: string; userName: string; action: string; field: string; previousValue: string; newValue: string; createdAt: string };