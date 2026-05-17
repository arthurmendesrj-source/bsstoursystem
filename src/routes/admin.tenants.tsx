import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/tenants")({
  component: AdminTenantsPage,
});

type Plan = { id: string; name: string; code: string; price_cents: number; currency: string; interval: string };
type Subscription = {
  id: string;
  status: "trialing" | "active" | "past_due" | "canceled";
  plan_id: string;
  trial_end: string | null;
  current_period_end: string | null;
  plans: { name: string; code: string } | null;
};
type Row = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended" | "canceled";
  created_at: string;
  subscriptions: Subscription | Subscription[] | null;
};
type Invoice = {
  id: string;
  amount_cents: number;
  currency: string;
  status: "open" | "paid" | "void" | "uncollectible";
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
};

function AdminTenantsPage() {
  const { isSuperAdmin, loading } = useTenant();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [newInv, setNewInv] = useState({ amount: "0", due: "" });

  useEffect(() => {
    if (!loading && !isSuperAdmin) navigate({ to: "/dashboard" });
  }, [loading, isSuperAdmin, navigate]);

  const load = useCallback(async () => {
    const [{ data: tdata }, { data: pdata }] = await Promise.all([
      supabase
        .from("tenants")
        .select(
          "id, slug, name, status, created_at, subscriptions:subscriptions (id, status, plan_id, trial_end, current_period_end, plans:plan_id (name, code))",
        )
        .order("created_at", { ascending: false }),
      supabase.from("plans").select("id, name, code, price_cents, currency, interval").eq("is_active", true).order("sort_order"),
    ]);
    setRows((tdata ?? []) as Row[]);
    setPlans((pdata ?? []) as Plan[]);
  }, []);

  useEffect(() => {
    if (isSuperAdmin) void load();
  }, [isSuperAdmin, load]);

  const sub = (r: Row): Subscription | null => {
    if (!r.subscriptions) return null;
    return Array.isArray(r.subscriptions) ? (r.subscriptions[0] ?? null) : r.subscriptions;
  };

  const setStatus = async (id: string, status: Row["status"]) => {
    const { error } = await supabase.from("tenants").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Empresa atualizada");
    void load();
  };

  const setSubStatus = async (subId: string, status: Subscription["status"]) => {
    const patch: Record<string, unknown> = { status };
    if (status === "canceled") patch.canceled_at = new Date().toISOString();
    const { error } = await supabase.from("subscriptions").update(patch).eq("id", subId);
    if (error) return toast.error(error.message);
    toast.success("Assinatura atualizada");
    void load();
    if (selected) void openTenant(selected);
  };

  const changePlan = async (subId: string, planId: string) => {
    const { error } = await supabase.from("subscriptions").update({ plan_id: planId }).eq("id", subId);
    if (error) return toast.error(error.message);
    toast.success("Plano alterado");
    void load();
    if (selected) void openTenant(selected);
  };

  const openTenant = async (r: Row) => {
    setSelected(r);
    const { data } = await supabase
      .from("billing_invoices")
      .select("id, amount_cents, currency, status, due_date, paid_at, created_at")
      .eq("tenant_id", r.id)
      .order("created_at", { ascending: false });
    setInvoices((data ?? []) as Invoice[]);
  };

  const markPaid = async (id: string) => {
    const { error } = await supabase
      .from("billing_invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Fatura marcada como paga");
    if (selected) void openTenant(selected);
  };

  const createInvoice = async () => {
    if (!selected) return;
    const s = sub(selected);
    const cents = Math.round(parseFloat(newInv.amount) * 100);
    if (!cents || cents <= 0) return toast.error("Valor inválido");
    const { error } = await supabase.from("billing_invoices").insert({
      tenant_id: selected.id,
      subscription_id: s?.id ?? null,
      amount_cents: cents,
      currency: "BRL",
      status: "open",
      due_date: newInv.due || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Fatura criada");
    setNewInv({ amount: "0", due: "" });
    void openTenant(selected);
  };

  if (!isSuperAdmin) return null;

  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold">Admin · Empresas</h1>
          <p className="text-muted-foreground">Gestão completa de tenants e assinaturas.</p>
        </div>

        <Card>
          <CardHeader><CardTitle>{rows.length} empresa(s)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Assinatura</TableHead>
                  <TableHead>Criada</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => {
                  const s = sub(t);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">/{t.slug}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status}</Badge>
                      </TableCell>
                      <TableCell>{s?.plans?.name ?? "—"}</TableCell>
                      <TableCell>
                        {s ? <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge> : "—"}
                      </TableCell>
                      <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="space-x-2">
                        <Button size="sm" variant="outline" onClick={() => openTenant(t)}>Gerenciar</Button>
                        {t.status !== "suspended" ? (
                          <Button size="sm" variant="outline" onClick={() => setStatus(t.id, "suspended")}>Suspender</Button>
                        ) : (
                          <Button size="sm" onClick={() => setStatus(t.id, "active")}>Reativar</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (() => {
            const s = sub(selected);
            return (
              <div className="space-y-5">
                <div className="rounded border p-4 space-y-3">
                  <h3 className="font-semibold">Assinatura</h3>
                  {!s ? (
                    <p className="text-sm text-muted-foreground">Sem assinatura.</p>
                  ) : (
                    <>
                      <div className="grid md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <Label>Status</Label>
                          <Select value={s.status} onValueChange={(v) => setSubStatus(s.id, v as Subscription["status"])}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="trialing">trialing</SelectItem>
                              <SelectItem value="active">active</SelectItem>
                              <SelectItem value="past_due">past_due</SelectItem>
                              <SelectItem value="canceled">canceled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Plano</Label>
                          <Select value={s.plan_id} onValueChange={(v) => changePlan(s.id, v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {plans.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} ({p.currency} {(p.price_cents / 100).toFixed(2)})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.trial_end && <>Trial até {new Date(s.trial_end).toLocaleDateString()} · </>}
                        {s.current_period_end && <>Período até {new Date(s.current_period_end).toLocaleDateString()}</>}
                      </div>
                    </>
                  )}
                </div>

                <div className="rounded border p-4 space-y-3">
                  <h3 className="font-semibold">Faturas</h3>
                  <div className="flex items-end gap-2">
                    <div>
                      <Label>Valor (BRL)</Label>
                      <Input type="number" step="0.01" value={newInv.amount} onChange={(e) => setNewInv({ ...newInv, amount: e.target.value })} className="w-32" />
                    </div>
                    <div>
                      <Label>Vencimento</Label>
                      <Input type="date" value={newInv.due} onChange={(e) => setNewInv({ ...newInv, due: e.target.value })} />
                    </div>
                    <Button onClick={createInvoice}>Criar fatura</Button>
                  </div>
                  {invoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma fatura.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Vence</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((i) => (
                          <TableRow key={i.id}>
                            <TableCell>{new Date(i.created_at).toLocaleDateString()}</TableCell>
                            <TableCell>{i.currency} {(i.amount_cents / 100).toFixed(2)}</TableCell>
                            <TableCell>{i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"}</TableCell>
                            <TableCell><Badge variant={i.status === "paid" ? "default" : "outline"}>{i.status}</Badge></TableCell>
                            <TableCell>
                              {i.status !== "paid" && (
                                <Button size="sm" variant="outline" onClick={() => markPaid(i.id)}>Marcar paga</Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
