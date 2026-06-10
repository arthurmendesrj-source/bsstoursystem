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
  ensureTenant: () => Promise<Tenant | null>;
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

    const fetchMemberships = async () =>
      supabase
        .from("tenant_members")
        .select(
          "role_in_tenant, tenants:tenant_id (id, slug, name, status, subscriptions:subscriptions (status, trial_end, current_period_end))",
        )
        .eq("user_id", user.id)
        .eq("is_active", true);

    const [{ data: initialMemberships }, { data: sa }] = await Promise.all([
      fetchMemberships(),
      supabase.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);

    setIsSuperAdmin(!!sa);

    let memberships = initialMemberships ?? [];

    // Auto-create a default tenant on first login so the user never sees the
    // "Criar empresa" screen. Super-admins are exempt.
    if (memberships.length === 0 && !sa) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        const baseName =
          profile?.full_name?.trim() || user.email?.split("@")[0] || "Minha Empresa";
        const slugify = (s: string) =>
          s
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-+|-+$)/g, "")
            .slice(0, 40) || "empresa";
        const suffix = user.id.replace(/-/g, "").slice(0, 6);
        let slug = `${slugify(baseName)}-${suffix}`;

        let { data: newTenant, error: te } = await supabase
          .from("tenants")
          .insert([{ name: baseName, slug, created_by: user.id, status: "active" as const }])
          .select("id, slug")
          .single();

        if (te) {
          slug = `${slugify(baseName)}-${Math.random().toString(36).slice(2, 8)}`;
          const retry = await supabase
            .from("tenants")
            .insert([{ name: baseName, slug, created_by: user.id, status: "active" as const }])
            .select("id, slug")
            .single();
          newTenant = retry.data;
          te = retry.error;
        }

        if (!te && newTenant) {
          await supabase.from("tenant_members").insert({
            tenant_id: newTenant.id,
            user_id: user.id,
            role_in_tenant: "owner",
            is_active: true,
          });
        }

        const refetched = await fetchMemberships();
        memberships = refetched.data ?? [];
      } catch {
        // Fall through; gate below keeps the user where they are.
      }
    }


    const list: Tenant[] = memberships
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

  // Gate: redirect users to /billing when subscription is blocked.
  // (We auto-create a tenant on first login, so there's no "no tenant" state to gate.)
  useEffect(() => {
    if (authLoading || loading) return;
    if (!user) return;
    if (isSuperAdmin) return; // super-admins navigate freely

    const path = location.pathname;

    if (tenants.length === 0) return; // auto-creation failed; don't trap the user


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
