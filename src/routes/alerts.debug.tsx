import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { debugTriggerNotification } from "@/lib/debug-notifications.functions";

type EventType =
  | "lead_assigned"
  | "lead_status_changed"
  | "task_due_soon"
  | "task_overdue";

export const Route = createFileRoute("/alerts/debug")({
  component: AlertsDebugPage,
});

function AlertsDebugPage() {
  const { isAdmin, loading } = useAuth();
  const trigger = useServerFn(debugTriggerNotification);

  const [event, setEvent] = useState<EventType>("lead_assigned");
  const [leadId, setLeadId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<unknown>(null);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!isAdmin) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-lg font-semibold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">
          Esta página é apenas para administradores.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/alerts">Voltar</Link>
        </Button>
      </div>
    );
  }

  async function fire() {
    setBusy(true);
    try {
      const result = await trigger({
        data: {
          event,
          leadId: leadId.trim() || undefined,
          taskId: taskId.trim() || undefined,
          targetUserId: targetUserId.trim() || undefined,
          title: title.trim() || undefined,
          body: body.trim() || undefined,
        },
      });
      setLastResult(result);
      toast.success("Disparo enviado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Debug: disparar notificação</h1>
        <Button asChild variant="outline" size="sm">
          <Link to="/alerts">Voltar</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evento de teste</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Evento</Label>
            <Select value={event} onValueChange={(v) => setEvent(v as EventType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead_assigned">lead_assigned</SelectItem>
                <SelectItem value="lead_status_changed">lead_status_changed</SelectItem>
                <SelectItem value="task_due_soon">task_due_soon</SelectItem>
                <SelectItem value="task_overdue">task_overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Lead ID (opcional)</Label>
              <Input value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="uuid" />
            </div>
            <div className="space-y-2">
              <Label>Task ID (opcional)</Label>
              <Input value={taskId} onChange={(e) => setTaskId(e.target.value)} placeholder="uuid" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Destinatário (user_id) — vazio = você</Label>
            <Input
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              placeholder="uuid"
            />
          </div>

          <div className="space-y-2">
            <Label>Título (opcional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Corpo (opcional)</Label>
            <Input value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          <Button onClick={fire} disabled={busy}>
            {busy ? "Disparando…" : "Disparar"}
          </Button>

          {lastResult ? (
            <pre className="mt-4 text-xs bg-muted p-3 rounded overflow-auto">
              {JSON.stringify(lastResult, null, 2)}
            </pre>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Este endpoint não altera leads/tasks reais — apenas dispara o push
            respeitando as preferências do destinatário.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
