import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth, type AppRole } from "@/lib/auth";
import { usePermissions, type Action } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/users_/$userId/permissions")({
  component: () => (
    <AuthGate>
      <AppShell>
        <UserPermissionsPage />
      </AppShell>
    </AuthGate>
  ),
});

const ROLES: AppRole[] = ["admin", "diretor", "gerente", "supervisor", "operador"];
const ACTIONS = [
  { key: "can_view", label: "Ver", action: "view" as Action },
  { key: "can_create", label: "Criar", action: "create" as Action },
  { key: "can_edit", label: "Editar", action: "edit" as Action },
  { key: "can_delete", label: "Excluir", action: "delete" as Action },
  { key: "can_approve", label: "Aprovar", action: "approve" as Action },
] as const;
type ActionKey = typeof ACTIONS[number]["key"];

type Module = { key: string; label: string; sensitive_fields: string[]; sort_order: number };
type RoleModuleRow = { role: AppRole; module_key: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean; can_approve: boolean };
type RoleFieldRow = { role: AppRole; module_key: string; field_key: string; can_view: boolean; can_edit: boolean };
type UserModuleRow = { user_id: string; module_key: string; can_view: boolean | null; can_create: boolean | null; can_edit: boolean | null; can_delete: boolean | null; can_approve: boolean | null };
type UserFieldRow = { user_id: string; module_key: string; field_key: string; can_view: boolean | null; can_edit: boolean | null };

type TriState = null | true | false; // null = herdado

