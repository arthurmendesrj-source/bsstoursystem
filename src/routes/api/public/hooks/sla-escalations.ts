import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser } from "@/server/push.server";

function checkApiKey(request: Request): boolean {
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const got = request.headers.get("apikey") || request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return !!expected && !!got && got === expected;
}

type SlaSetting = { stage: string; overdue_hours: number };
type Lead = {
  id: string;
  name: string | null;
  status: string;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
};
type Interaction = { lead_id: string | null; occurred_at: string };

export const Route = createFileRoute("/api/public/hooks/sla-escalations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!checkApiKey(request)) {
          return new Response("unauthorized", { status: 401 });
        }

        // 1) Carrega thresholds por stage
        const { data: settings, error: sErr } = await supabaseAdmin
          .from("sla_settings")
          .select("stage, overdue_hours");
        if (sErr) return new Response(sErr.message, { status: 500 });
        const thresholds = new Map<string, number>();
        for (const s of (settings ?? []) as SlaSetting[]) thresholds.set(s.stage, s.overdue_hours);
        if (thresholds.size === 0) return Response.json({ ok: true, escalated: 0 });

        // 2) Carrega leads ativos (estados que entram em SLA)
        const stages = Array.from(thresholds.keys());
        const { data: leadsData, error: lErr } = await supabaseAdmin
          .from("leads")
          .select("id, name, status, assigned_to, created_by, created_at")
          .in("status", stages);
        if (lErr) return new Response(lErr.message, { status: 500 });
        const leads = (leadsData ?? []) as Lead[];
        if (leads.length === 0) return Response.json({ ok: true, escalated: 0 });

        // 3) Última interação por lead
        const ids = leads.map((l) => l.id);
        const { data: ints } = await supabaseAdmin
          .from("interactions")
          .select("lead_id, occurred_at")
          .in("lead_id", ids)
          .order("occurred_at", { ascending: false });
        const lastByLead = new Map<string, string>();
        for (const it of (ints ?? []) as Interaction[]) {
          if (it.lead_id && !lastByLead.has(it.lead_id)) lastByLead.set(it.lead_id, it.occurred_at);
        }

        // 4) Escalonamentos abertos existentes (evita duplicar)
        const { data: openEsc } = await supabaseAdmin
          .from("sla_escalations")
          .select("lead_id")
          .is("resolved_at", null)
          .in("lead_id", ids);
        const alreadyOpen = new Set((openEsc ?? []).map((r) => r.lead_id as string));

        // 5) Admins ativos
        const { data: admins } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        const adminIds = Array.from(new Set((admins ?? []).map((a) => a.user_id as string).filter(Boolean)));

        const now = Date.now();
        let escalated = 0;

        for (const l of leads) {
          if (alreadyOpen.has(l.id)) continue;
          const threshold = thresholds.get(l.status);
          if (!threshold) continue;
          const lastIso = lastByLead.get(l.id) ?? l.created_at;
          const hours = (now - new Date(lastIso).getTime()) / 3600000;
          if (hours <= threshold) continue;

          // Cria escalonamento
          const { data: created, error: cErr } = await supabaseAdmin
            .from("sla_escalations")
            .insert({
              lead_id: l.id,
              stage: l.status,
              overdue_hours_at_trigger: threshold,
              hours_since_last_action: Math.round(hours * 10) / 10,
              notified_admins: adminIds,
            })
            .select("id")
            .single();
          if (cErr) continue;

          // Notifica admins por push
          await Promise.all(
            adminIds.map((uid) =>
              sendPushToUser({
                userId: uid,
                title: "Lead escalado por SLA",
                body: `${l.name ?? "Lead"} parado há ${Math.round(hours)}h em "${l.status}"`,
                url: `/alerts/sla?escalation=${created?.id ?? ""}`,
                leadId: l.id,
                tag: `sla-escalated-${l.id}`,
                eventType: "lead_escalated",
              }).catch(() => undefined),
            ),
          );
          escalated++;
        }

        return Response.json({ ok: true, escalated });
      },
    },
  },
});
