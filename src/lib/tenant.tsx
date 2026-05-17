import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type TenantMemberRole = "owner" | "admin" | "member";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "suspended" | "none";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "trialing" | "past_due" | "suspended" | "canceled";
  role_in_tenant: TenantMemberRole;
  subscription_status: SubscriptionStatus;
  trial_end: string | null;
  current_period_end: string | null;
};

type TenantCtx = {
  tenant: Tenant | null;
  tenants: Tenant[];
  loading: boolean;
  isSuperAdmin: boolean;
  switchTenant: (slug: string) => Promise<void>;
  reload: () => Promise<void>;
};

const Ctx = createContext<TenantCtx | null>(null);
const ACTIVE_KEY = "active_tenant_slug";

// Routes that bypass the tenant/subscription gate
const PUBLIC_PATHS = ["/", "/login", "/reset-password"];
const TENANT_FREE_PATHS = ["/onboarding", "/billing"];

function isPathAllowedWithoutTenant(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (TENANT_FREE_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/admin/")) return true;
  return false;
}

function isPathAllowedWithBadSubscription(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname === "/billing" || pathname === "/onboarding") return true;
  if (pathname.startsWith("/admin/")) return true;
  return false;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setTenants([]);
      setTenant(null);
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }
    setLoading(true);

    const [{ data: memberships }, { data: sa }] = await Promise.all([
      supabase
        .from("tenant_members")
        .select(
          "role_in_tenant, tenants:tenant_id (id, slug, name, status, subscriptions:subscriptions (status, trial_end, current_period_end))",
        )
        .eq("user_id", user.id)
        .eq("is_active", true),
      supabase.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);

    setIsSuperAdmin(!!sa);

    const list: Tenant[] = (memberships ?? [])
      .filter((m: any) => m.tenants)
      .map((m: any) => {
        const sub = Array.isArray(m.tenants.subscriptions) ? m.tenants.subscriptions[0] : m.tenants.subscriptions;
        return {
          id: m.tenants.id,
          slug: m.tenants.slug,
          name: m.tenants.name,
          status: m.tenants.status,
          role_in_tenant: m.role_in_tenant,
          subscription_status: (sub?.status ?? "none") as SubscriptionStatus,
          trial_end: sub?.trial_end ?? null,
          current_period_end: sub?.current_period_end ?? null,
        };
      });
    setTenants(list);

    const storedSlug = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
    const active = list.find((t) => t.slug === storedSlug) ?? list[0] ?? null;
    setTenant(active);
    if (active && typeof window !== "undefined") localStorage.setItem(ACTIVE_KEY, active.slug);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  // Gate: redirect users without tenant to /onboarding, or to /billing when subscription is blocked.
  useEffect(() => {
    if (authLoading || loading) return;
    if (!user) return;
    if (isSuperAdmin) return; // super-admins navigate freely

    const path = location.pathname;

    // No tenants at all → onboarding
    if (tenants.length === 0) {
      if (!isPathAllowedWithoutTenant(path)) {
        navigate({ to: "/onboarding" });
      }
      return;
    }

    // Has tenant but subscription is blocked
    if (tenant) {
      const blocked = ["past_due", "canceled", "suspended", "none"].includes(tenant.subscription_status);
      if (blocked && !isPathAllowedWithBadSubscription(path)) {
        navigate({ to: "/billing" });
      }
    }
  }, [authLoading, loading, user, tenants, tenant, isSuperAdmin, location.pathname, navigate]);

  const switchTenant = useCallback(
    async (slug: string) => {
      const next = tenants.find((t) => t.slug === slug);
      if (!next) return;
      setTenant(next);
      if (typeof window !== "undefined") localStorage.setItem(ACTIVE_KEY, slug);
    },
    [tenants],
  );

  return (
    <Ctx.Provider value={{ tenant, tenants, loading, isSuperAdmin, switchTenant, reload: load }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}
