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
  | 'calls.delete'
  | 'calls.reopen'
  | 'calls.view_logs'
  | 'calls.add_observation'
  | 'activations.view'
  | 'activations.decide'
  | 'imports.view'
  | 'imports.create'
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
  role?: Role;
};

export type SystemSettings = {
  autoRefresh: boolean;
  refreshIntervalSeconds: number;
  slaAlertHours: number;
  defaultRegion: string;
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
  activeOverride?: boolean;
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

export type EditableCallFields = Omit<Pick<Call, 'orderNumber' | 'bdesk' | 'officeTrack' | 'client' | 'type' | 'reason' | 'region' | 'city' | 'olt' | 'slotPon' | 'status' | 'technicianId' | 'notes'>, 'technicianId'> & { technicianId?: string | null };

export type CallObservation = { id: string; callId: string; userId: string; userName: string; text: string; createdAt: string };
export type CallAuditLog = { id: string; callId: string; userId: string; userName: string; action: string; field: string; previousValue: string; newValue: string; createdAt: string };

export type ActivationStatus = 'Pendente' | 'Processando' | 'Aceito' | 'Recusado';
export type ActivationAnalysis = {
  eh_acionamento: boolean;
  tipo_registro: string | null;
  tipo_card: string | null;
  categoria: string | null;
  origem: string | null;
  prioridade: string | null;
  tecnico: string | null;
  auxiliar: string | null;
  telefone: string | null;
  bdesk: string | null;
  ticket: string | null;
  office_track: string | null;
  os_ot: string | null;
  os_casa_cliente: string | null;
  contrato: string | null;
  sn: string | null;
  olt: string | null;
  slot_pon: string[] | null;
  placa_pon: string | null;
  tipo_falha: string | null;
  motivo: string | null;
  afetados: number | null;
  data_hora_evento: string | null;
  tratativa_realizada: string | null;
  localizacao: string[] | null;
  id_cto: string | null;
  loc_cto: string | null;
  materiais_utilizados: string | null;
  tecnico_rede: string | null;
  cope_rede: string | null;
  observacoes: string | null;
  raw_text: string;
};
export type Activation = {
  id: string;
  source: string;
  originalMessage: string;
  receivedAt: string;
  status: ActivationStatus;
  extractedData: Record<string, string>;
  analysis?: ActivationAnalysis;
  confirmedData?: Record<string, string>;
  decisionBy?: string;
  decisionAt?: string;
  createdCallId?: string;
  rejectionReason?: string;
};

export type ImportStatus = 'Previsualizada' | 'Confirmada' | 'Falhou';
export type ImportRecord = { id: string; fileName: string; fileType: 'csv' | 'xlsx'; sheetName: string; columns: string[]; preview: Record<string, string>[]; totalRows: number; validRows: number; errors: string[]; status: ImportStatus; importedBy: string; createdAt: string };
export type DashboardMetrics = { receivedToday: number; open: number; unassigned: number; inProgress: number; finished: number; cancelled: number; pendingActivations: number; byStatus: { label: string; value: number }[]; byRegion: { label: string; value: number }[]; byTechnician: { label: string; value: number }[]; byType: { label: string; value: number }[] };