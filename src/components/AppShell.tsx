import { type ReactNode } from "react";
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
  Building2,
  Briefcase,
  ListChecks,
  Bell,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n, type Lang } from "@/lib/i18n";
import { useCurrency, type Currency } from "@/lib/currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isAdmin, signOut } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { currency, setCurrency } = useCurrency();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const items = [
    { to: "/dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { to: "/leads", label: t("leads"), icon: UserPlus },
    { to: "/funnel", label: t("funnel"), icon: KanbanSquare },
    { to: "/activities", label: t("activities"), icon: ListChecks },
    { to: "/alerts", label: t("alertsMenu"), icon: Bell },
    { to: "/customers", label: t("customers"), icon: Users },
    { to: "/suppliers", label: t("suppliers"), icon: Building2 },
    { to: "/packages", label: t("packages"), icon: Package },
    { to: "/bookings", label: t("bookings"), icon: CalendarRange },
    { to: "/email", label: t("email"), icon: Mail },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };


  return (
    <div className="flex h-screen w-full bg-background">
      <aside className="hidden w-64 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Plane className="h-5 w-5" />
          </div>
          <div className="font-semibold text-sidebar-foreground">{t("appName")}</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((it) => {
            const active = path === it.to || path.startsWith(it.to + "/");
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
          <Link
            to="/workspace"
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              path === "/workspace" || path.startsWith("/leads/")
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            }`}
          >
            <Briefcase className="h-4 w-4" />
            {t("workspace")}
          </Link>
          {isAdmin && (
            <>
              <div className="mt-4 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
                {t("admin")}
              </div>
              <Link
                to="/users"
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  path.startsWith("/users")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                }`}
              >
                <Shield className="h-4 w-4" />
                {t("users")}
              </Link>
              <Link
                to="/security-audit"
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  path.startsWith("/security-audit")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                }`}
              >
                <ShieldAlert className="h-4 w-4" />
                {t("secAuditTitle")}
              </Link>
            </>
          )}
          <Link
            to="/settings"
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              path === "/settings"
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
            }`}
          >
            <Settings className="h-4 w-4" />
            {t("settings")}
          </Link>
          <Link
            to="/settings/templates"
            className={`flex items-center gap-3 rounded-md pl-9 pr-3 py-1.5 text-sm transition-colors ${
              path.startsWith("/settings/templates")
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
            }`}
          >
            {t("templatesMenu")}
          </Link>
          {isAdmin && (
            <Link
              to="/settings/sla"
              className={`flex items-center gap-3 rounded-md pl-9 pr-3 py-1.5 text-sm transition-colors ${
                path.startsWith("/settings/sla")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
              }`}
            >
              {t("slaSettingsMenu")}
            </Link>
          )}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 truncate px-3 text-xs text-sidebar-foreground/60">{user?.email}</div>
          <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            {t("logout")}
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-end gap-2 border-b border-border bg-card px-4 md:px-6">
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
        <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
