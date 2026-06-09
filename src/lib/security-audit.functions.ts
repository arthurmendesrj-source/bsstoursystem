import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SecurityDefinerFn = {
  schema: string;
  function_name: string;
  args: string;
  executors: string[];
  rationale: string;
  status: "ok" | "review" | "accepted_risk";
};

/**
 * Curated audit of SECURITY DEFINER functions in the public schema.
 * Live introspection requires a custom RPC; this list is the source of truth
 * and should be updated together with each migration that adds/removes a
 * SECURITY DEFINER function.
 */
const CATALOG: SecurityDefinerFn[] = [
  {
    schema: "public",
    function_name: "has_role",
    args: "_user_id uuid, _role app_role",
    executors: ["anon", "authenticated", "service_role"],
    rationale:
      "Required by RLS policies across the database. Must remain executable to avoid breaking access control. Reads only the role rows the caller could already infer.",
    status: "accepted_risk",
  },
  {
    schema: "public",
    function_name: "is_admin",
    args: "_user_id uuid",
    executors: ["anon", "authenticated", "service_role"],
    rationale:
      "Wrapper around has_role(_, 'admin'). Same RLS dependency — revoking would break admin policies.",
    status: "accepted_risk",
  },
  {
    schema: "public",
    function_name: "generate_entity_code",
    args: "_entity text, _user_id uuid",
    executors: ["service_role"],
    rationale: "Internal helper used only by the set_*_code triggers.",
    status: "ok",
  },
  {
    schema: "public",
    function_name: "handle_new_user",
    args: "",
    executors: ["service_role"],
    rationale: "Trigger AFTER INSERT on auth.users that creates the profile row.",
    status: "ok",
  },
  {
    schema: "public",
    function_name: "set_lead_code",
    args: "",
    executors: ["service_role"],
    rationale: "BEFORE INSERT trigger on leads.",
    status: "ok",
  },
  {
    schema: "public",
    function_name: "set_customer_code",
    args: "",
    executors: ["service_role"],
    rationale: "BEFORE INSERT trigger on customers.",
    status: "ok",
  },
  {
    schema: "public",
    function_name: "set_supplier_code",
    args: "",
    executors: ["service_role"],
    rationale: "BEFORE INSERT trigger on suppliers.",
    status: "ok",
  },
  {
    schema: "public",
    function_name: "log_activity",
    args: "",
    executors: ["service_role"],
    rationale: "AFTER INSERT/UPDATE trigger on leads, quotes, bookings. Writes activity_log.",
    status: "ok",
  },
];

export const listSecurityDefinerFunctions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw new Error("forbidden");
    return CATALOG;
  });
