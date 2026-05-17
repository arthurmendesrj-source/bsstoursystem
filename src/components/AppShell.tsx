import { type ReactNode, useState, useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  KanbanSquare,
  CalendarRange,
  Package,
  Settings,
  LogOut,
  Plane,
  Shield,
  ShieldAlert,
  Mail,
  MessageSquare,
  Building2,
  Briefcase,
  ListChecks,
  Bell,
  BookOpen,
  Library,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BarChart3,
  LayoutGrid,
  Sparkles,
  Wallet,
  Megaphone,
} from "lucide-react";
import { AssistantFab } from "@/components/assistant/AssistantFab";
import { GlobalSearchTrigger } from "@/components/GlobalSearch";
import { useAuth } from "@/lib/auth";
import { useViewAs, useEffectiveAuth } from "@/lib/viewAs";
import { useI18n, type Lang } from "@/lib/i18n";
import { useCurrency, type Currency } from "@/lib/currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceWindows } from "@/components/workspace/WorkspaceWindowsProvider";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { isAdmin, hasRole } = useEffectiveAuth();
  const { viewAs, exitViewAs } = useViewAs();
  const showManagerial = isAdmin || hasRole("diretor") || hasRole("gerente");
  const showFinanceiro = isAdmin || hasRole("diretor") || hasRole("financeiro");
  const showMarketing = isAdmin || hasRole("diretor") || hasRole("gerente");
  const { t, lang, setLang } = useI18n();
  const { currency, setCurrency } = useCurrency();
  const navigate = useNavigate();
  const { minimizeAllWindows } = useWorkspaceWindows();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const isEmbed = search?.embed === "1" || search?.embed === 1;
  const activeLeadId = path === "/workspace" && typeof search?.lead === "string" ? (search.lead as string) : null;

  const wrapTo = (to: string) => {
    if (!activeLeadId) return { to } as const;
    // Map sidebar route -> tool key inside Workspace
    const toolMap: Record<string, string> = {
      "/dashboard": "dashboard",
      "/funnel": "funnel",
      "/packages": "packages",
      "/inbox-ia": "inbox-ia",
      "/inbox-ia/email": "inbox-ia-email",
      "/email": "email",
      "/activities": "activities",
      "/alerts": "alerts",
      "/customers": "customers",
      "/suppliers": "suppliers",
      "/bookings": "bookings",
      "/biblia": "biblia",
      "/itineraries": "itineraries",
    };
    const tool = toolMap[to];
    if (!tool) return { to } as const;
    return { to: "/workspace", search: { lead: activeLeadId, tool } } as const;
  };

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar:collapsed") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  const crmRoutes = ["/dashboard", "/leads", "/funnel", "/workspace", "/packages"];
  const isCrmActive = crmRoutes.some((r) => path === r || path.startsWith(r + "/"));
  const [crmOpen, setCrmOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("sidebar:group:crm");
    if (saved === null) return true;
    return saved === "1";
  });
  useEffect(() => {
    if (isCrmActive) setCrmOpen(true);
  }, [isCrmActive]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebar:group:crm", crmOpen ? "1" : "0");
    }
  }, [crmOpen]);

  const crmChildren = [
    { to: "/dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { to: "/leads", label: t("leads"), icon: UserPlus },
    { to: "/funnel", label: t("funnel"), icon: KanbanSquare },
    { to: "/workspace", label: "Atendimento", icon: Briefcase },
    { to: "/packages", label: t("packages"), icon: Package },
  ];

  const items = [
    { to: "/inbox-ia", label: "Inbox IA", icon: Sparkles },
    { to: "/inbox-ia/email", label: "Triagem Email", icon: Sparkles },
    { to: "/email", label: t("email"), icon: Mail },
    { to: "/whatsapp", label: "WhatsApp", icon: MessageSquare },
    { to: "/activities", label: t("activities"), icon: ListChecks },
    { to: "/alerts", label: t("alertsMenu"), icon: Bell },
    ...(showFinanceiro ? [{ to: "/financeiro", label: "Financeiro", icon: Wallet }] : []),
    ...(showMarketing ? [{ to: "/marketing", label: "Marketing", icon: Megaphone }] : []),
    { to: "/customers", label: t("customers"), icon: Users },
    { to: "/suppliers", label: t("suppliers"), icon: Building2 },
    { to: "/bookings", label: t("bookings"), icon: CalendarRange },
    { to: "/biblia", label: t("bibliaMenu"), icon: BookOpen },
    { to: "/itineraries", label: "Roteiros (IA)", icon: Library },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const itemClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-md py-2 text-sm transition-colors",
      collapsed ? "justify-center px-2" : "px-3",
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
    );

  if (isEmbed) {
    return (
      <div className="h-screen w-full overflow-auto bg-background p-4 md:p-6">{children}</div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-background">
      <aside
        className={cn(
          "relative hidden flex-col border-r border-border bg-sidebar md:flex transition-[width] duration-200",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="absolute -right-3 top-5 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm hover:bg-muted"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
        <div className={cn("flex h-16 items-center gap-2 border-b border-sidebar-border", collapsed ? "justify-center px-2" : "px-6")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Plane className="h-5 w-5" />
          </div>
          {!collapsed && <div className="flex-1 truncate font-semibold text-sidebar-foreground">{t("appName")}</div>}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {/* CRM group */}
          <button
            type="button"
            onClick={() => {
              if (collapsed) {
                setCollapsed(false);
                setCrmOpen(true);
              } else {
                setCrmOpen((o) => !o);
              }
            }}
            className={cn(itemClass(isCrmActive), "w-full")}
            title={collapsed ? "CRM" : undefined}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 truncate text-left">CRM</span>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 transition-transform", crmOpen ? "rotate-0" : "-rotate-90")}
                />
              </>
            )}
          </button>
          {!collapsed && crmOpen &&
            crmChildren.map((it) => {
              const active = path === it.to || (it.to === "/workspace" && path.startsWith("/leads/")) || path.startsWith(it.to + "/");
              const Icon = it.icon;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  onClick={() => minimizeAllWindows()}
                  className={cn(
                    "flex items-center gap-3 rounded-md pl-9 pr-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{it.label}</span>
                </Link>
              );
            })}

          {items.map((it) => {
            const wrapped = wrapTo(it.to);
            const wrappedSearch = "search" in wrapped ? wrapped.search : null;
            const active = wrappedSearch
              ? path === "/workspace" && search?.tool === wrappedSearch.tool
              : path === it.to || path.startsWith(it.to + "/");
            const Icon = it.icon;
            const handleClick = (e: React.MouseEvent) => {
              minimizeAllWindows();
              if (wrappedSearch) {
                e.preventDefault();
                navigate({ to: "/workspace", search: wrappedSearch });
              }
            };
            return (
              <Link
                key={it.to}
                to={it.to}
                onClick={handleClick}
                className={itemClass(active)}
                title={collapsed ? it.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{it.label}</span>}
              </Link>
            );
          })}
          {showManagerial && !viewAs && (
            <Link to="/gerencial" onClick={() => minimizeAllWindows()} className={itemClass(path === "/gerencial" || path.startsWith("/gerencial/"))} title={collapsed ? "Gerencial" : undefined}>
              <BarChart3 className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">Gerencial</span>}
            </Link>
          )}
          {isAdmin && (
            <>
              {!collapsed && (
                <div className="mt-4 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
                  {t("admin")}
                </div>
              )}
              <Link to="/users" onClick={() => minimizeAllWindows()} className={itemClass(path.startsWith("/users"))} title={collapsed ? t("users") : undefined}>
                <Shield className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{t("users")}</span>}
              </Link>
              <Link to="/security-audit" onClick={() => minimizeAllWindows()} className={itemClass(path.startsWith("/security-audit"))} title={collapsed ? t("secAuditTitle") : undefined}>
                <ShieldAlert className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{t("secAuditTitle")}</span>}
              </Link>
            </>
          )}
          <Link to="/permissions-audit" onClick={() => minimizeAllWindows()} className={itemClass(path === "/permissions-audit")} title={collapsed ? "Minhas permissões" : undefined}>
            <Shield className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">Minhas permissões</span>}
          </Link>
          {!collapsed && (
            <Link
              to="/permissions-audit/financial"
              onClick={() => minimizeAllWindows()}
              className={cn(
                "flex items-center gap-3 rounded-md pl-9 pr-3 py-1.5 text-sm transition-colors",
                path.startsWith("/permissions-audit/financial")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60",
              )}
            >
              Campos financeiros
            </Link>
          )}
          <Link to="/settings" onClick={() => minimizeAllWindows()} className={itemClass(path === "/settings")} title={collapsed ? t("settings") : undefined}>
            <Settings className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{t("settings")}</span>}
          </Link>
          {!collapsed && (
            <>
              <Link
                to="/settings/templates"
                onClick={() => minimizeAllWindows()}
                className={cn(
                  "flex items-center gap-3 rounded-md pl-9 pr-3 py-1.5 text-sm transition-colors",
                  path.startsWith("/settings/templates")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60",
                )}
              >
                {t("templatesMenu")}
              </Link>
              {isAdmin && (
                <Link
                  to="/settings/sla"
                  onClick={() => minimizeAllWindows()}
                  className={cn(
                    "flex items-center gap-3 rounded-md pl-9 pr-3 py-1.5 text-sm transition-colors",
                    path.startsWith("/settings/sla")
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60",
                  )}
                >
                  {t("slaSettingsMenu")}
                </Link>
              )}
              {isAdmin && (
                <Link
                  to="/settings/permissions"
                  onClick={() => minimizeAllWindows()}
                  className={cn(
                    "flex items-center gap-3 rounded-md pl-9 pr-3 py-1.5 text-sm transition-colors",
                    path.startsWith("/settings/permissions")
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60",
                  )}
                >
                  Permissões
                </Link>
              )}
            </>
          )}
        </nav>
        <div className={cn("border-t border-sidebar-border", collapsed ? "p-2" : "p-3")}>
          {!collapsed && (
            <div className="mb-2 truncate px-3 text-xs text-sidebar-foreground/60">
              {viewAs ? (
                <>
                  <div className="font-medium text-amber-600 dark:text-amber-400">Espelho: {viewAs.full_name}</div>
                  <div className="text-[10px] opacity-70">Logado como {user?.email}</div>
                </>
              ) : (
                user?.email
              )}
            </div>
          )}
          <Button
            variant="ghost"
            className={cn(collapsed ? "w-full justify-center px-0" : "w-full justify-start")}
            onClick={handleSignOut}
            title={collapsed ? t("logout") : undefined}
          >
            <LogOut className={cn("h-4 w-4", !collapsed && "mr-2")} />
            {!collapsed && t("logout")}
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-end gap-2 border-b border-border bg-card px-4 md:px-6">
          <GlobalSearchTrigger />
          <AssistantFab />
          <NotificationBell />
          <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pt">PT</SelectItem>
              <SelectItem value="en">EN</SelectItem>
              <SelectItem value="es">ES</SelectItem>
            </SelectContent>
          </Select>
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BRL">BRL</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
            </SelectContent>
          </Select>
        </header>
        {viewAs && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm md:px-6">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <Eye className="h-4 w-4" />
              <span>
                Sessão espelhada de <strong>{viewAs.full_name}</strong> ({viewAs.role}) — você está agindo como este usuário
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-amber-500/50 bg-background/60 text-xs"
              onClick={() => {
                exitViewAs();
                navigate({ to: "/gerencial" });
              }}
            >
              Sair da visualização
            </Button>
          </div>
        )}
        <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
