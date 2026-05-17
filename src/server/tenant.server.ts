import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Resolve the tenant_id to use for a server-side action on behalf of a user.
 *
 * - If `preferred` is provided and the user is an active member of it, returns it.
 * - Otherwise returns the user's first active membership.
 * - Throws if the user belongs to no tenant.
 */
export async function resolveUserTenantId(
  userId: string,
  preferred?: string | null,
): Promise<string> {
  if (preferred) {
    const { data, error } = await supabaseAdmin
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .eq("tenant_id", preferred)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (data?.tenant_id) return data.tenant_id;
  }
  const { data, error } = await supabaseAdmin
    .from("tenant_members")
    .select("tenant_id, created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.tenant_id) throw new Error("Usuário sem tenant ativo");
  return data.tenant_id;
}
