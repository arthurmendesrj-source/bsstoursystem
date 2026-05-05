import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, ArrowLeft, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/alerts/preferences")({
  component: () => (
    <AuthGate>
      <AppShell>
        <PreferencesPage />
      </AppShell>
    </AuthGate>
  ),
});

type EventType =
  | "lead_assigned"
  | "lead_status_changed"
  | "task_due_soon"
  | "task_overdue"
  | "sla_warning"
  | "sla_overdue";

const EVENTS: { key: EventType; title: string; description: string }[] = [
  {
    key: "lead_assigned",
    title: "Novo lead atribuído a mim",
    description: "Receba quando um lead for designado para você.",
  },
  {
    key: "lead_status_changed",
    title: "Mudança de status em lead",
    description: "Avise quando um lead que você acompanha mudar de fase.",
  },
  {
    key: "task_due_soon",
    title: "Tarefa vencendo em breve",
    description: "Lembrete a até 1h do vencimento de uma tarefa.",
  },
  {
    key: "task_overdue",
    title: "Tarefa vencida",
    description: "Notifique quando uma tarefa passar do prazo.",
  },
  {
    key: "sla_warning",
    title: "SLA em alerta",
    description: "Avise quando o tempo de resposta entrar na zona amarela.",
  },
  {
    key: "sla_overdue",
    title: "SLA estourado",
    description: "Notifique imediatamente quando o SLA for excedido.",
  },
];

function PreferencesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Record<EventType, boolean>>(() =>
    EVENTS.reduce((acc, e) => ({ ...acc, [e.key]: true }), {} as Record<EventType, boolean>),
  );

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("event_type, push_enabled")
        .eq("user_id", user.id);
      if (!cancelled) {
        if (error) {
          console.error(error);
          toast.error("Falha ao carregar preferências.");
        } else if (data) {
          setPrefs((prev) => {
            const next = { ...prev };
            for (const row of data) {
              next[row.event_type as EventType] = row.push_enabled;
            }
            return next;
          });
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const toggle = (key: EventType, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    const rows = EVENTS.map((e) => ({
      user_id: user.id,
      event_type: e.key,
      push_enabled: prefs[e.key],
    }));
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(rows, { onConflict: "user_id,event_type" });
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Preferências salvas.");
    }
  };

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Preferências de notificação</h1>
            <p className="text-sm text-muted-foreground">
              Escolha quais eventos devem disparar push para você.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/alerts">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar para alertas
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventos disponíveis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 divide-y">
          {loading ? (
            <div className="space-y-3 py-2">
              {EVENTS.map((e) => (
                <Skeleton key={e.key} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            EVENTS.map((e) => (
              <div
                key={e.key}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="space-y-0.5">
                  <Label htmlFor={`pref-${e.key}`} className="text-sm font-medium">
                    {e.title}
                  </Label>
                  <p className="text-xs text-muted-foreground">{e.description}</p>
                </div>
                <Switch
                  id={`pref-${e.key}`}
                  checked={prefs[e.key]}
                  onCheckedChange={(v) => toggle(e.key, v)}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading || saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvando..." : "Salvar preferências"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Estas preferências controlam apenas os pushes <strong>para você</strong>. O envio real depende
        de você ter ativado as notificações no botão da página de alertas.
      </p>
    </div>
  );
}
