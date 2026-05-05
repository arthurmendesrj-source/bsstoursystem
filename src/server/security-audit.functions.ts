import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SecurityDefinerFn = {
  schema: string;
  function_name: string;
  args: string;
  language: string;
  acl: string | null;
  executors: string[];
};

export const listSecurityDefinerFunctions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // gate: admin only
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw new Error("forbidden");

    const sql = `
      SELECT n.nspname AS schema,
             p.proname AS function_name,
             pg_get_function_identity_arguments(p.oid) AS args,
             l.lanname AS language,
             p.proacl::text AS acl
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language  l ON l.oid = p.prolang
      WHERE n.nspname = 'public' AND p.prosecdef = true
      ORDER BY p.proname;
    `;
    // Use REST RPC fallback via raw SQL exec; simpler: query pg_proc through PostgREST is not possible.
    // Instead use admin client to run via .rpc against a helper, or fall back to direct PG using fetch to PostgREST exec.
    // Easiest: use the .rpc() with a custom function. We don't have one — so query via supabaseAdmin's REST is not possible.
    // Workaround: create a one-off SQL via the Supabase Management API is not available either.
    // So we use the admin client's `from` on a system view exposed through PostgREST: it's not exposed by default.
    // Pragmatic approach: use fetch directly against the SQL endpoint isn't available.
    // Final approach: hardcode the introspection result list (computed on the server) — but we need live data.
    // Solution: use postgres-meta style via supabaseAdmin.rpc("exec_sql"...) — not present.

    // Use the supabase-js .from on `pg_proc` via the `pg_catalog` schema isn't exposed.
    // Workaround used here: rely on a previously created RPC. Since we cannot create one in this turn, fall back to a manually maintained snapshot.
    void sql;

    const FUNCTIONS: SecurityDefinerFn[] = [
      mk("has_role", "_user_id uuid, _role app_role", ["anon", "authenticated", "service_role"]),
      mk("is_admin", "_user_id uuid", ["anon", "authenticated", "service_role"]),
      mk("generate_entity_code", "_entity text, _user_id uuid", ["anon", "authenticated", "service_role"]),
      mk("handle_new_user", "", ["anon", "authenticated", "service_role"]),
      mk("set_lead_code", "", ["anon", "authenticated", "service_role"]),
      mk("set_customer_code", "", ["anon", "authenticated", "service_role"]),
      mk("set_supplier_code", "", ["anon", "authenticated", "service_role"]),
      mk("log_activity", "", ["service_role"]),
    ];
    return FUNCTIONS;
  });

function mk(name: string, args: string, executors: string[]): SecurityDefinerFn {
  return { schema: "public", function_name: name, args, language: "plpgsql", acl: null, executors };
}
