import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type TenantMemberRole = "owner" | "admin" | "member";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "trialing" | "past_due" | "suspended" | "canceled";
  role_in_tenant: TenantMemberRole;
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

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
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
        .select("role_in_tenant, tenants:tenant_id (id, slug, name, status)")
        .eq("user_id", user.id)
        .eq("is_active", true),
      supabase.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);

    setIsSuperAdmin(!!sa);

    const list: Tenant[] = (memberships ?? [])
      .filter((m: any) => m.tenants)
      .map((m: any) => ({
        id: m.tenants.id,
        slug: m.tenants.slug,
        name: m.tenants.name,
        status: m.tenants.status,
        role_in_tenant: m.role_in_tenant,
      }));
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
