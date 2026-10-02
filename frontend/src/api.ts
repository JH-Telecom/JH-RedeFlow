const API_URL = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3333' : 'https://jh-redeflow-api.onrender.com')).replace(/\/+$/, '');
export type Permission = { code: string; description: string };
export type Role = { id: string; name: string; description: string; permissions: string[] };
export type User = { id: string; name: string; email: string; roleId: string; active: boolean; createdAt: string; mustChangePassword?: boolean; role?: Role };
export type Technician = { id: string; supervisorId?: string; name: string; registration: string; supervisorName?: string; region: string; shift: string; currentStatus: 'Disponivel' | 'Em campo' | 'Indisponivel'; active: boolean; employmentStatus: 'Trabalhando' | 'Demitido'; activeOverride?: boolean; teamRole: 'Tecnico' | 'Auxiliar'; leadTechnicianId?: string | null; leadTechnicianName?: string };
export type Supervisor = { id: string; userId?: string; name: string; region: string; active: boolean; technicianCount: number };
export type CallStatus = 'Aberto' | 'Atribuido' | 'Deslocamento' | 'Em campo' | 'Finalizado' | 'Cancelado' | 'Baixar';
export type Call = { id: string; orderNumber: string; bdesk: string; officeTrack: string; client: string; type: string; reason: string; region: string; city: string; address?: string; bairro?: string; ofsStatus?: string; olt: string; slotPon: string; status: CallStatus; technicianId?: string; technicianName?: string; supervisorName?: string; openedAt: string; assignedAt?: string; executedAt?: string | null; result?: string; cancellationReason?: string; notes: string; lastObservationAt?: string };
export type CallObservationAttachment = { id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string };
export type CallObservationAttachmentUpload = Pick<CallObservationAttachment, 'fileName' | 'mimeType' | 'sizeBytes'> & { contentBase64: string };
export type CallObservationAttachmentContent = CallObservationAttachment & { observationId: string; contentBase64: string };
export type CallObservation = { id: string; callId: string; userId: string; userName: string; text: string; createdAt: string; attachments: CallObservationAttachment[] };
export type CallAuditLog = { id: string; callId: string; userId: string; userName: string; action: string; field: string; previousValue: string; newValue: string; createdAt: string };
export type Activation = { id: string; source: string; originalMessage: string; receivedAt: string; status: 'Pendente' | 'Processando' | 'Aceito' | 'Recusado'; extractedData: Record<string, string>; analysis?: Record<string, unknown>; decisionBy?: string; decisionAt?: string; createdCallId?: string; rejectionReason?: string };
export type ImportRecord = { id: string; fileName: string; fileType: 'csv' | 'xlsx'; sheetName: string; columns: string[]; preview: Record<string, string>[]; totalRows: number; validRows: number; errors: string[]; status: 'Previsualizada' | 'Confirmada' | 'Falhou'; importedBy: string; createdAt: string };
export type HistoricalActivationImportPreview = { previewId: string; fileName: string; sheetName: string; target: string; canWrite: boolean; totalRows: number; parsedRows: number; importableRows: number; alreadyInSystem: number; duplicatesWithinFile: number; conflictingOrderRows: number; conflicts: { orderNumber: string; rows: { rowNumber: number; openedAt: string; assignedAt?: string; executedAt: string }[] }[]; missingOpeningDate: number; missingFinishedDate: number; missingOrder: number; missingReason: number; missingOlt: number; missingTechnician: number; unmatchedTechnicians: string[]; omittedLongNeighborhood: number; omittedLongSlotPon: number; byType: Record<string, number>; sample: { rowNumber: number; orderNumber: string; type: string; status: CallStatus; openedAt: string; executedAt?: string; region: string; technicianName?: string }[] };
export type CurrentCallsImportPreview = { previewId: string; fileName: string; sheetName: string; target: string; canWrite: boolean; totalRows: number; parsedRows: number; importableRows: number; alreadyInSystem: number; duplicateRows: number; invalidRows: number[]; missingFinishRows: number[]; ignoredFinishRows: number[]; unmatchedTechnicians: string[]; byStatus: Partial<Record<CallStatus, number>>; sample: { rowNumber: number; orderNumber: string; status: CallStatus; openedAt: string; executedAt?: string; region: string; technicianName?: string }[] };
export type D0BaseSummary = { fileName?: string; rowCount: number; uploadedBy?: string; uploadedAt?: string };
export type DashboardMetrics = { receivedToday: number; open: number; unassigned: number; inProgress: number; finished: number; cancelled: number; pendingActivations: number; byStatus: { label: string; value: number }[]; byRegion: { label: string; value: number }[]; byNeighborhood: { label: string; value: number }[]; byTechnician: { label: string; value: number }[]; byType: { label: string; value: number }[] };
export type ManualProductionRecord = { activityType: string; technician: string; status: string; order: string; inicio: string; tempo: string };
export type ManualProductionData = { activities: { type: string; pending: number; enRoute: number; started: number; concluded: number; cancelled: number; suspended: number; total: number }[]; technicians: { name: string; pending: number; enRoute: number; started: number; concluded: number; cancelled: number; suspended: number; total: number }[]; orders: { order: string; technician: string; inicio: string; tempo: string }[]; records?: ManualProductionRecord[]; updatedAt: string };
export type ManualDailyBase = { businessDate: string; fileName: string; data: ManualProductionData; uploadedBy: string; updatedAt: string };
export type SystemSettings = { autoRefresh: boolean; refreshIntervalSeconds: number; slaAlertHours: number; defaultRegion: string };
export type OltRegionMapping = { olt: string; region: string; defaultRegion?: string };
export type OltRegionRequest = { id: string; olt: string; source: string; status: 'Pendente' | 'Adicionada' | 'Ignorada'; occurrences: number; firstSeenAt: string; lastSeenAt: string; region?: string };
export type AppNotification = { id: string; type: 'warning' | 'info'; title: string; detail: string; href: string };
export type CallListQuery = { from?: string; to?: string; teamScope?: boolean; search?: string; region?: string; neighborhood?: string; olt?: string; hasTechnician?: boolean; page?: number; pageSize?: number; sort?: 'openedAt' | 'status' | 'region' | 'technicianName' | 'client' | 'orderNumber'; direction?: 'asc' | 'desc'; };
export type CallListResult = { calls: Call[]; total: number; page: number; pageSize: number; totalPages: number; olts: string[] };
export type IgpGroup = { orders: number; outliers: number; onTime: number; totalRepairHours: number; outlierPercent: number | null; onTimePercent: number | null; mttrHours: number | null };
export type IgpArea = 'ALL' | 'SP' | 'GRU' | 'ALTO_TIETE';
export type IgpMetrics = { month: string; area: IgpArea; access: IgpGroup; backbone: IgpGroup; total: IgpGroup; excludedOrders: number };
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
async function requestCallMutation<T>(path: string, init: RequestInit = {}) {
  const result = await request<T>(path, init);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('jh-redeflow:calls-changed'));
  return result;
}
export const api = {
  login: (email: string, password: string) => request<Session>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<{ user: User & { role: Role } }>('/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) => request<{ user: User & { role: Role } }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  dashboard: (filters?: { from?: string; to?: string }) => request<{ metrics: DashboardMetrics }>(`/api/dashboards/operacao${filters?.from || filters?.to ? `?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value) as string[][])}` : ''}`),
  igp: (month: string, area: IgpArea = 'ALL') => request<{ igp: IgpMetrics }>(`/api/dashboards/igp?month=${encodeURIComponent(month)}&area=${encodeURIComponent(area)}`),
  dailyBase: () => request<{ base?: ManualDailyBase }>('/api/dashboards/painel-diario/base'),
  saveDailyBase: (fileName: string, data: ManualProductionData) => request<{ base: ManualDailyBase }>('/api/dashboards/painel-diario/base', { method: 'PUT', body: JSON.stringify({ fileName, data }) }),
  clearDailyBase: () => request<{ deleted: boolean }>('/api/dashboards/painel-diario/base', { method: 'DELETE' }),
  notifications: () => request<{ notifications: AppNotification[] }>('/api/notificacoes'),
  users: () => request<{ users: User[] }>('/api/users'),
  roles: () => request<{ roles: Role[]; permissions: Permission[] }>('/api/roles'),
  technicians: () => request<{ technicians: Technician[] }>('/api/tecnicos'),
  createTechnician: (data: Omit<Technician, 'id' | 'supervisorName' | 'leadTechnicianName'>) => request<{ technician: Technician }>('/api/tecnicos', { method: 'POST', body: JSON.stringify(data) }),
  updateTechnician: (id: string, data: { name?: string; registration?: string; region?: string; shift?: string; supervisorId?: string; currentStatus?: Technician['currentStatus']; active?: boolean; employmentStatus?: Technician['employmentStatus']; teamRole?: Technician['teamRole']; leadTechnicianId?: string | null }) => request<{ technician: Technician }>(`/api/tecnicos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTechnician: (id: string) => request<{ deleted: boolean }>(`/api/tecnicos/${id}`, { method: 'DELETE' }),
  supervisors: () => request<{ supervisors: Supervisor[]; technicians: Technician[] }>('/api/supervisores'),
  createSupervisor: (data: Omit<Supervisor, 'id' | 'technicianCount'>) => request<{ supervisor: Supervisor }>('/api/supervisores', { method: 'POST', body: JSON.stringify(data) }),
  updateSupervisor: (id: string, data: { userId?: string | null; name?: string; region?: string; active?: boolean }) => request<{ supervisor: Supervisor }>(`/api/supervisores/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSupervisor: (id: string) => request<{ deleted: boolean }>(`/api/supervisores/${id}`, { method: 'DELETE' }),
  calls: (status?: CallStatus | CallStatus[], filters: CallListQuery = {}) => {
    const params = new URLSearchParams();
    if (status) params.set('status', Array.isArray(status) ? status.join(',') : status);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.teamScope) params.set('teamScope', 'true');
    if (filters.search) params.set('search', filters.search.trim());
    if (filters.region) params.set('region', filters.region);
    if (filters.neighborhood) params.set('neighborhood', filters.neighborhood);
    if (filters.olt) params.set('olt', filters.olt);
    if (filters.hasTechnician !== undefined) params.set('hasTechnician', String(filters.hasTechnician));
    if (filters.page) params.set('page', String(filters.page));
    if (filters.pageSize) params.set('pageSize', String(Math.min(Math.max(filters.pageSize, 1), 100)));
    if (filters.sort) params.set('sort', filters.sort);
    if (filters.direction) params.set('direction', filters.direction);
    return request<CallListResult>(`/api/chamados${params.toString() ? `?${params}` : ''}`);
  },
  call: (id: string, filters?: { teamScope?: boolean }) => request<{ call: Call }>(`/api/chamados/${id}${filters?.teamScope ? '?teamScope=true' : ''}`),
  updateCall: (id: string, data: Partial<Pick<Call, 'orderNumber' | 'bdesk' | 'officeTrack' | 'client' | 'type' | 'reason' | 'region' | 'city' | 'address' | 'bairro' | 'olt' | 'slotPon' | 'status' | 'notes'>> & { technicianId?: string | null }) => requestCallMutation<{ call: Call }>(`/api/chamados/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  finishCall: (id: string, data: { result: string; executedAt: string; notes: string }) => requestCallMutation<{ call: Call; missing?: string[] }>(`/api/chamados/${id}/finalizar`, { method: 'POST', body: JSON.stringify(data) }),
  cancelCall: (id: string, reason: string) => requestCallMutation<{ call: Call }>(`/api/chamados/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ reason }) }),
  deleteCall: (id: string) => requestCallMutation<{ deleted: boolean }>(`/api/chamados/${id}`, { method: 'DELETE' }),
  deleteAllCalls: () => requestCallMutation<{ deleted: number }>('/api/chamados', { method: 'DELETE' }),
  reopenCall: (id: string) => requestCallMutation<{ call: Call }>(`/api/chamados/${id}/reabrir`, { method: 'POST' }),
  observations: (id: string, filters?: { teamScope?: boolean }) => request<{ observations: CallObservation[] }>(`/api/chamados/${id}/observacoes${filters?.teamScope ? '?teamScope=true' : ''}`),
  addObservation: (id: string, text: string, attachments: CallObservationAttachmentUpload[] = [], filters?: { teamScope?: boolean }) => request<{ observation: CallObservation }>(`/api/chamados/${id}/observacoes${filters?.teamScope ? '?teamScope=true' : ''}`, { method: 'POST', body: JSON.stringify({ text, attachments }) }),
  observationAttachment: (callId: string, observationId: string, attachmentId: string, filters?: { teamScope?: boolean }) => request<{ attachment: CallObservationAttachmentContent }>(`/api/chamados/${callId}/observacoes/${observationId}/anexos/${attachmentId}${filters?.teamScope ? '?teamScope=true' : ''}`),
  auditLogs: (id: string) => request<{ logs: CallAuditLog[] }>(`/api/chamados/${id}/logs`),
  activations: (status?: Activation['status']) => request<{ activations: Activation[] }>(`/api/acionamentos${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  acceptActivation: (id: string) => requestCallMutation<{ activation: Activation; call?: Call }>(`/api/acionamentos/${id}/aceitar`, { method: 'POST' }),
  rejectActivation: (id: string, reason: string) => request<{ activation: Activation }>(`/api/acionamentos/${id}/recusar`, { method: 'POST', body: JSON.stringify({ reason }) }),
  imports: () => request<{ imports: ImportRecord[] }>('/api/importacoes'),
  d0Base: () => request<{ base: D0BaseSummary }>('/api/importacoes/d0'),
  importD0: (fileName: string, content: string) => requestCallMutation<{ sync: { rows: number; matchedCalls: number; updatedCalls: number; unmatchedRows: number }; base: D0BaseSummary }>('/api/importacoes/d0', { method: 'POST', body: JSON.stringify({ fileName, content }) }),
  clearD0Base: () => request<{ deleted: number; base: D0BaseSummary }>('/api/importacoes/d0', { method: 'DELETE' }),
  previewImport: (fileName: string, content: string) => request<{ import: ImportRecord }>('/api/importacoes/preview', { method: 'POST', body: JSON.stringify({ fileName, content }) }),
  confirmImport: (id: string) => request<{ import: ImportRecord }>(`/api/importacoes/${id}/confirmar`, { method: 'POST' }),
  syncGoogleDrive: () => requestCallMutation<{ sync: { files: number; rows: number; processed: number; newRecords: number; updated: number; unchanged: number; unmatched: number; skipped: number; errors: string[] } }>('/api/integrations/google-drive/sync', { method: 'POST' }),
  previewHistoricalActivationImport: (fileName: string, contentBase64: string) => request<HistoricalActivationImportPreview>('/api/importacoes/acionamentos-historicos/preview', { method: 'POST', body: JSON.stringify({ fileName, contentBase64 }) }),
  confirmHistoricalActivationImport: (previewId: string) => requestCallMutation<{ imported: number; skippedAlreadyPresent: number; fileName: string }>(`/api/importacoes/acionamentos-historicos/${encodeURIComponent(previewId)}/confirmar`, { method: 'POST' }),
  previewCurrentCallsImport: (fileName: string, contentBase64: string) => request<CurrentCallsImportPreview>('/api/importacoes/chamados-atuais/preview', { method: 'POST', body: JSON.stringify({ fileName, contentBase64 }) }),
  confirmCurrentCallsImport: (previewId: string) => requestCallMutation<{ imported: number; skippedAlreadyPresent: number; fileName: string }>(`/api/importacoes/chamados-atuais/${encodeURIComponent(previewId)}/confirmar`, { method: 'POST' }),
  createUser: (data: { name: string; email: string; roleId: string; password: string }) => request<{ user: User }>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: { name?: string; email?: string; roleId?: string; active?: boolean; password?: string }) => request<{ user: User }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request<{ deleted: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),
  createRole: (data: { name: string; description: string; permissions: string[] }) => request<{ role: Role }>('/api/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (id: string, data: { name?: string; description?: string; permissions?: string[] }) => request<{ role: Role }>(`/api/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  settings: () => request<{ settings: SystemSettings }>('/api/configuracoes'),
  updateSettings: (data: Partial<SystemSettings>) => request<{ settings: SystemSettings }>('/api/configuracoes', { method: 'PATCH', body: JSON.stringify(data) }),
  customOperationalRegions: () => request<{ regions: string[] }>('/api/configuracoes/regioes'),
  addCustomOperationalRegion: (region: string) => request<{ region: string }>('/api/configuracoes/regioes', { method: 'POST', body: JSON.stringify({ region }) }),
  oltRegionMappings: () => request<{ mappings: OltRegionMapping[] }>('/api/configuracoes/olt-regioes'),
  saveOltRegionMappings: (mappings: Array<Pick<OltRegionMapping, 'olt' | 'region'>>) => request<{ mappings: OltRegionMapping[] }>('/api/configuracoes/olt-regioes', { method: 'PUT', body: JSON.stringify({ mappings }) }),
  oltRegionRequests: () => request<{ requests: OltRegionRequest[] }>('/api/configuracoes/olt-regioes/solicitacoes'),
  acceptOltRegionRequest: (id: string, region: string) => request<{ olt: string; region: string }>(`/api/configuracoes/olt-regioes/solicitacoes/${encodeURIComponent(id)}/adicionar`, { method: 'POST', body: JSON.stringify({ region }) }),
  ignoreOltRegionRequest: (id: string) => request<{ ignored: boolean; olt: string }>(`/api/configuracoes/olt-regioes/solicitacoes/${encodeURIComponent(id)}/ignorar`, { method: 'POST' })
};