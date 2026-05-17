import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 60);
}

function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const { reload } = useTenant();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plans, setPlans] = useState<Array<{ id: string; code: string; name: string; price_cents: number; currency: string; trial_days: number }>>([]);
  const [planId, setPlanId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    supabase
      .from("plans")
      .select("id, code, name, price_cents, currency, trial_days")
      .eq("is_active", true)
      .eq("is_public", true)
      .order("sort_order")
      .then(({ data }) => {
        setPlans(data ?? []);
        if (data && data.length > 0) setPlanId(data[0].id);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim() || !slug.trim() || !planId) return;
    setSaving(true);
    try {
      const { data: tenant, error: te } = await supabase
        .from("tenants")
        .insert({ name: name.trim(), slug: slug.trim(), created_by: user.id, status: "trialing" })
        .select("id, slug")
        .single();
      if (te) throw te;

      const { error: me } = await supabase.from("tenant_members").insert({
        tenant_id: tenant.id,
        user_id: user.id,
        role_in_tenant: "owner",
        is_active: true,
      });
      if (me) throw me;

      const plan = plans.find((p) => p.id === planId);
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + (plan?.trial_days ?? 15));

      const { error: se } = await supabase.from("subscriptions").insert({
        tenant_id: tenant.id,
        plan_id: planId,
        status: "trialing",
        trial_end: trialEnd.toISOString(),
      });
      if (se) throw se;

      toast.success("Empresa criada!");
      await reload();
      localStorage.setItem("active_tenant_slug", tenant.slug);
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao criar empresa");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Criar empresa</CardTitle>
          <CardDescription>Cadastre sua empresa e escolha um plano para começar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nome da empresa</Label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug || slug === slugify(name)) setSlug(slugify(e.target.value));
                }}
                required
              />
            </div>
            <div>
              <Label>Identificador (slug)</Label>
              <Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} required />
              <p className="text-xs text-muted-foreground mt-1">URL: /t/{slug || "sua-empresa"}</p>
            </div>
            <div>
              <Label>Plano</Label>
              <div className="grid gap-2 mt-2">
                {plans.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setPlanId(p.id)}
                    className={`text-left rounded border p-3 transition ${planId === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.trial_days} dias de teste</div>
                      </div>
                      <div className="font-semibold">
                        {p.currency} {(p.price_cents / 100).toFixed(2)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Criando..." : "Criar empresa"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
