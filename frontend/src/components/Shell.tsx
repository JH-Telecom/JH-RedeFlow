import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, ChevronRight, LogOut, Menu, Moon, Search, Sun, X } from "lucide-react";
import { isTabHidden, navItems } from "../lib/nav-items";
import { canLeave, hasOpenDialog, isTypingTarget, submitSaveScope } from "../lib/keyboard";
import { browserNotificationState, browserNotificationsOn, disableBrowserNotifications, enableBrowserNotifications, markSeen, pageInBackground, readSeen, showBrowserNotification, signatureOf, takeNew, type BrowserNotificationState } from "../lib/browser-notifications";
export { navItems } from "../lib/nav-items";
import { applyPalette, isPaletteId, useTheme } from "../theme";
import { UpdateNotice } from "./UpdateNotice";
import { DueSoonBanner } from "./DueSoonBanner";
import { CommandPalette } from "./CommandPalette";
import { HelpTip, PAGE_HELP } from "./HelpTip";
import { ImageReadyToast } from "./ImageReadyToast";
import { ACTIVATIONS_CHANGED, ActivationToast } from "./ActivationToast";
import { markReleasesSeen, unseenReleases, WhatsNewModal } from "./WhatsNew";
import { TvModePage } from "../pages/TvModePage";
import faviconUrl from "../../image/favicon.ico";
import { api, type Activation, type Role, type User, type AppNotification, type ProfilePreferences, type UserStatus } from "../api";
import { RepeatedCallsPage } from "../repeated-calls";
import { AccessDenied } from "./ui";
import { ActivationsPage } from "../pages/ActivationsPage";
import { CallDetailRoute } from "../pages/CallDetailPage";
import { CallsPage, SupervisorOrdersPage } from "../pages/CallsPage";
import { SupervisorOverviewPage } from "../pages/SupervisorOverviewPage";
import { PopKeysPage } from "../pages/PopKeysPage";
import { NightRouterPage } from "../pages/NightRouterPage";
import { JotaHWidget } from "./JotaHWidget";
import { DashboardWithDateFilter } from "../pages/DashboardPage";
import { IGPPage } from "../pages/IgpPage";
import { SlaAnalysisPage } from "../pages/SlaAnalysisPage";
import { ReportsPage } from "../pages/ReportsPage";
import { ImportsPage } from "../pages/ImportsPage";
import { ManualProductionDashboard } from "../pages/ManualProductionPage";
import { RolesPage } from "../pages/RolesPage";
import { SettingsPage } from "../pages/SettingsPage";
import { ProfilePage } from "../pages/ProfilePage";
import { PeoplePage } from "../pages/PeoplePage";
import { IntegrationHealthPage } from "../pages/IntegrationHealthPage";
import { QueueMapPage, TechnicianLoadPage } from "../pages/OperationsPages";
import { AuditHistoryPage } from "../pages/AuditHistoryPage";
import { MonthlyReportPage } from "../pages/MonthlyReportPage";
import { FieldPage } from "../pages/FieldPage";
import { ProfileAvatar } from "./ProfileAvatar";
import { SupervisorsPage } from "../pages/SupervisorsPage";
import { TechniciansPage } from "../pages/TechniciansPage";
import { UsersPage } from "../pages/UsersPage";
import { CopyrightNotice } from "./Copyright";



function navItemForPath(pathname: string) {
  if (pathname === "/") return navItems[0];
  return navItems.find((item) => item.to !== "/" && pathname.startsWith(item.to));
}

export async function resizeProfilePhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");
  // GIF animado vai como esta (o canvas tiraria a animacao); a foto redonda mostra o centro dele.
  if (file.type === "image/gif") {
    if (file.size > 2 * 1024 * 1024) throw new Error("O GIF da foto deve ter no máximo 2 MB.");
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Não foi possível ler o GIF."));
      reader.readAsDataURL(file);
    });
  }
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

