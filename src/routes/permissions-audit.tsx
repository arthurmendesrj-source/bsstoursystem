import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, X, Shield } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/permissions-audit")({
  component: () => (
    <AuthGate>
      <AppShell>
        <PermissionsAuditPage />
      </AppShell>
    </AuthGate>
  ),
});

type Module = { key: string; label: string; sensitive_fields: string[]; sort_order: number };

const ACTIONS = [
  { key: "view", label: "Ver" },
  { key: "create", label: "Criar" },
  { key: "edit", label: "Editar" },
  { key: "delete", label: "Excluir" },
  { key: "approve", label: "Aprovar" },
] as const;

function Yes() { return <Check className="mx-auto h-4 w-4 text-emerald-600" />; }
function No() { return <X className="mx-auto h-4 w-4 text-muted-foreground/50" />; }

function PermissionsAuditPage() {
  const { user, roles, isAdmin } = useAuth();
  const { can, canField, loading } = usePermissions();
  const [modules, setModules] = useState<Module[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    supabase
      .from("permission_modules")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        setModules(((data ?? []) as any[]).map((r) => ({
          ...r,
          sensitive_fields: Array.isArray(r.sensitive_fields) ? r.sensitive_fields : [],
        })));
      });
  }, []);

  const filtered = useMemo(
    () => modules.filter((m) => !filter || m.label.toLowerCase().includes(filter.toLowerCase()) || m.key.includes(filter.toLowerCase())),
    [modules, filter],
  );

  const fieldModules = filtered.filter((m) => m.sensitive_fields.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Auditoria de Permissões</h1>
        <p className="text-muted-foreground">Suas permissões efetivas calculadas por papel</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Sessão atual</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Usuário: </span><span className="font-mono">{user?.email ?? "—"}</span></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Papéis:</span>
            {isAdmin && <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30"><Shield className="mr-1 h-3 w-3" />admin (acesso total)</Badge>}
            {roles.length === 0 && !isAdmin && <span className="text-muted-foreground">— nenhum papel atribuído</span>}
            {roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
          </div>
          {loading && <div className="text-xs text-muted-foreground">Carregando matriz…</div>}
        </CardContent>
      </Card>

      <Input
        placeholder="Filtrar módulo…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Permissões por módulo</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Módulo</TableHead>
                <TableHead className="font-mono text-xs">key</TableHead>
                {ACTIONS.map((a) => <TableHead key={a.key} className="text-center">{a.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.key}>
                  <TableCell className="font-medium">{m.label}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{m.key}</TableCell>
                  {ACTIONS.map((a) => (
                    <TableCell key={a.key} className="text-center">
                      {can(m.key, a.key) ? <Yes /> : <No />}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={2 + ACTIONS.length} className="text-center text-sm text-muted-foreground py-6">Nenhum módulo</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Campos sensíveis</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Módulo</TableHead>
                <TableHead>Campo</TableHead>
                <TableHead className="text-center">Ver</TableHead>
                <TableHead className="text-center">Editar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fieldModules.flatMap((m) => m.sensitive_fields.map((f) => (
                <TableRow key={`${m.key}.${f}`}>
                  <TableCell className="font-medium">{m.label}</TableCell>
                  <TableCell className="font-mono text-xs">{f}</TableCell>
                  <TableCell className="text-center">{canField(m.key, f, "view") ? <Yes /> : <No />}</TableCell>
                  <TableCell className="text-center">{canField(m.key, f, "edit") ? <Yes /> : <No />}</TableCell>
                </TableRow>
              )))}
              {fieldModules.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Sem campos sensíveis catalogados</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Campos não catalogados são liberados por padrão. Admin sempre tem acesso total. Para alterar a matriz, peça a um admin acessar <code>/settings/permissions</code>.
      </p>
    </div>
  );
}
