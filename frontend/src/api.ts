const isVercelDeployment = import.meta.env.PROD && typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app');
const API_URL = (isVercelDeployment ? '' : import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3333' : 'https://jh-redeflow-api.onrender.com')).replace(/\/+$/, '');
export type Permission = { code: string; description: string };
export type Role = { id: string; name: string; description: string; permissions: string[]; hiddenTabs?: string[] };
export type User = { id: string; name: string; email: string; roleId: string; active: boolean; createdAt: string; mustChangePassword?: boolean; role?: Role; online?: boolean; lastSeenAt?: string };
export type Technician = { id: string; supervisorId?: string; name: string; registration: string; supervisorName?: string; region: string; shift: string; currentStatus: 'Disponivel' | 'Em campo' | 'Indisponivel'; active: boolean; employmentStatus: 'Trabalhando' | 'Demitido'; activeOverride?: boolean; teamRole: 'Tecnico' | 'Auxiliar'; leadTechnicianId?: string | null; leadTechnicianName?: string };
export type Supervisor = { id: string; userId?: string; name: string; region: string; active: boolean; technicianCount: number };
// GIGA+: chamado tratado pelo outro escritorio (GIGA+). Chega nos mesmos grupos, mas nao e da Rede SP:
// fica encerrado para a fila e fora dos indicadores (Visao geral, relatorios, prazo, IGP).
export type CallStatus = 'Aberto' | 'Atribuido' | 'Atrelado' | 'Deslocamento' | 'Em campo' | 'Finalizado' | 'Cancelado' | 'Baixar' | 'GIGA+';
// Encerrado de verdade. GIGA+ fica aberto (aceita observacoes e edicao) ate o OFS mostrar a atividade concluida.
export const CLOSED_CALL_STATUSES: CallStatus[] = ['Finalizado', 'Cancelado', 'Baixar'];
export function isCallClosed(call: { status: CallStatus; ofsStatus?: string | null }) {
  if (CLOSED_CALL_STATUSES.includes(call.status)) return true;
  return call.status === 'GIGA+' && /^(conclu|finaliz|encerrad|executad)/.test(String(call.ofsStatus || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase());
}
export type Call = { id: string; orderNumber: string; bdesk: string; officeTrack: string; client: string; type: string; reason: string; region: string; city: string; address?: string; bairro?: string; ofsStatus?: string; olt: string; slotPon: string; status: CallStatus; atrelada?: string; technicianId?: string; technicianName?: string; supervisorName?: string; supportTechnicianId?: string; supportTechnicianName?: string; openedAt: string; eventAt?: string; assignedAt?: string; executedAt?: string | null; result?: string; cancellationReason?: string; cluster?: string; closingReason?: string; closingSubreason?: string; cableType?: string; notes: string; lastObservationAt?: string };
export type CallObservationAttachment = { id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string };
export type CallObservationAttachmentUpload = Pick<CallObservationAttachment, 'fileName' | 'mimeType' | 'sizeBytes'> & { contentBase64: string };
export type CallObservationAttachmentContent = CallObservationAttachment & { observationId: string; contentBase64: string };
export type CallObservation = { id: string; callId: string; userId: string; userName: string; text: string; createdAt: string; attachments: CallObservationAttachment[] };
export type CallAuditLog = { id: string; callId: string; userId: string; userName: string; action: string; field: string; previousValue: string; newValue: string; createdAt: string };
export type Activation = { id: string; source: string; originalMessage: string; receivedAt: string; status: 'Pendente' | 'Processando' | 'Aceito' | 'Recusado'; extractedData: Record<string, string>; analysis?: Record<string, unknown> & { atrelada?: string | null }; decisionBy?: string; decisionAt?: string; createdCallId?: string; rejectionReason?: string };
export type ImportRecord = { id: string; fileName: string; fileType: 'csv' | 'xlsx'; sheetName: string; columns: string[]; preview: Record<string, string>[]; totalRows: number; validRows: number; errors: string[]; status: 'Previsualizada' | 'Confirmada' | 'Falhou'; importedBy: string; createdAt: string };
export type HistoricalActivationImportPreview = { previewId: string; fileName: string; sheetName: string; target: string; canWrite: boolean; totalRows: number; parsedRows: number; importableRows: number; alreadyInSystem: number; duplicatesWithinFile: number; conflictingOrderRows: number; conflicts: { orderNumber: string; rows: { rowNumber: number; openedAt: string; assignedAt?: string; executedAt: string }[] }[]; missingOpeningDate: number; missingFinishedDate: number; missingOrder: number; missingReason: number; missingOlt: number; missingTechnician: number; unmatchedTechnicians: string[]; omittedLongNeighborhood: number; omittedLongSlotPon: number; byType: Record<string, number>; sample: { rowNumber: number; orderNumber: string; type: string; status: CallStatus; openedAt: string; executedAt?: string; region: string; technicianName?: string }[] };
export type CurrentCallsImportPreview = { previewId: string; fileName: string; sheetName: string; target: string; canWrite: boolean; totalRows: number; parsedRows: number; importableRows: number; alreadyInSystem: number; duplicateRows: number; invalidRows: number[]; missingFinishRows: number[]; ignoredFinishRows: number[]; unmatchedTechnicians: string[]; byStatus: Partial<Record<CallStatus, number>>; sample: { rowNumber: number; orderNumber: string; status: CallStatus; openedAt: string; executedAt?: string; region: string; technicianName?: string }[] };
export type D0BaseSummary = { fileName?: string; rowCount: number; uploadedBy?: string; uploadedAt?: string };
export type SlaBreakdown = { onTime: number; late: number; outlier: number };
export type DueSoonCall = { id: string; orderNumber: string; type: string; region: string; technicianName?: string; openedAt: string; status: CallStatus; minutesLeft: number };
export type DueSoonResult = { dueSoon: DueSoonCall[]; late: number; windowMinutes: number };
export type DashboardActiveCall = { id: string; orderNumber: string; type: string; region: string; status: CallStatus; technicianName?: string; openedAt: string };
export type DashboardMetrics = {
  receivedToday: number; open: number; unassigned: number; inProgress: number; finished: number; cancelled: number; pendingActivations: number;
  byStatus: { label: string; value: number }[]; byRegion: { label: string; value: number }[]; byNeighborhood: { label: string; value: number }[]; byTechnician: { label: string; value: number }[]; byType: { label: string; value: number }[];
  activeTotal: number; activeUnassigned: number; activeSla: SlaBreakdown; oldestActive: DashboardActiveCall[]; activeByTechnician: { label: string; value: number }[];
  openedInPeriod: number; closedSla: SlaBreakdown & { mttrHours: number | null }; daily: { date: string; opened: number; finished: number }[];
};
export type ManualProductionRecord = { activityType: string; technician: string; status: string; order: string; inicio: string; tempo: string };
export type ManualProductionData = { activities: { type: string; pending: number; enRoute: number; started: number; concluded: number; cancelled: number; suspended: number; total: number }[]; technicians: { name: string; pending: number; enRoute: number; started: number; concluded: number; cancelled: number; suspended: number; total: number }[]; orders: { order: string; technician: string; inicio: string; tempo: string }[]; records?: ManualProductionRecord[]; updatedAt: string };
export type ManualDailyBase = { businessDate: string; fileName: string; data: ManualProductionData; uploadedBy: string; updatedAt: string };
export type SystemSettings = { autoRefresh: boolean; refreshIntervalSeconds: number; slaAlertHours: number; defaultRegion: string };
export type OltRegionMapping = { olt: string; region: string; defaultRegion?: string };
export type OltRegionRequest = { id: string; olt: string; source: string; status: 'Pendente' | 'Adicionada' | 'Ignorada'; occurrences: number; firstSeenAt: string; lastSeenAt: string; region?: string };
export type AppNotification = { id: string; type: 'warning' | 'info'; title: string; detail: string; href: string; count?: number };
export type CallListQuery = { from?: string; to?: string; teamScope?: boolean; search?: string; region?: string; area?: 'SP' | 'GRU' | 'ALTO_TIETE' | 'ABC'; neighborhood?: string; olt?: string; hasTechnician?: boolean; gigaClosed?: boolean; page?: number; pageSize?: number; sort?: 'openedAt' | 'status' | 'region' | 'technicianName' | 'client' | 'orderNumber'; direction?: 'asc' | 'desc'; };
export type CallListResult = { calls: Call[]; total: number; page: number; pageSize: number; totalPages: number; olts: string[] };
export type IgpGroup = { orders: number; outliers: number; onTime: number; totalRepairHours: number; outlierPercent: number | null; onTimePercent: number | null; mttrHours: number | null };
export type IgpArea = 'ALL' | 'SP' | 'GRU' | 'ALTO_TIETE' | 'ABC';
export type SlaArea = IgpArea | 'OUTRAS';
export type LateCallRow = { id: string; orderNumber: string; bdesk: string; type: string; reason: string; area: string; cluster?: string; region: string; bairro: string; olt: string; technicianName: string; supervisorName: string; openedAt: string; executedAt: string; hours: number; state: 'late' | 'outlier'; result: string; closingReason: string; closingSubreason: string; cableType: string };
export type SlaCounters = { orders: number; lost: number; outliers: number; lostPercent: number | null; outlierPercent: number | null; avgHours: number | null; avgExecutionHours: number | null; withExecution: number };
export type SlaRankItem = SlaCounters & { name: string; detail?: string };
export type SlaHourItem = SlaCounters & { hour: number };
export type SlaShiftStudy = SlaCounters & { avgWaitHours: number | null; withAssignment: number };
export type SlaAnalysis = {
  from: string; to: string; area: SlaArea; total: SlaCounters; technicians: SlaRankItem[]; neighborhoods: SlaRankItem[]; byOpeningHour: SlaHourItem[]; heatmap: (SlaCounters & { weekday: number; band: number })[];
  incoming: { days: number; opened: number; avgPerDay: number | null; byWeekday: { weekday: number; avgPerDay: number | null; opened: number }[]; byHour: { hour: number; avgPerDay: number | null; opened: number }[]; nightShare: number | null };
  night: { day: SlaShiftStudy; night: SlaShiftStudy; crossedMorning: number; lostClosingHours: { hour: number; count: number }[]; byOpeningHour: SlaHourItem[]; byType: SlaRankItem[]; technicians: SlaRankItem[]; reasons: SlaRankItem[]; byWeekday: (SlaCounters & { weekday: number })[]; insights: string[] };
};
export type IgpGoalPlan = { goal: number; met: boolean; streak: number | null; projected: null | { remainingOrders: number; required: number; requiredPercent: number | null; possible: boolean; slack: number | null } };
export type IgpPlan = { month: string; currentMonth: boolean; elapsedDays: number; daysInMonth: number; orders: number; onTime: { target: IgpGoalPlan; minimum: IgpGoalPlan }; outlier: { target: IgpGoalPlan; minimum: IgpGoalPlan }; mttr: { target: IgpGoalPlan; minimum: IgpGoalPlan } };
export type IgpMetrics = { month: string; area: IgpArea; access: IgpGroup; backbone: IgpGroup; total: IgpGroup; excludedOrders: number };
export type PublicView = {
  state: 'aguardando' | 'recusado' | 'chamado';
  card: { tipo: string | null; bdesk: string | null; officeTrack: string | null; evento: string | null; afetacao: number | string | null; olt: string | null; placaPon: string | null; enderecos: string[]; recebidoEm: string };
  decidedAt?: string | null;
  call?: { orderNumber: string; status: string; ofsStatus: string | null; technicianName: string | null; openedAt: string; executedAt: string | null; type: string; region: string; bairro: string; olt: string; slotPon: string; result: string | null };
  observations?: { text: string; userName: string; createdAt: string }[];
  timeline?: { at: string; text: string }[];
};
export type Session = { token: string; user: User & { role: Role } };
// Respostas de leitura (GET) ficam guardadas em memoria com o ETag do servidor. Na proxima leitura o navegador
// pergunta "mudou algo?" (If-None-Match): se nao mudou, o servidor responde 304 sem corpo e reaproveitamos o mesmo
// objeto, entao a tela nem redesenha. So em memoria: dados de clientes nao ficam gravados no aparelho, e tudo
// some ao sair (clearResponseCache) ou fechar a aba.
const RESPONSE_CACHE_LIMIT = 80;
const responseCache = new Map<string, { etag: string; payload: unknown }>();
export function clearResponseCache() {
  responseCache.clear();
}
// Trafego estimado do Supabase (Configuracoes -> Trafego do banco).
export type SystemStatusLevel = 'ok' | 'warn' | 'down' | 'unknown';
export type SystemStatus = { status: SystemStatusLevel; checkedAt: string; components: { key: string; label: string; status: SystemStatusLevel; detail: string; checkedAt: string }[] };
export type PopKey = { id: string; pop: string; status: 'Base' | 'Retirada' | 'A conferir'; holderName: string | null; holderKind: 'Tecnico' | 'Supervisor' | 'Outro' | null; holderId: string | null; takenAt: string | null; notes: string | null; currentMovementId: string | null; hasPhoto: boolean; updatedAt: string };
export type PopKeyMovement = { id: string; popKeyId: string; action: 'Retirada' | 'Devolucao' | 'Ajuste'; holderName: string | null; holderKind: string | null; holderId: string | null; hasPhoto: boolean; notes: string | null; happenedAt: string; userName: string | null };
export type SupervisorOverview = {
  filters: { from: string; to: string; today: string; region?: string; type?: string };
  month: { from: string; entrantes: number; perDay: number }; week: { from: string; entrantes: number; perDay: number };
  period: { days: number; perDay: number; entrantes: number; finalizados: number; tmeHours: number | null };
  byRegion: { region: string; entrantes: number; finalizados: number; tmeHours: number | null }[];
  byHour: { hour: number; entrantes: number }[]; byDay: { day: string; entrantes: number; finalizados: number }[]; types: string[]; regions: string[];
};
export type BackupStatus = { configured: boolean; retentionDays: number; hour: number; running: boolean; scriptTemplate: string; history: { ok: boolean; summary: string; createdAt: string; gzipBytes: number | null }[] };
export type DbUsageReport = {
  supabase: boolean; limitBytes: number; last30DaysBytes: number; percent: number; projected30DaysBytes: number;
  mode: 'normal' | 'economia' | 'economia_forte'; trackedDays: number; today: { bytes: number; requests: number };
  daily: { day: string; bytes: number; requests: number }[]; topTargets: { name: string; bytes: number; requests: number }[];
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('jh-redeflow-token');
  const isRead = !init.method || init.method.toUpperCase() === 'GET';
  const cacheKey = `${token ? token.slice(-16) : 'anon'}|${path}`;
  const cached = isRead ? responseCache.get(cacheKey) : undefined;
  const response = await fetch(`${API_URL}${path}`, { ...init, ...(isRead ? { cache: 'no-store' as RequestCache } : {}), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cached ? { 'If-None-Match': cached.etag } : {}), ...init.headers } });
  if (response.status === 304 && cached) {
    responseCache.delete(cacheKey);
    responseCache.set(cacheKey, cached);
    return cached.payload as T;
  }

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
    const fallbackMessage = `A API respondeu com ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`;
    const error = new Error(payload.message || fallbackMessage) as Error & { missing?: string[] };
    error.missing = payload.missing;
    throw error;
  }
  const etag = isRead ? response.headers.get('ETag') : null;
  if (etag) {
    responseCache.delete(cacheKey);
    responseCache.set(cacheKey, { etag, payload });
    while (responseCache.size > RESPONSE_CACHE_LIMIT) responseCache.delete(responseCache.keys().next().value as string);
  }
  return payload;
}
async function requestCallMutation<T>(path: string, init: RequestInit = {}) {
  const result = await request<T>(path, init);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('jh-redeflow:calls-changed'));
  return result;
}
// Perfil: apelido (so para a propria pessoa) e tema de cor; palette nulo = Padrao.
export type ProfilePreferences = { nickname: string | null; palette: string | null };
// Relatorios do lote 2.
export type ProductivityRow = { name: string; detail?: string; finished: number; onTime: number; late: number; outliers: number; onTimePercent: number | null; avgHours: number | null };
export type ProductivityReport = { total: number; technicians: ProductivityRow[]; supervisors: ProductivityRow[] };
export type ReasonsReport = { total: number; withReason: number; withoutReason: number; reasons: { reason: string; count: number; percent: number | null; avgHours: number; byArea: Record<string, number>; subreasons: { name: string; count: number }[] }[]; byMonth: { month: string; total: number; top: { reason: string; count: number }[] }[] };
export type PeriodMetrics = { from: string; to: string; opened: number; finished: number; onTime: number; late: number; outliers: number; onTimePercent: number | null; outlierPercent: number | null; avgHours: number | null; cancelled: number };
export type CompareReport = { days: number; current: PeriodMetrics; previous: PeriodMetrics };
export type DailySummary = PeriodMetrics & { date: string; activeNow: number; activeLate: number; topTechnicians: ProductivityRow[]; topReasons: { reason: string; count: number }[]; igp: { month: string; orders: number; onTimePercent: number | null; outlierPercent: number | null } };
export type AuditLogRow = CallAuditLog & { orderNumber: string };
// Lote B: sugestao de tecnico, risco e incidentes em massa.
export type TechnicianSuggestion = { technicianId: string; name: string; score: number; reasons: string[]; active: number };
export type CallRisk = { level: 'baixo' | 'medio' | 'alto'; percent: number; reasons: string[] };
export type MassIncident = { key: string; olt: string; region: string; slotPons: string[]; firstAt: string; lastAt: string; calls: { id: string; orderNumber: string; status: string; technicianId?: string; technicianName?: string; openedAt: string; slotPon: string; bairro?: string }[] };
// Operacao (lote 3): mapa da fila, carga dos tecnicos e reincidencia.
export type QueueState = 'ok' | 'soon' | 'late' | 'outlier';
export type MapCall = { id: string; orderNumber: string; type: string; technicianName?: string; status: string; openedAt: string; olt: string; state: QueueState; minutes: number };
export type MapArea = { name: string; total: number; states: Record<QueueState, number>; worst: QueueState; noTechnician: number; calls: MapCall[] };
export type QueueMap = { total: number; states: Record<QueueState, number>; noTechnician: number; regions: (MapArea & { bairros: MapArea[] })[] };
export type TechnicianLoadRow = { id: string; name: string; supervisorName?: string; region: string; currentStatus: string; active: number; oldestMinutes: number | null; worst: QueueState | null; activeCalls: MapCall[]; finishedToday: number; onTimeToday: number; avgHoursToday: number | null; free: boolean };
export type TechnicianLoad = { technicians: TechnicianLoadRow[]; free: number; busy: number; unassignedActive: number };
export type RepeatHistory = { eligible: boolean; isRepeat: boolean; previousWithin30Days: number; history: { id: string; orderNumber: string; status: string; openedAt: string; executedAt?: string; technicianName?: string; result?: string; closingReason?: string; closingSubreason?: string; type: string }[] };
// Lote C: gargalos e mapa de calor.
export type StageStats = { name: string; calls: number; waitMedian: number | null; waitP90: number | null; execMedian: number | null; execP90: number | null; waitShare: number | null; late: number; lateByWait: number };
export type BottleneckReport = { total: StageStats; byRegion: StageStats[]; byTechnician: StageStats[] };
export type HeatmapReport = { weekdayCount: number[]; incoming: number[][]; technicians: number[][]; callsPerTechnician: (number | null)[][]; latePercent: (number | null)[][]; totalIncoming: number };
// Lote D: reincidencia por tecnico e exportacao completa.
export type RepeatRankingRow = { name: string; finished: number; eligible: number; repeated: number; percent: number | null; items: { orderNumber: string; id: string; nextOrder: string; nextId: string; days: number }[] };
export type RepeatRanking = { finished: number; eligible: number; repeated: number; percent: number | null; technicians: RepeatRankingRow[] };
export type FullExport = { calls: Call[]; observations: { id: string; callId: string; userName: string; text: string; attachments: string; createdAt: string }[]; logs: AuditLogRow[]; truncated: boolean };
// Lote E: checklist e tela do tecnico.
export type ChecklistTemplate = { id: string; name: string; callTypes: string[]; items: string[]; active: boolean };
export type FieldCall = Call & { checklist: ChecklistTemplate | null };
// Mesmo criterio do servidor: o do tipo do chamado; sem tipo = vale para todos.
export function checklistForType(type: string, templates: ChecklistTemplate[]): ChecklistTemplate | null {
  const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const active = templates.filter((template) => template.active && template.items.length);
  return active.find((template) => template.callTypes.some((item) => fold(item) === fold(type || ''))) ?? active.find((template) => !template.callTypes.length) ?? null;
}
// Integracao OFS (painel de saude).
export type HealthStatus = 'ok' | 'warn' | 'critical' | 'unknown';
export type StuckReason = 'sem-tecnico' | 'sem-data-fim' | 'sem-fechamento' | 'fechamento-codigo' | 'ordem-duplicada' | 'pronto';
export type IntegrationEventRow = { id: string; kind: string; ok: boolean; summary: string; details: Record<string, unknown>; createdAt: string };
export type IntegrationHealth = {
  checks: { key: string; label: string; status: HealthStatus; lastAt: string | null; detail: string }[];
  stuck: { id: string; orderNumber: string; status: string; ofsStatus?: string; technicianName?: string; openedAt: string; executedAt?: string; region?: string; reasons: StuckReason[]; waitingMinutes: number | null }[];
  reasonLabels: Record<StuckReason, string>;
  events: IntegrationEventRow[];
  d0: { fileName?: string; rowCount: number; uploadedAt?: string; uploadedBy?: string } | null;
  whatsapp: { configured: boolean; chat: string | null; alerts: IntegrationEventRow[] };
};
// Pessoas (diretorio so de leitura, aberto a todos).
export type UserStatus = { text: string; emoji: string; until: string | null };
export type Highlight = { kind: 'most-finished' | 'best-on-time' | 'best-supervisor'; title: string; name: string; detail: string; userId?: string };
export type PersonCard = { id: string; name: string; email: string; roleName: string; online: boolean; lastSeenAt?: string; createdAt: string };