// Avatar da barra lateral e do topo: abre a pagina Meu perfil (foto, banner, apelido e tema).
function ProfileLink({ name, photo, className }: { name: string; photo: string | null; className: string }) {
  return (
    <NavLink to="/perfil" className="profile-avatar-link" title={`${name} · Meu perfil`} aria-label="Meu perfil">
      <ProfileAvatar name={name} photo={photo} className={className} />
    </NavLink>
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
  const { theme, toggle: toggleTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Secoes do menu recolhidas pelo usuario (Operacao, Indicadores...), lembradas neste navegador.
  const [collapsedSections, setCollapsedSections] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("jh-redeflow:nav-collapsed") || "[]"); } catch { return []; }
  });
  function toggleSection(name: string) {
    setCollapsedSections((current) => {
      const next = current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
      try { localStorage.setItem("jh-redeflow:nav-collapsed", JSON.stringify(next)); } catch { /* sem armazenamento */ }
      return next;
    });
  }
  useEffect(() => {
    // Ctrl+K (ou Cmd+K) abre a busca rapida de qualquer tela.
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen((current) => !current); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Esc volta para a tela anterior (ou para a principal) e Enter num campo de uma linha salva a area (lib/keyboard).
  const escapeState = useRef<{ pathname: string; home: string; go: (to: string | number) => void }>({ pathname: "", home: "/", go: () => undefined });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { if (submitSaveScope(event.target)) event.preventDefault(); return; }
      if (event.key !== "Escape" || hasOpenDialog()) return;
      // Num campo: so sai do campo (ninguem perde o que digitou); o proximo Esc volta.
      if (isTypingTarget(event.target)) { (event.target as HTMLElement).blur(); return; }
      const { pathname, home, go } = escapeState.current;
      if (pathname === "/modo-tv" || navItems.some((item) => item.to === pathname)) return;
      if (!canLeave()) return;
      event.preventDefault();
      if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) go(-1);
      else go(pathname.startsWith("/chamados/") ? "/chamados/atendimento" : home);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activationCount, setActivationCount] = useState(0);
  // Acionamentos novos esperando decisao no aviso do canto inferior direito (fila, o primeiro aparece).
  const [activationQueue, setActivationQueue] = useState<Activation[]>([]);
  const [bellRinging, setBellRinging] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  // Ponto vermelho so com algo nao visto (ao abrir o sino, tudo conta como visto) e avisos do navegador.
  const [seen, setSeen] = useState<Set<string>>(() => readSeen(user.id));
  const [browserState, setBrowserState] = useState<BrowserNotificationState>(() => browserNotificationState());
  const unseenCount = notifications.filter((item) => !seen.has(signatureOf(item))).length;
  // Com o sino aberto, o que chegar tambem conta como visto.
  useEffect(() => { if (notificationsOpen && notifications.length) setSeen(markSeen(user.id, notifications)); }, [notificationsOpen, notifications, user.id]);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [profilePhotoError, setProfilePhotoError] = useState("");
  const [savingProfilePhoto, setSavingProfilePhoto] = useState(false);
  // Apelido (so para a propria pessoa) e tema de cor do perfil.
  const [preferences, setPreferences] = useState<ProfilePreferences>({ nickname: null, palette: null });
  const displayName = preferences.nickname || user.name;
  const [myStatus, setMyStatus] = useState<UserStatus | null>(null);
  // Usuario ligado a um tecnico: aparece "Meus chamados" (tela do celular).
  const [fieldTech, setFieldTech] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { api.fieldMe().then((data) => setFieldTech(data.technician)).catch(() => setFieldTech(null)); }, [user.id]);
  async function saveMyStatus(next: UserStatus | null) { setMyStatus((await api.saveMyStatus(next)).status); }
  const knownActivationIds = useRef<Set<string> | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
        async function loadNotifications() {
    setNotificationsLoading(true);
          try {
            const notificationData = await api.notifications();
            setNotifications(notificationData.notifications);
            // Aviso do navegador so para o que e novo de verdade (e com a pessoa fora do sistema).
            const freshSignatures = takeNew(user.id, notificationData.notifications.map(signatureOf));
            if (browserNotificationsOn() && pageInBackground()) {
              for (const item of notificationData.notifications.filter((entry) => freshSignatures.has(signatureOf(entry))).slice(0, 3)) {
                showBrowserNotification({ title: item.title, body: item.detail, tag: item.id, icon: faviconUrl, onClick: () => navigate(item.href) });
              }
            }
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
                const fresh = pending.filter((activation) => !knownActivationIds.current?.has(activation.id));
                if (fresh.length) {
                  setBellRinging(true);
                  window.setTimeout(() => setBellRinging(false), 900);
                  if (browserNotificationsOn() && pageInBackground()) {
                    const first = fresh[0];
                    showBrowserNotification({ title: fresh.length === 1 ? "Novo acionamento" : `${fresh.length} novos acionamentos`, body: [first.extractedData.orderNumber, first.extractedData.type, first.extractedData.bdesk && `BDESK ${first.extractedData.bdesk}`].filter(Boolean).join(" · ") || "Acionamento recebido pelo WhatsApp", tag: "acionamentos", icon: faviconUrl, onClick: () => navigate("/acionamentos") });
                  }
                }
                // Tira da fila o que ja foi decidido (aqui ou em outra tela/computador) e junta os novos.
                setActivationQueue((queue) => [...queue.filter((item) => pendingIds.has(item.id)), ...fresh.filter((item) => !queue.some((queued) => queued.id === item.id))]);
              }
              knownActivationIds.current = pendingIds;
            }
          } catch { setNotifications([]); } finally { setNotificationsLoading(false); }
  }
  // Aceitou/recusou pelo aviso ou pela tela de Acionamentos: atualiza o sino e a fila do aviso na hora.
  useEffect(() => { const refresh = () => void loadNotifications(); window.addEventListener(ACTIVATIONS_CHANGED, refresh); return () => window.removeEventListener(ACTIVATIONS_CHANGED, refresh); }, []);
  // Sino: a cada 1 min e so com a aba visivel (antes 15 s em toda aba aberta, gastando trafego do banco).
  // Com os avisos do navegador ligados, confere tambem com a aba em segundo plano, a cada 2 min.
  useEffect(() => { void loadNotifications(); let tick = 0; const interval = window.setInterval(() => { tick += 1; if (document.visibilityState === "visible" || (browserNotificationsOn() && tick % 2 === 0)) void loadNotifications(); }, 60_000); const onVisible = () => { if (document.visibilityState === "visible") void loadNotifications(); }; document.addEventListener("visibilitychange", onVisible); return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); }; }, [location.pathname]);
  useEffect(() => {
    let active = true;
    api.profileAvatar().then(({ avatarDataUrl }) => { if (active) setProfilePhoto(avatarDataUrl); }).catch(() => {});
    // O tema salvo no perfil vale em qualquer computador; a copia local so serve para abrir ja com a cor certa.
    api.myStatus().then(({ status }) => { if (active) setMyStatus(status); }).catch(() => {});
    api.profilePreferences().then((next) => {
      if (!active) return;
      setPreferences(next);
      applyPalette(isPaletteId(next.palette) ? next.palette : "padrao");
    }).catch(() => {});
    return () => { active = false; };
  }, [user.id]);
  async function savePreferences(next: ProfilePreferences) {
    const previous = preferences;
    setPreferences(next);
    if (next.palette !== previous.palette) applyPalette(isPaletteId(next.palette) ? next.palette : "padrao");
    try {
      setPreferences(await api.saveProfilePreferences(next));
    } catch (error) {
      setPreferences(previous);
      applyPalette(isPaletteId(previous.palette) ? previous.palette : "padrao");
      throw error;
    }
  }
  function logout() {
    applyPalette("padrao"); // o proximo login neste navegador comeca no Padrao ate carregar o tema dele
    onLogout();
  }
  async function handleProfilePhotoChange(file: File) {
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
  async function handleProfilePhotoRemove() {
    setProfilePhotoError("");
    setSavingProfilePhoto(true);
    try {
      await api.removeProfileAvatar();
      setProfilePhoto(null);
    } catch (error) {
      setProfilePhotoError(error instanceof Error ? error.message : "Não foi possível remover a foto.");
    } finally {
      setSavingProfilePhoto(false);
    }
  }
  const canAccess = (permission: string) => !permission || user.role.permissions.includes(permission);
  // O que ha de novo: uma vez por versao para cada login (fecha marca como visto).
  const [whatsNew, setWhatsNew] = useState(() => unseenReleases(user.id, canAccess));
  const closeWhatsNew = () => { markReleasesSeen(user.id); setWhatsNew([]); };
  const guard = (permission: string, element: React.ReactNode) => (canAccess(permission) ? element : <AccessDenied />);
  // Abas ocultas pelo cargo (Cargos e permissoes): saem do menu, da busca e a rota fica bloqueada.
  const hiddenTabs = user.role.hiddenTabs ?? [];
  const firstAllowedPath = navItems.find((item) => canAccess(item.permission) && (!item.fieldOnly || fieldTech) && (!item.roles || item.roles.includes(user.role.name)) && !isTabHidden(hiddenTabs, item.to))?.to;
  escapeState.current = { pathname: location.pathname, home: firstAllowedPath || "/", go: (to) => (typeof to === "number" ? navigate(to) : navigate(to)) };
  function toggleSidebar() {
    setDesktopCollapsed((current) => {
      const next = !current;
      localStorage.setItem("jh-redeflow-sidebar-collapsed", String(next));
      return next;
    });
  }
  const currentItem = navItemForPath(location.pathname);
  const isCallDetail = !currentItem && location.pathname.startsWith("/chamados/");
  const isProfile = location.pathname === "/perfil";
  const section = isCallDetail ? "Operação" : isProfile ? "Conta" : currentItem?.section ?? "O&M";
  const title = isCallDetail ? "Detalhe do chamado" : isProfile ? "Meu perfil" : currentItem?.label ?? "Visão geral";
  const counters = {
    unassigned: notifications.find((item) => item.id === "unassigned-calls")?.count ?? 0,
    activations: activationCount,
  };
  const visibleItems = navItems.filter((item) => canAccess(item.permission) && (!item.fieldOnly || fieldTech) && (!item.roles || item.roles.includes(user.role.name)) && !isTabHidden(hiddenTabs, item.to));
  const currentTabHidden = Boolean(currentItem && isTabHidden(hiddenTabs, currentItem.to));
  const sections = [...new Set(visibleItems.map((item) => item.section))];
  useEffect(() => {
    document.title = `${title} · JH Telecom - Rede`;
  }, [title]);
  // Modo TV: tela cheia, sem lateral nem barra do topo (o aviso de atualizacao continua valendo).
  if (location.pathname === "/modo-tv") return canAccess("dashboard.view") ? <><UpdateNotice /><TvModePage /></> : <AccessDenied />;
  // Relatorio mensal para imprimir/PDF: sem lateral nem topo.
  if (location.pathname.startsWith("/relatorio-mensal/")) return canAccess("dashboard.view") ? <Routes><Route path="/relatorio-mensal/:month" element={<MonthlyReportPage />} /></Routes> : <AccessDenied />;
  return (
    <div className={desktopCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      {/* Teclado/leitor de tela: primeiro Tab da pagina pula o menu e vai direto ao conteudo. */}
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <UpdateNotice />
      <ImageReadyToast />
      {whatsNew.length > 0 && location.pathname !== "/perfil" && <WhatsNewModal releases={whatsNew} onClose={closeWhatsNew} />}
      {paletteOpen && (
        <CommandPalette
          links={visibleItems.map((item) => ({ label: item.label, to: item.to, section: item.section, icon: item.icon }))}
          canSearchCalls={canAccess("calls.view")}
          onClose={() => setPaletteOpen(false)}
          onNavigate={(to) => { setMobileOpen(false); navigate(to); }}
        />
      )}
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
        <button type="button" className="sidebar-search" onClick={() => setPaletteOpen(true)} title="Busca rápida (Ctrl+K)">
          <Search size={15} aria-hidden="true" />
          <span>Buscar...</span>
          <kbd>Ctrl K</kbd>
        </button>
        <nav aria-label="Menu principal">
          {sections.map((sectionName) => {
            // Com o menu so de icones as secoes ficam sempre abertas; recolhida, a secao ainda mostra a tela atual.
            const sectionCollapsed = !desktopCollapsed && collapsedSections.includes(sectionName);
            return (
            <div className={`nav-section${sectionCollapsed ? " is-collapsed" : ""}`} key={sectionName}>
              <button type="button" className="nav-section-title" onClick={() => toggleSection(sectionName)} aria-expanded={!sectionCollapsed}>
                {sectionName}
                <ChevronDown size={13} aria-hidden="true" />
              </button>
              {visibleItems.filter((item) => item.section === sectionName).map((item) => {
                const count = item.counter ? counters[item.counter] : 0;
                // Secao recolhida: os itens ficam na tela e encolhem com animacao (abrir/fechar); o da tela atual fica.
                // Escondido: inert (fora do teclado e do leitor de tela).
                const hidden = sectionCollapsed && !(item === currentItem || (item.to === "/chamados/atendimento" && isCallDetail));
                return (
                  <div key={item.to} className={`nav-item-slot${hidden ? " is-hidden" : ""}`} inert={hidden} aria-hidden={hidden || undefined}><div className="nav-item-slot-inner">
                  <NavLink
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
                  </div></div>
                );
              })}
            </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-mini">
            <ProfileLink name={displayName} photo={profilePhoto} className="avatar" />
            <NavLink to="/perfil" className="profile-mini-name" title="Meu perfil">
              <strong>{displayName}</strong>
              <small>{myStatus ? `${myStatus.emoji} ${myStatus.text}`.trim() : user.role.name}</small>
            </NavLink>
            <button className="icon-button profile-logout" onClick={logout} title="Sair">
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
            {(() => { const help = PAGE_HELP[isCallDetail ? "detalhe" : isProfile ? "/perfil" : currentItem?.to ?? "/"]; return help ? <HelpTip lines={help} title={title} /> : null; })()}
          </nav>
          <div className="topbar-actions">
            <button type="button" className="icon-button theme-toggle" onClick={toggleTheme} title={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"} aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
            <div className="notification-wrap">
              <button className={`icon-button notification ${bellRinging ? "is-ringing" : ""}`} onClick={() => { setNotificationsOpen((current) => { if (!current) setSeen(markSeen(user.id, notifications)); return !current; }); void loadNotifications(); }} title="Notificacoes" aria-label={unseenCount ? `Notificações: ${unseenCount} nova(s)` : "Notificações"}>
                <Bell size={18} />
                {unseenCount > 0 && <i />}
              </button>
              {notificationsOpen && <div className="notification-popover"><div className="notification-heading"><strong>Notificacoes</strong><span>{notifications.length}</span>{notifications.length > 0 && <button type="button" className="link-button notification-read-all" onClick={() => { setSeen(markSeen(user.id, notifications)); void (notifications.some((item) => item.id.startsWith("user:")) ? api.markNotificationsRead() : Promise.resolve()).then(() => loadNotifications()); }}>Marcar tudo como lido</button>}</div><BrowserNotificationToggle state={browserState} onChange={setBrowserState} />{notifications.length ? notifications.map((notification) => <button className={`notification-item${notification.id.startsWith("user:") ? " is-personal" : ""}`} key={notification.id} onClick={() => { setNotificationsOpen(false); if (notification.id.startsWith("user:")) void api.markNotificationsRead([notification.id]).then(() => loadNotifications()); navigate(notification.href); }}><b>{notification.title}</b><small>{notification.detail}</small></button>) : <div className="notification-empty">Nenhuma notificacao pendente.</div>}</div>}
            </div>
            <ProfileLink name={displayName} photo={profilePhoto} className="topbar-avatar" />
          </div>
        </header>
        <ActivationToast
          queue={activationQueue}
          canDecide={user.role.permissions.includes("activations.decide")}
          onClose={() => setActivationQueue([])}
          onDecided={(id) => { setActivationQueue((queue) => queue.filter((item) => item.id !== id)); setActivationCount((count) => Math.max(0, count - 1)); }}
          onOpen={() => { setActivationQueue([]); navigate("/acionamentos"); }}
        />
        {canAccess("dashboard.view") && <JotaHWidget userName={displayName} canSeeUsage={canAccess("settings.manage")} />}
        {canAccess("calls.view") && <DueSoonBanner />}
        <main id="conteudo" className="content" tabIndex={-1}>
          {/* Troca de pagina com fade suave (page-transition.css) em vez do corte seco */}
          <div className="page-transition" key={location.pathname}>
          {currentTabHidden ? (currentItem?.to === "/" && firstAllowedPath ? <Navigate to={firstAllowedPath} replace /> : <AccessDenied />) : (
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
            <Route path="/visao-supervisores" element={guard("dashboard.view", <SupervisorOverviewPage />)} />
            <Route path="/supervisor/ordens" element={user.role.name === "Supervisor" ? guard("calls.view", <SupervisorOrdersPage user={user} />) : <AccessDenied />} />
            <Route path="/acionamentos" element={guard("activations.view", <ActivationsPage />)} />
            <Route path="/painel-diario" element={guard("dashboard.view", <ManualProductionDashboard />)} />
            <Route path="/igp" element={guard("dashboard.view", <IGPPage />)} />
            <Route path="/analise-prazo" element={guard("dashboard.view", <SlaAnalysisPage />)} />
            <Route path="/relatorios" element={guard("dashboard.view", <ReportsPage />)} />
            <Route path="/importacoes" element={guard("imports.view", <ImportsPage />)} />
            <Route path="/chamados/:id" element={guard("calls.view", <CallDetailRoute />)} />
            <Route path="/tecnicos" element={guard("technicians.view", <TechniciansPage />)} />
            <Route path="/supervisores" element={guard("supervisors.view", <SupervisorsPage user={user} />)} />
            <Route path="/usuarios" element={guard("users.view", <UsersPage />)} />
            <Route path="/cargos" element={guard("roles.view", <RolesPage currentRoleId={user.roleId} />)} />
            <Route path="/historico-alteracoes" element={guard("calls.view_logs", <AuditHistoryPage />)} />
            <Route path="/mapa" element={guard("calls.view", <QueueMapPage />)} />
            <Route path="/chaves" element={guard("calls.view", <PopKeysPage user={user} />)} />
            <Route path="/roteirizador" element={guard("imports.view", <NightRouterPage user={user} />)} />
            <Route path="/carga" element={guard("calls.view", <TechnicianLoadPage />)} />
            <Route path="/integracao-ofs" element={guard("imports.view", <IntegrationHealthPage />)} />
            <Route path="/campo" element={<FieldPage />} />
            <Route path="/pessoas" element={<PeoplePage currentUserId={user.id} />} />
            <Route path="/perfil" element={<ProfilePage user={user} profile={{ photo: profilePhoto, saving: savingProfilePhoto, error: profilePhotoError, onChange: handleProfilePhotoChange, onRemove: handleProfilePhotoRemove }} preferences={preferences} onSavePreferences={savePreferences} theme={theme} onToggleTheme={toggleTheme} status={myStatus} onSaveStatus={saveMyStatus} />} />
            <Route path="/configuracoes" element={<SettingsPage user={user} canManage={canAccess("settings.manage")} profile={{ photo: profilePhoto, saving: savingProfilePhoto, error: profilePhotoError, onChange: handleProfilePhotoChange, onRemove: handleProfilePhotoRemove }} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          )}
          </div>
          {/* Direitos autorais discretos no fim de cada pagina (inclusive Meu perfil). */}
          <CopyrightNotice className="page-copyright" />
        </main>
      </div>
    </div>
  );
}

// Botao no sino: liga/desliga os avisos do navegador (Windows/Chrome). Sem permissao do navegador, explica como liberar.
function BrowserNotificationToggle({ state, onChange }: { state: BrowserNotificationState; onChange: (state: BrowserNotificationState) => void }) {
  if (state === "unsupported") return null;
  return (
    <div className="notification-browser">
      {state === "granted" ? (
        <><span>Avisos no navegador ligados.</span><button type="button" className="link-button" onClick={() => { disableBrowserNotifications(); onChange(browserNotificationState()); }}>Desligar</button></>
      ) : state === "denied" ? (
        <span>O navegador bloqueou os avisos. Para liberar, clique no cadeado ao lado do endereço do site → Notificações → Permitir.</span>
      ) : (
        <><span>Receba os avisos no Windows mesmo com o sistema em segundo plano.</span><button type="button" className="link-button" onClick={() => void enableBrowserNotifications().then(onChange)}>Ativar avisos no navegador</button></>
      )}
    </div>
  );
}
