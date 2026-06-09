import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const disconnectGmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    emailAddress: z.string().email().max(320),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const email = data.emailAddress.toLowerCase();

    const { data: existing } = await supabaseAdmin
      .from("user_gmail_tokens")
      .select("id")
      .eq("user_id", userId)
      .eq("email_address", email)
      .maybeSingle();
    if (!existing) return { ok: true, removed: false };

    const { error } = await supabaseAdmin
      .from("user_gmail_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("email_address", email);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("gmail_connection_audit").insert({
      user_id: userId,
      email_address: email,
      event: "disconnected",
      actor_id: userId,
    });

    return { ok: true, removed: true };
  });

export const listGmailAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as { userId: string }).userId;
    const { data, error } = await supabaseAdmin
      .from("gmail_connection_audit")
      .select("id,email_address,event,reason,metadata,created_at,actor_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { entries: data ?? [] };
  });
