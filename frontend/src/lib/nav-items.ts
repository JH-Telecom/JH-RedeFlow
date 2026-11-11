import { Activity, Archive, Binoculars, HeartPulse, KeyRound, Smartphone, History, Map as MapIcon, UsersRound, BellRing, CalendarDays, ClipboardCheck, Contact, FileBarChart, Gauge, HardHat, Hourglass, Inbox, LayoutDashboard, Repeat2, Settings, ShieldCheck, Tv, Upload, UserCog, Users, Wrench, type LucideIcon } from "lucide-react";

// Abas do menu lateral. Usado pelo Shell (menu, rotas, busca Ctrl+K) e pela tela de Cargos (abas visiveis por cargo).
// fieldOnly: so aparece para o usuario ligado a um tecnico (Meus chamados).
export type NavItem = { label: string; to: string; icon: LucideIcon; permission: string; section: string; roles?: string[]; counter?: "unassigned" | "activations"; fieldOnly?: boolean };

export const navItems: NavItem[] = [
  { section: "Operação", label: "Meus chamados", to: "/campo", icon: Smartphone, permission: "", fieldOnly: true },
  { section: "Operação", label: "Visão geral", to: "/", icon: LayoutDashboard, permission: "dashboard.view" },
  { section: "Operação", label: "Chamados abertos", to: "/chamados/abertos", icon: Inbox, permission: "calls.view", counter: "unassigned" },
  { section: "Operação", label: "Em atendimento", to: "/chamados/atendimento", icon: Wrench, permission: "calls.view" },
  { section: "Operação", label: "Finalizados e cancelados", to: "/chamados/finalizados", icon: Archive, permission: "calls.view" },
  { section: "Operação", label: "Repetidos", to: "/repetidos", icon: Repeat2, permission: "calls.view" },
  { section: "Operação", label: "Ordens da equipe", to: "/supervisor/ordens", icon: ClipboardCheck, permission: "calls.view", roles: ["Supervisor"] },
  { section: "Operação", label: "Mapa da fila", to: "/mapa", icon: MapIcon, permission: "calls.view" },
  { section: "Operação", label: "Acionamentos", to: "/acionamentos", icon: BellRing, permission: "activations.view", counter: "activations" },
  { section: "Indicadores", label: "Visão dos supervisores", to: "/visao-supervisores", icon: Binoculars, permission: "dashboard.view" },
  { section: "Indicadores", label: "Painel diário", to: "/painel-diario", icon: CalendarDays, permission: "dashboard.view" },
  { section: "Indicadores", label: "IGP", to: "/igp", icon: Gauge, permission: "dashboard.view" },
  { section: "Indicadores", label: "Análise de prazo", to: "/analise-prazo", icon: Hourglass, permission: "dashboard.view" },
  { section: "Indicadores", label: "Relatórios", to: "/relatorios", icon: FileBarChart, permission: "dashboard.view" },
  { section: "Indicadores", label: "Modo TV", to: "/modo-tv", icon: Tv, permission: "dashboard.view" },
  { section: "Equipes", label: "Técnicos", to: "/tecnicos", icon: HardHat, permission: "technicians.view" },
  { section: "Equipes", label: "Supervisores", to: "/supervisores", icon: UserCog, permission: "supervisors.view" },
  { section: "Equipes", label: "Carga dos técnicos", to: "/carga", icon: UsersRound, permission: "calls.view" },
  // Aberta a todos (so leitura): perfis e quem esta online.
  { section: "Equipes", label: "Pessoas", to: "/pessoas", icon: Contact, permission: "" },
  { section: "Administração", label: "Status do sistema", to: "/status", icon: HeartPulse, permission: "" },
  { section: "Administração", label: "Chaves dos POPs", to: "/chaves", icon: KeyRound, permission: "calls.view" },
  { section: "Administração", label: "Importações", to: "/importacoes", icon: Upload, permission: "imports.view" },
  { section: "Administração", label: "Histórico de alterações", to: "/historico-alteracoes", icon: History, permission: "calls.view_logs" },
  { section: "Administração", label: "Integração OFS", to: "/integracao-ofs", icon: Activity, permission: "imports.view" },
  { section: "Administração", label: "Usuários", to: "/usuarios", icon: Users, permission: "users.view" },
  { section: "Administração", label: "Cargos e permissões", to: "/cargos", icon: ShieldCheck, permission: "roles.view" },
  { section: "Administração", label: "Configurações", to: "/configuracoes", icon: Settings, permission: "" },
];

// Cargo com a aba oculta: some do menu e a rota fica bloqueada.
export const isTabHidden = (hiddenTabs: string[] | undefined, path: string) => Boolean(hiddenTabs?.includes(path));
