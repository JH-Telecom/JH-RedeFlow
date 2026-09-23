const API_URL = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3333' : 'https://jh-redeflow-api.onrender.com')).replace(/\/+$/, '');
export type Permission = { code: string; description: string };
export type Role = { id: string; name: string; description: string; permissions: string[] };
export type User = { id: string; name: string; email: string; roleId: string; active: boolean; createdAt: string; role?: Role };
export type Technician = { id: string; supervisorId?: string; name: string; registration: string; supervisorName?: string; region: string; shift: string; currentStatus: 'Disponivel' | 'Em campo' | 'Indisponivel'; active: boolean; activeOverride?: boolean };
export type Supervisor = { id: string; userId?: string; name: string; region: string; active: boolean; technicianCount: number };
export type CallStatus = 'Aberto' | 'Atribuido' | 'Deslocamento' | 'Em campo' | 'Finalizado' | 'Cancelado';
export type Call = { id: string; orderNumber: string; bdesk: string; officeTrack: string; client: string; type: string; reason: string; region: string; city: string; olt: string; slotPon: string; status: CallStatus; technicianId?: string; technicianName?: string; supervisorName?: string; openedAt: string; assignedAt?: string; executedAt?: string; result?: string; cancellationReason?: string; notes: string };
export type CallObservation = { id: string; callId: string; userId: string; userName: string; text: string; createdAt: string };
export type CallAuditLog = { id: string; callId: string; userId: string; userName: string; action: string; field: string; previousValue: string; newValue: string; createdAt: string };
export type Activation = { id: string; source: string; originalMessage: string; receivedAt: string; status: 'Pendente' | 'Processando' | 'Aceito' | 'Recusado'; extractedData: Record<string, string>; analysis?: Record<string, unknown>; decisionBy?: string; decisionAt?: string; createdCallId?: string; rejectionReason?: string };
export type ImportRecord = { id: string; fileName: string; fileType: 'csv' | 'xlsx'; sheetName: string; columns: string[]; preview: Record<string, string>[]; totalRows: number; validRows: number; errors: string[]; status: 'Previsualizada' | 'Confirmada' | 'Falhou'; importedBy: string; createdAt: string };
export type DashboardMetrics = { receivedToday: number; open: number; unassigned: number; inProgress: number; finished: number; cancelled: number; pendingActivations: number; byStatus: { label: string; value: number }[]; byRegion: { label: string; value: number }[]; byTechnician: { label: string; value: number }[]; byType: { label: string; value: number }[] };
export type ManualProductionData = { activities: { type: string; pending: number; enRoute: number; started: number; concluded: number; cancelled: number; suspended: number; total: number }[]; technicians: { name: string; pending: number; enRoute: number; started: number; concluded: number; cancelled: number; suspended: number; total: number }[]; orders: { order: string; technician: string; inicio: string; tempo: string }[]; updatedAt: string };
export type ManualDailyBase = { businessDate: string; fileName: string; data: ManualProductionData; uploadedBy: string; updatedAt: string };
export type SystemSettings = { autoRefresh: boolean; refreshIntervalSeconds: number; slaAlertHours: number; defaultRegion: string };
export type AppNotification = { id: string; type: 'warning' | 'info'; title: string; detail: string; href: string };
export type Session = { token: string; user: User & { role: Role } };
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('jh-redeflow-token');
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });

  const rawText = await response.text();
  let payload: any = {};

  if (rawText) {
    const contentType = response.headers.get('content-type') || '';
    const looksLikeJson = contentType.includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[');
    if (!looksLikeJson) {
      throw new Error('A API respondeu com HTML em vez de JSON. Verifique se a variavel VITE_API_URL aponta para o backend correto.');
    }

    try {
      payload = JSON.parse(rawText);
    } catch {
      throw new Error('A API respondeu com um corpo invalido. Verifique a URL do backend e o CORS.');
    }
  }

  if (!response.ok) {
    const error = new Error(payload.message || 'Nao foi possivel concluir a operacao.') as Error & { missing?: string[] };
    error.missing = payload.missing;
    throw error;
  }
  return payload;
}
export const api = {
  login: (email: string, password: string) => request<Session>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<{ user: User & { role: Role } }>('/api/auth/me'),
  dashboard: () => request<{ metrics: DashboardMetrics }>('/api/dashboards/operacao'),
  dailyBase: () => request<{ base?: ManualDailyBase }>('/api/dashboards/painel-diario/base'),
  saveDailyBase: (fileName: string, data: ManualProductionData) => request<{ base: ManualDailyBase }>('/api/dashboards/painel-diario/base', { method: 'PUT', body: JSON.stringify({ fileName, data }) }),
  clearDailyBase: () => request<{ deleted: boolean }>('/api/dashboards/painel-diario/base', { method: 'DELETE' }),
  notifications: () => request<{ notifications: AppNotification[] }>('/api/notificacoes'),
  users: () => request<{ users: User[] }>('/api/users'),
  roles: () => request<{ roles: Role[]; permissions: Permission[] }>('/api/roles'),
  technicians: () => request<{ technicians: Technician[] }>('/api/tecnicos'),
  createTechnician: (data: Omit<Technician, 'id' | 'supervisorName'>) => request<{ technician: Technician }>('/api/tecnicos', { method: 'POST', body: JSON.stringify(data) }),
  updateTechnician: (id: string, data: { supervisorId?: string; currentStatus?: Technician['currentStatus']; active?: boolean }) => request<{ technician: Technician }>(`/api/tecnicos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  supervisors: () => request<{ supervisors: Supervisor[]; technicians: Technician[] }>('/api/supervisores'),
  createSupervisor: (data: Omit<Supervisor, 'id' | 'technicianCount'>) => request<{ supervisor: Supervisor }>('/api/supervisores', { method: 'POST', body: JSON.stringify(data) }),
  calls: (status?: CallStatus) => request<{ calls: Call[] }>(`/api/chamados${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  call: (id: string) => request<{ call: Call }>(`/api/chamados/${id}`),
  updateCall: (id: string, data: Partial<Pick<Call, 'orderNumber' | 'bdesk' | 'officeTrack' | 'client' | 'type' | 'reason' | 'region' | 'city' | 'olt' | 'slotPon' | 'status' | 'notes'>> & { technicianId?: string | null }) => request<{ call: Call }>(`/api/chamados/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  finishCall: (id: string, data: { result: string; executedAt: string; notes: string }) => request<{ call: Call; missing?: string[] }>(`/api/chamados/${id}/finalizar`, { method: 'POST', body: JSON.stringify(data) }),
  cancelCall: (id: string, reason: string) => request<{ call: Call }>(`/api/chamados/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ reason }) }),
  deleteCall: (id: string) => request<{ deleted: boolean }>(`/api/chamados/${id}`, { method: 'DELETE' }),
  reopenCall: (id: string) => request<{ call: Call }>(`/api/chamados/${id}/reabrir`, { method: 'POST' }),
  observations: (id: string) => request<{ observations: CallObservation[] }>(`/api/chamados/${id}/observacoes`),
  addObservation: (id: string, text: string) => request<{ observation: CallObservation }>(`/api/chamados/${id}/observacoes`, { method: 'POST', body: JSON.stringify({ text }) }),
  auditLogs: (id: string) => request<{ logs: CallAuditLog[] }>(`/api/chamados/${id}/logs`),
  activations: (status?: Activation['status']) => request<{ activations: Activation[] }>(`/api/acionamentos${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  acceptActivation: (id: string) => request<{ activation: Activation; call?: Call }>(`/api/acionamentos/${id}/aceitar`, { method: 'POST' }),
  rejectActivation: (id: string, reason: string) => request<{ activation: Activation }>(`/api/acionamentos/${id}/recusar`, { method: 'POST', body: JSON.stringify({ reason }) }),
  imports: () => request<{ imports: ImportRecord[] }>('/api/importacoes'),
  previewImport: (fileName: string, content: string) => request<{ import: ImportRecord }>('/api/importacoes/preview', { method: 'POST', body: JSON.stringify({ fileName, content }) }),
  confirmImport: (id: string) => request<{ import: ImportRecord }>(`/api/importacoes/${id}/confirmar`, { method: 'POST' }),
  syncGoogleDrive: () => request<{ sync: { files: number; rows: number; updated: number; skipped: number; errors: string[] } }>('/api/integrations/google-drive/sync', { method: 'POST' }),
  createUser: (data: { name: string; email: string; roleId: string; password: string }) => request<{ user: User }>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: { name?: string; email?: string; roleId?: string; active?: boolean; password?: string }) => request<{ user: User }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request<{ deleted: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),
  createRole: (data: { name: string; description: string; permissions: string[] }) => request<{ role: Role }>('/api/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (id: string, data: { name?: string; description?: string; permissions?: string[] }) => request<{ role: Role }>(`/api/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  settings: () => request<{ settings: SystemSettings }>('/api/configuracoes'),
  updateSettings: (data: Partial<SystemSettings>) => request<{ settings: SystemSettings }>('/api/configuracoes', { method: 'PATCH', body: JSON.stringify(data) })
};