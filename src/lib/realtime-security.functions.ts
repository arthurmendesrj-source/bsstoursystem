import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RealtimePolicy = {
  name: string;
  cmd: string;
  using: string | null;
  with_check: string | null;
};

export type RealtimeSecurityReport = {
  status: "ok" | "warn" | "error";
  realtime_messages_exists: boolean;
  realtime_messages_rls_enabled: boolean;
  realtime_messages_policy_count: number;
  realtime_messages_policies: RealtimePolicy[];
  published_tables: { schema: string; table: string }[];
  checked_at: string;
};

/**
 * Admin-only health check. Returns the current realtime channel RLS posture.
 * status === "error" means at least one table is published to realtime but
 * realtime.messages has no RLS / no policy — any authenticated user could
 * subscribe to any topic.
 */
export const checkRealtimeSecurity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RealtimeSecurityReport> => {
    const { supabase, userId } = context;
    const { data: isAdminData } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdminData) throw new Error("forbidden");

    const { data, error } = await supabase.rpc("check_realtime_security" as never);
    if (error) throw new Error(error.message);
    return data as unknown as RealtimeSecurityReport;
  });
