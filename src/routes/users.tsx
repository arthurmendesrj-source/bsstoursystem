import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, Settings2 } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import { useAuth, type AppRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/users")({
  component: () => (
    <AuthGate>
      <AppShell>
        <UsersPage />
      </AppShell>
    </AuthGate>
  ),
});

type ProfileRow = {
  id: string;
  user_id: string;
  full_name: string | null;
};
type RoleRow = { user_id: string; role: AppRole };

const ROLES: AppRole[] = ["admin", "diretor", "gerente", "supervisor", "operador"];

function UsersPage() {
  const { t } = useI18n();
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard" });
  }, [loading, isAdmin, navigate]);

  const load = async () => {
    const [p, r] = await Promise.all([
      supabase.from("profiles").select("id,user_id,full_name"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    setProfiles(p.data ?? []);
    setRoles((r.data as RoleRow[]) ?? []);
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const userRoles = (uid: string) => roles.filter((r) => r.user_id === uid).map((r) => r.role);

  const addRole = async (uid: string, role: AppRole) => {
    if (userRoles(uid).includes(role)) return;
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role });
    if (error) toast.error(error.message); else { toast.success(t("saved")); load(); }
  };

  const removeRole = async (uid: string, role: AppRole) => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", role);
    if (error) toast.error(error.message); else load();
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("users")}</h1>
        <p className="text-muted-foreground">{profiles.length}</p>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("role")}</TableHead>
              <TableHead className="w-48">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link
                    to="/users/$userId/permissions"
                    params={{ userId: p.user_id }}
                    className="inline-flex items-center gap-2 hover:underline"
                  >
                    <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {p.full_name ?? "—"}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {userRoles(p.user_id).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    {userRoles(p.user_id).map((r) => (
                      <Badge key={r} variant="secondary" className="cursor-pointer" onClick={() => removeRole(p.user_id, r)}>
                        <Shield className="mr-1 h-3 w-3" />{t(r)} ✕
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Select onValueChange={(v) => addRole(p.user_id, v as AppRole)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="+ Atribuir papel" /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{t(r)}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">
        Clique em uma badge para remover o papel. Convites por e-mail virão em fase futura — por enquanto, usuários se cadastram em <code>/login</code> e o admin atribui papéis aqui.
      </p>
    </div>
  );
}
