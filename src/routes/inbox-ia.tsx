import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Check, X, Edit3, Loader2, AlertTriangle, Filter, Inbox } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inbox-ia")({
  component: InboxIaPage,
  head: () => ({
    meta: [
      { title: "Inbox IA — Fila de ações" },
      { name: "description", content: "Aprovar, editar ou rejeitar ações sugeridas pela IA do CRM." },
    ],
  }),
});

type PendingAction = {
  id: string;
  user_id: string;
  conversation_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  created_at: string;
  decided_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  propose_create_lead: "Criar lead",
  propose_update_lead: "Atualizar lead",
  propose_create_interaction: "Registrar interação",
  propose_create_activity: "Criar atividade operacional",
  propose_send_proposal: "Enviar proposta",
  propose_send_followup: "Enviar follow-up",
  propose_create_invoice: "Gerar invoice (rascunho)",
  propose_request_quote: "Solicitar cotação a fornecedor",
};

function scoreOf(a: PendingAction): { score: number; label: "Alta" | "Média" | "Baixa"; color: string } {
  // urgency by age + impact by action type
  const ageMin = (Date.now() - new Date(a.created_at).getTime()) / 60000;
  const urgency = Math.min(1, ageMin / 60); // 0..1 over 60min
  const impactMap: Record<string, number> = {
    propose_create_invoice: 0.9,
    propose_send_proposal: 0.85,
    propose_send_followup: 0.5,
    propose_create_lead: 0.6,
    propose_update_lead: 0.4,
    propose_create_interaction: 0.3,
    propose_create_activity: 0.4,
    propose_request_quote: 0.7,
  };
  const impact = impactMap[a.action_type] ?? 0.5;
  const score = +(urgency * 0.4 + impact * 0.6).toFixed(2);
  if (score >= 0.7) return { score, label: "Alta", color: "bg-destructive text-destructive-foreground" };
  if (score >= 0.45) return { score, label: "Média", color: "bg-amber-500 text-white" };
  return { score, label: "Baixa", color: "bg-muted text-muted-foreground" };
}

function formatPayload(p: Record<string, unknown>): { label: string; value: string }[] {
  return Object.entries(p)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 8)
    .map(([k, v]) => ({
      label: k,
      value: typeof v === "object" ? JSON.stringify(v) : String(v),
    }));
}

function InboxIaPage() {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const fetchActions = async () => {
    setLoading(true);
    let q = supabase
      .from("ai_pending_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    else setActions((data ?? []) as PendingAction[]);
    setLoading(false);
  };

  useEffect(() => {
    void fetchActions();
    const ch = supabase
      .channel("ai_pending_actions_inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_pending_actions" },
        () => void fetchActions(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const sorted = useMemo(
    () => [...actions].sort((a, b) => scoreOf(b).score - scoreOf(a).score),
    [actions],
  );

  const decide = async (id: string, status: "approved" | "rejected") => {
    setBusy(id);
    const { error } = await supabase
      .from("ai_pending_actions")
      .update({ status, decided_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(null);
    if (error) toast.error(error.message);
    else {
      toast.success(status === "approved" ? "Aprovado" : "Rejeitado");
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

  const decideBatch = async (status: "approved" | "rejected") => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("ai_pending_actions")
      .update({ status, decided_at: new Date().toISOString() })
      .in("id", ids);
    if (error) toast.error(error.message);
    else {
      toast.success(`${ids.length} ações ${status === "approved" ? "aprovadas" : "rejeitadas"}`);
      setSelected(new Set());
    }
  };

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <AuthGate>
      <AppShell>
        <div className="container mx-auto max-w-5xl px-4 py-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-primary" />
                Inbox IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Fila priorizada de ações sugeridas pela IA. Você aprova, edita ou rejeita.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="approved">Aprovadas</SelectItem>
                  <SelectItem value="rejected">Rejeitadas</SelectItem>
                  <SelectItem value="executed">Executadas</SelectItem>
                  <SelectItem value="failed">Falhas</SelectItem>
                  <SelectItem value="all">Todas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {selected.size > 0 && (
            <Card className="border-primary">
              <CardContent className="flex items-center justify-between py-3">
                <span className="text-sm font-medium">{selected.size} selecionada(s)</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => decideBatch("rejected")}>
                    <X className="h-4 w-4 mr-1" /> Rejeitar lote
                  </Button>
                  <Button size="sm" onClick={() => decideBatch("approved")}>
                    <Check className="h-4 w-4 mr-1" /> Aprovar lote
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sorted.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <Inbox className="h-12 w-12 mx-auto mb-3 opacity-50" />
                Nenhuma ação {statusFilter === "pending" ? "pendente" : statusFilter} no momento.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sorted.map((a) => {
                const sc = scoreOf(a);
                const fields = formatPayload(a.payload);
                const isPending = a.status === "pending";
                return (
                  <Card key={a.id} className={cn("transition-colors", selected.has(a.id) && "border-primary")}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        {isPending && (
                          <Checkbox
                            checked={selected.has(a.id)}
                            onCheckedChange={() => toggleSel(a.id)}
                            className="mt-1"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={sc.color}>{sc.label}</Badge>
                            <CardTitle className="text-base">
                              {ACTION_LABELS[a.action_type] ?? a.action_type}
                            </CardTitle>
                            <Badge variant="outline" className="text-xs">
                              {new Date(a.created_at).toLocaleString("pt-BR")}
                            </Badge>
                            {a.status !== "pending" && (
                              <Badge variant="secondary" className="text-xs capitalize">
                                {a.status}
                              </Badge>
                            )}
                          </div>
                          {a.error && (
                            <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              {a.error}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        {fields.map((f) => (
                          <div key={f.label} className="flex gap-2 min-w-0">
                            <span className="text-muted-foreground text-xs shrink-0 w-24 truncate">{f.label}:</span>
                            <span className="truncate font-medium">{f.value}</span>
                          </div>
                        ))}
                      </div>
                      {isPending && (
                        <div className="flex items-center justify-end gap-2 pt-2 border-t">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy === a.id}
                            onClick={() => toast.info("Edição inline em breve — abra o registro relacionado.")}
                          >
                            <Edit3 className="h-4 w-4 mr-1" /> Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === a.id}
                            onClick={() => decide(a.id, "rejected")}
                          >
                            <X className="h-4 w-4 mr-1" /> Rejeitar
                          </Button>
                          <Button
                            size="sm"
                            disabled={busy === a.id}
                            onClick={() => decide(a.id, "approved")}
                          >
                            {busy === a.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4 mr-1" />
                            )}
                            Aprovar
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </AppShell>
    </AuthGate>
  );
}
