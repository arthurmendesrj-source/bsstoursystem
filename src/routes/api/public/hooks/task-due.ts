import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser } from "@/server/push.server";

function checkApiKey(request: Request): boolean {
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const got = request.headers.get("apikey") || request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return !!expected && !!got && got === expected;
}

export const Route = createFileRoute("/api/public/hooks/task-due")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!checkApiKey(request)) {
          return new Response("unauthorized", { status: 401 });
        }

        const now = new Date();
        const inOneHour = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
        const nowIso = now.toISOString();

        // Tarefas vencendo em <1h, ainda não notificadas
        const { data: dueSoon, error: e1 } = await supabaseAdmin
          .from("tasks")
          .select("id, title, due_date, assigned_to, lead_id")
          .eq("completed", false)
          .not("assigned_to", "is", null)
          .not("due_date", "is", null)
          .gte("due_date", nowIso)
          .lte("due_date", inOneHour)
          .is("notified_due_soon_at", null)
          .limit(200);
        if (e1) {
          return new Response(JSON.stringify({ error: e1.message }), { status: 500 });
        }

        // Tarefas atrasadas (overdue), ainda não notificadas
        const { data: overdue, error: e2 } = await supabaseAdmin
          .from("tasks")
          .select("id, title, due_date, assigned_to, lead_id")
          .eq("completed", false)
          .not("assigned_to", "is", null)
          .not("due_date", "is", null)
          .lt("due_date", nowIso)
          .is("notified_overdue_at", null)
          .limit(200);
        if (e2) {
          return new Response(JSON.stringify({ error: e2.message }), { status: 500 });
        }

        let dueSent = 0;
        let overdueSent = 0;

        for (const t of dueSoon ?? []) {
          if (!t.assigned_to) continue;
          await sendPushToUser({
            userId: t.assigned_to,
            title: "Tarefa vencendo em breve",
            body: t.title ?? "Você tem uma tarefa próxima do vencimento.",
            url: t.lead_id ? `/leads/${t.lead_id}` : "/alerts",
            leadId: t.lead_id ?? null,
            tag: `task-due-${t.id}`,
            eventType: "task_due_soon",
          }).catch(() => undefined);
          await supabaseAdmin
            .from("tasks")
            .update({ notified_due_soon_at: nowIso })
            .eq("id", t.id);
          dueSent++;
        }

        for (const t of overdue ?? []) {
          if (!t.assigned_to) continue;
          await sendPushToUser({
            userId: t.assigned_to,
            title: "Tarefa atrasada",
            body: t.title ?? "Você tem uma tarefa atrasada.",
            url: t.lead_id ? `/leads/${t.lead_id}` : "/alerts",
            leadId: t.lead_id ?? null,
            tag: `task-overdue-${t.id}`,
            eventType: "task_overdue",
          }).catch(() => undefined);
          await supabaseAdmin
            .from("tasks")
            .update({ notified_overdue_at: nowIso })
            .eq("id", t.id);
          overdueSent++;
        }

        return Response.json({ ok: true, dueSent, overdueSent });
      },
    },
  },
});
