import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Cloud, Sparkles, Receipt, User, Lock, Building2, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  getBillingOverview,
  getUsageAi,
  getUsageStorage,
  listInvoices,
  upsertBillingCustomer,
  addPaymentCard,
  setDefaultCard,
  removeCard,
  createTopup,
  listPublicPlans,
  changeSubscriptionPlan,
} from "@/lib/billing.functions";

export const Route = createFileRoute("/billing")({ component: BillingPage });

const brl = (cents: number | null | undefined) =>
  cents == null ? "—" : `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const fmtBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};

/** Normalize plan features into a plain object. Backend may return null,
 *  a JSON string, an array, or an object — UI must never call `.map` on it. */
function normalizeFeatures(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as any) : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as any;
  return {};
}

function BillingPage() {
  const { tenant, tenants, loading } = useTenant();
  const isOwner = tenant?.role_in_tenant === "owner";

  if (loading) {
    return (
      <AppShell>
        <div className="p-8">Carregando…</div>
      </AppShell>
    );
  }

  if (!tenant) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto p-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {tenants.length === 0 ? "Nenhuma empresa" : "Selecione uma empresa"}
              </CardTitle>
              <CardDescription>
                {tenants.length === 0
                  ? "Você ainda não tem uma empresa cadastrada. Crie uma para acessar a área de cobrança."
                  : "Escolha uma empresa no seletor do topo para visualizar planos e cobrança."}
              </CardDescription>
            </CardHeader>
            {tenants.length === 0 && (
              <CardContent>
                <Button asChild>
                  <Link to="/onboarding"><Plus className="mr-2 h-4 w-4" /> Criar empresa</Link>
                </Button>
              </CardContent>
            )}
          </Card>
        </div>
      </AppShell>
    );
  }

  if (!isOwner) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto p-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" /> Acesso restrito
              </CardTitle>
              <CardDescription>
                Apenas o proprietário da organização pode acessar a área de cobrança.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Cobrança</h1>
          <p className="text-muted-foreground">Plano, uso e pagamentos de {tenant.name}.</p>
        </div>
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview"><Sparkles className="h-4 w-4 mr-1" />Visão geral</TabsTrigger>
            <TabsTrigger value="ai"><Sparkles className="h-4 w-4 mr-1" />Uso de IA</TabsTrigger>
            <TabsTrigger value="storage"><Cloud className="h-4 w-4 mr-1" />Nuvem</TabsTrigger>
            <TabsTrigger value="payments"><Receipt className="h-4 w-4 mr-1" />Pagamentos</TabsTrigger>
            <TabsTrigger value="customer"><User className="h-4 w-4 mr-1" />Dados</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><OverviewTab tenantId={tenant.id} /></TabsContent>
          <TabsContent value="ai"><AiUsageTab tenantId={tenant.id} /></TabsContent>
          <TabsContent value="storage"><StorageUsageTab tenantId={tenant.id} /></TabsContent>
          <TabsContent value="payments"><PaymentsTab tenantId={tenant.id} /></TabsContent>
          <TabsContent value="customer"><CustomerTab tenantId={tenant.id} /></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

// ────────────────────────── Overview ──────────────────────────
function OverviewTab({ tenantId }: { tenantId: string }) {
  const fn = useServerFn(getBillingOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["billing-overview", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  if (isLoading) return <div>Carregando…</div>;
  if (!data) return null;

  const plan = (data.subscription as any)?.plans;
  const includedAi = (plan?.features?.ai_credits as number) ?? 100_000;
  const includedGb = (plan?.features?.storage_gb as number) ?? 5;
  const aiUsed = Number(data.ai_used_in_cycle ?? 0);
  const aiPct = Math.min(100, (aiUsed / includedAi) * 100);

  const storageBytes = (data.storage_latest ?? []).reduce(
    (acc: number, r: any) => acc + Number(r.bytes ?? 0),
    0,
  );
  const storageGb = storageBytes / 1024 ** 3;
  const stPct = Math.min(100, (storageGb / includedGb) * 100);

  const includedUsers = Number(plan?.included_users ?? 0);
  const extraPerCents = Number(plan?.extra_user_cents ?? 0);
  const activeUsers = Number((data as any).active_users ?? 0);
  const extraUsers = Math.max(0, activeUsers - includedUsers);
  const monthlyTotal = Number(plan?.price_cents ?? 0) + extraUsers * extraPerCents;
  const usersPct = includedUsers > 0 ? Math.min(100, (activeUsers / includedUsers) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>Plano atual</CardTitle>
          <CardDescription>{plan?.name ?? "Sem assinatura"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-3xl font-bold">{brl(monthlyTotal)}<span className="text-sm font-normal text-muted-foreground">/mês</span></div>
          <Badge variant={data.subscription?.status === "active" ? "default" : "secondary"}>
            {data.subscription?.status ?? "—"}
          </Badge>
          {extraUsers > 0 && (
            <p className="text-xs text-muted-foreground">
              Base {brl(plan?.price_cents)} + {extraUsers} × {brl(extraPerCents)}
            </p>
          )}
          {data.subscription?.current_period_end && (
            <p className="text-xs text-muted-foreground">
              Próxima cobrança: {new Date(data.subscription.current_period_end).toLocaleDateString("pt-BR")}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Usuários da licença</CardTitle><CardDescription>Ativos × incluídos no plano</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <div className="text-2xl font-bold">{activeUsers} <span className="text-sm font-normal text-muted-foreground">/ {includedUsers || "—"}</span></div>
          {includedUsers > 0 && <Progress value={usersPct} />}
          <p className="text-xs text-muted-foreground">
            {includedUsers} incluídos · {brl(extraPerCents)} por extra
            {extraUsers > 0 && <> · <strong>{extraUsers} extra(s)</strong></>}
          </p>
          <p className="text-xs text-muted-foreground">
            Reservas: {plan?.features?.bookings_unlimited ? <strong>ilimitadas</strong> : <>{(plan?.features?.bookings_per_month as number) ?? "—"}/mês</>}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Créditos de IA</CardTitle><CardDescription>Tokens consumidos no ciclo</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <div className="text-2xl font-bold">{aiUsed.toLocaleString("pt-BR")} <span className="text-sm font-normal text-muted-foreground">/ {includedAi.toLocaleString("pt-BR")}</span></div>
          <Progress value={aiPct} />
          <p className="text-xs text-muted-foreground">Saldo extra: {Number(data.wallet?.ai_credits ?? 0).toLocaleString("pt-BR")} tokens</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Armazenamento</CardTitle><CardDescription>Buckets do tenant</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <div className="text-2xl font-bold">{storageGb.toFixed(2)} GB <span className="text-sm font-normal text-muted-foreground">/ {includedGb} GB</span></div>
          <Progress value={stPct} />
          <p className="text-xs text-muted-foreground">Extra: {Number(data.wallet?.storage_gb_extra ?? 0).toFixed(2)} GB</p>
        </CardContent>
      </Card>
      </div>
      <PlansSection tenantId={tenantId} currentPlanCode={plan?.code ?? null} />
    </div>
  );
}

function PlansSection({ tenantId, currentPlanCode }: { tenantId: string; currentPlanCode: string | null }) {
  const listFn = useServerFn(listPublicPlans);
  const changeFn = useServerFn(changeSubscriptionPlan);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => listFn(),
  });
  const mut = useMutation({
    mutationFn: (plan_code: string) => changeFn({ data: { tenant_id: tenantId, plan_code } }),
    onSuccess: () => {
      toast.success("Plano atualizado");
      qc.invalidateQueries({ queryKey: ["billing-overview", tenantId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao trocar de plano"),
  });
  const plans = (data?.plans ?? []) as any[];
  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando planos…</div>;
  if (plans.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">Planos disponíveis</h2>
        <p className="text-sm text-muted-foreground">Escolha a opção que melhor se adapta à sua operação.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = p.code === currentPlanCode;
          const f = (p.features ?? {}) as any;
          return (
            <Card key={p.id} className={isCurrent ? "border-primary" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>{p.name}</CardTitle>
                    <CardDescription>{p.included_users} usuário{p.included_users === 1 ? "" : "s"} incluso{p.included_users === 1 ? "" : "s"}</CardDescription>
                  </div>
                  {isCurrent && <Badge>Atual</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-bold">
                  {brl(p.price_cents)}<span className="text-sm font-normal text-muted-foreground">/mês</span>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• {p.included_users} usuário(s) incluso(s)</li>
                  <li>• Usuário extra: {brl(p.extra_user_cents)}/mês</li>
                  <li>• Reservas: {f.bookings_unlimited ? "ilimitadas" : `${f.bookings_per_month ?? "—"}/mês`}</li>
                  {f.gmail_integration && <li>• Integração Gmail</li>}
                  {f.advanced_permissions && <li>• Permissões avançadas</li>}
                  {f.advanced_reports && <li>• Relatórios avançados</li>}
                </ul>
                <Button
                  className="w-full"
                  disabled={isCurrent || mut.isPending}
                  onClick={() => mut.mutate(p.code)}
                >
                  {isCurrent ? "Plano atual" : mut.isPending ? "Aplicando…" : "Assinar este plano"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────── AI Usage ──────────────────────────
function AiUsageTab({ tenantId }: { tenantId: string }) {
  const fn = useServerFn(getUsageAi);
  const { data } = useQuery({
    queryKey: ["ai-usage", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });
  const events = (data?.events ?? []) as any[];

  const byFeature = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of events) m[e.feature] = (m[e.feature] ?? 0) + Number(e.credits_charged ?? 0);
    return m;
  }, [events]);
  const byModel = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of events) m[e.model] = (m[e.model] ?? 0) + Number(e.credits_charged ?? 0);
    return m;
  }, [events]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Por funcionalidade</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byFeature).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm"><span>{k}</span><span className="font-mono">{v.toLocaleString("pt-BR")} tokens</span></div>
            ))}
            {!Object.keys(byFeature).length && <p className="text-sm text-muted-foreground">Sem uso registrado.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Por modelo</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byModel).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm"><span>{k}</span><span className="font-mono">{v.toLocaleString("pt-BR")} tokens</span></div>
            ))}
            {!Object.keys(byModel).length && <p className="text-sm text-muted-foreground">Sem uso registrado.</p>}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Últimas chamadas</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Feature</TableHead><TableHead>Modelo</TableHead>
              <TableHead className="text-right">Prompt</TableHead><TableHead className="text-right">Output</TableHead><TableHead className="text-right">Créditos</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {events.slice(0, 100).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{new Date(e.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>{e.feature}</TableCell>
                  <TableCell className="text-xs">{e.model}</TableCell>
                  <TableCell className="text-right font-mono">{e.prompt_tokens}</TableCell>
                  <TableCell className="text-right font-mono">{e.completion_tokens}</TableCell>
                  <TableCell className="text-right font-mono">{Number(e.credits_charged).toLocaleString("pt-BR")}</TableCell>
                </TableRow>
              ))}
              {!events.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sem chamadas no período.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────── Storage Usage ──────────────────────────
function StorageUsageTab({ tenantId }: { tenantId: string }) {
  const fn = useServerFn(getUsageStorage);
  const { data } = useQuery({
    queryKey: ["storage-usage", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId, days: 30 } }),
  });
  const rows = (data?.rows ?? []) as any[];

  const byBucket = useMemo(() => {
    const m: Record<string, { bytes: number; files: number }> = {};
    // Use only latest snapshot per bucket
    const latestDate: Record<string, string> = {};
    for (const r of rows) {
      if (!latestDate[r.bucket] || r.snapshot_date > latestDate[r.bucket]) {
        latestDate[r.bucket] = r.snapshot_date;
      }
    }
    for (const r of rows) {
      if (r.snapshot_date === latestDate[r.bucket]) m[r.bucket] = { bytes: r.bytes, files: r.file_count };
    }
    return m;
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Uso de armazenamento por bucket</CardTitle>
        <CardDescription>Snapshot diário — atualizado por job automático.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Bucket</TableHead><TableHead className="text-right">Arquivos</TableHead><TableHead className="text-right">Tamanho</TableHead></TableRow></TableHeader>
          <TableBody>
            {Object.entries(byBucket).map(([k, v]) => (
              <TableRow key={k}>
                <TableCell>{k}</TableCell>
                <TableCell className="text-right font-mono">{v.files}</TableCell>
                <TableCell className="text-right font-mono">{fmtBytes(v.bytes)}</TableCell>
              </TableRow>
            ))}
            {!Object.keys(byBucket).length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Aguardando primeiro snapshot diário.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ────────────────────────── Payments ──────────────────────────
function PaymentsTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getBillingOverview);
  const invoicesFn = useServerFn(listInvoices);
  const setDefaultFn = useServerFn(setDefaultCard);
  const removeFn = useServerFn(removeCard);

  const { data: overview } = useQuery({
    queryKey: ["billing-overview", tenantId],
    queryFn: () => overviewFn({ data: { tenant_id: tenantId } }),
  });
  const { data: inv } = useQuery({
    queryKey: ["billing-invoices", tenantId],
    queryFn: () => invoicesFn({ data: { tenant_id: tenantId } }),
  });

  const cards = (overview?.payment_methods ?? []) as any[];
  const invoices = (inv?.invoices ?? []) as any[];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Cartões salvos</CardTitle>
            <CardDescription>O cartão padrão é usado na mensalidade automática.</CardDescription>
          </div>
          <AddCardDialog tenantId={tenantId} />
        </CardHeader>
        <CardContent className="space-y-2">
          {cards.map((c) => (
            <div key={c.id} className="flex items-center justify-between border rounded p-3">
              <div className="text-sm">
                <span className="font-semibold uppercase">{c.brand}</span> •••• {c.last4}
                <span className="text-muted-foreground ml-2">{String(c.exp_month).padStart(2, "0")}/{c.exp_year}</span>
                {c.is_default && <Badge className="ml-2">padrão</Badge>}
              </div>
              <div className="flex gap-2">
                {!c.is_default && (
                  <Button size="sm" variant="outline" onClick={async () => {
                    await setDefaultFn({ data: { tenant_id: tenantId, card_id: c.id } });
                    qc.invalidateQueries({ queryKey: ["billing-overview", tenantId] });
                    toast.success("Cartão padrão atualizado");
                  }}>Tornar padrão</Button>
                )}
                <Button size="sm" variant="ghost" onClick={async () => {
                  await removeFn({ data: { tenant_id: tenantId, card_id: c.id } });
                  qc.invalidateQueries({ queryKey: ["billing-overview", tenantId] });
                  toast.success("Cartão removido");
                }}>Remover</Button>
              </div>
            </div>
          ))}
          {!cards.length && <p className="text-sm text-muted-foreground">Nenhum cartão salvo.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recarregar créditos</CardTitle>
            <CardDescription>Compra avulsa via PIX, boleto ou cartão.</CardDescription>
          </div>
          <TopUpDialog tenantId={tenantId} cards={cards} />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle>Faturas</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead>
              <TableHead>Forma</TableHead><TableHead className="text-right">Valor</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="text-xs">{new Date(i.created_at).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{i.kind === "subscription" ? "Mensalidade" : "Recarga"}</TableCell>
                  <TableCell><Badge variant={i.status === "paid" ? "default" : "secondary"}>{i.status}</Badge></TableCell>
                  <TableCell className="text-xs">{i.payment_method ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{brl(i.amount_cents)}</TableCell>
                  <TableCell className="text-right">
                    {i.pix_copia_cola && <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(i.pix_copia_cola); toast.success("PIX copiado"); }}>PIX</Button>}
                    {i.boleto_url && <a href={i.boleto_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="ml-2">Boleto</Button></a>}
                  </TableCell>
                </TableRow>
              ))}
              {!invoices.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhuma fatura ainda.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AddCardDialog({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const addFn = useServerFn(addPaymentCard);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ number: "", holder_name: "", exp_month: "12", exp_year: "2030", cvv: "", set_default: true });
  const mut = useMutation({
    mutationFn: () => addFn({ data: {
      tenant_id: tenantId,
      number: form.number,
      holder_name: form.holder_name,
      exp_month: Number(form.exp_month),
      exp_year: Number(form.exp_year),
      cvv: form.cvv,
      set_default: form.set_default,
    } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-overview", tenantId] });
      toast.success("Cartão adicionado");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao adicionar"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">Adicionar cartão</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo cartão</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Número</Label><Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></div>
          <div><Label>Nome impresso</Label><Input value={form.holder_name} onChange={(e) => setForm({ ...form, holder_name: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Mês</Label><Input value={form.exp_month} onChange={(e) => setForm({ ...form, exp_month: e.target.value })} /></div>
            <div><Label>Ano</Label><Input value={form.exp_year} onChange={(e) => setForm({ ...form, exp_year: e.target.value })} /></div>
            <div><Label>CVV</Label><Input value={form.cvv} onChange={(e) => setForm({ ...form, cvv: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? "Enviando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TopUpDialog({ tenantId, cards }: { tenantId: string; cards: any[] }) {
  const qc = useQueryClient();
  const topupFn = useServerFn(createTopup);
  const [open, setOpen] = useState(false);
  const [resource, setResource] = useState<"ai_credits" | "storage_gb">("ai_credits");
  const [quantity, setQuantity] = useState("10");
  const [method, setMethod] = useState<"card" | "pix" | "boleto">("pix");
  const defaultCard = cards.find((c) => c.is_default) ?? cards[0];

  const mut = useMutation({
    mutationFn: () => topupFn({ data: {
      tenant_id: tenantId,
      resource,
      quantity: Number(quantity),
      payment_method: method,
      card_id: method === "card" ? defaultCard?.id : undefined,
    } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["billing-invoices", tenantId] });
      qc.invalidateQueries({ queryKey: ["billing-overview", tenantId] });
      if (r.pix?.copia_cola) {
        navigator.clipboard.writeText(r.pix.copia_cola);
        toast.success("PIX gerado e copiado");
      } else if (r.boleto?.url) {
        window.open(r.boleto.url, "_blank");
      } else {
        toast.success("Pagamento processado");
      }
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">Comprar créditos</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Recarregar</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Recurso</Label>
            <Select value={resource} onValueChange={(v: any) => setResource(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ai_credits">Créditos de IA (1K tokens)</SelectItem>
                <SelectItem value="storage_gb">Armazenamento (GB/mês)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Quantidade</Label><Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          <div>
            <Label>Forma de pagamento</Label>
            <Select value={method} onValueChange={(v: any) => setMethod(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="card" disabled={!defaultCard}>Cartão {defaultCard ? `•••• ${defaultCard.last4}` : "(nenhum)"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? "Processando…" : "Confirmar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────── Customer ──────────────────────────
function CustomerTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getBillingOverview);
  const saveFn = useServerFn(upsertBillingCustomer);
  const { data } = useQuery({
    queryKey: ["billing-overview", tenantId],
    queryFn: () => overviewFn({ data: { tenant_id: tenantId } }),
  });
  const c = (data?.customer ?? {}) as any;
  const [form, setForm] = useState({
    legal_name: "", doc_type: "cnpj" as "cpf" | "cnpj", doc_number: "", email: "", phone: "",
    cep: "", street: "", number: "", city: "", state: "",
  });

  useEffect(() => {
    if (data?.customer) {
      setForm({
        legal_name: c.legal_name ?? "",
        doc_type: c.doc_type ?? "cnpj",
        doc_number: c.doc_number ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        cep: c.address?.cep ?? "",
        street: c.address?.street ?? "",
        number: c.address?.number ?? "",
        city: c.address?.city ?? "",
        state: c.address?.state ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const mut = useMutation({
    mutationFn: () => saveFn({ data: {
      tenant_id: tenantId,
      legal_name: form.legal_name,
      doc_type: form.doc_type,
      doc_number: form.doc_number.replace(/\D/g, ""),
      email: form.email,
      phone: form.phone || undefined,
      address: { cep: form.cep, street: form.street, number: form.number, city: form.city, state: form.state },
    } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-overview", tenantId] });
      toast.success("Dados salvos");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados de cobrança</CardTitle>
        <CardDescription>Obrigatórios para emitir boleto e nota fiscal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 max-w-xl">
        <div><Label>Razão social / Nome</Label><Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Tipo</Label>
            <Select value={form.doc_type} onValueChange={(v: any) => setForm({ ...form, doc_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="cnpj">CNPJ</SelectItem><SelectItem value="cpf">CPF</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Número</Label><Input value={form.doc_number} onChange={(e) => setForm({ ...form, doc_number: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div><Label>CEP</Label><Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} /></div>
          <div className="col-span-2"><Label>Rua</Label><Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} /></div>
          <div><Label>Nº</Label><Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Label>Cidade</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><Label>UF</Label><Input maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
        </div>
        <Button disabled={mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? "Salvando…" : "Salvar"}</Button>
      </CardContent>
    </Card>
  );
}
