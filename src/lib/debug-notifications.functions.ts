// Debug-only server functions to manually fire notification flows.
// Requires authenticated admin. Does NOT update real lead/task rows.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  sendPushToUser,
  sendPushToLeadRecipients,
  type NotificationEventType,
} from "@/server/push.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

const TriggerSchema = z.object({
  event: z.enum([
    "lead_assigned",
    "lead_status_changed",
    "task_due_soon",
    "task_overdue",
  ]),
  leadId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
  title: z.string().max(200).optional(),
  body: z.string().max(1000).optional(),
});

/**
 * Trigger a notification event for testing without touching the real DB
 * (no leads/tasks are mutated, no cron required).
 */
export const debugTriggerNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TriggerSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const eventType = data.event as NotificationEventType;

    // Cases that target a specific user (assigned / task notifications)
    if (
      data.event === "lead_assigned" ||
      data.event === "task_due_soon" ||
      data.event === "task_overdue"
    ) {
      const userId = data.targetUserId ?? context.userId;
      const titles: Record<string, string> = {
        lead_assigned: "Novo lead atribuído a você",
        task_due_soon: "Tarefa vencendo em breve",
        task_overdue: "Tarefa atrasada",
      };
      const result = await sendPushToUser({
        userId,
        title: data.title ?? titles[data.event],
        body: data.body ?? "[debug] Disparo manual de teste",
        url: data.leadId ? `/leads/${data.leadId}` : "/alerts",
        leadId: data.leadId ?? null,
        tag: `debug-${data.event}-${data.taskId ?? data.leadId ?? userId}`,
        eventType,
      });
      return { ok: true, mode: "user", result };
    }

    // Status change → fan-out to lead recipients
    if (data.event === "lead_status_changed") {
      if (!data.leadId) throw new Error("leadId is required for lead_status_changed");
      const result = await sendPushToLeadRecipients({
        leadId: data.leadId,
        title: data.title ?? "Status do lead alterado",
        body: data.body ?? "[debug] Disparo manual de teste",
        url: `/leads/${data.leadId}`,
        tag: `debug-lead-status-${data.leadId}`,
        eventType,
        excludeUserIds: [context.userId],
      });
      return { ok: true, mode: "lead", result };
    }

    return { ok: false, error: "unsupported event" };
  });