// Baixa o .zip da extensao do Chrome (precisa do login; vem como arquivo, nao JSON).
export async function downloadExtensionZip(): Promise<{ blob: Blob; fileName: string }> {
  const token = localStorage.getItem('jh-redeflow-token');
  const response = await fetch(`${API_URL}/api/extensao/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || `Download recusado (${response.status}).`);
  const fileName = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'jh-redeflow-extensao.zip';
  return { blob: await response.blob(), fileName };
}
export const api = {
  login: (email: string, password: string) => request<Session>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<{ user: User & { role: Role } }>('/api/auth/me'),
  // Consulta publica do informativo (link so de leitura, sem login).
  sendNoticeTest: () => request<{ mode: 'botao' | 'texto'; chat: string }>('/api/integracoes/informativo/teste', { method: 'POST' }),
  extensionInfo: () => request<{ name: string; version: string; fileName: string }>('/api/extensao'),
  publicView: (token: string) => request<PublicView>(`/api/public/consulta/${encodeURIComponent(token)}`),
  // LGPD: os dados pessoais da propria pessoa, para baixar em JSON (Meu perfil).
  myData: () => request<Record<string, unknown>>('/api/auth/meus-dados'),
  logout: () => request<void>('/api/auth/logout', { method: 'POST', keepalive: true }),
  profileAvatar: () => request<{ avatarDataUrl: string | null }>('/api/auth/avatar'),
  saveProfileAvatar: (avatarDataUrl: string) => request<{ avatarDataUrl: string }>('/api/auth/avatar', { method: 'PUT', body: JSON.stringify({ avatarDataUrl }) }),
  removeProfileAvatar: () => request<{ deleted: boolean }>('/api/auth/avatar', { method: 'DELETE' }),
  profileBanner: () => request<{ bannerDataUrl: string | null }>('/api/auth/banner'),
  saveProfileBanner: (bannerDataUrl: string) => request<{ bannerDataUrl: string }>('/api/auth/banner', { method: 'PUT', body: JSON.stringify({ bannerDataUrl }) }),
  removeProfileBanner: () => request<{ deleted: boolean }>('/api/auth/banner', { method: 'DELETE' }),
  profilePreferences: () => request<ProfilePreferences>('/api/auth/preferences'),
  integrationHealth: () => request<IntegrationHealth>('/api/integracoes/saude'),
  people: () => request<{ people: PersonCard[]; avatars: Record<string, string>; status?: Record<string, UserStatus> }>('/api/people'),
  person: (id: string) => request<{ person: PersonCard; avatar: string | null; banner: string | null; status?: UserStatus | null }>(`/api/people/${encodeURIComponent(id)}`),
  myStatus: () => request<{ status: UserStatus | null }>('/api/auth/status'),
  saveMyStatus: (status: UserStatus | null) => request<{ status: UserStatus | null }>('/api/auth/status', { method: 'PUT', body: JSON.stringify(status ?? { status: null }) }),
  markNotificationsRead: (ids?: string[]) => request<{ read: number }>('/api/notificacoes/lidas', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) }),
  highlights: (month?: string) => request<{ month: string; highlights: Highlight[] }>(`/api/destaques${month ? `?month=${month}` : ''}`),
  saveProfilePreferences: (preferences: ProfilePreferences) => request<ProfilePreferences>('/api/auth/preferences', { method: 'PUT', body: JSON.stringify(preferences) }),
  changePassword: (currentPassword: string, newPassword: string) => request<{ user: User & { role: Role } }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  dashboard: (filters?: { from?: string; to?: string }) => request<{ metrics: DashboardMetrics }>(`/api/dashboards/operacao${filters?.from || filters?.to ? `?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value) as string[][])}` : ''}`),
  dueSoon: () => request<DueSoonResult>('/api/chamados/vencendo'),
  auditHistory: (query: { from: string; to: string; page: number; pageSize: number; userId?: string; field?: string; q?: string }) => request<{ logs: AuditLogRow[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/auditoria?${new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value)])).toString()}`),
  technicianSuggestions: (id: string) => request<{ suggestions: TechnicianSuggestion[] }>(`/api/chamados/${encodeURIComponent(id)}/sugestoes`),
  callRisks: (ids: string[]) => request<{ risks: Record<string, CallRisk>; samples: number }>('/api/chamados/risco', { method: 'POST', body: JSON.stringify({ ids }) }),
  massIncidents: () => request<{ incidents: MassIncident[] }>('/api/operacao/incidentes'),
  incidentAction: (body: { callIds: string[]; action: 'assign' | 'observe' | 'finish'; technicianId?: string; text?: string; executedAt?: string }) => request<{ ok: number; results: { callId: string; ok: boolean; message?: string }[] }>('/api/operacao/incidentes/acao', { method: 'POST', body: JSON.stringify(body) }),
  queueMap: () => request<QueueMap>('/api/operacao/mapa'),
  technicianLoad: () => request<TechnicianLoad>('/api/operacao/carga'),
  repeatHistory: (id: string) => request<RepeatHistory>(`/api/chamados/${encodeURIComponent(id)}/reincidencia`),
  repeatFlags: (ids: string[]) => request<{ flags: Record<string, number> }>('/api/chamados/reincidencia', { method: 'POST', body: JSON.stringify({ ids }) }),
  productivityReport: (from: string, to: string, area: SlaArea = 'ALL') => request<ProductivityReport>(`/api/relatorios/produtividade?from=${from}&to=${to}&area=${area}`),
  reasonsReport: (from: string, to: string, area: SlaArea = 'ALL') => request<ReasonsReport>(`/api/relatorios/motivos?from=${from}&to=${to}&area=${area}`),
  bottleneckReport: (from: string, to: string, area: SlaArea = 'ALL') => request<BottleneckReport>(`/api/relatorios/gargalos?from=${from}&to=${to}&area=${area}`),
  heatmapReport: (from: string, to: string, area: SlaArea = 'ALL') => request<HeatmapReport>(`/api/relatorios/mapa-de-calor?from=${from}&to=${to}&area=${area}`),
  repeatRanking: (from: string, to: string, area: SlaArea = 'ALL') => request<RepeatRanking>(`/api/relatorios/reincidencia-tecnico?from=${from}&to=${to}&area=${area}`),
  fullExport: (from: string, to: string) => request<FullExport>(`/api/exportacao?from=${from}&to=${to}`),
  compareReport: (from: string, to: string, area: SlaArea = 'ALL') => request<CompareReport>(`/api/relatorios/comparar?from=${from}&to=${to}&area=${area}`),
  dailySummary: (date: string) => request<{ summary: DailySummary; text: string; whatsapp: { configured: boolean; sendsAt: string } }>(`/api/relatorios/resumo-dia?date=${date}`),
  lateFinishedReport: (from: string, to: string, area: SlaArea = 'ALL') => request<{ calls: LateCallRow[] }>(`/api/relatorios/fora-do-prazo?from=${from}&to=${to}&area=${area}`),
  slaAnalysis: (from: string, to: string, area: SlaArea = 'ALL') => request<{ analysis: SlaAnalysis }>(`/api/dashboards/prazo?from=${from}&to=${to}&area=${area}`),
  igp: (month: string, area: IgpArea = 'ALL') => request<{ igp: IgpMetrics; plan?: IgpPlan }>(`/api/dashboards/igp?month=${encodeURIComponent(month)}&area=${encodeURIComponent(area)}`),
  dailyBase: () => request<{ base?: ManualDailyBase }>('/api/dashboards/painel-diario/base'),
  saveDailyBase: (fileName: string, data: ManualProductionData) => request<{ base: ManualDailyBase }>('/api/dashboards/painel-diario/base', { method: 'PUT', body: JSON.stringify({ fileName, data }) }),
  clearDailyBase: () => request<{ deleted: boolean }>('/api/dashboards/painel-diario/base', { method: 'DELETE' }),
  notifications: () => request<{ notifications: AppNotification[] }>('/api/notificacoes'),
  users: () => request<{ users: User[] }>('/api/users'),
  checklists: () => request<{ templates: ChecklistTemplate[] }>('/api/checklists'),
  saveChecklists: (templates: Omit<ChecklistTemplate, 'id'>[] & { id?: string }[]) => request<{ templates: ChecklistTemplate[] }>('/api/checklists', { method: 'PUT', body: JSON.stringify({ templates }) }),
  technicianLinks: () => request<{ links: Record<string, string> }>('/api/tecnicos/vinculos'),
  setTechnicianUser: (technicianId: string, userId: string | null) => request<{ ok: boolean }>(`/api/tecnicos/${encodeURIComponent(technicianId)}/usuario`, { method: 'PUT', body: JSON.stringify({ userId }) }),
  fieldMe: () => request<{ technician: { id: string; name: string } | null }>('/api/campo/eu'),
  fieldCalls: () => request<{ technician: { id: string; name: string }; calls: FieldCall[] }>('/api/campo/chamados'),
  fieldStatus: (id: string, status: 'Deslocamento' | 'Em campo') => request<{ call: Call }>(`/api/campo/chamados/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  fieldObservation: (id: string, text: string, photos: { fileName: string; mimeType: string; sizeBytes: number; contentBase64: string }[]) => request<{ observation: unknown }>(`/api/campo/chamados/${encodeURIComponent(id)}/observacao`, { method: 'POST', body: JSON.stringify({ text, photos }) }),
  fieldFinish: (id: string, text: string, checklist: string[]) => request<{ call: Call }>(`/api/campo/chamados/${encodeURIComponent(id)}/finalizar`, { method: 'POST', body: JSON.stringify({ text, checklist }) }),
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
    if (filters.area) params.set('area', filters.area);
    if (filters.neighborhood) params.set('neighborhood', filters.neighborhood);
    if (filters.olt) params.set('olt', filters.olt);
    if (filters.hasTechnician !== undefined) params.set('hasTechnician', String(filters.hasTechnician));
    if (filters.gigaClosed !== undefined) params.set('gigaClosed', String(filters.gigaClosed));
    if (filters.page) params.set('page', String(filters.page));
    if (filters.pageSize) params.set('pageSize', String(Math.min(Math.max(filters.pageSize, 1), 100)));
    if (filters.sort) params.set('sort', filters.sort);
    if (filters.direction) params.set('direction', filters.direction);
    return request<CallListResult>(`/api/chamados${params.toString() ? `?${params}` : ''}`);
  },
  call: (id: string, filters?: { teamScope?: boolean }) => request<{ call: Call }>(`/api/chamados/${id}${filters?.teamScope ? '?teamScope=true' : ''}`),
  updateCall: (id: string, data: Partial<Pick<Call, 'orderNumber' | 'bdesk' | 'officeTrack' | 'client' | 'type' | 'reason' | 'region' | 'city' | 'address' | 'bairro' | 'olt' | 'slotPon' | 'status' | 'openedAt' | 'notes'>> & { technicianId?: string | null }) => requestCallMutation<{ call: Call }>(`/api/chamados/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // Corrige so a Data Fim ("AAAA-MM-DDTHH:mm" no horario de Sao Paulo), mesmo com o chamado encerrado.
  updateCallEndDate: (id: string, executedAt: string) => requestCallMutation<{ call: Call }>(`/api/chamados/${id}/data-fim`, { method: 'PUT', body: JSON.stringify({ executedAt }) }),
  finishCall: (id: string, data: { result: string; executedAt: string; notes: string; checklist?: string[] }) => requestCallMutation<{ call: Call; missing?: string[] }>(`/api/chamados/${id}/finalizar`, { method: 'POST', body: JSON.stringify(data) }),
  cancelCall: (id: string, reason: string) => requestCallMutation<{ call: Call }>(`/api/chamados/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ reason }) }),
  deleteCall: (id: string) => requestCallMutation<{ deleted: boolean }>(`/api/chamados/${id}`, { method: 'DELETE' }),
  deleteAllCalls: () => requestCallMutation<{ deleted: number }>('/api/chamados', { method: 'DELETE' }),
  reopenCall: (id: string) => requestCallMutation<{ call: Call }>(`/api/chamados/${id}/reabrir`, { method: 'POST' }),
  // Ultima observacao (texto, autor e hora) de varios chamados de uma vez (ate 100), para a coluna da fila.
  latestObservations: (ids: string[], filters?: { teamScope?: boolean }) => request<{ observations: Record<string, { text: string; userName: string; createdAt: string }> }>(`/api/chamados/ultimas-observacoes?ids=${encodeURIComponent(ids.join(','))}${filters?.teamScope ? '&teamScope=true' : ''}`),
  // SN da ONU do chamado: do card FIELD ou achado no AutoISP pela extensao (contrato do card).
  callSerial: (id: string) => request<{ serialNumber: string | null; source: 'card' | 'autoisp' | null; contract?: string | null; contracts: string[] }>(`/api/chamados/${id}/sn`),
  observations: (id: string, filters?: { teamScope?: boolean }) => request<{ observations: CallObservation[]; banners?: Record<string, string> }>(`/api/chamados/${id}/observacoes${filters?.teamScope ? '?teamScope=true' : ''}`),
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
  previewHistoricalActivationImport: (fileName: string, contentBase64: string) => request<HistoricalActivationImportPreview>('/api/importacoes/acionamentos-historicos/preview', { method: 'POST', body: JSON.stringify({ fileName, contentBase64 }) }),
  confirmHistoricalActivationImport: (previewId: string) => requestCallMutation<{ imported: number; skippedAlreadyPresent: number; fileName: string; createdTechnicians?: string[] }>(`/api/importacoes/acionamentos-historicos/${encodeURIComponent(previewId)}/confirmar`, { method: 'POST' }),
  previewCurrentCallsImport: (fileName: string, contentBase64: string) => request<CurrentCallsImportPreview>('/api/importacoes/chamados-atuais/preview', { method: 'POST', body: JSON.stringify({ fileName, contentBase64 }) }),
  confirmCurrentCallsImport: (previewId: string) => requestCallMutation<{ imported: number; skippedAlreadyPresent: number; fileName: string }>(`/api/importacoes/chamados-atuais/${encodeURIComponent(previewId)}/confirmar`, { method: 'POST' }),
  createUser: (data: { name: string; email: string; roleId: string; password: string }) => request<{ user: User }>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: { name?: string; email?: string; roleId?: string; active?: boolean; password?: string }) => request<{ user: User }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request<{ deleted: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),
  createRole: (data: { name: string; description: string; permissions: string[]; hiddenTabs?: string[] }) => request<{ role: Role }>('/api/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (id: string, data: { name?: string; description?: string; permissions?: string[]; hiddenTabs?: string[] }) => request<{ role: Role }>(`/api/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  settings: () => request<{ settings: SystemSettings }>('/api/configuracoes'),
  dbUsage: () => request<DbUsageReport>('/api/configuracoes/banco'),
  supervisorOverview: (filters: { from: string; to: string; region?: string; type?: string }) => request<SupervisorOverview>(`/api/visao-supervisores?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value) as [string, string][]).toString()}`),
  systemStatus: () => request<SystemStatus>('/api/status'),
  popKeys: () => request<{ keys: PopKey[] }>('/api/chaves'),
  addPopKey: (pop: string) => request<{ key: PopKey }>('/api/chaves', { method: 'POST', body: JSON.stringify({ pop }) }),
  takePopKey: (id: string, data: { holderName: string; holderKind: 'Tecnico' | 'Supervisor' | 'Outro'; holderId: string | null; notes: string | null; photo: string | null; takenAt: string }) => request<{ key: PopKey }>(`/api/chaves/${id}/retirada`, { method: 'POST', body: JSON.stringify(data) }),
  returnPopKey: (id: string, data: { notes: string | null; returnedAt: string }) => request<{ key: PopKey }>(`/api/chaves/${id}/devolucao`, { method: 'POST', body: JSON.stringify(data) }),
  popKeyHistory: (id: string) => request<{ movements: PopKeyMovement[] }>(`/api/chaves/${id}/historico`),
  popKeyPhoto: (movementId: string) => request<{ photo: string }>(`/api/chaves/movimentos/${movementId}/foto`),
  backupStatus: () => request<BackupStatus>('/api/configuracoes/backup'),
  runBackup: () => request<{ ok: true; summary: string; name: string; gzipBytes: number }>('/api/configuracoes/backup', { method: 'POST' }),
  updateSettings: (data: Partial<SystemSettings>) => request<{ settings: SystemSettings }>('/api/configuracoes', { method: 'PATCH', body: JSON.stringify(data) }),
  customOperationalRegions: () => request<{ regions: string[] }>('/api/configuracoes/regioes'),
  addCustomOperationalRegion: (region: string) => request<{ region: string }>('/api/configuracoes/regioes', { method: 'POST', body: JSON.stringify({ region }) }),
  oltRegionMappings: () => request<{ mappings: OltRegionMapping[] }>('/api/configuracoes/olt-regioes'),
  saveOltRegionMappings: (mappings: Array<Pick<OltRegionMapping, 'olt' | 'region'>>) => request<{ mappings: OltRegionMapping[] }>('/api/configuracoes/olt-regioes', { method: 'PUT', body: JSON.stringify({ mappings }) }),
  oltRegionRequests: () => request<{ requests: OltRegionRequest[] }>('/api/configuracoes/olt-regioes/solicitacoes'),
  acceptOltRegionRequest: (id: string, region: string) => request<{ olt: string; region: string }>(`/api/configuracoes/olt-regioes/solicitacoes/${encodeURIComponent(id)}/adicionar`, { method: 'POST', body: JSON.stringify({ region }) }),
  ignoreOltRegionRequest: (id: string) => request<{ ignored: boolean; olt: string }>(`/api/configuracoes/olt-regioes/solicitacoes/${encodeURIComponent(id)}/ignorar`, { method: 'POST' })
};