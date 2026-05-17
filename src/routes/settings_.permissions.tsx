import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth, type AppRole } from "@/lib/auth";
import { usePermissions, type Action } from "@/lib/permissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/settings_/permissions")({
  component: () => (
    <AuthGate>
      <AppShell>
        <PermissionsPage />
      </AppShell>
    </AuthGate>
  ),
});

const ROLES: AppRole[] = ["admin", "diretor", "gerente", "coordenador", "supervisor", "operador"];
const ACTIONS = [
  { key: "can_view", label: "Ver" },
  { key: "can_create", label: "Criar" },
  { key: "can_edit", label: "Editar" },
  { key: "can_delete", label: "Excluir" },
  { key: "can_approve", label: "Aprovar" },
] as const;

type Module = { key: string; label: string; sensitive_fields: string[]; sort_order: number };
type ModuleRow = { role: AppRole; module_key: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean; can_approve: boolean };
type FieldRow = { role: AppRole; module_key: string; field_key: string; can_view: boolean; can_edit: boolean };

function PermissionsPage() {
  const { isAdmin, loading } = useAuth();
  const { refresh, can: editorCan, canField: editorCanField } = usePermissions();
  const navigate = useNavigate();
  const [modules, setModules] = useState<Module[]>([]);
  const [moduleRows, setModuleRows] = useState<ModuleRow[]>([]);
  const [fieldRows, setFieldRows] = useState<FieldRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!loading && !isAdmin) navigate({ to: "/dashboard" }); }, [loading, isAdmin, navigate]);

  const load = async () => {
    const [m, p, f] = await Promise.all([
      supabase.from("permission_modules").select("*").order("sort_order"),
      supabase.from("role_module_permissions").select("*"),
      supabase.from("role_field_permissions").select("*"),
    ]);
    setModules(((m.data ?? []) as any[]).map((r) => ({ ...r, sensitive_fields: Array.isArray(r.sensitive_fields) ? r.sensitive_fields : [] })));
    setModuleRows((p.data as ModuleRow[]) ?? []);
    setFieldRows((f.data as FieldRow[]) ?? []);
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const moduleMap = useMemo(() => {
    const map = new Map<string, ModuleRow>();
    moduleRows.forEach((r) => map.set(`${r.role}|${r.module_key}`, r));
    return map;
  }, [moduleRows]);

  const fieldMap = useMemo(() => {
    const map = new Map<string, FieldRow>();
    fieldRows.forEach((r) => map.set(`${r.role}|${r.module_key}|${r.field_key}`, r));
    return map;
  }, [fieldRows]);

  const getMod = (role: AppRole, mk: string): ModuleRow =>
    moduleMap.get(`${role}|${mk}`) ?? { role, module_key: mk, can_view: false, can_create: false, can_edit: false, can_delete: false, can_approve: false };

  const getField = (role: AppRole, mk: string, fk: string): FieldRow =>
    fieldMap.get(`${role}|${mk}|${fk}`) ?? { role, module_key: mk, field_key: fk, can_view: true, can_edit: false };

  const toggleMod = (role: AppRole, mk: string, action: typeof ACTIONS[number]["key"]) => {
    const cur = getMod(role, mk);
    const next = { ...cur, [action]: !cur[action] };
    setModuleRows((rows) => {
      const key = `${role}|${mk}`;
      const exists = rows.some((r) => r.role === role && r.module_key === mk);
      return exists ? rows.map((r) => r.role === role && r.module_key === mk ? next : r) : [...rows, next];
    });
  };

  const toggleField = (role: AppRole, mk: string, fk: string, action: "can_view" | "can_edit") => {
    const cur = getField(role, mk, fk);
    const next = { ...cur, [action]: !cur[action] };
    setFieldRows((rows) => {
      const exists = rows.some((r) => r.role === role && r.module_key === mk && r.field_key === fk);
      return exists ? rows.map((r) => r.role === role && r.module_key === mk && r.field_key === fk ? next : r) : [...rows, next];
    });
  };

  // Edit-gating: editor não pode conceder o que ele próprio não tem.
  // Admin sempre pode (editorCan/editorCanField já retornam true para admin).
  const actionToKey: Record<typeof ACTIONS[number]["key"], Action> = {
    can_view: "view", can_create: "create", can_edit: "edit", can_delete: "delete", can_approve: "approve",
  };
  const canGrantMod = (mk: string, action: typeof ACTIONS[number]["key"]) =>
    editorCan(mk, actionToKey[action]);
  const canGrantField = (mk: string, fk: string, action: "can_view" | "can_edit") =>
    editorCanField(mk, fk, action === "can_view" ? "view" : "edit");

  const save = async () => {
    setSaving(true);
    // Defesa em profundidade: filtra do payload qualquer linha que viole o edit-gating.
    const safeMods = moduleRows.map((row) => ({
      ...row,
      can_view: row.can_view && canGrantMod(row.module_key, "can_view"),
      can_create: row.can_create && canGrantMod(row.module_key, "can_create"),
      can_edit: row.can_edit && canGrantMod(row.module_key, "can_edit"),
      can_delete: row.can_delete && canGrantMod(row.module_key, "can_delete"),
      can_approve: row.can_approve && canGrantMod(row.module_key, "can_approve"),
    }));
    const safeFields = fieldRows.map((row) => ({
      ...row,
      can_view: row.can_view && canGrantField(row.module_key, row.field_key, "can_view"),
      can_edit: row.can_edit && canGrantField(row.module_key, row.field_key, "can_edit"),
    }));
    const m = await supabase.from("role_module_permissions").upsert(safeMods, { onConflict: "role,module_key" });
    const f = await supabase.from("role_field_permissions").upsert(safeFields, { onConflict: "role,module_key,field_key" });
    setSaving(false);
    if (m.error || f.error) { toast.error(m.error?.message ?? f.error?.message ?? "Erro"); return; }
    toast.success("Permissões salvas");
    await refresh();
  };

  if (!isAdmin) return null;

  const GatedCheckbox = ({ checked, onChange, locked, lockedReason }: {
    checked: boolean; onChange: () => void; locked: boolean; lockedReason: string;
  }) => {
    const cb = <Checkbox checked={checked} onCheckedChange={onChange} disabled={locked} />;
    if (!locked) return cb;
    return (
      <Tooltip>
        <TooltipTrigger asChild><span className="inline-flex">{cb}</span></TooltipTrigger>
        <TooltipContent>{lockedReason}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Permissões</h1>
          <p className="text-muted-foreground">Matriz de alçadas por papel</p>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </div>

      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules">Por módulo</TabsTrigger>
          <TabsTrigger value="fields">Campos sensíveis</TabsTrigger>
        </TabsList>

        <TabsContent value="modules">
          <p className="mb-2 text-xs text-muted-foreground">
            Checkboxes em cinza não podem ser alterados — você não pode conceder um acesso que não possui.
          </p>
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-40">Módulo</TableHead>
                  {ROLES.map((r) => (
                    <TableHead key={r} colSpan={ACTIONS.length} className="text-center border-l">{r}</TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  <TableHead></TableHead>
                  {ROLES.flatMap((r) => ACTIONS.map((a) => (
                    <TableHead key={`${r}-${a.key}`} className="text-center text-xs">{a.label}</TableHead>
                  )))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {modules.map((m) => (
                  <TableRow key={m.key}>
                    <TableCell className="font-medium">{m.label}</TableCell>
                    {ROLES.flatMap((r) => ACTIONS.map((a) => {
                      const row = getMod(r, m.key);
                      const locked = r === "admin" || !canGrantMod(m.key, a.key);
                      const reason = r === "admin"
                        ? "Admin sempre tem acesso total."
                        : "Você não pode conceder um acesso que não possui.";
                      return (
                        <TableCell key={`${r}-${m.key}-${a.key}`} className="text-center">
                          <GatedCheckbox
                            checked={row[a.key]}
                            onChange={() => toggleMod(r, m.key, a.key)}
                            locked={locked}
                            lockedReason={reason}
                          />
                        </TableCell>
                      );
                    }))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">Admin sempre tem acesso total (não editável).</p>
        </TabsContent>

        <TabsContent value="fields">
          <p className="mb-2 text-xs text-muted-foreground">
            Checkboxes em cinza não podem ser alterados — você não pode conceder um acesso que não possui.
          </p>
          <div className="space-y-4">
            {modules.filter((m) => m.sensitive_fields.length > 0).map((m) => (
              <Card key={m.key} className="p-4">
                <h3 className="mb-3 font-semibold">{m.label}</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campo</TableHead>
                      {ROLES.map((r) => <TableHead key={r} colSpan={2} className="text-center border-l">{r}</TableHead>)}
                    </TableRow>
                    <TableRow>
                      <TableHead></TableHead>
                      {ROLES.flatMap((r) => [
                        <TableHead key={`${r}-v`} className="text-center text-xs">Ver</TableHead>,
                        <TableHead key={`${r}-e`} className="text-center text-xs">Editar</TableHead>,
                      ])}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {m.sensitive_fields.map((f) => (
                      <TableRow key={f}>
                        <TableCell className="font-mono text-xs">{f}</TableCell>
                        {ROLES.flatMap((r) => {
                          const row = getField(r, m.key, f);
                          const lockedV = r === "admin" || !canGrantField(m.key, f, "can_view");
                          const lockedE = r === "admin" || !canGrantField(m.key, f, "can_edit");
                          const reason = r === "admin"
                            ? "Admin sempre tem acesso total."
                            : "Você não pode conceder um acesso que não possui.";
                          return [
                            <TableCell key={`${r}-${f}-v`} className="text-center">
                              <GatedCheckbox checked={row.can_view} onChange={() => toggleField(r, m.key, f, "can_view")} locked={lockedV} lockedReason={reason} />
                            </TableCell>,
                            <TableCell key={`${r}-${f}-e`} className="text-center">
                              <GatedCheckbox checked={row.can_edit} onChange={() => toggleField(r, m.key, f, "can_edit")} locked={lockedE} lockedReason={reason} />
                            </TableCell>,
                          ];
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </TooltipProvider>
  );
}
