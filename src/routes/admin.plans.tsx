import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/plans")({
  component: AdminPlansPage,
});

type Plan = {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: string;
  trial_days: number;
  is_active: boolean;
  is_public: boolean;
};

function AdminPlansPage() {
  const { isSuperAdmin, loading } = useTenant();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({ code: "", name: "", price: "0", trial: "15" });

  useEffect(() => {
    if (!loading && !isSuperAdmin) navigate({ to: "/dashboard" });
  }, [loading, isSuperAdmin, navigate]);

  const load = () =>
    supabase
      .from("plans")
      .select("id, code, name, price_cents, currency, interval, trial_days, is_active, is_public")
      .order("sort_order")
      .then(({ data }) => setPlans((data ?? []) as Plan[]));

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("plans").insert({
      code: form.code.trim(),
      name: form.name.trim(),
      price_cents: Math.round(parseFloat(form.price) * 100),
      trial_days: parseInt(form.trial),
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Plano criado");
      setForm({ code: "", name: "", price: "0", trial: "15" });
      load();
    }
  };

  const toggle = async (p: Plan, field: "is_active" | "is_public") => {
    const { error } = await supabase.from("plans").update({ [field]: !p[field] }).eq("id", p.id);
    if (error) toast.error(error.message);
    else load();
  };

  if (!isSuperAdmin) return null;

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold">Admin · Planos</h1>
        </div>

        <Card>
          <CardHeader><CardTitle>Criar plano</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div><Label>Código</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></div>
              <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div><Label>Preço (BRL)</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div><Label>Trial (dias)</Label><Input type="number" value={form.trial} onChange={(e) => setForm({ ...form, trial: e.target.value })} /></div>
              <Button type="submit">Criar</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Planos ({plans.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Trial</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Público</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell><code className="text-xs">{p.code}</code></TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.currency} {(p.price_cents / 100).toFixed(2)} / {p.interval}</TableCell>
                    <TableCell>{p.trial_days}d</TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => toggle(p, "is_active")}><Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "ativo" : "inativo"}</Badge></Button></TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => toggle(p, "is_public")}><Badge variant={p.is_public ? "default" : "secondary"}>{p.is_public ? "público" : "oculto"}</Badge></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
