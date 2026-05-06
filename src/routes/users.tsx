import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, Settings2, UserPlus, Ban, Trash2, CheckCircle2, Mail, RefreshCw, Clock, History } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/i18n";
import { useAuth, type AppRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { filterAdmins } from "@/lib/hideAdmin";
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

type ProfileRow = { id: string; user_id: string; full_name: string | null };
type RoleRow = { user_id: string; role: AppRole };
type AuthUserInfo = {
  user_id: string;
  email: string | null;
  banned_until: string | null;
  invited_at: string | null;
  email_confirmed_at: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
};

const ROLES: AppRole[] = ["admin", "diretor", "gerente", "supervisor", "operador"];
const PROTECTED: AppRole[] = ["admin", "diretor"];

async function callAdminUsers(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

function UsersPage() {
  const { t } = useI18n();
  const { isAdmin, isDirector, canManageUsers, loading, user } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [authInfo, setAuthInfo] = useState<Record<string, AuthUserInfo>>({});
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (!loading && !canManageUsers) navigate({ to: "/dashboard" });
  }, [loading, canManageUsers, navigate]);

  const load = async () => {
    const [p, r] = await Promise.all([
      supabase.from("profiles").select("id,user_id,full_name"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    const allRoles = (r.data as RoleRow[]) ?? [];
    setProfiles(filterAdmins(p.data ?? [], allRoles));
    setRoles(allRoles);
    try {
      const data = await callAdminUsers("list");
      const map: Record<string, AuthUserInfo> = {};
      for (const u of (data?.users ?? []) as AuthUserInfo[]) map[u.user_id] = u;
      setAuthInfo(map);
    } catch (e) {
      console.warn("list users failed", e);
    }
  };
  useEffect(() => { if (canManageUsers) load(); }, [canManageUsers]);

  const userRoles = (uid: string) => roles.filter((r) => r.user_id === uid).map((r) => r.role);
  const isProtectedTarget = (uid: string) => userRoles(uid).some((r) => PROTECTED.includes(r));
  const canActOn = (uid: string) => {
    if (uid === user?.id) return false;
    if (isAdmin) return true;
    if (isDirector) return !isProtectedTarget(uid);
    return false;
  };

  const addRole = async (uid: string, role: AppRole) => {
    if (userRoles(uid).includes(role)) return;
    if (!isAdmin && PROTECTED.includes(role)) {
      toast.error("Apenas admin pode atribuir admin/diretor");
      return;
    }
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role });
    if (error) toast.error(error.message); else { toast.success(t("saved")); load(); }
  };

  const removeRole = async (uid: string, role: AppRole) => {
    if (!isAdmin && PROTECTED.includes(role)) {
      toast.error("Apenas admin pode remover admin/diretor");
      return;
    }
    const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", role);
    if (error) toast.error(error.message); else load();
  };

  const handleBlock = async (uid: string, blocked: boolean) => {
    try {
      await callAdminUsers(blocked ? "block" : "unblock", { user_id: uid });
      toast.success(blocked ? "Usuário bloqueado" : "Usuário desbloqueado");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDelete = async (uid: string, reassignTo?: string | null) => {
    try {
      await callAdminUsers("delete", { user_id: uid, reassign_to: reassignTo || null });
      toast.success(reassignTo ? "Usuário excluído (dados reatribuídos)" : "Usuário excluído");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const isBanned = (uid: string) => {
    const b = authInfo[uid]?.banned_until;
    if (!b) return false;
    return new Date(b).getTime() > Date.now();
  };

  if (!canManageUsers) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("users")}</h1>
          <p className="text-muted-foreground">{profiles.length}</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 h-4 w-4" />Convidar usuário</Button>
          </DialogTrigger>
          <InviteDialog
            isAdmin={isAdmin}
            onClose={() => setInviteOpen(false)}
            onDone={() => { setInviteOpen(false); load(); }}
          />
        </Dialog>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>{t("role")}</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-64 text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((p) => {
              const banned = isBanned(p.user_id);
              const acts = canActOn(p.user_id);
              return (
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
                  <TableCell className="text-sm text-muted-foreground">
                    {authInfo[p.user_id]?.email ?? "—"}
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
                    {banned ? (
                      <Badge variant="destructive">Bloqueado</Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-600 border-green-600/50">Ativo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Select onValueChange={(v) => addRole(p.user_id, v as AppRole)}>
                        <SelectTrigger className="h-8 w-32"><SelectValue placeholder="+ Papel" /></SelectTrigger>
                        <SelectContent>
                          {ROLES.filter((r) => isAdmin || !PROTECTED.includes(r)).map((r) => (
                            <SelectItem key={r} value={r}>{t(r)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {acts && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" title={banned ? "Desbloquear" : "Bloquear"}>
                              {banned ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Ban className="h-4 w-4 text-orange-600" />}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{banned ? "Desbloquear usuário?" : "Bloquear usuário?"}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {banned
                                  ? "O usuário poderá fazer login novamente."
                                  : "O usuário não conseguirá fazer login enquanto estiver bloqueado."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleBlock(p.user_id, !banned)}>
                                Confirmar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      {acts && (
                        <DeleteUserDialog
                          targetId={p.user_id}
                          targetName={p.full_name ?? authInfo[p.user_id]?.email ?? "—"}
                          candidates={profiles.filter((x) => x.user_id !== p.user_id)}
                          authInfo={authInfo}
                          onConfirm={(reassignTo) => handleDelete(p.user_id, reassignTo)}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <PendingInvites
        authInfo={authInfo}
        profiles={profiles}
        canActOn={canActOn}
        onChange={load}
      />

      <AuditLogSection profiles={profiles} authInfo={authInfo} />

      <p className="text-xs text-muted-foreground">
        Convites enviam um e-mail com link de cadastro. Clique nas badges de papel para removê-las.
      </p>
    </div>
  );
}

const INVITE_TTL_HOURS = 24;

function PendingInvites({
  authInfo,
  profiles,
  canActOn,
  onChange,
}: {
  authInfo: Record<string, AuthUserInfo>;
  profiles: ProfileRow[];
  canActOn: (uid: string) => boolean;
  onChange: () => void;
}) {
  const profileName = (uid: string) => profiles.find((p) => p.user_id === uid)?.full_name ?? null;
  const pending = Object.values(authInfo).filter(
    (u) => u.invited_at && !u.email_confirmed_at && !u.confirmed_at,
  );

  const expiresAt = (invitedAt: string) =>
    new Date(new Date(invitedAt).getTime() + INVITE_TTL_HOURS * 3600_000);

  const fmt = (d: Date) => d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const resend = async (uid: string) => {
    try {
      await callAdminUsers("resend_invite", { user_id: uid });
      toast.success("Convite reenviado");
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Convites pendentes</h2>
        <Badge variant="secondary" className="ml-auto">{pending.length}</Badge>
      </div>
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum convite pendente.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-mail</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Enviado em</TableHead>
              <TableHead>Expira em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((u) => {
              const exp = u.invited_at ? expiresAt(u.invited_at) : null;
              const expired = exp ? exp.getTime() < Date.now() : false;
              return (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">{u.email ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{profileName(u.user_id) ?? "—"}</TableCell>
                  <TableCell className="text-sm">{u.invited_at ? fmt(new Date(u.invited_at)) : "—"}</TableCell>
                  <TableCell className="text-sm">
                    <span className={expired ? "text-destructive" : ""}>
                      {exp ? fmt(exp) : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {expired ? (
                      <Badge variant="destructive">Expirado</Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-600/50">
                        <Clock className="mr-1 h-3 w-3" />Aguardando
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canActOn(u.user_id) && (
                        <Button size="sm" variant="ghost" onClick={() => resend(u.user_id)} title="Reenviar convite">
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function InviteDialog({ isAdmin, onClose, onDone }: { isAdmin: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const availableRoles = ROLES.filter((r) => isAdmin || !PROTECTED.includes(r));

  const toggleRole = (r: AppRole) => {
    setSelectedRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  };

  const submit = async () => {
    if (!email.trim()) { toast.error("Informe o e-mail"); return; }
    setSubmitting(true);
    try {
      await callAdminUsers("invite", {
        email: email.trim(),
        full_name: fullName.trim() || undefined,
        roles: selectedRoles,
      });
      toast.success("Convite enviado");
      setEmail(""); setFullName(""); setSelectedRoles([]);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Convidar novo usuário</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label htmlFor="inv-email">E-mail *</Label>
          <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@empresa.com" />
        </div>
        <div>
          <Label htmlFor="inv-name">Nome (opcional)</Label>
          <Input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label>Papéis iniciais</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {availableRoles.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <Checkbox checked={selectedRoles.includes(r)} onCheckedChange={() => toggleRole(r)} />
                {t(r)}
              </label>
            ))}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
        <Button onClick={submit} disabled={submitting}>{submitting ? "Enviando..." : "Enviar convite"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DeleteUserDialog({
  targetId,
  targetName,
  candidates,
  authInfo,
  onConfirm,
}: {
  targetId: string;
  targetName: string;
  candidates: ProfileRow[];
  authInfo: Record<string, AuthUserInfo>;
  onConfirm: (reassignTo: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"reassign" | "delete_all">("reassign");
  const [reassignTo, setReassignTo] = useState<string>("");

  const submit = () => {
    if (mode === "reassign" && !reassignTo) {
      toast.error("Selecione um usuário para reatribuir");
      return;
    }
    onConfirm(mode === "reassign" ? reassignTo : null);
    setOpen(false);
    setReassignTo("");
    setMode("reassign");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Excluir">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir {targetName}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Escolha o que fazer com os dados vinculados (leads, clientes, orçamentos, reservas, interações):
          </p>
          <div className="space-y-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                checked={mode === "reassign"}
                onChange={() => setMode("reassign")}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium text-sm">Reatribuir para outro usuário</div>
                <div className="text-xs text-muted-foreground mb-2">
                  Os registros serão transferidos e preservados.
                </div>
                {mode === "reassign" && (
                  <Select value={reassignTo} onValueChange={setReassignTo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o usuário destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((c) => (
                        <SelectItem key={c.user_id} value={c.user_id}>
                          {c.full_name ?? authInfo[c.user_id]?.email ?? c.user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                checked={mode === "delete_all"}
                onChange={() => setMode("delete_all")}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium text-sm text-destructive">Excluir todos os dados</div>
                <div className="text-xs text-muted-foreground">
                  Remove permanentemente leads, clientes, orçamentos, reservas e interações criados por este usuário. Não pode ser desfeito.
                </div>
              </div>
            </label>
          </div>
          {/* targetId reserved for future use */}
          <input type="hidden" value={targetId} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={submit}
          >
            Excluir usuário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type AuditEntry = {
  id: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  target_user_id: string | null;
  target_email: string | null;
  details: Record<string, unknown> | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  invite: "Convite enviado",
  resend_invite: "Convite reenviado",
  block: "Usuário bloqueado",
  unblock: "Usuário desbloqueado",
  delete: "Usuário excluído",
};

const ACTION_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  invite: "secondary",
  resend_invite: "outline",
  block: "destructive",
  unblock: "default",
  delete: "destructive",
};

function AuditLogSection({
  profiles,
  authInfo,
}: {
  profiles: ProfileRow[];
  authInfo: Record<string, AuthUserInfo>;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const profileName = (uid: string | null) => {
    if (!uid) return null;
    return profiles.find((p) => p.user_id === uid)?.full_name ?? null;
  };
  const userLabel = (uid: string | null, fallbackEmail: string | null) => {
    const name = profileName(uid);
    const email = fallbackEmail ?? (uid ? authInfo[uid]?.email ?? null : null);
    if (name && email) return `${name} (${email})`;
    return name ?? email ?? "—";
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await callAdminUsers("list_audit", { limit: 100 });
      setEntries((data?.entries ?? []) as AuditEntry[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Log de auditoria</h2>
        <Badge variant="secondary" className="ml-auto">{entries.length}</Badge>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} title="Atualizar">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Executado por</TableHead>
              <TableHead>Usuário alvo</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => {
              const details = e.details ?? {};
              const detailParts: string[] = [];
              if (Array.isArray((details as { roles?: unknown[] }).roles)) {
                const roles = (details as { roles: string[] }).roles;
                if (roles.length > 0) detailParts.push(`papéis: ${roles.join(", ")}`);
              }
              if ((details as { mode?: string }).mode === "reassign") {
                const re = (details as { reassigned_to_email?: string }).reassigned_to_email;
                detailParts.push(`reatribuído para ${re ?? "outro usuário"}`);
              } else if ((details as { mode?: string }).mode === "cascade_delete") {
                detailParts.push("dados excluídos em cascata");
              }
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-sm whitespace-nowrap">{fmt(e.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={ACTION_VARIANTS[e.action] ?? "outline"}>
                      {ACTION_LABELS[e.action] ?? e.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{userLabel(e.actor_id, e.actor_email)}</TableCell>
                  <TableCell className="text-sm">{userLabel(e.target_user_id, e.target_email)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {detailParts.length > 0 ? detailParts.join(" · ") : "—"}
                    {!e.success && e.error_message && (
                      <span className="block text-destructive">Erro: {e.error_message}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
