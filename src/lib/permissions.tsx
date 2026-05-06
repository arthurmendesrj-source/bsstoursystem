import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";

export type ModuleKey =
  | "leads" | "customers" | "quotes" | "bookings" | "suppliers"
  | "supplier_rates" | "supplier_documents" | "packages" | "itineraries"
  | "activities" | "emails" | "financial" | "sla" | "users";

export type Action = "view" | "create" | "edit" | "delete" | "approve";

type ModuleRow = {
  role: AppRole; module_key: string;
  can_view: boolean; can_create: boolean; can_edit: boolean;
  can_delete: boolean; can_approve: boolean;
};
type FieldRow = {
  role: AppRole; module_key: string; field_key: string;
  can_view: boolean; can_edit: boolean;
};

type Ctx = {
  loading: boolean;
  can: (m: ModuleKey | string, a: Action) => boolean;
  canField: (m: ModuleKey | string, field: string, a: "view" | "edit") => boolean;
  refresh: () => Promise<void>;
};

const PermCtx = createContext<Ctx | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { roles, user, isAdmin } = useAuth();
  const [mods, setMods] = useState<ModuleRow[]>([]);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) { setMods([]); setFields([]); setLoading(false); return; }
    setLoading(true);
    const [m, f] = await Promise.all([
      supabase.from("role_module_permissions").select("*"),
      supabase.from("role_field_permissions").select("*"),
    ]);
    setMods((m.data as ModuleRow[]) ?? []);
    setFields((f.data as FieldRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const can = (module: string, action: Action) => {
    if (isAdmin) return true;
    if (!roles.length) return false;
    return mods.some((p) => roles.includes(p.role) && p.module_key === module && (
      action === "view" ? p.can_view :
      action === "create" ? p.can_create :
      action === "edit" ? p.can_edit :
      action === "delete" ? p.can_delete :
      action === "approve" ? p.can_approve : false
    ));
  };

  const canField = (module: string, field: string, action: "view" | "edit") => {
    if (isAdmin) return true;
    if (!roles.length) return action === "view"; // sem papel: não bloqueia view por padrão
    const rows = fields.filter((f) => roles.includes(f.role) && f.module_key === module && f.field_key === field);
    if (rows.length === 0) return true; // campo não catalogado = liberado
    return rows.some((r) => action === "view" ? r.can_view : r.can_edit);
  };

  return (
    <PermCtx.Provider value={{ loading, can, canField, refresh: load }}>
      {children}
    </PermCtx.Provider>
  );
}

export function usePermissions() {
  const c = useContext(PermCtx);
  if (!c) throw new Error("usePermissions must be used within PermissionsProvider");
  return c;
}

export function Can({
  module, action, children, fallback = null,
}: {
  module: ModuleKey | string;
  action: Action;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = usePermissions();
  return <>{can(module, action) ? children : fallback}</>;
}

export function MaskedField({
  module, field, value, mask = "•••",
}: { module: ModuleKey | string; field: string; value: ReactNode; mask?: ReactNode }) {
  const { canField } = usePermissions();
  return <>{canField(module, field, "view") ? value : mask}</>;
}
