import { useEffect, useRef, useState } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Copy,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  RefreshCcw,
  Users,
  X,
} from "lucide-react";
import html2canvas from "html2canvas";
import faviconUrl from "../image/favicon.ico";
import * as XLSX from "xlsx";
import {
  api,
  type Call,
  type CallAuditLog,
  type CallObservation,
  type CallStatus,
  type Role,
  type Technician,
  type Supervisor,
  type User,
  type Activation,
  type AppNotification,
  type DashboardMetrics,
  type ImportRecord,
} from "./api";

const operationalRegions = [
  "COLUMBIA", "SERTÃOZINHO", "TURQUESA", "GIULIA", "MAUÁ", "RIBEIRÃO PIRES", "SANTA LUZIA", "CÂMBIO", "CAÇULA",
  "CIDADE TIRADENTES", "CIDADE TIRADENTES 1", "CIDADE TIRADENTES 2", "CIDADE TIRADENTES 3", "FERRAZ DE VASCONCELOS", "FERRAZ DE VASCONCELOS 1", "FERRAZ DE VASCONCELOS 2",
  "GUAIANASES", "GUAIANASES 1", "GUAIANASES 2", "GUARULHOS", "GUARULHOS 1", "GUARULHOS 2", "GUARULHOS 3", "GUARULHOS 4", "GUARULHOS 5",
  "MOGI DAS CRUZES", "MOGI 1", "MOGI 2", "ARICANDUVA", "CAÇAPAVA", "CONQUISTA", "IGUATEMI", "ITAIM PAULISTA", "JACAREÍ", "PALMEIRAS", "PENHA",
  "RIO GRANDE DA SERRA", "SÃO MATEUS", "SÃO MIGUEL PAULISTA", "SÃO RAFAEL", "SUZANO", "PIRAPORINHA", "CAEMA", "SERRARIA", "VITORIA", "DIADEMA",
  "SÃO BERNARDO DOS CAMPOS", "SÃO PAULO",
];

const navItems = [
  {
    label: "Visao geral",
    to: "/",
    icon: LayoutDashboard,
    permission: "dashboard.view",
  },
  {
    label: "Chamados abertos",
    to: "/chamados/abertos",
    icon: ClipboardList,
    permission: "calls.view",
  },
  {
    label: "Em atendimento",
    to: "/chamados/atendimento",
    icon: Activity,
    permission: "calls.view",
  },
  {
    label: "Ordens da equipe",
    to: "/supervisor/ordens",
    icon: Users,
    permission: "calls.view",
    roles: ["Supervisor"],
  },
  {
    label: "Acionamentos",
    to: "/acionamentos",
    icon: ClipboardList,
    permission: "activations.view",
  },
  {
    label: "Painel diario",
    to: "/painel-diario",
    icon: BarChart3,
    permission: "dashboard.view",
  },
  {
    label: "Importacoes",
    to: "/importacoes",
    icon: ClipboardList,
    permission: "imports.view",
  },
  {
    label: "Tecnicos",
    to: "/tecnicos",
    icon: Users,
    permission: "technicians.view",
  },
  {
    label: "Supervisores",
    to: "/supervisores",
    icon: Building2,
    permission: "supervisors.view",
  },
  { label: "Usuarios", to: "/usuarios", icon: Users, permission: "users.view" },
  {
    label: "Cargos e permissoes",
    to: "/cargos",
    icon: ShieldCheck,
    permission: "roles.view",
  },
  {
    label: "Configuracoes",
    to: "/configuracoes",
    icon: Settings,
    permission: "settings.manage",
  },
];

function Login({
  onLogin,
}: {
  onLogin: (session: { token: string; user: User & { role: Role } }) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await api.login(email, password);
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel entrar.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="brand-mark">
          <img className="brand-logo-image" src={faviconUrl} alt="JH Telecom" />
          <div>
            <strong>JH Telecom - Rede</strong>
            <small>O&amp;M</small>
          </div>
        </div>
        <div className="intro-copy">
          <p className="eyebrow">OPERACAO DE REDE</p>
          <h1>Controle operacional da Rede em um só lugar.</h1>
          <p>
            Gerencie ordens, equipes, atendimentos e indicadores de forma
            simples e centralizada.
          </p>
        </div>
        <div className="intro-foot">
          <span>
            <Activity size={16} /> Plataforma em evolução
          </span>
          <span>
            <LockKeyhole size={16} /> Ambiente corporativo
          </span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand">
            <img className="brand-logo-image" src={faviconUrl} alt="JH Telecom" />
            <strong>JH Telecom - Rede</strong>
          </div>
          <div className="form-heading">
            <span className="section-kicker">ACESSO INTERNO</span>
            <h2>Entrar</h2>
            <p>Use sua conta corporativa para acessar o sistema.</p>
          </div>
          <form onSubmit={submit} autoComplete="off">
            <label>
              E-mail
              <input
                type="email"
                autoComplete="on"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="user@jhtelecom.com"
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
                required
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="primary-button" disabled={loading}>
              {loading ? "Entrando..." : "Entrar no sistema"}
              <ChevronRight size={18} />
            </button>
          </form>
          <button className="text-button" type="button">
            Esqueci minha senha
          </button>
        </div>
      </section>
    </main>
  );
}

