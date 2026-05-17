import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/billing")({
  component: BillingPage,
});

type Subscription = {
  id: string;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  plans: { name: string; code: string; price_cents: number; currency: string; interval: string } | null;
};
type Invoice = {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  created_at: string;
};

function BillingPage() {
  const { tenant } = useTenant();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenant) return;
    setLoading(true);
    Promise.all([
      supabase
        .from("subscriptions")
        .select("id, status, trial_end, current_period_end, plans:plan_id (name, code, price_cents, currency, interval)")
        .eq("tenant_id", tenant.id)
        .maybeSingle(),
      supabase
        .from("billing_invoices")
        .select("id, amount_cents, currency, status, due_date, paid_at, hosted_invoice_url, created_at")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false }),
    ]).then(([s, i]) => {
      setSub(s.data as any);
      setInvoices((i.data ?? []) as Invoice[]);
      setLoading(false);
    });
  }, [tenant]);

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold">Cobrança</h1>
          <p className="text-muted-foreground">Gerencie a assinatura de {tenant?.name ?? "—"}.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Plano atual</CardTitle>
            <CardDescription>Detalhes da sua assinatura</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : !sub ? (
              <p className="text-muted-foreground">Nenhuma assinatura ativa.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-sm text-muted-foreground">Plano</div>
                  <div className="text-lg font-semibold">{sub.plans?.name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <Badge variant={sub.status === "active" ? "default" : "secondary"}>{sub.status}</Badge>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Preço</div>
                  <div>
                    {sub.plans ? `${sub.plans.currency} ${(sub.plans.price_cents / 100).toFixed(2)} / ${sub.plans.interval}` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    {sub.status === "trialing" ? "Fim do trial" : "Próxima cobrança"}
                  </div>
                  <div>
                    {(sub.trial_end || sub.current_period_end)
                      ? new Date((sub.trial_end || sub.current_period_end)!).toLocaleDateString()
                      : "—"}
                  </div>
                </div>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <Button variant="outline" disabled>Alterar plano (em breve)</Button>
              <Button variant="outline" disabled>Adicionar método de pagamento (em breve)</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Faturas</CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma fatura ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
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
                      <TableCell><Badge variant="outline">{i.status}</Badge></TableCell>
                      <TableCell>
                        {i.hosted_invoice_url && (
                          <a className="text-primary text-sm" href={i.hosted_invoice_url} target="_blank" rel="noreferrer">Ver</a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
