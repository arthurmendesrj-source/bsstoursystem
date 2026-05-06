import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAdminIds } from "@/lib/hideAdmin";
import { useI18n } from "@/lib/i18n";
import { Plus, Edit3, ArrowRightLeft, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";

type EntityType = "lead" | "quote" | "booking";

type Entry = {
  id: string;
  action: "created" | "updated" | "status_changed";
  changes: Record<string, { old: unknown; new: unknown }>;
  actor_id: string | null;
  created_at: string;
};

const ICONS = {
  created: Plus,
  updated: Edit3,
  status_changed: ArrowRightLeft,
} as const;

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function ActivityTimeline({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const { t, lang } = useI18n();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [actors, setActors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const locale = lang === "pt" ? ptBR : lang === "es" ? es : enUS;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("activity_log" as never)
        .select("id, action, changes, actor_id, created_at")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      const list = (data ?? []) as Entry[];
      setEntries(list);
      const ids = Array.from(new Set(list.map((e) => e.actor_id).filter(Boolean))) as string[];
      if (ids.length) {
        const [{ data: profs }, { data: rls }] = await Promise.all([
          supabase.from("profiles").select("user_id, full_name").in("user_id", ids),
          supabase.from("user_roles").select("user_id, role").in("user_id", ids),
        ]);
        const adminIds = getAdminIds((rls ?? []) as { user_id: string; role: string }[]);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p: { user_id: string; full_name: string | null }) => {
          map[p.user_id] = adminIds.has(p.user_id) ? "Sistema" : (p.full_name ?? "");
        });
        if (!cancelled) setActors(map);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  if (loading) return <div className="text-xs text-muted-foreground py-4">{t("loading")}</div>;
  if (entries.length === 0) return <div className="text-xs text-muted-foreground py-4">{t("activityEmpty")}</div>;

  return (
    <div className="space-y-3">
      {entries.map((e) => {
        const Icon = ICONS[e.action] ?? Clock;
        const actor = e.actor_id ? actors[e.actor_id] : null;
        const fields = Object.entries(e.changes ?? {});
        return (
          <div key={e.id} className="flex gap-2 text-xs">
            <div className="mt-0.5">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-muted-foreground">
                <span className="font-medium text-foreground">{t(`activity_${e.action}` as "activity_created")}</span>
                {actor && <> · {t("activityBy")} <span className="text-foreground">{actor}</span></>}
                <> · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale })}</>
              </div>
              {fields.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {fields.map(([f, v]) => (
                    <li key={f} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{f}</span>: {fmtVal(v.old)} → <span className="text-foreground">{fmtVal(v.new)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