function Shell({
  user,
  onLogout,
}: {
  user: User & { role: Role };
  onLogout: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => localStorage.getItem("jh-redeflow-sidebar-collapsed") === "true");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activationCount, setActivationCount] = useState(0);
  const [activationToast, setActivationToast] = useState<AppNotification | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const knownActivationIds = useRef<Set<string> | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
        async function loadNotifications() {
    setNotificationsLoading(true);
          try {
            const notificationData = await api.notifications();
            setNotifications(notificationData.notifications);
            if (user.role.permissions.includes("activations.view")) {
              const pending = (await api.activations("Pendente")).activations;
              const pendingIds = new Set(pending.map((activation) => activation.id));
              setActivationCount(pending.length);
              if (knownActivationIds.current) {
                const newActivation = pending.find((activation) => !knownActivationIds.current?.has(activation.id));
                if (newActivation) {
                  setActivationToast({ id: newActivation.id, type: "info", title: "Novo acionamento recebido", detail: newActivation.extractedData.orderNumber ? `Ordem ${newActivation.extractedData.orderNumber} aguardando análise.` : "Existe um acionamento aguardando análise.", href: "/acionamentos" });
                  window.setTimeout(() => setActivationToast(null), 8000);
                }
              }
              knownActivationIds.current = pendingIds;
            }
          } catch { setNotifications([]); } finally { setNotificationsLoading(false); }
  }
  useEffect(() => { void loadNotifications(); const interval = window.setInterval(() => void loadNotifications(), 15000); return () => window.clearInterval(interval); }, [location.pathname]);
  function toggleSidebar() {
    setDesktopCollapsed((current) => {
      const next = !current;
      localStorage.setItem("jh-redeflow-sidebar-collapsed", String(next));
      return next;
    });
  }
  const title =
    location.pathname === "/"
      ? "Visao geral"
      : location.pathname.includes("/chamados/abertos")
        ? "Chamados abertos"
          : location.pathname.includes("/chamados/atendimento")
            ? "Em atendimento"
          : location.pathname === "/supervisor/ordens"
            ? "Ordens da equipe"
          : location.pathname === "/acionamentos"
            ? "Acionamentos"
          : location.pathname === "/painel-diario"
            ? "Painel diario"
          : location.pathname === "/importacoes"
            ? "Importacoes"
          : location.pathname.includes("/chamados/")
            ? "Detalhe do chamado"
            : location.pathname === "/tecnicos"
              ? "Tecnicos"
              : location.pathname === "/supervisores"
                ? "Supervisores"
                : location.pathname === "/usuarios"
                  ? "Usuarios"
                  : location.pathname === "/cargos"
                    ? "Cargos e permissoes"
                    : "Configuracoes";
  return (
    <div className={desktopCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className={`${desktopCollapsed ? "sidebar collapsed" : "sidebar"}${mobileOpen ? " open" : ""}`}>
        <div className="sidebar-brand">
          <img className="brand-logo-image" src={faviconUrl} alt="JH Telecom" />
          <div>
            <strong>JH Telecom - Rede</strong>
            <small>O&amp;M</small>
          </div>
          <button
            className="icon-button sidebar-close"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-dot" />
          <span>Operacao Rede</span>
          <ChevronRight size={15} />
        </div>
        <nav>
          {navItems
            .filter((item) => user.role.permissions.includes(item.permission) && (!item.roles || item.roles.includes(user.role.name)))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                title={desktopCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  isActive ? "nav-item active" : "nav-item"
                }
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.to === "/acionamentos" && activationCount > 0 && <b className="nav-count">{activationCount > 99 ? "99+" : activationCount}</b>}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-link">
            <CircleHelp size={17} />
            <span>Central de ajuda</span>
          </div>
          <div className="profile-mini">
            <div className="avatar">
              {user.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role.name}</small>
            </div>
            <button className="icon-button" onClick={onLogout} title="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}
      <div className="main-area">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            onClick={() => (window.innerWidth <= 900 ? setMobileOpen(true) : toggleSidebar())}
            title={desktopCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>O&amp;M</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <div className="notification-wrap">
              <button className={`icon-button notification ${notificationsLoading ? "is-refreshing" : ""}`} onClick={() => { setNotificationsOpen((current) => !current); void loadNotifications(); }} title="Notificacoes">
                <Bell size={18} />
                {notifications.length > 0 && <i />}
              </button>
              {notificationsOpen && <div className="notification-popover"><div className="notification-heading"><strong>Notificacoes</strong><span>{notifications.length}</span></div>{notifications.length ? notifications.map((notification) => <button className="notification-item" key={notification.id} onClick={() => { setNotificationsOpen(false); navigate(notification.href); }}><b>{notification.title}</b><small>{notification.detail}</small></button>) : <div className="notification-empty">Nenhuma notificacao pendente.</div>}</div>}
            </div>
            <div className="topbar-avatar">{user.name.slice(0, 1)}</div>
          </div>
        </header>
        {activationToast && <button className="activation-toast" type="button" onClick={() => { setActivationToast(null); navigate(activationToast.href); }}><Bell size={18} /><span><strong>{activationToast.title}</strong><small>{activationToast.detail}</small></span><X size={16} /></button>}
        <div className="content">
          <Routes>
            <Route path="/" element={<DashboardWithDateFilter user={user} />} />
            <Route
              path="/chamados/abertos"
              element={<CallsPage status="Aberto" title="Chamados abertos" />}
            />
            <Route
              path="/chamados/atendimento"
              element={<CallsPage title="Chamados em atendimento" assignedOnly />}
            />
            <Route path="/supervisor/ordens" element={<SupervisorOrdersPage user={user} />} />
            <Route path="/acionamentos" element={<ActivationsPage />} />
            <Route path="/painel-diario" element={<ManualProductionDashboard />} />
            <Route path="/importacoes" element={<ImportsPage />} />
            <Route path="/chamados/:id" element={<CallDetailRoute />} />
            <Route path="/tecnicos" element={<TechniciansPage />} />
            <Route path="/supervisores" element={<SupervisorsPage user={user} />} />
            <Route path="/usuarios" element={<UsersPage />} />
            <Route path="/cargos" element={<RolesPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function DashboardWithDateFilter({ user }: { user: User & { role: Role } }) {
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  return <><DateRangeFilter value={dateRange} onChange={setDateRange} /><OperationalDashboard user={user} dateRange={dateRange} /></>;
}

function OperationalDashboard({ user, dateRange }: { user: User; dateRange: { from: string; to: string } }) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [callsInRange, setCallsInRange] = useState<Call[]>([]);
  const [error, setError] = useState("");
        useEffect(() => {
          api.dashboard(dateRange)
            .then((data) => {
              setMetrics(data.metrics);
              setError("");
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Nao foi possivel carregar os indicadores."));
        }, [dateRange.from, dateRange.to]);

        useEffect(() => {
          api.calls(undefined, { from: dateRange.from, to: dateRange.to })
            .then((data) => setCallsInRange(data.calls))
            .catch(() => setCallsInRange([]));
        }, [dateRange.from, dateRange.to]);

        if (error) return <div className="empty-state">{error}</div>;
        if (!metrics) return <div className="empty-state">Carregando indicadores...</div>;

        return (
          <>
            <div className="page-heading">
              <div>
                <span className="section-kicker">OPERACAO DE REDE</span>
                <h1>Visao geral</h1>
                <p>Indicadores calculados no backend a partir dos dados operacionais atuais.</p>
              </div>
              <button className="secondary-button" onClick={() => api.dashboard(dateRange).then((data) => setMetrics(data.metrics))}>
                <Activity size={16}/> Atualizar
              </button>
            </div>

            <div className="metric-grid">
              <Metric label="Recebidos hoje" value={String(metrics.receivedToday)} note="Chamados abertos hoje" positive />
              <Metric label="Chamados abertos" value={String(metrics.open)} note={`${metrics.unassigned} sem tecnico`} />
              <Metric label="Em atendimento" value={String(metrics.inProgress)} note="Atribuidos ou em campo" />
              <Metric label="Pendentes de aceite" value={String(metrics.pendingActivations)} note={`${metrics.finished} finalizados`} positive />
            </div>

            <div className="dashboard-grid">
              <section className="panel chart-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">STATUS</span>
                    <h2>Distribuicao dos chamados</h2>
                  </div>
                </div>
                <div className="bar-chart">
                  {metrics.byStatus.map((item) => (
                    <div className="bar-item" key={item.label}>
                      <div className="bar-track"><i style={{ height: `${Math.max(8, item.value * 28)}px` }} /></div>
                      <strong>{item.value}</strong>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel status-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">REGIOES</span>
                    <h2>Volume por regiao</h2>
                  </div>
                </div>
                <div className="rank-list">
                  {metrics.byRegion.map((item) => (
                    <div className="rank-row" key={item.label}>
                      <span>{item.label}</span>
                      <div><i style={{ width: `${Math.max(8, item.value * 30)}%` }} /></div>
                      <b>{item.value}</b>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="dashboard-grid">
              <section className="panel status-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">TECNICOS</span>
                    <h2>Chamados atribuidos</h2>
                  </div>
                </div>
                <div className="rank-list">
                  {metrics.byTechnician.length ? metrics.byTechnician.map((item) => (
                    <div className="rank-row" key={item.label}>
                      <span>{item.label}</span>
                      <div><i style={{ width: `${Math.max(8, item.value * 30)}%` }} /></div>
                      <b>{item.value}</b>
                    </div>
                  )) : <div className="empty-state">Nenhum chamado atribuido.</div>}
                </div>
              </section>

              <section className="panel status-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">TIPOS</span>
                    <h2>Chamados por tipo</h2>
                  </div>
                </div>
                <div className="rank-list">
                  {metrics.byType.map((item) => (
                    <div className="rank-row" key={item.label}>
                      <span>{item.label}</span>
                      <div><i style={{ width: `${Math.max(8, item.value * 30)}%` }} /></div>
                      <b>{item.value}</b>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <RangeCallTable calls={callsInRange} />
          </>
        );
}
function Dashboard({ user }: { user: User }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">
            QUARTA-FEIRA, 18 DE SETEMBRO DE 2026
          </span>
          <h1>Bom dia, {user.name.split(" ")[0]}.</h1>
          <p>
            Acompanhe o pulso da operação e mantenha sua equipe em movimento.
          </p>
        </div>
        <button className="secondary-button">
          <SlidersHorizontal size={16} /> Personalizar
        </button>
      </div>
      <div className="metric-grid">
        <Metric
          label="Chamados recebidos hoje"
          value="128"
          note="+12,4% vs. ontem"
          positive
        />
        <Metric label="Chamados abertos" value="42" note="8 sem técnico" />
        <Metric label="Em atendimento" value="67" note="14 em campo" />
        <Metric
          label="Finalizados hoje"
          value="19"
          note="Tempo médio 03h42"
          positive
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">FLUXO OPERACIONAL</span>
              <h2>Chamados por período</h2>
            </div>
            <button className="select-button">
              Últimos 7 dias <ChevronRight size={15} />
            </button>
          </div>
          <div className="chart">
            <div className="chart-y">
              <span>160</span>
              <span>120</span>
              <span>80</span>
              <span>40</span>
              <span>0</span>
            </div>
            <div className="chart-area">
              <div className="grid-line" />
              <div className="grid-line" />
              <div className="grid-line" />
              <div className="grid-line" />
              <svg viewBox="0 0 700 220" preserveAspectRatio="none">
                <path
                  className="chart-fill"
                  d="M0,176 C40,160 70,162 110,128 S175,145 220,112 S280,95 325,114 S380,75 430,88 S490,50 535,78 S590,45 640,61 S680,30 700,38 L700,220 L0,220Z"
                />
                <path
                  className="chart-line"
                  d="M0,176 C40,160 70,162 110,128 S175,145 220,112 S280,95 325,114 S380,75 430,88 S490,50 535,78 S590,45 640,61 S680,30 700,38"
                />
              </svg>
              <div className="chart-labels">
                <span>12 set</span>
                <span>13 set</span>
                <span>14 set</span>
                <span>15 set</span>
                <span>16 set</span>
                <span>17 set</span>
                <span>18 set</span>
              </div>
            </div>
          </div>
        </section>
        <section className="panel status-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">DISTRIBUICAO</span>
              <h2>Status dos chamados</h2>
            </div>
            <BarChart3 size={19} className="muted-icon" />
          </div>
          <div className="donut-wrap">
            <div className="donut">
              <div>
                <strong>128</strong>
                <small>Total</small>
              </div>
            </div>
            <div className="legend">
              <span>
                <i className="blue" />
                Em atendimento <b>67</b>
              </span>
              <span>
                <i className="cyan" />
                Abertos <b>42</b>
              </span>
              <span>
                <i className="gray" />
                Finalizados <b>19</b>
              </span>
            </div>
          </div>
        </section>
      </div>
      <section className="panel activity-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">ACOMPANHAMENTO</span>
            <h2>Atividade recente</h2>
          </div>
          <button className="link-button">
            Ver tudo <ChevronRight size={15} />
          </button>
        </div>
        <div className="activity-list">
          <ActivityRow
            color="blue"
            text="Novo chamado recebido"
            detail="Ordem #RF-240918 · Região Sul"
            time="há 4 min"
          />
          <ActivityRow
            color="green"
            text="Chamado finalizado"
            detail="Ordem #RF-240912 · Carlos Mendes"
            time="há 18 min"
          />
          <ActivityRow
            color="orange"
            text="Chamado sem técnico"
            detail="Ordem #RF-240905 · Região Leste"
            time="há 31 min"
          />
        </div>
      </section>
    </>
  );
}
function Metric({
  label,
  value,
  note,
  positive,
}: {
  label: string;
  value: string;
  note: string;
  positive?: boolean;
}) {
  return (
    <section className="metric">
      <div className="metric-icon">
        <ClipboardList size={17} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={positive ? "positive" : ""}>
        {positive && "↗ "}
        {note}
      </small>
    </section>
  );
}
function ActivityRow({
  color,
  text,
  detail,
  time,
}: {
  color: string;
  text: string;
  detail: string;
  time: string;
}) {
  return (
    <div className="activity-row">
      <i className={`activity-dot ${color}`} />
      <div>
        <strong>{text}</strong>
        <span>{detail}</span>
      </div>
      <time>{time}</time>
    </div>
  );
}

function AdminModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onClick={onClose}><section className="admin-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} title="Fechar"><X size={18} /></button></div>{children}</section></div>;
}

type ManualProductionActivity = {
  type: string;
  pending: number;
  enRoute: number;
  started: number;
  concluded: number;
  cancelled: number;
  suspended: number;
  total: number;
};

type ManualProductionTechnician = {
  name: string;
  pending: number;
  enRoute: number;
  started: number;
  concluded: number;
  cancelled: number;
  suspended: number;
  total: number;
};

type ManualProductionOrder = {
  order: string;
  technician: string;
  inicio: string;
  tempo: string;
};

type ManualProductionData = {
  activities: ManualProductionActivity[];
  technicians: ManualProductionTechnician[];
  orders: ManualProductionOrder[];
  updatedAt: string;
};

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function splitCsvLikeLine(line: string): string[] {
  const delimiters = [";", ",", "\t"];
  const counts = delimiters.map((delimiter) => {
    const parsed = parseDelimitedLine(line, delimiter);
    return { delimiter, count: parsed.length > 1 ? parsed.length : 0 };
  });

  const bestDelimiter = counts.sort((left, right) => right.count - left.count)[0]?.delimiter ?? ",";
  return parseDelimitedLine(line, bestDelimiter);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const allowedActivityTypes = new Set([
  "manutencao preventiva de rede",
  "manutencao corretiva de rede",
  "manutencao de rede field",
]);

function incrementProductionStatus(item: ManualProductionActivity | ManualProductionTechnician, status: string) {
  const normalizedStatus = normalizeText(status);
  if (normalizedStatus === "pendente") item.pending += 1;
  if (normalizedStatus === "em rota") item.enRoute += 1;
  if (normalizedStatus === "iniciado") item.started += 1;
  if (normalizedStatus === "concluido") item.concluded += 1;
  if (normalizedStatus === "cancelado") item.cancelled += 1;
  if (normalizedStatus === "suspenso") item.suspended += 1;
  item.total += 1;
}

function parseFlatActivityExport(rows: string[][]): ManualProductionData {
  const activities = new Map<string, ManualProductionActivity>();
  const technicians = new Map<string, ManualProductionTechnician>();
  const orders: ManualProductionOrder[] = [];

  for (const cells of rows.slice(1)) {
    if (cells.length < 25) continue;

    const technicianName = cells[0]?.trim();
    const status = cells[2]?.trim() ?? "";
    const activityType = cells[23]?.trim();
    const order = cells[24]?.trim();
    if (!activityType || !allowedActivityTypes.has(normalizeText(activityType))) continue;

    const activity = activities.get(activityType) ?? {
      type: activityType,
      pending: 0,
      enRoute: 0,
      started: 0,
      concluded: 0,
      cancelled: 0,
      suspended: 0,
      total: 0,
    };
    incrementProductionStatus(activity, status);
    activities.set(activityType, activity);

    if (technicianName) {
      const technician = technicians.get(technicianName) ?? {
        name: technicianName,
        pending: 0,
        enRoute: 0,
        started: 0,
        concluded: 0,
        cancelled: 0,
        suspended: 0,
        total: 0,
      };
      incrementProductionStatus(technician, status);
      technicians.set(technicianName, technician);
    }

    if (order && normalizeText(status) === "iniciado") {
      orders.push({
        order,
        technician: technicianName,
        inicio: cells[15]?.trim() ?? "",
        tempo: cells[20]?.trim() ?? "",
      });
    }
  }

  return {
    activities: [...activities.values()].filter((item) => allowedActivityTypes.has(normalizeText(item.type))),
    technicians: [...technicians.values()],
    orders,
    updatedAt: new Date().toLocaleString("pt-BR"),
  };
}

function parseManualProductionData(raw: string): ManualProductionData {
  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s+|\s+$/g, ""))
    .filter(Boolean);

  if (!rows.length) {
    return { activities: [], technicians: [], orders: [], updatedAt: new Date().toLocaleString("pt-BR") };
  }

  const firstRow = splitCsvLikeLine(rows[0]);
  const flatHeader = firstRow.map(normalizeText);
  const isFlatActivityExport = flatHeader.includes("recurso")
    && flatHeader.includes("status da atividade")
    && flatHeader.filter((cell) => cell === "tipo de atividade").length >= 2
    && flatHeader.includes("ordem de servico");
  if (isFlatActivityExport) {
    return parseFlatActivityExport(rows.map(splitCsvLikeLine));
  }

  const activities: ManualProductionActivity[] = [];
  const technicians: ManualProductionTechnician[] = [];
  const orders: ManualProductionOrder[] = [];

  let section: "activity" | "technician" | "orders" | null = null;

  for (const row of rows) {
    const cells = splitCsvLikeLine(row)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);

    if (!cells.length) continue;

    const normalizedCells = cells.map(normalizeText);
    const label = normalizedCells.join(" ");
    const hasNumericColumns = ["pendente", "em rota", "iniciado", "concluido", "cancelado", "suspenso", "total"]
      .filter((column) => normalizedCells.includes(column)).length >= 3;
    const isActivityHeader = normalizedCells.some((cell) => cell.includes("tipo da atividade"));
    const isTechnicianHeader = normalizedCells.some((cell) => cell === "tecnico" || cell === "tecnicos") && hasNumericColumns;
    const isOrdersHeader = normalizedCells.some((cell) => cell === "order" || cell === "orders" || cell === "ordem" || cell === "ordens")
      && normalizedCells.some((cell) => cell.includes("inicio") || cell.includes("tempo"));

    if (isActivityHeader || label.includes("producao por atividades")) {
      section = "activity";
      continue;
    }
    if (isTechnicianHeader || label.includes("producao por tecnico") || label.includes("prod por tecnico")) {
      section = "technician";
      continue;
    }
    if (isOrdersHeader || label.includes("ordens iniciadas") || label.includes("dados da planilha") || label === "orders" || label === "ordens") {
      section = "orders";
      continue;
    }
    if (label.includes("soma") && section === "activity") {
      continue;
    }

    if (section === "activity" && cells.length >= 8) {
      const [type, pending, enRoute, started, concluded, cancelled, suspended, total] = cells;
      if (type && /[A-Za-zÀ-ÿ]/.test(type) && /\d/.test(String(total ?? ""))) {
        activities.push({
          type,
          pending: Number(String(pending ?? "0").replace(/[^0-9]/g, "")) || 0,
          enRoute: Number(String(enRoute ?? "0").replace(/[^0-9]/g, "")) || 0,
          started: Number(String(started ?? "0").replace(/[^0-9]/g, "")) || 0,
          concluded: Number(String(concluded ?? "0").replace(/[^0-9]/g, "")) || 0,
          cancelled: Number(String(cancelled ?? "0").replace(/[^0-9]/g, "")) || 0,
          suspended: Number(String(suspended ?? "0").replace(/[^0-9]/g, "")) || 0,
          total: Number(String(total ?? "0").replace(/[^0-9]/g, "")) || 0,
        });
      }
      continue;
    }

    if (section === "technician" && cells.length >= 8) {
      const [name, pending, enRoute, started, concluded, cancelled, suspended, total] = cells;
      if (name && /[A-Za-zÀ-ÿ]/.test(name) && /\d/.test(String(total ?? ""))) {
        technicians.push({
          name,
          pending: Number(String(pending ?? "0").replace(/[^0-9]/g, "")) || 0,
          enRoute: Number(String(enRoute ?? "0").replace(/[^0-9]/g, "")) || 0,
          started: Number(String(started ?? "0").replace(/[^0-9]/g, "")) || 0,
          concluded: Number(String(concluded ?? "0").replace(/[^0-9]/g, "")) || 0,
          cancelled: Number(String(cancelled ?? "0").replace(/[^0-9]/g, "")) || 0,
          suspended: Number(String(suspended ?? "0").replace(/[^0-9]/g, "")) || 0,
          total: Number(String(total ?? "0").replace(/[^0-9]/g, "")) || 0,
        });
      }
      continue;
    }

    if (section === "orders" && cells.length >= 4) {
      const [order, technician, inicio, tempo] = cells;
      if (order && /[A-Za-z0-9]/.test(order) && !order.toLowerCase().includes("orders")) {
        orders.push({ order, technician: technician || "", inicio: inicio || "", tempo: tempo || "" });
      }
    }
  }

  return {
    activities: activities.filter((item) => item.type && allowedActivityTypes.has(normalizeText(item.type))),
    technicians: technicians.filter((item) => item.name && item.name !== ""),
    orders: orders.filter((item) => item.order && item.order !== ""),
    updatedAt: new Date().toLocaleString("pt-BR"),
  };
}

function sumProductionRows(rows: Array<ManualProductionActivity | ManualProductionTechnician>) {
  return rows.reduce((total, item) => ({
    pending: total.pending + item.pending,
    enRoute: total.enRoute + item.enRoute,
    started: total.started + item.started,
    concluded: total.concluded + item.concluded,
    cancelled: total.cancelled + item.cancelled,
    suspended: total.suspended + item.suspended,
    total: total.total + item.total,
  }), { pending: 0, enRoute: 0, started: 0, concluded: 0, cancelled: 0, suspended: 0, total: 0 });
}

function ManualProductionDashboard() {
  const [data, setData] = useState<ManualProductionData | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");

  useEffect(() => {
    const loadBase = () => api.dailyBase().then((result) => {
      if (!result.base) {
        setData(null);
        setSelectedFileName("");
        return;
      }
      setData(result.base.data);
      setSelectedFileName(result.base.fileName);
    }).catch((error) => setUploadError(error instanceof Error ? error.message : "Nao foi possivel carregar a base salva."));
    void loadBase();
    const interval = window.setInterval(loadBase, 15000);
    return () => window.clearInterval(interval);
  }, []);

  async function clearBase() {
    try {
      await api.clearDailyBase();
      setData(null);
      setUploadError("");
      setSelectedFileName("");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Nao foi possivel limpar a base.");
    }
  }

  async function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileName = file.name.toLowerCase();
      let nextRaw = "";

      if (fileName.endsWith(".csv") || fileName.endsWith(".txt") || fileName.endsWith(".tsv")) {
        nextRaw = await file.text();
      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = workbook.Sheets[firstSheetName];
        nextRaw = XLSX.utils.sheet_to_csv(firstSheet);
      } else {
        throw new Error("Formato de arquivo não suportado. Use CSV, TSV, TXT, XLS ou XLSX.");
      }

      const parsed = parseManualProductionData(nextRaw);
      if (!parsed.activities.length && !parsed.technicians.length && !parsed.orders.length) {
        throw new Error("Arquivo carregado, mas não foi possível identificar as tabelas de produção. Verifique se o arquivo é o base do painel diário.");
      }
      const saved = await api.saveDailyBase(file.name, parsed);
      setSelectedFileName(saved.base.fileName);
      setData(saved.base.data);
      setUploadError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nao foi possivel carregar o arquivo.";
      setUploadError(message);
      setData(null);
    } finally {
      event.target.value = "";
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">OPERACAO DE REDE</span>
          <h1>Painel diario</h1>
          <p>Selecione a base do dia para atualizar as ordens e a produção.</p>
        </div>
        <div className="page-actions compact-actions">
          <button className="secondary-button compact danger-button" onClick={clearBase} type="button">
            Limpar base
          </button>
        </div>
      </div>

      <div className="manual-dashboard-tools">
        <div className="manual-file-actions">
          <label className="manual-file-picker">
            <input type="file" accept=".csv,.tsv,.txt,.xls,.xlsx" onChange={handleFileSelection} />
            <span>Selecionar arquivo</span>
          </label>
          {selectedFileName && <span className="selected-file-name">{selectedFileName}</span>}
        </div>

        {uploadError && <div className="form-error import-error">{uploadError}</div>}
      </div>

      {data && (
        <>
          {(() => {
            const activityTotals = sumProductionRows(data.activities);
            const technicianTotals = sumProductionRows(data.technicians);
            return (
              <>
          <div className="manual-summary-row">
            <div className="summary-badge">
              <span>Última atualização</span>
              <strong>{data.updatedAt}</strong>
            </div>
          </div>

          <div className="manual-production-grid">
            <section className="panel panel-elevated">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">PRODUCAO</span>
                  <h2>Produção por atividades</h2>
                </div>
              </div>
              <div className="manual-table-wrap">
                <table className="manual-table">
                  <thead>
                    <tr>
                      <th>Tipo da Atividade</th>
                      <th>Pendente</th>
                      <th>Em Rota</th>
                      <th>Iniciado</th>
                      <th>Concluído</th>
                      <th>Cancelado</th>
                      <th>Suspenso</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.activities.map((item) => (
                      <tr key={`${item.type}-${item.total}`}>
                        <td>{item.type}</td>
                        <td>{item.pending}</td>
                        <td>{item.enRoute}</td>
                        <td>{item.started}</td>
                        <td>{item.concluded}</td>
                        <td>{item.cancelled}</td>
                        <td>{item.suspended}</td>
                        <td>{item.total}</td>
                      </tr>
                    ))}
                    <tr className="manual-total-row">
                      <td>Total</td>
                      <td>{activityTotals.pending}</td>
                      <td>{activityTotals.enRoute}</td>
                      <td>{activityTotals.started}</td>
                      <td>{activityTotals.concluded}</td>
                      <td>{activityTotals.cancelled}</td>
                      <td>{activityTotals.suspended}</td>
                      <td>{activityTotals.total}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel panel-elevated">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">TÉCNICOS</span>
                  <h2>Produção por técnico</h2>
                </div>
              </div>
              <div className="manual-table-wrap compact">
                <table className="manual-table">
                  <thead>
                    <tr>
                      <th>Técnicos</th>
                      <th>Pendente</th>
                      <th>Em Rota</th>
                      <th>Iniciado</th>
                      <th>Concluído</th>
                      <th>Cancelado</th>
                      <th>Suspenso</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.technicians.map((item) => (
                      <tr key={`${item.name}-${item.total}`}>
                        <td>{item.name}</td>
                        <td>{item.pending}</td>
                        <td>{item.enRoute}</td>
                        <td>{item.started}</td>
                        <td>{item.concluded}</td>
                        <td>{item.cancelled}</td>
                        <td>{item.suspended}</td>
                        <td>{item.total}</td>
                      </tr>
                    ))}
                    <tr className="manual-total-row">
                      <td>Total</td>
                      <td>{technicianTotals.pending}</td>
                      <td>{technicianTotals.enRoute}</td>
                      <td>{technicianTotals.started}</td>
                      <td>{technicianTotals.concluded}</td>
                      <td>{technicianTotals.cancelled}</td>
                      <td>{technicianTotals.suspended}</td>
                      <td>{technicianTotals.total}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel panel-elevated orders-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">ORDENS</span>
                  <h2>Ordens iniciadas</h2>
                </div>
              </div>
              <div className="manual-table-wrap compact">
                <table className="manual-table">
                  <thead>
                    <tr>
                      <th>Orders</th>
                      <th>Técnico</th>
                      <th>Início</th>
                      <th>Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((item, index) => (
                      <tr key={`${item.order}-${index}`}>
                        <td>{item.order}</td>
                        <td>{item.technician}</td>
                        <td>{item.inicio}</td>
                        <td>{item.tempo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
              </>
            );
          })()}
        </>
      )}
    </>
  );
}

function ImportsPage() {
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [preview, setPreview] = useState<ImportRecord | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  useEffect(() => { api.imports().then((data) => setRecords(data.imports)).catch((err) => setError(err.message)); }, []);
  async function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const content = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = () => reject(new Error("Nao foi possivel ler o arquivo.")); reader.readAsDataURL(file); });
    try { const result = await api.previewImport(file.name, content); setPreview(result.import); setRecords((current) => [result.import, ...current]); setMessage("Pré-visualização pronta para conferência."); } catch (err) { setError(err instanceof Error ? err.message : "Falha ao ler arquivo."); }
  }
  async function confirm() { if (!preview) return; const result = await api.confirmImport(preview.id); setPreview(result.import); setRecords((current) => current.map((item) => item.id === result.import.id ? result.import : item)); setMessage("Importação confirmada e registrada."); }
  async function syncGoogleDrive() {
    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const result = await api.syncGoogleDrive();
      const summary = result.sync;
      if (summary.errors.length > 0) {
        setError(summary.errors.join(" · "));
      }
      setMessage(`Sincronização concluída: ${summary.updated} chamados atualizados em ${summary.files} arquivo(s). ${summary.skipped} registros ignorados.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel sincronizar o Google Drive.");
    } finally {
      setSyncing(false);
    }
  }
  return <><div className="page-heading"><div><span className="section-kicker">DADOS</span><h1>Importacoes</h1><p>Leia bases externas, valide os dados e confirme somente depois da conferência.</p></div><div className="page-actions"><button className="secondary-button compact" type="button" onClick={() => void syncGoogleDrive()} disabled={syncing}><RefreshCcw size={15} /> {syncing ? "Sincronizando..." : "Sincronizar Drive"}</button><label className="primary-button compact file-button"><ClipboardList size={16}/> Selecionar arquivo<input type="file" accept=".csv,.xlsx,.xls" onChange={selectFile}/></label></div></div>{error && <div className="form-error import-error">{error}</div>}{message && <div className="save-message import-message">{message}</div>}{preview && <section className="panel import-preview"><div className="panel-heading"><div><span className="section-kicker">PRÉ-VISUALIZACAO</span><h2>{preview.fileName}</h2></div><span className={`call-badge ${preview.status.toLowerCase()}`}>{preview.status}</span></div><div className="import-stats"><span><b>{preview.totalRows}</b> linhas</span><span><b>{preview.validRows}</b> validas</span><span><b>{preview.columns.length}</b> colunas</span><span>{preview.sheetName}</span></div><div className="import-table-wrap"><table><thead><tr>{preview.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{preview.preview.map((row, index) => <tr key={index}>{preview.columns.map((column) => <td key={column}>{row[column]}</td>)}</tr>)}</tbody></table></div>{preview.status === "Previsualizada" && <button className="primary-button compact confirm-import" onClick={confirm}>Confirmar importacao <ChevronRight size={16}/></button>}</section>}<section className="panel import-history"><div className="panel-heading"><div><span className="section-kicker">HISTORICO</span><h2>Importacoes recentes</h2></div></div>{records.map((record) => <div className="import-history-row" key={record.id}><div><strong>{record.fileName}</strong><span>{record.fileType.toUpperCase()} · {record.totalRows} linhas · {record.importedBy}</span></div><span className={`call-badge ${record.status.toLowerCase()}`}>{record.status}</span><small>{new Date(record.createdAt).toLocaleString("pt-BR")}</small></div>)}{!records.length && <div className="empty-state">Nenhuma importacao registrada.</div>}</section></>;
}
function ActivationsPage() {
  const [activations, setActivations] = useState<Activation[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  async function load() {
    try {
      const pending = (await api.activations("Pendente")).activations;
      setActivations(pending);
      setSelectedIds((current) => current.filter((id) => pending.some((activation) => activation.id === id)));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar acionamentos.");
    }
  }
  useEffect(() => { load(); }, []);
  function toggleSelection(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]);
  }
  function toggleAll() {
    setSelectedIds((current) => current.length === activations.length ? [] : activations.map((activation) => activation.id));
  }
  async function accept(ids: string[]) {
    if (!ids.length) return;
    setProcessing(true);
    try {
      await Promise.all(ids.map((id) => api.acceptActivation(id)));
      setSelectedIds([]);
      setMessage(ids.length === 1 ? "Tudo certo: o acionamento foi aceito e o chamado já está na fila operacional." : `Tudo certo: ${ids.length} acionamentos foram aceitos e os chamados já estão na fila operacional.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel aceitar os acionamentos."); }
    finally { setProcessing(false); }
  }
  async function reject(ids: string[], rejectionReason: string) {
    if (!ids.length || !rejectionReason.trim()) return;
    setProcessing(true);
    try {
      await Promise.all(ids.map((id) => api.rejectActivation(id, rejectionReason)));
      setSelectedIds([]); setReason(""); setRejecting(null);
      setMessage(ids.length === 1 ? "Acionamento recusado com sucesso." : `${ids.length} acionamentos recusados com sucesso.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel recusar os acionamentos."); }
    finally { setProcessing(false); }
  }
  function requestReject(ids: string[]) {
    if (!ids.length) return;
    setSelectedIds(ids);
    setRejecting(ids.length === 1 ? ids[0] : "bulk");
  }
  const allSelected = activations.length > 0 && selectedIds.length === activations.length;
  return <><div className="page-heading"><div><span className="section-kicker">MESARIOS</span><h1>Acionamentos pendentes</h1><p>Revise os dados recebidos antes de criar um chamado operacional.</p></div><div className="page-actions"><button className="secondary-button compact" onClick={() => void load()} disabled={processing}><Activity size={15}/> Atualizar</button><button className="accept-button" onClick={() => void accept(activations.map((activation) => activation.id))} disabled={processing || !activations.length}>Aceitar todos</button></div></div><section className="panel activation-panel"><div className="activation-summary"><span><b>{activations.length}</b> pendentes</span><span>Origem isolada: WuzAPI</span></div>{activations.length > 0 && <div className="activation-bulk-actions"><label className="checkbox-label"><input type="checkbox" checked={allSelected} onChange={toggleAll} /> Selecionar todos</label><span>{selectedIds.length} selecionados</span><button className="accept-button" onClick={() => void accept(selectedIds)} disabled={processing || !selectedIds.length}>Aceitar selecionados</button><button className="reject-button" onClick={() => requestReject(selectedIds)} disabled={processing || !selectedIds.length}>Recusar selecionados</button></div>}{error ? <div className="empty-state">{error}</div> : activations.length ? activations.map((activation) => <div className="activation-row" key={activation.id}><div className="activation-main"><input type="checkbox" checked={selectedIds.includes(activation.id)} onChange={() => toggleSelection(activation.id)} aria-label={`Selecionar ${activation.extractedData.orderNumber || "acionamento"}`} /><div className="activation-icon"><ClipboardList size={17}/></div><div><strong>{activation.extractedData.orderNumber || "Sem ordem identificada"}</strong><span>{activation.extractedData.type} · {activation.extractedData.bdesk || "Sem BDESK"} · recebido {new Date(activation.receivedAt).toLocaleString("pt-BR")}</span></div></div><button className="link-button" onClick={() => setExpanded(expanded === activation.id ? null : activation.id)}>Ver dados</button><button className="accept-button" onClick={() => void accept([activation.id])} disabled={processing}>Aceitar</button><button className="reject-button" onClick={() => requestReject([activation.id])} disabled={processing}>Recusar</button>{expanded === activation.id && <div className="activation-detail"><div><b>Mensagem original</b><p>{activation.originalMessage}</p></div><div className="extracted-grid">{Object.entries(activation.extractedData).filter(([, value]) => value).map(([key, value]) => <span key={key}><small>{key}</small><strong>{value}</strong></span>)}</div></div>}{rejecting === activation.id && <div className="reject-form"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo da recusa"/><button className="reject-button" onClick={() => void reject([activation.id], reason)} disabled={processing || !reason.trim()}>Confirmar recusa</button></div>}{rejecting === "bulk" && selectedIds.length > 0 && activation.id === selectedIds[0] && <div className="reject-form"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo da recusa dos selecionados"/><button className="reject-button" onClick={() => void reject(selectedIds, reason)} disabled={processing || !reason.trim()}>Confirmar recusa dos selecionados</button></div>}</div>) : <div className="empty-state">Nenhum acionamento pendente.</div>}{message && <div className="save-message">{message}</div>}</section></>;
}
function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", roleId: "role-operator", password: "", active: true });
  async function load() {
    try {
      const [userData, roleData] = await Promise.all([api.users(), api.roles()]);
      setUsers(userData.users);
      setRoles(roleData.roles);
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel carregar usuarios."); }
  }
  useEffect(() => {
    load();
  }, []);
  function openForm(user?: User) {
    setEditing(user || null);
    setShowForm(true);
    setForm({ name: user?.name || "", email: user?.email || "", roleId: user?.roleId || roles[0]?.id || "", password: "", active: user?.active ?? true });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editing) await api.updateUser(editing.id, { ...form, password: form.password || undefined });
      else await api.createUser({ name: form.name, email: form.email, roleId: form.roleId, password: form.password });
      setEditing(null); setShowForm(false); setMessage("Usuario salvo com sucesso."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel salvar usuario."); }
  }
  async function handleDelete(user: User) {
    const confirmed = window.confirm(`Deseja apagar o usuario ${user.name}?`);
    if (!confirmed) return;
    try {
      await api.deleteUser(user.id);
      setMessage("Usuario removido com sucesso.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel remover o usuario.");
    }
  }
  const visibleUsers = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()) && (activeFilter === "all" || (activeFilter === "active" ? user.active : !user.active)));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">ADMINISTRACAO</span>
          <h1>Usuarios</h1>
          <p>Controle quem acessa o O&amp;M e o que cada pessoa pode fazer.</p>
        </div>
        <button className="primary-button compact" onClick={() => openForm()}>
          <Users size={16} /> Novo usuario
        </button>
      </div>
      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou e-mail" />
          </div>
          <button className="secondary-button compact" onClick={() => setShowFilters((current) => !current)}>
            <SlidersHorizontal size={15} /> Filtros
          </button>
          {showFilters && <select className="toolbar-select" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as typeof activeFilter)}><option value="all">Todos os status</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>}
        </div>
        {error ? (
          <div className="empty-state">{error}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>E-mail</th>
                <th>Cargo</th>
                <th>Status</th>
                <th>Cadastro</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="user-cell">
                      <div className="avatar">
                        {user.name
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <strong>{user.name}</strong>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <span className="role-pill">
                      {user.role?.name ||
                        (user.roleId === "role-admin"
                          ? "Administrador"
                          : "Operador")}
                    </span>
                  </td>
                  <td>
                    <span className={`status ${user.active ? "active" : "inactive"}`}>
                      <i />
                      {user.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button className="secondary-button compact" type="button" onClick={() => openForm(user)} title="Editar usuario">
                        Editar
                      </button>
                      <button className="secondary-button compact" type="button" onClick={() => handleDelete(user)} title="Apagar usuario" style={{ background: '#e63946', borderColor: '#e63946', color: '#fff' }}>
                        Apagar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {message && <div className="save-message">{message}</div>}
      {showForm ? <AdminModal title={editing ? "Editar usuario" : "Novo usuario"} onClose={() => { setEditing(null); setShowForm(false); }}>
        <form className="admin-form" onSubmit={save}>
          <label>Nome<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>E-mail<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label>Cargo<select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          <label>Senha {editing && <small>(deixe vazio para manter)</small>}<input type="password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!editing} /></label>
          {editing && <label className="checkbox-label"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Usuario ativo</label>}
          <button className="primary-button" type="submit">Salvar usuario <ChevronRight size={16} /></button>
        </form>
      </AdminModal> : null}
    </>
  );
}
function DateRangeFilter({ value, onChange }: { value: { from: string; to: string }; onChange: (value: { from: string; to: string }) => void }) {
  return <div className="date-range-filter"><label>De<input type="date" value={value.from} onChange={(event) => onChange({ ...value, from: event.target.value })} /></label><label>Ate<input type="date" value={value.to} onChange={(event) => onChange({ ...value, to: event.target.value })} /></label>{(value.from || value.to) && <button className="text-button" type="button" onClick={() => onChange({ from: "", to: "" })}>Limpar periodo</button>}</div>;
}

function RangeCallTable({ calls }: { calls: Call[] }) {
  return (
    <section className="panel compact-range-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">PERIODO</span>
          <h2>Chamados no intervalo</h2>
        </div>
      </div>
      <div className="range-call-table">
        <table>
          <thead>
            <tr>
              <th>Ordem</th>
              <th>Cliente</th>
              <th>Tipo</th>
              <th>Regiao</th>
              <th>Status</th>
              <th>Tecnico</th>
            </tr>
          </thead>
          <tbody>
            {calls.length ? calls.slice(0, 8).map((call) => (
              <tr key={call.id}>
                <td><strong>{call.orderNumber}</strong><small>{call.bdesk}</small></td>
                <td><strong>{call.client}</strong><small>{call.city}</small></td>
                <td>{call.type}<small>{call.reason}</small></td>
                <td>{call.region}</td>
                <td><span className={`call-badge ${call.status.toLowerCase().replace(" ", "-")}`}>{call.status}</span></td>
                <td>{call.technicianName || <span className="unassigned">Sem tecnico</span>}</td>
              </tr>
            )) : <tr><td colSpan={6} className="empty-state-cell">Sem chamados neste periodo.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SupervisorOrdersPage({ user }: { user: User & { role: Role } }) {
  if (user.role.name !== "Supervisor") return <Navigate to="/" replace />;
  return <CallsPage title="Ordens dos meus tecnicos" teamScoped />;
}

function CallsPage({ status, title, assignedOnly = false, teamScoped = false }: { status?: CallStatus; title: string; assignedOnly?: boolean; teamScoped?: boolean }) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [regionFilter, setRegionFilter] = useState("Todas");
  const [statusFilter, setStatusFilter] = useState<CallStatus | "Todos">("Todos");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "downloaded" | "error">("idle");
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [, setClock] = useState(Date.now());
  const navigate = useNavigate();
  useEffect(() => { const interval = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(interval); }, []);
  useEffect(() => {
    api
      .calls(status, { ...dateRange, teamScope: teamScoped })
      .then((data) => setCalls(data.calls))
      .catch((err) => setError(err.message));
  }, [status, dateRange.from, dateRange.to]);

  async function copyTableAsImage() {
    const table = tableRef.current;
    if (!table) return;

    try {
      const canvas = await html2canvas(table, {
        backgroundColor: "#ffffff",
        scale: 2,
        width: table.scrollWidth,
        height: table.scrollHeight,
        windowWidth: table.scrollWidth,
        windowHeight: table.scrollHeight,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Imagem indisponivel");
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
        setCopyState("copied");
      } else {
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = "redeflow-tabela.png";
        link.click();
        URL.revokeObjectURL(downloadUrl);
        setCopyState("downloaded");
      }
    } catch {
      setCopyState("error");
    }

    window.setTimeout(() => setCopyState("idle"), 1800);
  }

  async function refreshCalls() {
    setLoading(true);
    try { setCalls((await api.calls(status, { ...dateRange, teamScope: teamScoped })).calls); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel atualizar chamados."); } finally { setLoading(false); }
  }
  const visibleCalls = calls.filter((call) =>
    (!assignedOnly || Boolean(call.technicianId || call.technicianName)) &&
    [call.orderNumber, call.client, call.bdesk, call.region, call.city]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()) &&
    (statusFilter === "Todos" || call.status === statusFilter) &&
    (regionFilter === "Todas" || call.region === regionFilter),
  );
  const regions = [...new Set(calls.map((call) => call.region))];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">OPERACAO</span>
          <h1>{title}</h1>
          <p>
            {visibleCalls.length} chamados na fila atual. Clique em uma linha
            para abrir o atendimento.
          </p>
        </div>
        <button
          className={`secondary-button compact ${loading ? "is-refreshing" : ""}`}
          onClick={() => void refreshCalls()}
          disabled={loading}
        >
          <Activity size={15} /> Atualizar
        </button>
      </div>
      <section className={`panel table-panel calls-table${assignedOnly ? " attendance-table" : ""}`}>
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar ordem, tecnico B2C, BDESK ou regiao"
            />
          </div>
          <div className="table-toolbar-actions">
            <button className="secondary-button compact" onClick={() => setShowFilters((current) => !current)}>
              <SlidersHorizontal size={15} /> Filtros
            </button>
            <button className="secondary-button compact" onClick={() => void copyTableAsImage()} type="button" aria-label="Copiar tabela completa como imagem">
              <Copy size={15} />
              {copyState === "copied" ? "Tabela copiada" : copyState === "downloaded" ? "PNG baixado" : copyState === "error" ? "Falha ao copiar" : "Copiar tabela"}
            </button>
            <span className="result-count">{visibleCalls.length} resultados</span>
          </div>
        </div>
        {showFilters && <div className="table-filter-row"><select className="toolbar-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CallStatus | "Todos")}><option>Todos</option><option>Aberto</option><option>Atribuido</option><option>Deslocamento</option><option>Em campo</option><option>Finalizado</option><option>Cancelado</option></select><select className="toolbar-select" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option>Todas</option>{regions.map((region) => <option key={region}>{region}</option>)}</select><DateRangeFilter value={dateRange} onChange={setDateRange}/></div>}
        {error ? (
          <div className="empty-state">{error}</div>
        ) : (
          <div className="table-scroll-container">
          <table ref={tableRef}>
            <thead>
              <tr>
                {assignedOnly ? <><th>Protocolo</th><th>Tecnico</th><th>SLA</th><th>Prazo</th><th>Afet.</th><th>Tipo de evento</th><th>OLT</th><th>Cidade</th><th>Obs.</th><th>Timer</th></> : <><th>Ordem</th><th>Tecnico B2C</th><th>Tipo / motivo</th><th>Regiao</th><th>Abertura</th><th>Tempo aguardando</th><th>Status</th><th>Tecnico</th></>}
              </tr>
            </thead>
            <tbody>
              {visibleCalls.map((call) => (
                <tr
                  key={call.id}
                  onClick={() => navigate(`/chamados/${call.id}${teamScoped ? "?teamScope=true" : ""}`)}
                >
                  {assignedOnly ? <><td><strong>{call.orderNumber}</strong><small className="table-subtext">{call.bdesk}</small></td><td><strong>{call.technicianName || "Sem tecnico"}</strong><small className="table-subtext">{call.supervisorName || "Sem supervisor"}</small></td><td><SlaDurationCell openedAt={call.openedAt} /></td><td><SlaCell openedAt={call.openedAt} /></td><td className="muted-cell">-</td><td><strong>{call.type}</strong><small className="table-subtext">{call.reason}</small></td><td>{call.olt || <span className="muted-cell">-</span>}</td><td>{call.city || <span className="muted-cell">-</span>}</td><td className="observation-cell" title={call.notes}>{call.notes || <span className="muted-cell">-</span>}</td><td><TimerCell lastObservationAt={call.lastObservationAt} /></td></> : <><td><strong>{call.orderNumber}</strong><small className="table-subtext">{call.bdesk}</small></td><td>{call.client}<small className="table-subtext">{call.city}</small></td><td>{call.type}<small className="table-subtext">{call.reason}</small></td><td>{call.region}</td><td>{new Date(call.openedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td><td>{formatWaiting(call.openedAt)}</td><td><span className={`call-badge ${call.status.toLowerCase().replace(" ", "-")}`}>{call.status}</span></td><td>{call.technicianName || <span className="unassigned">Sem tecnico</span>}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </>
  );
}
function getElapsedMinutes(openedAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000));
}
function formatElapsed(openedAt: string) {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}
function SlaCell({ openedAt }: { openedAt: string }) {
  const elapsedMinutes = getElapsedMinutes(openedAt);
  const state = elapsedMinutes > 600 ? "outlier" : elapsedMinutes > 480 ? "late" : "on-time";
  const label = state === "outlier" ? "Outlier" : state === "late" ? "Fora do prazo" : "No prazo";
  return <span className={`sla-cell ${state}`}><strong>{label}</strong><small>Limite 08:00</small></span>;
}
function SlaDurationCell({ openedAt }: { openedAt: string }) {
  const elapsedMinutes = getElapsedMinutes(openedAt);
  const state = elapsedMinutes > 600 ? "outlier" : elapsedMinutes > 480 ? "late" : "on-time";
  return <span className={`sla-duration ${state}`}>{formatElapsed(openedAt)}</span>;
}
function TimerCell({ lastObservationAt }: { lastObservationAt?: string }) {
  if (!lastObservationAt) return <span className="timer-cell empty">Sem observacao</span>;
  const elapsedMinutes = getElapsedMinutes(lastObservationAt);
  const state = elapsedMinutes > 600 ? "outlier" : elapsedMinutes > 480 ? "late" : "on-time";
  return <span className={`timer-cell ${state}`}>{formatElapsed(lastObservationAt)}</span>;
}
function formatWaiting(openedAt: string) {
  const minutes = Math.max(
    1,
    Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000),
  );
  return minutes > 59
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}min`
    : `${minutes}min`;
}
function CallDetailBase() {
  const { pathname, search } = useLocation();
  const id = pathname.split("/").pop()!;
  const teamScoped = new URLSearchParams(search).get("teamScope") === "true";
  const [call, setCall] = useState<Call | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [status, setStatus] = useState<CallStatus>("Aberto");
  const [technicianId, setTechnicianId] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [bdesk, setBdesk] = useState("");
  const [officeTrack, setOfficeTrack] = useState("");
  const [client, setClient] = useState("");
  const [type, setType] = useState("");
  const [reason, setReason] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [olt, setOlt] = useState("");
  const [slotPon, setSlotPon] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    Promise.all([api.call(id, { teamScope: teamScoped }), api.technicians()]).then(
      ([callData, technicianData]) => {
        setCall(callData.call);
        setStatus(callData.call.status);
        setTechnicianId(callData.call.technicianId || "");
        setNotes(callData.call.notes);
        setOrderNumber(callData.call.orderNumber); setBdesk(callData.call.bdesk); setOfficeTrack(callData.call.officeTrack); setClient(callData.call.client); setType(callData.call.type); setReason(callData.call.reason); setRegion(callData.call.region); setCity(callData.call.city); setOlt(callData.call.olt); setSlotPon(callData.call.slotPon);
        setTechnicians(technicianData.technicians);
      },
    );
  }, [id]);
  if (!call) return <div className="empty-state">Carregando chamado...</div>;
  async function save() {
    setSaving(true);
    try {
      const data = await api.updateCall(id, { orderNumber, bdesk, officeTrack, client, type, reason, region, city, olt, slotPon, status, technicianId: technicianId || null, notes });
      setCall(data.call); setStatus(data.call.status); setTechnicianId(data.call.technicianId || "");
      setMessage("Chamado atualizado com sucesso."); setConfirmed(true); setTimeout(() => window.location.reload(), 1100);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Nao foi possivel salvar alteracoes."); }
    finally { setSaving(false); }
  }
  return (
    <>
      <button className="back-button" onClick={() => navigate(-1)}>
        <ChevronRight size={16} className="back-icon" /> Voltar para chamados
      </button>
      <div className="call-detail-heading">
        <div>
          <span className="section-kicker">ORDEM {call.orderNumber}</span>
          <h1>{call.client}</h1>
          <p>
            {call.bdesk} · {call.officeTrack} · {call.city}, {call.region}
          </p>
        </div>
        <span
          className={`call-badge ${status.toLowerCase().replace(" ", "-")}`}
        >
          {status}
        </span>
      </div>
      <div className="detail-layout">
        <section className="panel detail-main">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">INFORMACOES DO CHAMADO</span>
              <h2>Dados operacionais</h2>
            </div>
          </div>
          <div className="detail-grid">
            <EditableDetailItem label="Ordem" value={orderNumber} onChange={setOrderNumber} />
            <EditableDetailItem label="BDESK" value={bdesk} onChange={setBdesk} />
            <EditableDetailItem label="Office Track" value={officeTrack} onChange={setOfficeTrack} />
            <EditableDetailItem label={`Tecnico B2C${["NOC TX", "NOC ACESSO"].includes(type.trim().toUpperCase()) ? " (opcional)" : ""}`} value={client} onChange={setClient} />
            <EditableDetailItem label="Tipo" value={type} onChange={setType} />
            <EditableDetailItem label="Motivo" value={reason} onChange={setReason} />
            <label className="detail-item editable-detail-item"><span>Regiao</span><select className="region-detail-select" value={region} onChange={(event) => setRegion(event.target.value)}><option value="">Selecione uma região</option>{region && !operationalRegions.includes(region) && <option value={region}>{region}</option>}{operationalRegions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <EditableDetailItem label="Cidade" value={city} onChange={setCity} />
            <EditableDetailItem label="OLT" value={olt} onChange={setOlt} />
            <EditableDetailItem label="Slot/PON" value={slotPon} onChange={setSlotPon} />
            <DetailItem label="Abertura" value={new Date(call.openedAt).toLocaleString("pt-BR")} />
          </div>
          <label className="detail-label">
            Observacoes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={5}
            />
          </label>
        </section>
        <aside className="panel detail-actions">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">ATENDIMENTO</span>
              <h2>Distribuicao</h2>
            </div>
          </div>
          <label className="detail-label">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as CallStatus)}
            >
              {[
                "Aberto",
                "Atribuido",
                "Deslocamento",
                "Em campo",
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="detail-label">
            Tecnico
            <select
              value={technicianId}
              onChange={(event) => setTechnicianId(event.target.value)}
            >
              <option value="">Sem tecnico</option>
              {technicians
                .filter((technician) => technician.teamRole === "Tecnico" && technician.active)
                .map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name} · {technician.region}
                  </option>
                ))}
            </select>
          </label>
          <div className="assignment-note">
            {technicianId
              ? `Supervisor: ${technicians.find((technician) => technician.id === technicianId)?.supervisorName || "Nao definido"}`
              : "Este chamado ainda nao possui tecnico."}
          </div>
          <button className="primary-button save-call" onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alteracoes"} <ChevronRight size={17} />
          </button>
          {message && <div className="save-message">{message}</div>}
        </aside>
      </div>
      {confirmed && <div className="call-confirmation" role="status"><span>✓</span><strong>Alteração confirmada</strong><small>A ordem foi atualizada. Recarregando os dados...</small></div>}
    </>
  );
}
function EditableDetailItem({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="detail-item editable-detail-item"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
function AuditedCallDetailPage() {
  const { pathname } = useLocation();
  const id = pathname.split("/").pop()!;
  const [observations, setObservations] = useState<CallObservation[]>([]);
  const [logs, setLogs] = useState<CallAuditLog[]>([]);
  const [text, setText] = useState("");
  const [tab, setTab] = useState<"observations" | "logs">("observations");
  async function refreshHistory() {
    const [observationData, logData] = await Promise.all([
      api.observations(id),
      api.auditLogs(id),
    ]);
    setObservations(observationData.observations);
    setLogs(logData.logs);
  }
  useEffect(() => {
    refreshHistory();
  }, [id]);
  async function addNote() {
    if (!text.trim()) return;
    await api.addObservation(id, text);
    setText("");
    await refreshHistory();
  }
  return (
    <>
      <CallDetailBase />
      <CallOutcomeActions />
      <section className="panel history-panel">
        <div className="history-tabs">
          <button
            className={
              tab === "observations" ? "history-tab active" : "history-tab"
            }
            onClick={() => setTab("observations")}
          >
            Observacoes <b>{observations.length}</b>
          </button>
          <button
            className={tab === "logs" ? "history-tab active" : "history-tab"}
            onClick={() => setTab("logs")}
          >
            Auditoria <b>{logs.length}</b>
          </button>
        </div>
        {tab === "observations" ? (
          <>
            <div className="observation-compose">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Registrar uma observacao operacional..."
                rows={3}
              />
              <button className="primary-button compact" onClick={addNote}>
                Adicionar observacao
              </button>
            </div>
            <div className="history-list">
              {observations.length ? (
                observations.map((item) => (
                  <div className="history-item" key={item.id}>
                    <div className="history-avatar">
                      {item.userName.slice(0, 1)}
                    </div>
                    <div>
                      <strong>{item.userName}</strong>
                      <small>
                        {new Date(item.createdAt).toLocaleString("pt-BR")}
                      </small>
                      <p>{item.text}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  Nenhuma observacao registrada.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="history-list">
            {logs.length ? (
              logs.map((item) => (
                <div className="history-item" key={item.id}>
                  <div className="history-avatar log">↗</div>
                  <div>
                    <strong>{item.userName}</strong>
                    <small>
                      {new Date(item.createdAt).toLocaleString("pt-BR")}
                    </small>
                    <p>
                      <b>{item.action}</b>
                      <br />
                      {item.previousValue || "vazio"} →{" "}
                      {item.newValue || "vazio"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">Nenhuma alteracao registrada.</div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
function CallOutcomeActions() {
  const { pathname } = useLocation();
  const id = pathname.split("/").pop()!;
  const [call, setCall] = useState<Call | null>(null);
  const [result, setResult] = useState("");
  const [executedAt, setExecutedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [message, setMessage] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [canDeleteCall, setCanDeleteCall] = useState(false);
  useEffect(() => { api.call(id).then((data) => setCall(data.call)).catch(() => setCall(null)); }, [id]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('jh-redeflow-session');
      const session = raw ? JSON.parse(raw) : null;
      setCanDeleteCall(Boolean(session?.user?.role?.permissions?.includes('calls.delete')));
    } catch {
      setCanDeleteCall(false);
    }
  }, []);
  async function finish() {
    setMessage("");
    setMissing([]);
    setSaving(true);
    try {
      await api.finishCall(id, { result, executedAt, notes });
      setMessage("Chamado finalizado com sucesso."); setConfirmed(true); setTimeout(() => window.location.reload(), 1100);
    } catch (error) {
      const typedError = error as Error & { missing?: string[] };
      setMessage(typedError.message);
      setMissing(typedError.missing || []);
    } finally { setSaving(false); }
  }
  async function cancel() {
    if (!cancelReason.trim()) {
      setMessage("Informe o motivo do cancelamento.");
      return;
    }
    setSaving(true);
    try { await api.cancelCall(id, cancelReason); setMessage("Chamado cancelado com sucesso."); setConfirmed(true); setTimeout(() => window.location.reload(), 1100); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Nao foi possivel cancelar o chamado."); }
    finally { setSaving(false); }
  }
  async function reopen() {
    try { setSaving(true); const data = await api.reopenCall(id); setCall(data.call); setMessage("Chamado reaberto com sucesso."); setConfirmed(true); setTimeout(() => window.location.reload(), 1100); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Nao foi possivel reabrir o chamado."); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!window.confirm('Deseja apagar este chamado de teste? Essa acao nao pode ser desfeita.')) return;
    setSaving(true);
    try {
      await api.deleteCall(id);
      setMessage('Chamado removido com sucesso.');
      setTimeout(() => { window.location.href = '/chamados/abertos'; }, 600);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nao foi possivel apagar o chamado.');
    } finally {
      setSaving(false);
    }
  }
  const closed = call ? ["Finalizado", "Cancelado"].includes(call.status) : false;
  return (
    <section className="panel outcome-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">ENCERRAMENTO</span>
          <h2>Finalizar ou cancelar</h2>
        </div>
      </div>
      {closed ? <div className="closed-call-action"><p>Este chamado está encerrado e não pode mais ser alterado.</p><button className="primary-button compact" onClick={reopen} disabled={saving}>{saving ? "Reabrindo..." : "Reabrir chamado"} <ChevronRight size={16} /></button></div> : <div className="outcome-grid">
        <div>
          <div className="required-checks">
            <span>Tecnico</span><span>Resultado</span><span>Data/hora</span><span>Observacao</span>
          </div>
          <div className="outcome-fields">
            <label className="detail-label">Resultado<input value={result} onChange={(event) => setResult(event.target.value)} placeholder="Ex.: reparo realizado" /></label>
            <label className="detail-label">Data e hora de execucao<input type="datetime-local" value={executedAt} onChange={(event) => setExecutedAt(event.target.value)} /></label>
            <label className="detail-label">Observacao final<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Descreva a execucao" /></label>
          </div>
          <button className="primary-button compact" onClick={finish} disabled={saving}>{saving ? "Finalizando..." : "Finalizar chamado"} <ChevronRight size={16} /></button>
          {missing.length > 0 && <div className="validation-error">Faltando: {missing.join(", ")}</div>}
        </div>
        <div className="cancel-box">
          <span className="section-kicker">CANCELAMENTO</span>
          <label className="detail-label">Motivo<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={3} placeholder="Informe por que o chamado será cancelado" /></label>
          <button className="cancel-button" onClick={cancel} disabled={saving}>{saving ? "Cancelando..." : "Cancelar chamado"}</button>
          {canDeleteCall && (
            <button className="delete-button" onClick={remove} disabled={saving}>{saving ? "Excluindo..." : "Apagar chamado"}</button>
          )}
        </div>
      </div>}
      {message && <div className="save-message">{message}</div>}
      {confirmed && <div className="call-confirmation" role="status"><span>✓</span><strong>Alteração confirmada</strong><small>Atualizando a ordem...</small></div>}
    </section>
  );
}
function CallDetailRoute() {
  return <AuditedCallDetailPage />;
}
function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}
function TechniciansPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [regionFilter, setRegionFilter] = useState("Todas");
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [form, setForm] = useState({ name: "", registration: "", supervisorId: "", teamRole: "Tecnico" as Technician["teamRole"], leadTechnicianId: "", region: "", shift: "", currentStatus: "Disponivel" as Technician["currentStatus"], active: true });
  async function load() {
    try {
      const [technicianData, supervisorData] = await Promise.all([api.technicians(), api.supervisors()]);
      setTechnicians(technicianData.technicians); setSupervisors(supervisorData.supervisors);
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel carregar tecnicos."); }
  }
  useEffect(() => {
    load();
    const interval = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(interval);
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try { await api.createTechnician({ ...form, supervisorId: form.supervisorId || undefined, leadTechnicianId: form.teamRole === "Auxiliar" ? form.leadTechnicianId || undefined : undefined }); setShowForm(false); setForm({ name: "", registration: "", supervisorId: "", teamRole: "Tecnico", leadTechnicianId: "", region: "", shift: "", currentStatus: "Disponivel", active: true }); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel criar tecnico."); }
  }
  const regions = [...new Set(technicians.map((technician) => technician.region))];
  const visibleTechnicians = technicians.filter((technician) => `${technician.name} ${technician.registration} ${technician.region}`.toLowerCase().includes(query.toLowerCase()) && (statusFilter === "Todos" || technician.currentStatus === statusFilter) && (regionFilter === "Todas" || technician.region === regionFilter));
  async function changeStatus(technician: Technician, currentStatus: Technician["currentStatus"]) {
    try { const result = await api.updateTechnician(technician.id, { currentStatus }); setTechnicians((items) => items.map((item) => item.id === result.technician.id ? { ...item, ...result.technician } : item)); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel atualizar status."); }
  }
  async function changeActive(technician: Technician, active: boolean) {
    try { const result = await api.updateTechnician(technician.id, { active }); setTechnicians((items) => items.map((item) => item.id === result.technician.id ? { ...item, ...result.technician } : item)); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel atualizar a ativacao."); }
  }
  async function assignAssistant(technician: Technician, leadTechnicianId: string) {
    try { const result = await api.updateTechnician(technician.id, { leadTechnicianId: leadTechnicianId || null }); setTechnicians((items) => items.map((item) => item.id === result.technician.id ? { ...item, ...result.technician } : item)); setSelectedTechnician(result.technician); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel vincular o auxiliar."); }
  }
  async function removeTechnician(technician: Technician) {
    if (!window.confirm(`Deseja excluir ${technician.name}? O técnico ficará inativo e seus chamados históricos serão preservados.`)) return;
    try { await api.deleteTechnician(technician.id); setSelectedTechnician(null); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel excluir o tecnico."); }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">EQUIPES</span>
          <h1>Tecnicos</h1>
          <p>Consulte disponibilidade, escala e supervisor de cada tecnico.</p>
        </div>
        <button className="primary-button compact" onClick={() => setShowForm(true)}>
          <Users size={16} /> Novo tecnico
        </button>
      </div>
      <div className="metric-grid team-metrics">
        <Metric
          label="Tecnicos ativos"
          value={String(
            technicians.filter((technician) => technician.active).length,
          )}
          note="Na operacao"
          positive
        />
        <Metric
          label="Em campo"
          value={String(
            technicians.filter(
              (technician) => technician.currentStatus === "Em campo",
            ).length,
          )}
          note="Atendimento em curso"
        />
        <Metric
          label="Disponiveis"
          value={String(
            technicians.filter(
              (technician) => technician.currentStatus === "Disponivel",
            ).length,
          )}
          note="Prontos para atribuicao"
          positive
        />
        <Metric
          label="Regioes"
          value={String(
            new Set(technicians.map((technician) => technician.region)).size,
          )}
          note="Areas cobertas"
        />
      </div>
      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou matricula" />
          </div>
          <button className="secondary-button compact" onClick={() => setShowFilters((current) => !current)}>
            <SlidersHorizontal size={15} /> Filtros
          </button>
          {showFilters && <><select className="toolbar-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todos</option><option>Disponivel</option><option>Em campo</option><option>Indisponivel</option></select><select className="toolbar-select" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option>Todas</option>{regions.map((region) => <option key={region}>{region}</option>)}</select></>}
        </div>
        {error ? (
          <div className="empty-state">{error}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tecnico</th>
                <th>Tipo</th>
                <th>Matricula</th>
                <th>Supervisor</th>
                <th>Regiao</th>
                <th>Turno</th>
                <th>Situacao</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleTechnicians.map((technician) => (
                <tr key={technician.id} onClick={() => setSelectedTechnician(technician)}>
                  <td>
                    <div className="user-cell">
                      <div className="avatar">
                        {technician.name
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <strong>{technician.name}</strong>
                    </div>
                  </td>
                  <td><span className="role-pill">{technician.teamRole}</span></td>
                  <td>{technician.registration}</td>
                  <td>{technician.supervisorName || "Sem supervisor"}</td>
                  <td>{technician.region}</td>
                  <td>{technician.shift}</td>
                  <td>
                    <select className="status-select" value={technician.currentStatus} onClick={(event) => event.stopPropagation()} onChange={(event) => changeStatus(technician, event.target.value as Technician["currentStatus"])} aria-label={`Status de ${technician.name}`}>
                      <option>Disponivel</option><option>Em campo</option><option>Indisponivel</option>
                    </select>
                  </td>
                  <td>
                    <select className="status-select" value={technician.active ? "true" : "false"} onClick={(event) => event.stopPropagation()} onChange={(event) => void changeActive(technician, event.target.value === "true")} aria-label={`Ativacao de ${technician.name}`}>
                      <option value="true">Ativo</option>
                      <option value="false">Inativo</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {showForm && <AdminModal title="Novo tecnico" onClose={() => setShowForm(false)}><form className="admin-form" onSubmit={save}>
        <label>Nome<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label>Matricula<input value={form.registration} onChange={(event) => setForm({ ...form, registration: event.target.value })} required /></label>
        <label>Tipo<select value={form.teamRole} onChange={(event) => setForm({ ...form, teamRole: event.target.value as Technician["teamRole"], leadTechnicianId: "" })}><option value="Tecnico">Técnico</option><option value="Auxiliar">Auxiliar</option></select></label>
        {form.teamRole === "Auxiliar" && <label>Técnico responsável<select value={form.leadTechnicianId} onChange={(event) => setForm({ ...form, leadTechnicianId: event.target.value })} required><option value="">Selecione o técnico</option>{technicians.filter((technician) => technician.teamRole === "Tecnico").map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>}
        <label>Supervisor<select value={form.supervisorId} onChange={(event) => setForm({ ...form, supervisorId: event.target.value })}><option value="">Sem supervisor</option>{supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}</select></label>
        <label>Regiao<input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} required /></label>
        <label>Turno<input value={form.shift} onChange={(event) => setForm({ ...form, shift: event.target.value })} placeholder="07:00 - 16:00" required /></label>
        <label>Status<select value={form.currentStatus} onChange={(event) => setForm({ ...form, currentStatus: event.target.value as Technician["currentStatus"] })}><option>Disponivel</option><option>Em campo</option><option>Indisponivel</option></select></label>
        <button className="primary-button" type="submit">Cadastrar tecnico <ChevronRight size={16} /></button>
      </form></AdminModal>}
      {selectedTechnician && <AdminModal title={selectedTechnician.name} onClose={() => setSelectedTechnician(null)}>
        <div className="detail-grid">
          <DetailItem label="Tipo" value={selectedTechnician.teamRole} /><DetailItem label="Matrícula" value={selectedTechnician.registration} /><DetailItem label="Região" value={selectedTechnician.region} /><DetailItem label="Turno" value={selectedTechnician.shift} /><DetailItem label="Supervisor" value={selectedTechnician.supervisorName || "Sem supervisor"} /><DetailItem label="Status" value={selectedTechnician.currentStatus} />
        </div>
        {selectedTechnician.teamRole === "Tecnico" ? <div className="team-member-list"><strong>Auxiliares vinculados</strong>{technicians.filter((technician) => technician.leadTechnicianId === selectedTechnician.id).map((assistant) => <span key={assistant.id}>{assistant.name} · {assistant.registration}</span>)}{!technicians.some((technician) => technician.leadTechnicianId === selectedTechnician.id) && <small>Nenhum auxiliar vinculado.</small>}</div> : <label className="detail-label">Técnico responsável<select value={selectedTechnician.leadTechnicianId || ""} onChange={(event) => void assignAssistant(selectedTechnician, event.target.value)}><option value="">Sem vínculo</option>{technicians.filter((technician) => technician.teamRole === "Tecnico" && technician.id !== selectedTechnician.id).map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>}
        <button className="delete-button" type="button" onClick={() => void removeTechnician(selectedTechnician)}>Excluir técnico</button>
      </AdminModal>}
    </>
  );
}
function SupervisorsPage({ user }: { user: User & { role: Role } }) {
  const [data, setData] = useState<{
    supervisors: {
      id: string;
      userId?: string;
      name: string;
      region: string;
      active: boolean;
      technicianCount: number;
    }[];
    technicians: Technician[];
  }>({ supervisors: [], technicians: [] });
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", region: "", userId: "", active: true });
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("Todas");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSupervisor, setSelectedSupervisor] = useState<typeof data.supervisors[number] | null>(null);
  const [assigning, setAssigning] = useState(false);
  async function load() {
    try {
      const supervisorData = await api.supervisors();
      setData(supervisorData);
      if (user.role.permissions.includes("users.view")) setUsers((await api.users()).users);
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel carregar supervisores."); }
  }
  useEffect(() => {
    load();
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try { await api.createSupervisor({ ...form, userId: form.userId || undefined }); setShowForm(false); setForm({ name: "", region: "", userId: "", active: true }); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel criar supervisor."); }
  }
  function openTeam(supervisor: typeof data.supervisors[number]) { setSelectedSupervisor(supervisor); }
  async function assignTechnician(event: React.ChangeEvent<HTMLSelectElement>) {
    const technicianId = event.target.value;
    if (!technicianId || !selectedSupervisor) return;
    setAssigning(true);
    try {
      await api.updateTechnician(technicianId, { supervisorId: selectedSupervisor.id });
      await load();
      setSelectedSupervisor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel adicionar tecnico.");
    } finally {
      setAssigning(false);
    }
  }
  async function linkUser(userId: string) {
    if (!selectedSupervisor) return;
    try {
      const result = await api.updateSupervisor(selectedSupervisor.id, { userId: userId || null });
      setSelectedSupervisor(result.supervisor);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel vincular o login."); }
  }
  const regions = [...new Set(data.supervisors.map((supervisor) => supervisor.region))];
  const visibleSupervisors = data.supervisors.filter((supervisor) => `${supervisor.name} ${supervisor.region}`.toLowerCase().includes(query.toLowerCase()) && (regionFilter === "Todas" || supervisor.region === regionFilter));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">EQUIPES</span>
          <h1>Supervisores</h1>
          <p>
            Visualize a estrutura das equipes e o tecnico sob cada supervisao.
          </p>
        </div>
        <button className="primary-button compact" onClick={() => setShowForm(true)}>
          <Building2 size={16} /> Novo supervisor
        </button>
      </div>
      <div className="team-toolbar"><div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar supervisor ou regiao" /></div><button className="secondary-button compact" onClick={() => setShowFilters((current) => !current)}><SlidersHorizontal size={15} /> Filtros</button>{showFilters && <select className="toolbar-select" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option>Todas</option>{regions.map((region) => <option key={region}>{region}</option>)}</select>}</div>
      <div className="supervisor-grid">
        {error && <div className="form-error">{error}</div>}
        {visibleSupervisors.map((supervisor) => (
          <section className="panel supervisor-card" key={supervisor.id}>
            <div className="supervisor-heading">
              <div className="supervisor-avatar">
                <Building2 size={17} />
              </div>
              <div>
                <h2>{supervisor.name}</h2>
                <div className="supervisor-meta"><span>{supervisor.region}</span><strong>{supervisor.technicianCount} tecnicos</strong></div>
              </div>
              <button className="icon-button" type="button" onClick={() => openTeam(supervisor)} title="Abrir equipe">
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="team-list">
              {data.technicians
                .filter(
                  (technician) => technician.supervisorId === supervisor.id,
                )
                .map((technician) => (
                  <div className="team-member" key={technician.id}>
                    <div className="avatar">
                      {technician.name
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div>
                      <strong>{technician.name}</strong>
                      <span>
                        {technician.registration} · {technician.shift}
                      </span>
                    </div>
                    <i
                      className={`member-dot ${technician.currentStatus === "Em campo" ? "field" : technician.active ? "ready" : "off"}`}
                    />
                  </div>
                ))}
              {!data.technicians.some((technician) => technician.supervisorId === supervisor.id) && <div className="team-empty"><Users size={18} /><span>Nenhum tecnico vinculado</span><small>Abra a equipe para adicionar profissionais.</small></div>}
            </div>
            <button className="link-button team-link" type="button" onClick={() => openTeam(supervisor)}>
              Ver chamados da equipe <ChevronRight size={14} />
            </button>
          </section>
        ))}
      </div>
      {showForm && <AdminModal title="Novo supervisor" onClose={() => setShowForm(false)}><form className="admin-form" onSubmit={save}>
        <label>Nome<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label>Regiao<input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} required /></label>
        {user.role.permissions.includes("users.view") && <label>Login do supervisor<select value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })}><option value="">Selecionar depois</option>{users.filter((account) => account.role?.name === "Supervisor" || account.roleId === "role-supervisor").map((account) => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>)}</select></label>}
        <button className="primary-button" type="submit">Cadastrar supervisor <ChevronRight size={16} /></button>
      </form></AdminModal>}
      {selectedSupervisor && <AdminModal title={`Equipe de ${selectedSupervisor.name}`} onClose={() => setSelectedSupervisor(null)}>
        {user.role.permissions.includes("users.view") && <label className="detail-label">Login vinculado<select value={selectedSupervisor.userId || ""} onChange={(event) => void linkUser(event.target.value)}><option value="">Sem login vinculado</option>{users.filter((account) => account.role?.name === "Supervisor" || account.roleId === "role-supervisor").map((account) => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>)}</select></label>}
        <div className="team-detail-list">
          <div className="panel-heading"><div><span className="section-kicker">EQUIPE ATUAL</span><h2>{data.technicians.filter((technician) => technician.supervisorId === selectedSupervisor.id).length} tecnicos</h2></div></div>
          {data.technicians.filter((technician) => technician.supervisorId === selectedSupervisor.id).map((technician) => <div className="team-member" key={technician.id}><div className="avatar">{technician.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div><strong>{technician.name}</strong><span>{technician.registration} · {technician.shift}</span></div><i className={`member-dot ${technician.currentStatus === "Em campo" ? "field" : technician.active ? "ready" : "off"}`} /></div>)}
          {!data.technicians.some((technician) => technician.supervisorId === selectedSupervisor.id) && <div className="empty-state">Nenhum tecnico nesta equipe.</div>}
        </div>
        <label className="detail-label">Adicionar tecnico<select defaultValue="" disabled={assigning} onChange={assignTechnician}><option value="">Selecione um tecnico</option>{data.technicians.filter((technician) => technician.supervisorId !== selectedSupervisor.id).map((technician) => <option key={technician.id} value={technician.id}>{technician.name} · {technician.registration}</option>)}</select></label>
      </AdminModal>}
    </>
  );
}
function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<
    { code: string; description: string }[]
  >([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState({ name: "", description: "", permissions: [] as string[] });
  const [error, setError] = useState("");
  async function load() {
    try { const data = await api.roles(); setRoles(data.roles); setPermissions(data.permissions); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel carregar cargos."); }
  }
  useEffect(() => {
    load();
  }, []);
  function openForm(role?: Role) { setEditing(role || null); setShowForm(true); setForm({ name: role?.name || "", description: role?.description || "", permissions: role?.permissions || [] }); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editing) await api.updateRole(editing.id, form); else await api.createRole(form);
      setShowForm(false);
      await load();
      window.location.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel salvar cargo."); }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">CONTROLE DE ACESSO</span>
          <h1>Cargos e permissoes</h1>
          <p>Defina os limites de cada funcao dentro da operacao.</p>
        </div>
        <button className="primary-button compact" onClick={() => openForm()}>
          <ShieldCheck size={16} /> Novo cargo
        </button>
      </div>
      <div className="roles-layout">
        <section className="panel roles-list">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">CARGOS</span>
              <h2>Perfis de acesso</h2>
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          {roles.map((role) => (
            <button className="role-row role-row-button" key={role.id} onClick={() => openForm(role)}>
              <div className="role-symbol">
                <ShieldCheck size={17} />
              </div>
              <div>
                <strong>{role.name}</strong>
                <span>{role.description}</span>
              </div>
              <b>{role.permissions.length} permissoes</b>
              <ChevronRight size={16} />
            </button>
          ))}
        </section>
        <section className="panel permissions-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">CATALOGO</span>
              <h2>Permissoes disponiveis</h2>
            </div>
          </div>
          <div className="permissions-catalog">
            {permissions.map((permission) => (
              <div className="permission-row" key={permission.code}>
                <span>{permission.code}</span>
                <small>{permission.description}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
      {showForm && <AdminModal title={editing ? "Editar cargo" : "Novo cargo"} onClose={() => setShowForm(false)}><form className="admin-form" onSubmit={save}>
        <label>Nome<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label>Descricao<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} required /></label>
        <fieldset><legend>Permissoes</legend>{permissions.map((permission) => <label className="checkbox-label" key={permission.code}><input type="checkbox" checked={form.permissions.includes(permission.code)} onChange={(event) => setForm({ ...form, permissions: event.target.checked ? [...form.permissions, permission.code] : form.permissions.filter((code) => code !== permission.code) })} /> <span><b>{permission.code}</b><small>{permission.description}</small></span></label>)}</fieldset>
        <button className="primary-button" type="submit">Salvar cargo <ChevronRight size={16} /></button>
      </form></AdminModal>}
    </>
  );
}
function SettingsPage() {
  const [settings, setSettings] = useState({ autoRefresh: true, refreshIntervalSeconds: 60, slaAlertHours: 8, defaultRegion: "Todas" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api.settings().then((data) => setSettings(data.settings)).catch((err) => setError(err.message)); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try { const result = await api.updateSettings(settings); setSettings(result.settings); setMessage("Configuracoes salvas."); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel salvar configuracoes."); }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">SISTEMA</span>
          <h1>Configuracoes</h1>
          <p>Preferencias gerais do ambiente O&amp;M.</p>
        </div>
      </div>
      <form className="panel settings-panel settings-form" onSubmit={save}>
        <div className="settings-icon"><Settings size={20} /></div>
        <div className="settings-fields">
          <h2>Configuracoes operacionais</h2>
          <p>Defina os parametros usados pelo acompanhamento da operacao.</p>
          <label className="checkbox-label"><input type="checkbox" checked={settings.autoRefresh} onChange={(event) => setSettings({ ...settings, autoRefresh: event.target.checked })} /> Atualizar indicadores automaticamente</label>
          <label>Intervalo de atualizacao (segundos)<input type="number" min="10" max="3600" value={settings.refreshIntervalSeconds} onChange={(event) => setSettings({ ...settings, refreshIntervalSeconds: Number(event.target.value) })} /></label>
          <label>Alerta de SLA (horas)<input type="number" min="1" max="72" value={settings.slaAlertHours} onChange={(event) => setSettings({ ...settings, slaAlertHours: Number(event.target.value) })} /></label>
          <label>Regiao padrao<input value={settings.defaultRegion} onChange={(event) => setSettings({ ...settings, defaultRegion: event.target.value })} /></label>
          <button className="primary-button compact" type="submit">Salvar configuracoes <ChevronRight size={16} /></button>
          {message && <div className="save-message">{message}</div>}
          {error && <div className="form-error">{error}</div>}
        </div>
      </form>
    </>
  );
}

export default function App() {
  const [session, setSession] = useState<{
    token: string;
    user: User & { role: Role };
  } | null>(() => {
    const raw = localStorage.getItem("jh-redeflow-session");
    return raw ? JSON.parse(raw) : null;
  });
  const [hydrating, setHydrating] = useState(() =>
    Boolean(localStorage.getItem("jh-redeflow-token")),
  );

  useEffect(() => {
    if (!localStorage.getItem("jh-redeflow-token")) {
      setHydrating(false);
      return;
    }

    api
      .me()
      .then(({ user }) => {
        const refreshedSession = {
          token: localStorage.getItem("jh-redeflow-token")!,
          user,
        };
        localStorage.setItem(
          "jh-redeflow-session",
          JSON.stringify(refreshedSession),
        );
        setSession(refreshedSession);
      })
      .catch(() => {
        localStorage.removeItem("jh-redeflow-token");
        localStorage.removeItem("jh-redeflow-session");
        setSession(null);
      })
      .finally(() => setHydrating(false));
  }, []);

  function login(nextSession: { token: string; user: User & { role: Role } }) {
    localStorage.setItem("jh-redeflow-token", nextSession.token);
    localStorage.setItem("jh-redeflow-session", JSON.stringify(nextSession));
    setSession(nextSession);
  }

  function logout() {
    localStorage.removeItem("jh-redeflow-token");
    localStorage.removeItem("jh-redeflow-session");
    setSession(null);
  }

  if (hydrating)
    return (
      <div className="app-loading">
        <img className="loading-mark logo-image" src={faviconUrl} alt="JH Telecom" />
        <span>Carregando O&amp;M...</span>
      </div>
    );
  if (!session) return <Login onLogin={login} />;
  return <Shell user={session.user} onLogout={logout} />;
}
