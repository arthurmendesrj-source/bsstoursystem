import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendPushToUser } from "@/server/push.server";

const NotifyTaskAssignedSchema = z.object({ taskId: z.string().uuid() });

export const notifyTaskAssigned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => NotifyTaskAssignedSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: task, error } = await supabase
      .from("tasks")
      .select("id, title, assigned_to, lead_id")
      .eq("id", data.taskId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!task) return { ok: false, reason: "not_found" };
    if (!task.assigned_to || task.assigned_to === userId) {
      return { ok: false, reason: "self_or_unassigned" };
    }

    const result = await sendPushToUser({
      userId: task.assigned_to,
      title: "Nova atividade atribuída a você",
      body: task.title ?? "Você recebeu uma nova atividade.",
      url: task.lead_id ? `/leads/${task.lead_id}` : "/activities",
      leadId: task.lead_id ?? null,
      tag: `task-assigned-${task.id}`,
      eventType: "lead_assigned",
    });
    return { ok: true, ...result };
  });
