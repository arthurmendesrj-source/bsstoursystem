import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { CheckCircle2, Save, X } from "lucide-react";

type Update = {
  id: string;
  content: string | null;
  occurred_at: string;
  created_by: string | null;
};

export function TaskUpdatesPanel({
  taskId,
  taskTitle,
  leadId,
  onChanged,
  onClose,
}: {
  taskId: string;
  taskTitle: string;
  leadId: string | null;
  onChanged: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);
  const subjectMatch = `Atualização [${taskId.slice(0, 8)}]`;

  useEffect(() => {
    let cancel = false;
    (async () => {
      let q = supabase
        .from("interactions")
        .select("id,content,occurred_at,created_by")
        .ilike("subject", `${subjectMatch}%`)
        .order("occurred_at", { ascending: false })
        .limit(20);
      if (leadId) q = q.eq("lead_id", leadId);
      const { data } = await q;
      if (!cancel) setUpdates((data as Update[]) ?? []);
    })();
    return () => {
      cancel = true;
    };
  }, [taskId, leadId, subjectMatch]);

  const save = async (alsoClose: boolean) => {
    if (!user) return;
    const content = text.trim();
    if (!content && !alsoClose) {
      toast.error(t("taskUpdatePlaceholder"));
      return;
    }
    setBusy(true);
    if (content) {
      const { error: insErr } = await supabase.from("interactions").insert({
        type: "nota",
        subject: `${subjectMatch} ${taskTitle}`.slice(0, 200),
        content,
        lead_id: leadId,
        created_by: user.id,
        occurred_at: new Date().toISOString(),
      });
      if (insErr) {
        toast.error(insErr.message);
        setBusy(false);
        return;
      }
    }
    if (alsoClose) {
      const { error: updErr } = await supabase
        .from("tasks")
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq("id", taskId);
      if (updErr) {
        toast.error(updErr.message);
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setText("");
    toast.success(t("saved"));
    onChanged();
    if (alsoClose) onClose();
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      {updates.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-auto">
          {updates.map((u) => (
            <div key={u.id} className="text-xs border-l-2 border-primary/40 pl-2">
              <div className="text-muted-foreground">
                {format(new Date(u.occurred_at), "dd/MM/yyyy HH:mm")}
              </div>
              <div className="whitespace-pre-wrap">{u.content}</div>
            </div>
          ))}
        </div>
      )}
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("taskUpdatePlaceholder")}
      />
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
          <X className="h-4 w-4 mr-1" />
          {t("cancel")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => save(false)} disabled={busy || !text.trim()}>
          <Save className="h-4 w-4 mr-1" />
          {t("save")}
        </Button>
        <Button size="sm" onClick={() => save(true)} disabled={busy}>
          <CheckCircle2 className="h-4 w-4 mr-1" />
          {t("closeTask")}
        </Button>
      </div>
    </div>
  );
}
