import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Archive, Bell, BellRing, CalendarDays, Camera, ChevronRight, ClipboardCheck, Gauge, HardHat, Inbox, LayoutDashboard, LogOut, Menu, Repeat2, Settings, ShieldCheck, Upload, UserCog, Users, Wrench, X, type LucideIcon } from "lucide-react";
import faviconUrl from "../../image/favicon.ico";
import { api, type Role, type User, type AppNotification } from "../api";
import { RepeatedCallsPage } from "../repeated-calls";
import { AccessDenied } from "./ui";
import { ActivationsPage } from "../pages/ActivationsPage";
import { CallDetailRoute } from "../pages/CallDetailPage";
import { CallsPage, SupervisorOrdersPage } from "../pages/CallsPage";
import { DashboardWithDateFilter } from "../pages/DashboardPage";
import { IGPPage } from "../pages/IgpPage";
import { ImportsPage } from "../pages/ImportsPage";
import { ManualProductionDashboard } from "../pages/ManualProductionPage";
import { RolesPage } from "../pages/RolesPage";
import { SettingsPage } from "../pages/SettingsPage";
import { SupervisorsPage } from "../pages/SupervisorsPage";
import { TechniciansPage } from "../pages/TechniciansPage";
import { UsersPage } from "../pages/UsersPage";

type NavItem = { label: string; to: string; icon: LucideIcon; permission: string; section: string; roles?: string[]; counter?: "unassigned" | "activations" };

export const navItems: NavItem[] = [
  { section: "Operação", label: "Visão geral", to: "/", icon: LayoutDashboard, permission: "dashboard.view" },
  { section: "Operação", label: "Chamados abertos", to: "/chamados/abertos", icon: Inbox, permission: "calls.view", counter: "unassigned" },
  { section: "Operação", label: "Em atendimento", to: "/chamados/atendimento", icon: Wrench, permission: "calls.view" },
  { section: "Operação", label: "Finalizados e cancelados", to: "/chamados/finalizados", icon: Archive, permission: "calls.view" },
  { section: "Operação", label: "Repetidos", to: "/repetidos", icon: Repeat2, permission: "calls.view" },
  { section: "Operação", label: "Ordens da equipe", to: "/supervisor/ordens", icon: ClipboardCheck, permission: "calls.view", roles: ["Supervisor"] },
  { section: "Operação", label: "Acionamentos", to: "/acionamentos", icon: BellRing, permission: "activations.view", counter: "activations" },
  { section: "Indicadores", label: "Painel diário", to: "/painel-diario", icon: CalendarDays, permission: "dashboard.view" },
  { section: "Indicadores", label: "IGP", to: "/igp", icon: Gauge, permission: "dashboard.view" },
  { section: "Equipes", label: "Técnicos", to: "/tecnicos", icon: HardHat, permission: "technicians.view" },
  { section: "Equipes", label: "Supervisores", to: "/supervisores", icon: UserCog, permission: "supervisors.view" },
  { section: "Administração", label: "Importações", to: "/importacoes", icon: Upload, permission: "imports.view" },
  { section: "Administração", label: "Usuários", to: "/usuarios", icon: Users, permission: "users.view" },
  { section: "Administração", label: "Cargos e permissões", to: "/cargos", icon: ShieldCheck, permission: "roles.view" },
  { section: "Administração", label: "Configurações", to: "/configuracoes", icon: Settings, permission: "settings.manage" },
];

function navItemForPath(pathname: string) {
  if (pathname === "/") return navItems[0];
  return navItems.find((item) => item.to !== "/" && pathname.startsWith(item.to));
}

export async function resizeProfilePhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");
  if (file.size > 10 * 1024 * 1024) throw new Error("A imagem original deve ter no máximo 10 MB.");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível processar esta imagem.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const avatarDataUrl = canvas.toDataURL("image/jpeg", 0.82);
  if (avatarDataUrl.length > 350_000) throw new Error("Não foi possível reduzir a imagem para o tamanho permitido.");
  return avatarDataUrl;
}

