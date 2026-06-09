import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser } from "@/server/push.server";

const ReassignSchema = z.object({
  leadId: z.string().uuid(),
  newAssigneeId: z.string().uuid(),
  escalationId: z.string().uuid().optional(),
});

/** Admin-only: reatribui um lead e marca o escalonamento como resolvido. */
export const reassignLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReassignSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Verifica se é admin
    const { data: roleRow, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!roleRow) throw new Error("Apenas admins podem reatribuir.");

    // Carrega lead
    const { data: lead, error: lErr } = await supabaseAdmin
      .from("leads")
      .select("id, name, assigned_to")
      .eq("id", data.leadId)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!lead) throw new Error("Lead não encontrado.");

    // Atualiza
    const { error: uErr } = await supabaseAdmin
      .from("leads")
      .update({ assigned_to: data.newAssigneeId })
      .eq("id", data.leadId);
    if (uErr) throw new Error(uErr.message);

    // Resolve escalonamentos abertos do lead
    await supabaseAdmin
      .from("sla_escalations")
      .update({
        resolved_at: new Date().toISOString(),
        resolution: "reassigned",
        reassigned_to: data.newAssigneeId,
      } as never)
      .eq("lead_id", data.leadId)
      .is("resolved_at", null);

    // Notifica novo responsável
    await sendPushToUser({
      userId: data.newAssigneeId,
      title: "Lead reatribuído a você",
      body: lead.name ? `Lead: ${lead.name}` : undefined,
      url: `/leads/${data.leadId}`,
      leadId: data.leadId,
      tag: `lead-reassigned-${data.leadId}`,
      eventType: "lead_assigned",
    }).catch(() => undefined);

    return { ok: true };
  });
