import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/billing")({
  component: BillingPage,
});

type Plan = {
  id: string;
  code: string;
  name: string;
  price_cents: number | null;
  currency: string;
  interval: string;
  trial_days: number;
  included_users: number;
  extra_user_cents: number;
  description: string | null;
  features: string[];
  is_quote: boolean;
};
type Addon = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  category: string | null;
};
type OneTime = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  price_min_cents: number | null;
  price_max_cents: number | null;
  currency: string;
  category: string | null;
  is_quote: boolean;
};
type Subscription = {
  id: string;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  plans: { name: string; code: string; price_cents: number | null; currency: string; interval: string } | null;
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

const fmt = (cents: number | null | undefined, currency = "BRL") =>
  cents == null ? "—" : `${currency} ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PRESETS = {
  boa: {
    label: "Boa",
    tagline: "Entrada enxuta para começar rápido com o core.",
    plan: "profissional",
    addons: [] as string[],
    oneTimes: ["setup_essencial"],
  },
  melhor: {
    label: "Melhor",
    tagline: "Equilíbrio entre custo e valor. Recomendado.",
    plan: "profissional",
    addons: ["whatsapp", "ia_starter"],
    oneTimes: ["setup_completo", "setup_whatsapp", "migracao_basica"],
  },
  ideal: {
    label: "Ideal",
    tagline: "Máxima automação e gestão.",
    plan: "profissional",
    addons: ["whatsapp", "ia_pro", "bi"],
    oneTimes: ["setup_completo", "setup_whatsapp", "migracao_completa"],
  },
} as const;

function BillingPage() {
  const { tenant } = useTenant();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [oneTimes, setOneTimes] = useState<OneTime[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedPlan, setSelectedPlan] = useState<string>("profissional");
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [selectedOneTimes, setSelectedOneTimes] = useState<Set<string>>(new Set());
  const [extraUsers, setExtraUsers] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [pRes, aRes, oRes] = await Promise.all([
        supabase
          .from("plans")
          .select("id, code, name, price_cents, currency, interval, trial_days, included_users, extra_user_cents, description, features, is_quote")
          .eq("is_active", true)
          .eq("is_public", true)
          .order("sort_order"),
        supabase
          .from("plan_addons")
          .select("id, code, name, description, price_cents, currency, category")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("plan_one_time")
          .select("id, code, name, description, price_cents, price_min_cents, price_max_cents, currency, category, is_quote")
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      if (cancelled) return;
      setPlans(((pRes.data ?? []) as any[]).map((p) => ({ ...p, features: p.features ?? [] })) as Plan[]);
      setAddons((aRes.data ?? []) as Addon[]);
      setOneTimes((oRes.data ?? []) as OneTime[]);
      if (tenant) {
        const [sRes, iRes] = await Promise.all([
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
        ]);
        if (cancelled) return;
        setSub(sRes.data as any);
        setInvoices((iRes.data ?? []) as Invoice[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenant]);

  const planByCode = useMemo(() => Object.fromEntries(plans.map((p) => [p.code, p])), [plans]);
  const addonByCode = useMemo(() => Object.fromEntries(addons.map((a) => [a.code, a])), [addons]);
  const oneTimeByCode = useMemo(() => Object.fromEntries(oneTimes.map((o) => [o.code, o])), [oneTimes]);

  const currentPlan = planByCode[selectedPlan];
  const monthlyTotal = useMemo(() => {
    let t = currentPlan?.price_cents ?? 0;
    if (currentPlan && extraUsers > 0) t += extraUsers * currentPlan.extra_user_cents;
    for (const code of selectedAddons) t += addonByCode[code]?.price_cents ?? 0;
    return t;
  }, [currentPlan, extraUsers, selectedAddons, addonByCode]);

  const oneTimeTotal = useMemo(() => {
    let t = 0;
    for (const code of selectedOneTimes) t += oneTimeByCode[code]?.price_cents ?? 0;
    return t;
  }, [selectedOneTimes, oneTimeByCode]);

  const applyPreset = (key: keyof typeof PRESETS) => {
    const p = PRESETS[key];
    setSelectedPlan(p.plan);
    setSelectedAddons(new Set(p.addons));
    setSelectedOneTimes(new Set(p.oneTimes));
    toast.success(`Pacote ${p.label} aplicado`);
  };

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, code: string) => {
    const next = new Set(set);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSet(next);
  };

  return (
    <AppShell>
      <div className="space-y-8 max-w-6xl">
        <div>
          <h1 className="text-3xl font-bold">Planos e cobrança</h1>
          <p className="text-muted-foreground">
            Escolha o plano e os complementos para {tenant?.name ?? "sua operadora"}.
          </p>
        </div>

        {/* Presets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Pacotes prontos
            </CardTitle>
            <CardDescription>Combinações sugeridas — clique para pré-selecionar plano, add-ons e implantação.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((key) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className="text-left rounded-lg border p-4 hover:border-primary transition"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Opção {PRESETS[key].label}</div>
                  {key === "melhor" && <Badge>Recomendado</Badge>}
                </div>
                <div className="text-sm text-muted-foreground mt-1">{PRESETS[key].tagline}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Planos */}
        <div>
          <h2 className="text-xl font-semibold mb-3">Planos</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((p) => {
              const active = selectedPlan === p.code;
              const recommended = p.code === "profissional";
              return (
                <Card
                  key={p.id}
                  className={`relative cursor-pointer transition ${active ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/60"}`}
                  onClick={() => !p.is_quote && setSelectedPlan(p.code)}
                >
                  {recommended && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge>Recomendado</Badge>
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle>{p.name}</CardTitle>
                    <CardDescription>{p.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="text-3xl font-bold">
                        {p.is_quote ? "Sob proposta" : fmt(p.price_cents, p.currency)}
                      </div>
                      {!p.is_quote && <div className="text-xs text-muted-foreground">/ {p.interval}</div>}
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {(p.features ?? []).map((f, i) => (
                        <li key={i} className="flex gap-2">
                          <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    {p.trial_days > 0 && (
                      <Badge variant="secondary">{p.trial_days} dias de teste</Badge>
                    )}
                    {p.is_quote ? (
                      <Button variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); toast.info("Em breve: formulário de contato"); }}>
                        Falar com vendas
                      </Button>
                    ) : (
                      <Button variant={active ? "default" : "outline"} className="w-full">
                        {active ? "Selecionado" : "Selecionar"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Usuários extras */}
        {currentPlan && !currentPlan.is_quote && currentPlan.extra_user_cents > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Usuários adicionais</CardTitle>
              <CardDescription>
                {currentPlan.included_users} usuários inclusos no {currentPlan.name}. Extras a {fmt(currentPlan.extra_user_cents, currentPlan.currency)} / mês.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setExtraUsers(Math.max(0, extraUsers - 1))}>−</Button>
              <div className="w-12 text-center font-semibold">{extraUsers}</div>
              <Button variant="outline" size="sm" onClick={() => setExtraUsers(extraUsers + 1)}>+</Button>
              <div className="text-sm text-muted-foreground ml-3">
                Subtotal: {fmt(extraUsers * currentPlan.extra_user_cents, currentPlan.currency)} / mês
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add-ons recorrentes */}
        <div>
          <h2 className="text-xl font-semibold mb-3">Add-ons (mensais)</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {addons.map((a) => {
              const checked = selectedAddons.has(a.code);
              return (
                <label
                  key={a.id}
                  className={`flex gap-3 rounded-lg border p-4 cursor-pointer transition ${checked ? "border-primary bg-primary/5" : "hover:border-primary/60"}`}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(selectedAddons, setSelectedAddons, a.code)} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{a.name}</div>
                      <div className="text-sm font-semibold whitespace-nowrap">{fmt(a.price_cents, a.currency)} / mês</div>
                    </div>
                    {a.description && <div className="text-xs text-muted-foreground mt-1">{a.description}</div>}
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Serviços únicos */}
        <div>
          <h2 className="text-xl font-semibold mb-3">Implantação e Migração (cobrança única)</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {oneTimes.map((o) => {
              const checked = selectedOneTimes.has(o.code);
              const priceLabel = o.is_quote
                ? `${fmt(o.price_min_cents, o.currency)} – ${fmt(o.price_max_cents, o.currency)}`
                : fmt(o.price_cents, o.currency);
              return (
                <label
                  key={o.id}
                  className={`flex gap-3 rounded-lg border p-4 cursor-pointer transition ${checked ? "border-primary bg-primary/5" : "hover:border-primary/60"}`}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(selectedOneTimes, setSelectedOneTimes, o.code)} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{o.name}</div>
                      <div className="text-sm font-semibold whitespace-nowrap">
                        {priceLabel}{o.is_quote && <span className="text-xs text-muted-foreground ml-1">(sob proposta)</span>}
                      </div>
                    </div>
                    {o.description && <div className="text-xs text-muted-foreground mt-1">{o.description}</div>}
                    <div className="text-xs text-muted-foreground mt-1">Pagamento 50% início + 50% entrega.</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Resumo */}
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Resumo da proposta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span>Plano: <strong>{currentPlan?.name ?? "—"}</strong></span>
                <span>{currentPlan?.is_quote ? "Sob proposta" : `${fmt(currentPlan?.price_cents, currentPlan?.currency)} / mês`}</span>
              </div>
              {extraUsers > 0 && currentPlan && (
                <div className="flex justify-between">
                  <span>{extraUsers} usuário(s) extra</span>
                  <span>{fmt(extraUsers * currentPlan.extra_user_cents, currentPlan.currency)} / mês</span>
                </div>
              )}
              {[...selectedAddons].map((code) => {
                const a = addonByCode[code];
                if (!a) return null;
                return (
                  <div key={code} className="flex justify-between">
                    <span>{a.name}</span>
                    <span>{fmt(a.price_cents, a.currency)} / mês</span>
                  </div>
                );
              })}
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Mensalidade total</span>
                <span>{fmt(monthlyTotal, currentPlan?.currency ?? "BRL")} / mês</span>
              </div>
              {selectedOneTimes.size > 0 && (
                <>
                  <div className="border-t pt-2" />
                  {[...selectedOneTimes].map((code) => {
                    const o = oneTimeByCode[code];
                    if (!o) return null;
                    return (
                      <div key={code} className="flex justify-between">
                        <span>{o.name} <span className="text-xs text-muted-foreground">(único)</span></span>
                        <span>
                          {o.is_quote
                            ? `${fmt(o.price_min_cents, o.currency)} – ${fmt(o.price_max_cents, o.currency)}`
                            : fmt(o.price_cents, o.currency)}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between font-semibold">
                    <span>Setup/Migração total (estimado)</span>
                    <span>{fmt(oneTimeTotal, currentPlan?.currency ?? "BRL")}</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => toast.info("Checkout será conectado ao Stripe na próxima fase.")}>
                Contratar
              </Button>
              <Button variant="outline" onClick={() => toast.info("Em breve: gerar PDF da proposta.")}>
                Gerar PDF
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Custos de terceiros (Twilio/Meta) não inclusos. Suporte em horário comercial. Evoluções fora do padrão via banco de horas ou aditivo.
            </p>
          </CardContent>
        </Card>

        {/* Assinatura atual */}
        {tenant && (
          <Card>
            <CardHeader>
              <CardTitle>Assinatura atual</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground">Carregando...</p>
              ) : !sub ? (
                <p className="text-muted-foreground">Nenhuma assinatura ativa ainda.</p>
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
                    <div>{sub.plans ? `${fmt(sub.plans.price_cents, sub.plans.currency)} / ${sub.plans.interval}` : "—"}</div>
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
            </CardContent>
          </Card>
        )}

        {/* Faturas */}
        {tenant && invoices.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Faturas</CardTitle>
            </CardHeader>
            <CardContent>
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
                      <TableCell>{fmt(i.amount_cents, i.currency)}</TableCell>
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
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