export function ProfilePhotoButton({ name, photo, className = "", disabled = false, onClick }: {
  name: string;
  photo: string | null;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const initials = name.split(" ").map((part) => part[0]).slice(0, className.includes("topbar") ? 1 : 2).join("");
  return (
    <button className={`profile-photo-button ${className}`} type="button" onClick={onClick} disabled={disabled} title="Alterar foto de perfil" aria-label="Alterar foto de perfil">
      {photo ? <img src={photo} alt="" /> : initials}
      <span className="profile-photo-camera"><Camera size={12} /></span>
    </button>
  );
}

export function Shell({
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
  const [activationToastClosing, setActivationToastClosing] = useState(false);
  const [bellRinging, setBellRinging] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [profilePhotoError, setProfilePhotoError] = useState("");
  const [savingProfilePhoto, setSavingProfilePhoto] = useState(false);
  const profilePhotoInput = useRef<HTMLInputElement | null>(null);
  const knownActivationIds = useRef<Set<string> | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
        async function loadNotifications() {
    setNotificationsLoading(true);
          try {
            const notificationData = await api.notifications();
            setNotifications(notificationData.notifications);
            if (user.role.permissions.includes("activations.view")) {
              const pending = (await api.activations("Pendente")).activations.map((activation) => {
                const atrelada = activation.analysis?.atrelada;
                return atrelada
                  ? { ...activation, extractedData: { ...activation.extractedData, type: `${activation.extractedData.type || "Acionamento"} · Atrelado à ordem ${atrelada}` } }
                  : activation;
              });
              const pendingIds = new Set(pending.map((activation) => activation.id));
              setActivationCount(pending.length);
              if (knownActivationIds.current) {
                const newActivation = pending.find((activation) => !knownActivationIds.current?.has(activation.id));
                if (newActivation) {
                  setActivationToastClosing(false);
                  setBellRinging(true);
                  window.setTimeout(() => setBellRinging(false), 900);
                  setActivationToast({ id: newActivation.id, type: "info", title: "Novo acionamento recebido", detail: newActivation.extractedData.orderNumber ? `Ordem ${newActivation.extractedData.orderNumber} aguardando análise.` : "Existe um acionamento aguardando análise.", href: "/acionamentos" });
                  window.setTimeout(() => setActivationToastClosing(true), 7000);
                  window.setTimeout(() => { setActivationToast(null); setActivationToastClosing(false); }, 8000);
                }
              }
              knownActivationIds.current = pendingIds;
            }
          } catch { setNotifications([]); } finally { setNotificationsLoading(false); }
  }
  useEffect(() => { void loadNotifications(); const interval = window.setInterval(() => void loadNotifications(), 15000); return () => window.clearInterval(interval); }, [location.pathname]);
  useEffect(() => {
    let active = true;
    api.profileAvatar().then(({ avatarDataUrl }) => { if (active) setProfilePhoto(avatarDataUrl); }).catch(() => {});
    return () => { active = false; };
  }, [user.id]);
  async function handleProfilePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setProfilePhotoError("");
    setSavingProfilePhoto(true);
    try {
      const avatarDataUrl = await resizeProfilePhoto(file);
      const saved = await api.saveProfileAvatar(avatarDataUrl);
      setProfilePhoto(saved.avatarDataUrl);
    } catch (error) {
      setProfilePhotoError(error instanceof Error ? error.message : "Não foi possível salvar a foto.");
    } finally {
      setSavingProfilePhoto(false);
    }
  }
  const canAccess = (permission: string) => user.role.permissions.includes(permission);
  const guard = (permission: string, element: React.ReactNode) => (canAccess(permission) ? element : <AccessDenied />);
  const firstAllowedPath = navItems.find((item) => canAccess(item.permission) && (!item.roles || item.roles.includes(user.role.name)))?.to;
  function toggleSidebar() {
    setDesktopCollapsed((current) => {
      const next = !current;
      localStorage.setItem("jh-redeflow-sidebar-collapsed", String(next));
      return next;
    });
  }
  const currentItem = navItemForPath(location.pathname);
  const isCallDetail = !currentItem && location.pathname.startsWith("/chamados/");
  const section = isCallDetail ? "Operação" : currentItem?.section ?? "O&M";
  const title = isCallDetail ? "Detalhe do chamado" : currentItem?.label ?? "Visão geral";
  const counters = {
    unassigned: notifications.find((item) => item.id === "unassigned-calls")?.count ?? 0,
    activations: activationCount,
  };
  const visibleItems = navItems.filter((item) => canAccess(item.permission) && (!item.roles || item.roles.includes(user.role.name)));
  const sections = [...new Set(visibleItems.map((item) => item.section))];
  useEffect(() => {
    document.title = `${title} · JH Telecom - Rede`;
  }, [title]);
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
        <nav aria-label="Menu principal">
          {sections.map((sectionName) => (
            <div className="nav-section" key={sectionName}>
              <span className="nav-section-title">{sectionName}</span>
              {visibleItems.filter((item) => item.section === sectionName).map((item) => {
                const count = item.counter ? counters[item.counter] : 0;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    onClick={() => setMobileOpen(false)}
                    title={desktopCollapsed ? (count ? `${item.label} (${count})` : item.label) : undefined}
                    className={({ isActive }) => (isActive || (item.to === "/chamados/atendimento" && isCallDetail) ? "nav-item active" : "nav-item")}
                  >
                    <item.icon size={18} aria-hidden="true" />
                    <span>{item.label}</span>
                    {count > 0 && <b className={`nav-count${item.counter === "unassigned" ? " is-warning" : ""}`} aria-label={item.counter === "unassigned" ? `${count} sem técnico` : `${count} pendentes`}>{count > 99 ? "99+" : count}</b>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-mini">
            <ProfilePhotoButton name={user.name} photo={profilePhoto} className="avatar" disabled={savingProfilePhoto} onClick={() => profilePhotoInput.current?.click()} />
            <div>
              <strong>{user.name}</strong>
              <small className={profilePhotoError ? "profile-photo-error" : undefined}>{profilePhotoError || user.role.name}</small>
            </div>
            <input ref={profilePhotoInput} className="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleProfilePhotoChange(event)} />
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
            aria-label={desktopCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            <Menu size={20} />
          </button>
          <nav className="breadcrumbs" aria-label="Você está em">
            <span>{section}</span>
            <ChevronRight size={14} aria-hidden="true" />
            {isCallDetail ? <><NavLink to="/chamados/atendimento">Chamados</NavLink><ChevronRight size={14} aria-hidden="true" /></> : null}
            <strong aria-current="page">{title}</strong>
          </nav>
          <div className="topbar-actions">
            <div className="notification-wrap">
              <button className={`icon-button notification ${bellRinging ? "is-ringing" : ""}`} onClick={() => { setNotificationsOpen((current) => !current); void loadNotifications(); }} title="Notificacoes">
                <Bell size={18} />
                {notifications.length > 0 && <i />}
              </button>
              {notificationsOpen && <div className="notification-popover"><div className="notification-heading"><strong>Notificacoes</strong><span>{notifications.length}</span></div>{notifications.length ? notifications.map((notification) => <button className="notification-item" key={notification.id} onClick={() => { setNotificationsOpen(false); navigate(notification.href); }}><b>{notification.title}</b><small>{notification.detail}</small></button>) : <div className="notification-empty">Nenhuma notificacao pendente.</div>}</div>}
            </div>
            <ProfilePhotoButton name={user.name} photo={profilePhoto} className="topbar-avatar" disabled={savingProfilePhoto} onClick={() => profilePhotoInput.current?.click()} />
          </div>
        </header>
        {activationToast && <button className={`activation-toast${activationToastClosing ? " closing" : ""}`} type="button" onClick={() => { setActivationToast(null); setActivationToastClosing(false); navigate(activationToast.href); }}><Bell size={18} /><span><strong>{activationToast.title}</strong><small>{activationToast.detail}</small></span><X size={16} /></button>}
        <div className="content">
          <Routes>
            <Route path="/" element={canAccess("dashboard.view") ? <DashboardWithDateFilter user={user} /> : firstAllowedPath ? <Navigate to={firstAllowedPath} replace /> : <AccessDenied />} />
            <Route
              path="/chamados/abertos"
              element={guard("calls.view", <CallsPage status="Aberto" title="Chamados abertos" unassignedOnly />)}
            />
            <Route
              path="/chamados/atendimento"
              element={guard("calls.view", <CallsPage title="Chamados em atendimento" assignedOnly />)}
            />
            <Route
              path="/chamados/finalizados"
              element={guard("calls.view", <CallsPage title="Finalizados e cancelados" closedOnly />)}
            />
            <Route path="/repetidos" element={guard("calls.view", <RepeatedCallsPage teamScoped={user.role.name === "Supervisor"} />)} />
            <Route path="/supervisor/ordens" element={user.role.name === "Supervisor" ? guard("calls.view", <SupervisorOrdersPage user={user} />) : <AccessDenied />} />
            <Route path="/acionamentos" element={guard("activations.view", <ActivationsPage />)} />
            <Route path="/painel-diario" element={guard("dashboard.view", <ManualProductionDashboard />)} />
            <Route path="/igp" element={guard("dashboard.view", <IGPPage />)} />
            <Route path="/importacoes" element={guard("imports.view", <ImportsPage />)} />
            <Route path="/chamados/:id" element={guard("calls.view", <CallDetailRoute />)} />
            <Route path="/tecnicos" element={guard("technicians.view", <TechniciansPage />)} />
            <Route path="/supervisores" element={guard("supervisors.view", <SupervisorsPage user={user} />)} />
            <Route path="/usuarios" element={guard("users.view", <UsersPage />)} />
            <Route path="/cargos" element={guard("roles.view", <RolesPage />)} />
            <Route path="/configuracoes" element={guard("settings.manage", <SettingsPage />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
