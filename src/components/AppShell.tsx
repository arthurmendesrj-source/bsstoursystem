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
  Mail,
  Building2,
  Briefcase,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useI18n, type Lang } from "@/lib/i18n";
import { useCurrency, type Currency } from "@/lib/currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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

  const openWorkspace = async () => {
    const { data } = await supabase
      .from("leads")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      navigate({ to: "/leads/$leadId", params: { leadId: data.id } });
    } else {
      toast.info(t("noData"));
      navigate({ to: "/leads" });
    }
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
          <button
            type="button"
            onClick={openWorkspace}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              path.startsWith("/leads/")
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            }`}
          >
            <Briefcase className="h-4 w-4" />
            {t("workspace")}
          </button>
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
            </>
          )}
          <Link
            to="/settings"
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              path.startsWith("/settings")
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
            }`}
          >
            <Settings className="h-4 w-4" />
            {t("settings")}
          </Link>
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
