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
type UserModuleRow = {
  user_id: string; module_key: string;
  can_view: boolean | null; can_create: boolean | null; can_edit: boolean | null;
  can_delete: boolean | null; can_approve: boolean | null;
};
type UserFieldRow = {
  user_id: string; module_key: string; field_key: string;
  can_view: boolean | null; can_edit: boolean | null;
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
  const [userMods, setUserMods] = useState<UserModuleRow[]>([]);
  const [userFields, setUserFields] = useState<UserFieldRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) { setMods([]); setFields([]); setUserMods([]); setUserFields([]); setLoading(false); return; }
    setLoading(true);
    const [m, f, um, uf] = await Promise.all([
      supabase.from("role_module_permissions").select("*"),
      supabase.from("role_field_permissions").select("*"),
      supabase.from("user_module_permissions").select("*").eq("user_id", user.id),
      supabase.from("user_field_permissions").select("*").eq("user_id", user.id),
    ]);
    setMods((m.data as ModuleRow[]) ?? []);
    setFields((f.data as FieldRow[]) ?? []);
    setUserMods((um.data as UserModuleRow[]) ?? []);
    setUserFields((uf.data as UserFieldRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const can = (module: string, action: Action) => {
    if (isAdmin) return true;
    // Override individual tem prioridade
    const ovr = userMods.find((u) => u.module_key === module);
    if (ovr) {
      const v = action === "view" ? ovr.can_view :
                action === "create" ? ovr.can_create :
                action === "edit" ? ovr.can_edit :
                action === "delete" ? ovr.can_delete :
                action === "approve" ? ovr.can_approve : null;
      if (v !== null && v !== undefined) return v;
    }
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
    const ovr = userFields.find((u) => u.module_key === module && u.field_key === field);
    if (ovr) {
      const v = action === "view" ? ovr.can_view : ovr.can_edit;
      if (v !== null && v !== undefined) return v;
    }
    if (!roles.length) return action === "view";
    const rows = fields.filter((f) => roles.includes(f.role) && f.module_key === module && f.field_key === field);
    if (rows.length === 0) return true;
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
  const visible = canField(module, field, "view");
  return (
    <span data-perm-field={`${module}.${field}`} data-perm-masked={visible ? "0" : "1"}>
      {visible ? value : mask}
    </span>
  );
}
