import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, XCircle, MinusCircle, RefreshCw, Search, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/alerts/history")({
  component: () => (
    <AuthGate>
      <AppShell>
        <NotificationHistoryPage />
      </AppShell>
    </AuthGate>
  ),
});

interface LogRow {
  id: string;
  user_id: string;
  lead_id: string | null;
  channel: "push" | "in_app" | "email" | "whatsapp";
  status: "success" | "error" | "skipped";
  title: string;
  body: string | null;
  error_detail: string | null;
  sent_at: string;
  metadata: Record<string, unknown>;
}

interface ProfileRow {
  user_id: string;
  full_name: string | null;
}

function NotificationHistoryPage() {
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [leadNames, setLeadNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [onlyMine, setOnlyMine] = useState(!isAdmin);
  const [search, setSearch] = useState("");

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      let query = (supabase.from("notification_logs" as any) as any)
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(200);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (channelFilter !== "all") query = query.eq("channel", channelFilter);
      if (onlyMine || !isAdmin) query = query.eq("user_id", user.id);

      const { data, error } = await query;
      if (error) throw error;
      const list = (data ?? []) as LogRow[];
      setRows(list);

      // Carrega nomes dos usuários (apenas admin vê outros)
      if (isAdmin && list.length) {
        const ids = Array.from(new Set(list.map((r) => r.user_id)));
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id,full_name")
          .in("user_id", ids);
        const map: Record<string, string> = {};
        for (const p of (profs ?? []) as ProfileRow[]) {
          if (p.user_id) map[p.user_id] = p.full_name ?? "—";
        }
        setProfiles(map);
      }

      // Carrega nomes/códigos dos leads referenciados
      const leadIds = Array.from(
        new Set(list.map((r) => r.lead_id).filter((v): v is string => !!v)),
      );
      if (leadIds.length) {
        const { data: leads } = await supabase
          .from("leads")
          .select("id,name,code")
          .in("id", leadIds);
        const lmap: Record<string, string> = {};
        for (const l of (leads ?? []) as { id: string; name: string; code: string | null }[]) {
          lmap[l.id] = l.code ? `${l.code} · ${l.name}` : l.name;
        }
        setLeadNames(lmap);
      } else {
        setLeadNames({});
      }
    } catch (err) {
      console.error("[notif-history] load failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, statusFilter, channelFilter, onlyMine]);

  const successCount = rows.filter((r) => r.status === "success").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const skippedCount = rows.filter((r) => r.status === "skipped").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Histórico de notificações
          </h1>
          <p className="text-sm text-muted-foreground">
            Registro de notificações enviadas (sucesso, erro ou ignoradas).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/alerts">Voltar para alertas</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Sucesso" value={successCount} tone="success" />
        <SummaryCard label="Erros" value={errorCount} tone="error" />
        <SummaryCard label="Ignoradas" value={skippedCount} tone="muted" />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
                <SelectItem value="skipped">Ignorada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">Canal</Label>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="push">Push</SelectItem>
                <SelectItem value="in_app">In-app</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Switch id="only-mine" checked={onlyMine} onCheckedChange={setOnlyMine} />
              <Label htmlFor="only-mine" className="text-sm cursor-pointer">
                Somente as minhas
              </Label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {rows.length} {rows.length === 1 ? "registro" : "registros"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma notificação registrada ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-4">Quando</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Canal</th>
                    <th className="py-2 pr-4">Título</th>
                    <th className="py-2 pr-4">Detalhe</th>
                    {isAdmin && <th className="py-2 pr-4">Usuário</th>}
                    <th className="py-2 pr-4">Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0 align-top">
                      <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                        {new Date(r.sent_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-xs">{r.channel}</Badge>
                      </td>
                      <td className="py-2 pr-4 max-w-[260px] truncate" title={r.title}>{r.title}</td>
                      <td className="py-2 pr-4 max-w-[320px] text-xs text-muted-foreground">
                        {r.status === "error" ? (
                          <span className="text-destructive">{r.error_detail ?? "Erro desconhecido"}</span>
                        ) : (
                          <span className="line-clamp-2">{r.body ?? "—"}</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {profiles[r.user_id] ?? r.user_id.slice(0, 8)}
                        </td>
                      )}
                      <td className="py-2 pr-4">
                        {r.lead_id ? (
                          <Link
                            to="/leads/$leadId"
                            params={{ leadId: r.lead_id }}
                            className="text-primary hover:underline text-xs"
                          >
                            abrir
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: "success" | "error" | "skipped" }) {
  if (status === "success") {
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Sucesso
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive gap-1">
        <XCircle className="h-3 w-3" /> Erro
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1">
      <MinusCircle className="h-3 w-3" /> Ignorada
    </Badge>
  );
}

function SummaryCard({
  label, value, tone,
}: { label: string; value: number; tone: "success" | "error" | "muted" }) {
  const colors = {
    success: "text-emerald-600",
    error: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={cn("text-3xl font-semibold mt-1", colors)}>{value}</p>
      </CardContent>
    </Card>
  );
}