function UserPermissionsPage() {
  const { userId } = Route.useParams();
  const { isAdmin, loading } = useAuth();
  const { can: editorCan, canField: editorCanField, refresh } = usePermissions();
  const navigate = useNavigate();

  const [target, setTarget] = useState<{ full_name: string | null; user_id: string } | null>(null);
  const [targetRoles, setTargetRoles] = useState<AppRole[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [roleMods, setRoleMods] = useState<RoleModuleRow[]>([]);
  const [roleFields, setRoleFields] = useState<RoleFieldRow[]>([]);
  const [userMods, setUserMods] = useState<UserModuleRow[]>([]);
  const [userFields, setUserFields] = useState<UserFieldRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!loading && !isAdmin) navigate({ to: "/dashboard" }); }, [loading, isAdmin, navigate]);

  const load = async () => {
    const [prof, ur, mods, rmp, rfp, ump, ufp] = await Promise.all([
      supabase.from("profiles").select("user_id,full_name").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("permission_modules").select("*").order("sort_order"),
      supabase.from("role_module_permissions").select("*"),
      supabase.from("role_field_permissions").select("*"),
      supabase.from("user_module_permissions").select("*").eq("user_id", userId),
      supabase.from("user_field_permissions").select("*").eq("user_id", userId),
    ]);
    setTarget(prof.data ?? null);
    setTargetRoles(((ur.data ?? []) as { role: AppRole }[]).map((r) => r.role));
    setModules(((mods.data ?? []) as any[]).map((r) => ({ ...r, sensitive_fields: Array.isArray(r.sensitive_fields) ? r.sensitive_fields : [] })));
    setRoleMods((rmp.data as RoleModuleRow[]) ?? []);
    setRoleFields((rfp.data as RoleFieldRow[]) ?? []);
    setUserMods((ump.data as UserModuleRow[]) ?? []);
    setUserFields((ufp.data as UserFieldRow[]) ?? []);
  };
  useEffect(() => { if (isAdmin) load(); /* eslint-disable-next-line */ }, [isAdmin, userId]);

  // Valor herdado do(s) papel(éis) do usuário-alvo
  const inheritedMod = (mk: string, ak: ActionKey): boolean => {
    if (targetRoles.includes("admin")) return true;
    return roleMods.some((p) => targetRoles.includes(p.role) && p.module_key === mk && (p as any)[ak] === true);
  };
  const inheritedField = (mk: string, fk: string, ak: "can_view" | "can_edit"): boolean => {
    if (targetRoles.includes("admin")) return true;
    const rows = roleFields.filter((p) => targetRoles.includes(p.role) && p.module_key === mk && p.field_key === fk);
    if (rows.length === 0) return ak === "can_view"; // padrão libera view se não catalogado
    return rows.some((r) => (r as any)[ak] === true);
  };

  const overrideMod = (mk: string, ak: ActionKey): TriState => {
    const r = userMods.find((u) => u.module_key === mk);
    if (!r) return null;
    const v = (r as any)[ak];
    return v === null || v === undefined ? null : v;
  };
  const overrideField = (mk: string, fk: string, ak: "can_view" | "can_edit"): TriState => {
    const r = userFields.find((u) => u.module_key === mk && u.field_key === fk);
    if (!r) return null;
    const v = (r as any)[ak];
    return v === null || v === undefined ? null : v;
  };

  const cycleMod = (mk: string, ak: ActionKey) => {
    const cur = overrideMod(mk, ak);
    const next: TriState = cur === null ? true : cur === true ? false : null;
    setUserMods((rows) => {
      const existing = rows.find((r) => r.module_key === mk);
      if (existing) {
        const updated = { ...existing, [ak]: next } as UserModuleRow;
        return rows.map((r) => (r.module_key === mk ? updated : r));
      }
      return [...rows, {
        user_id: userId, module_key: mk,
        can_view: null, can_create: null, can_edit: null, can_delete: null, can_approve: null,
        [ak]: next,
      } as UserModuleRow];
    });
  };

  const cycleField = (mk: string, fk: string, ak: "can_view" | "can_edit") => {
    const cur = overrideField(mk, fk, ak);
    const next: TriState = cur === null ? true : cur === true ? false : null;
    setUserFields((rows) => {
      const existing = rows.find((r) => r.module_key === mk && r.field_key === fk);
      if (existing) {
        const updated = { ...existing, [ak]: next } as UserFieldRow;
        return rows.map((r) => (r.module_key === mk && r.field_key === fk ? updated : r));
      }
      return [...rows, {
        user_id: userId, module_key: mk, field_key: fk,
        can_view: null, can_edit: null,
        [ak]: next,
      } as UserFieldRow];
    });
  };

  const resetModuleRow = (mk: string) => {
    setUserMods((rows) => rows.filter((r) => r.module_key !== mk).concat([{
      user_id: userId, module_key: mk,
      can_view: null, can_create: null, can_edit: null, can_delete: null, can_approve: null,
    }]));
  };
  const resetFieldRow = (mk: string, fk: string) => {
    setUserFields((rows) => rows.filter((r) => !(r.module_key === mk && r.field_key === fk)).concat([{
      user_id: userId, module_key: mk, field_key: fk, can_view: null, can_edit: null,
    }]));
  };

  // Edit-gating: editor não pode CONCEDER (true) acesso que ele próprio não tem.
  // Pode sempre BLOQUEAR (false) e RESETAR (null).
  const canGrantMod = (mk: string, ak: ActionKey): boolean => {
    const action = ACTIONS.find((a) => a.key === ak)!.action;
    return editorCan(mk, action);
  };
  const canGrantField = (mk: string, fk: string, ak: "can_view" | "can_edit"): boolean => {
    return editorCanField(mk, fk, ak === "can_view" ? "view" : "edit");
  };

  const save = async () => {
    setSaving(true);
    // Filtra: se um override = true e editor não pode conceder, força null
    const safeMods = userMods.map((r) => ({
      user_id: r.user_id,
      module_key: r.module_key,
      can_view: r.can_view === true && !canGrantMod(r.module_key, "can_view") ? null : r.can_view,
      can_create: r.can_create === true && !canGrantMod(r.module_key, "can_create") ? null : r.can_create,
      can_edit: r.can_edit === true && !canGrantMod(r.module_key, "can_edit") ? null : r.can_edit,
      can_delete: r.can_delete === true && !canGrantMod(r.module_key, "can_delete") ? null : r.can_delete,
      can_approve: r.can_approve === true && !canGrantMod(r.module_key, "can_approve") ? null : r.can_approve,
    }));
    const safeFields = userFields.map((r) => ({
      user_id: r.user_id,
      module_key: r.module_key,
      field_key: r.field_key,
      can_view: r.can_view === true && !canGrantField(r.module_key, r.field_key, "can_view") ? null : r.can_view,
      can_edit: r.can_edit === true && !canGrantField(r.module_key, r.field_key, "can_edit") ? null : r.can_edit,
    }));

    // Linhas com tudo null podem ser deletadas
    const modsToUpsert = safeMods.filter((r) => r.can_view !== null || r.can_create !== null || r.can_edit !== null || r.can_delete !== null || r.can_approve !== null);
    const modsToDelete = safeMods.filter((r) => r.can_view === null && r.can_create === null && r.can_edit === null && r.can_delete === null && r.can_approve === null);
    const fieldsToUpsert = safeFields.filter((r) => r.can_view !== null || r.can_edit !== null);
    const fieldsToDelete = safeFields.filter((r) => r.can_view === null && r.can_edit === null);

    const errors: string[] = [];
    if (modsToUpsert.length) {
      const { error } = await supabase.from("user_module_permissions").upsert(modsToUpsert, { onConflict: "user_id,module_key" });
      if (error) errors.push(error.message);
    }
    for (const r of modsToDelete) {
      const { error } = await supabase.from("user_module_permissions").delete().eq("user_id", r.user_id).eq("module_key", r.module_key);
      if (error) errors.push(error.message);
    }
    if (fieldsToUpsert.length) {
      const { error } = await supabase.from("user_field_permissions").upsert(fieldsToUpsert, { onConflict: "user_id,module_key,field_key" });
      if (error) errors.push(error.message);
    }
    for (const r of fieldsToDelete) {
      const { error } = await supabase.from("user_field_permissions").delete().eq("user_id", r.user_id).eq("module_key", r.module_key).eq("field_key", r.field_key);
      if (error) errors.push(error.message);
    }

    setSaving(false);
    if (errors.length) { toast.error(errors.join("; ")); return; }
    toast.success("Permissões salvas");
    await load();
    await refresh();
  };

  if (!isAdmin) return null;

  const TriCell = ({ inherited, override, locked, lockedReason, onClick, onReset }: {
    inherited: boolean; override: TriState; locked: boolean; lockedReason: string;
    onClick: () => void; onReset: () => void;
  }) => {
    const effective = override === null ? inherited : override;
    const label =
      override === null ? `Herdado (${inherited ? "✓" : "✗"})` :
      override === true ? "Permitir (override)" : "Bloquear (override)";
    const style =
      override === null ? "border-dashed border-muted-foreground/40 text-muted-foreground" :
      override === true ? "border-green-600 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" :
      "border-red-600 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300";
    const symbol = effective ? "✓" : "✗";
    const btn = (
      <button
        type="button"
        onClick={locked ? undefined : onClick}
        onContextMenu={(e) => { e.preventDefault(); if (!locked) onReset(); }}
        disabled={locked}
        className={cn(
          "inline-flex h-6 min-w-12 items-center justify-center rounded border px-2 text-xs font-medium transition",
          style,
          locked && "cursor-not-allowed opacity-50",
          !locked && "hover:opacity-80"
        )}
        title={`${label}. Botão direito = resetar.`}
      >
        {symbol}
      </button>
    );
    if (!locked) return btn;
    return (
      <Tooltip>
        <TooltipTrigger asChild><span className="inline-flex">{btn}</span></TooltipTrigger>
        <TooltipContent>{lockedReason}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link to="/users" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar para usuários
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">{target?.full_name ?? "Usuário"}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Papéis:</span>
              {targetRoles.length === 0 && <span className="text-sm text-muted-foreground">— sem papel</span>}
              {targetRoles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
            </div>
          </div>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </div>

        <Card className="bg-muted/30 p-3 text-xs text-muted-foreground">
          <p className="mb-1"><strong>Como usar:</strong> clique numa célula para alternar entre <strong>Herdado → Permitir → Bloquear → Herdado</strong>. Botão direito reseta para herdado.</p>
          <p>Os valores herdados vêm dos papéis do usuário (configurados em <Link to="/settings/permissions" className="underline">/settings/permissions</Link>). Você não pode <em>conceder</em> um acesso que você próprio não possui — admin sempre pode.</p>
        </Card>

        <Tabs defaultValue="modules">
          <TabsList>
            <TabsTrigger value="modules">Por módulo</TabsTrigger>
            <TabsTrigger value="fields">Campos sensíveis</TabsTrigger>
          </TabsList>

          <TabsContent value="modules">
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-40">Módulo</TableHead>
                    {ACTIONS.map((a) => <TableHead key={a.key} className="text-center text-xs">{a.label}</TableHead>)}
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modules.map((m) => (
                    <TableRow key={m.key}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      {ACTIONS.map((a) => {
                        const inh = inheritedMod(m.key, a.key);
                        const ovr = overrideMod(m.key, a.key);
                        const lockedGrant = !canGrantMod(m.key, a.key);
                        // Se editor não pode conceder, só pode bloquear ou resetar.
                        // Bloqueamos só quando estado seria virar "true" sem ter direito.
                        // Para simplificar: bloqueia o clique se ovr === false (próximo seria null=ok) — não, vamos permitir o ciclo, mas a célula "true" só é alcançável se !lockedGrant.
                        // Implementação: se locked, desabilita o ciclo inteiro EXCETO se valor atual == false (pode resetar).
                        const locked = lockedGrant && ovr !== false; // permite reset partindo de false
                        const reason = "Você não pode conceder um acesso que não possui. Pode bloquear ou resetar.";
                        return (
                          <TableCell key={a.key} className="text-center">
                            <TriCell
                              inherited={inh}
                              override={ovr}
                              locked={locked}
                              lockedReason={reason}
                              onClick={() => cycleMod(m.key, a.key)}
                              onReset={() => {
                                setUserMods((rows) => rows.map((r) => r.module_key === m.key ? { ...r, [a.key]: null } as UserModuleRow : r));
                              }}
                            />
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center">
                        <Button size="icon" variant="ghost" onClick={() => resetModuleRow(m.key)} title="Resetar tudo (herdar do papel)">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="fields">
            <div className="space-y-4">
              {modules.filter((m) => m.sensitive_fields.length > 0).map((m) => (
                <Card key={m.key} className="p-4">
                  <h3 className="mb-3 font-semibold">{m.label}</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campo</TableHead>
                        <TableHead className="text-center text-xs">Ver</TableHead>
                        <TableHead className="text-center text-xs">Editar</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {m.sensitive_fields.map((f) => {
                        const inhV = inheritedField(m.key, f, "can_view");
                        const inhE = inheritedField(m.key, f, "can_edit");
                        const ovrV = overrideField(m.key, f, "can_view");
                        const ovrE = overrideField(m.key, f, "can_edit");
                        const lockedGrantV = !canGrantField(m.key, f, "can_view");
                        const lockedGrantE = !canGrantField(m.key, f, "can_edit");
                        const lockedV = lockedGrantV && ovrV !== false;
                        const lockedE = lockedGrantE && ovrE !== false;
                        return (
                          <TableRow key={f}>
                            <TableCell className="font-mono text-xs">{f}</TableCell>
                            <TableCell className="text-center">
                              <TriCell
                                inherited={inhV} override={ovrV} locked={lockedV}
                                lockedReason="Você não pode conceder um acesso que não possui."
                                onClick={() => cycleField(m.key, f, "can_view")}
                                onReset={() => setUserFields((rows) => rows.map((r) => r.module_key === m.key && r.field_key === f ? { ...r, can_view: null } : r))}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <TriCell
                                inherited={inhE} override={ovrE} locked={lockedE}
                                lockedReason="Você não pode conceder um acesso que não possui."
                                onClick={() => cycleField(m.key, f, "can_edit")}
                                onReset={() => setUserFields((rows) => rows.map((r) => r.module_key === m.key && r.field_key === f ? { ...r, can_edit: null } : r))}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Button size="icon" variant="ghost" onClick={() => resetFieldRow(m.key, f)} title="Resetar (herdar do papel)">
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
