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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim() || !slug.trim()) return;
    setSaving(true);
    try {
      const { data: tenant, error: te } = await supabase
        .from("tenants")
        .insert([{ name: name.trim(), slug: slug.trim(), created_by: user.id, status: "active" as const }])
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

      // Trial subscription is auto-created by DB trigger (30 days free).
      toast.success("Empresa criada! Você tem 30 dias grátis. Escolha um pacote em Licença.");
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
          <CardDescription>
            Cadastre sua empresa e ganhe <strong>30 dias grátis</strong> de teste no pacote básico.
            Depois disso, escolha o pacote ideal na aba Licença.
          </CardDescription>
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
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Criando..." : "Criar empresa e iniciar 30 dias grátis"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
