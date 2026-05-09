import { format } from "date-fns";
import { Calendar as CalendarIcon, AlertCircle, CheckCircle2, Play, Pause, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TaskUpdatesPanel } from "@/components/TaskUpdatesPanel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export type TaskWindowData = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  priority: "baixa" | "media" | "alta";
  started_at: string | null;
  completed_at: string | null;
};

export function TaskWindow({
  task,
  leadId,
  onChanged,
  onClose,
}: {
  task: TaskWindowData;
  leadId: string;
  onChanged: () => void;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const isOverdue = !task.completed && task.due_date && new Date(task.due_date) < new Date();
  const inProgress = !!task.started_at && !task.completed;

  const priorityColor =
    task.priority === "alta" ? "bg-red-500/10 text-red-700 border-red-500/30" :
    task.priority === "baixa" ? "bg-slate-500/10 text-slate-700 border-slate-500/30" :
    "bg-amber-500/10 text-amber-700 border-amber-500/30";

  const toggleComplete = async () => {
    const { error } = await supabase.from("tasks").update({ completed: !task.completed }).eq("id", task.id);
    if (error) toast.error(error.message); else onChanged();
  };
  const toggleStarted = async () => {
    const newStarted = task.started_at ? null : new Date().toISOString();
    const { error } = await supabase.from("tasks").update({ started_at: newStarted }).eq("id", task.id);
    if (error) toast.error(error.message); else onChanged();
  };
  const remove = async () => {
    if (!confirm(`${t("delete")}?`)) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) toast.error(error.message);
    else { onChanged(); onClose?.(); }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start gap-3">
        <button onClick={toggleComplete} className="mt-0.5" aria-label="toggle">
          {task.completed
            ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            : <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/40 hover:border-primary" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className={cn("text-base font-semibold", task.completed && "line-through")}>{task.title}</h2>
            <Badge variant="outline" className={priorityColor}>
              {task.priority === "alta" ? t("priorityHigh") : task.priority === "baixa" ? t("priorityLow") : t("priorityMedium")}
            </Badge>
            {inProgress && <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">{t("inProgress")}</Badge>}
          </div>
          {task.due_date && (
            <div className={cn("text-xs mt-1 flex items-center gap-1", isOverdue ? "text-red-600 font-medium" : "text-muted-foreground")}>
              {isOverdue && <AlertCircle className="h-3 w-3" />}
              <CalendarIcon className="h-3 w-3" />
              {format(new Date(task.due_date), "dd/MM/yyyy HH:mm")}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!task.completed && (
            <Button size="sm" variant="outline" onClick={toggleStarted}>
              {inProgress ? <><Pause className="h-4 w-4 mr-1 text-amber-600" />{t("pauseTask")}</> : <><Play className="h-4 w-4 mr-1" />{t("startTask")}</>}
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={remove} title={t("delete")}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {task.description && (
        <div className="text-sm text-muted-foreground whitespace-pre-wrap border rounded-md p-3 bg-muted/30">
          {task.description}
        </div>
      )}

      <Separator />

      <TaskUpdatesPanel
        taskId={task.id}
        taskTitle={task.title}
        leadId={leadId}
        onChanged={onChanged}
        onClose={() => onClose?.()}
      />
    </div>
  );
}
