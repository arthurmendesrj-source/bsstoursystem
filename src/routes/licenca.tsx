import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, ArrowLeft } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redeemLicenseCode } from "@/lib/license.functions";
import { useTenant } from "@/lib/tenant";
import { toast } from "sonner";

export const Route = createFileRoute("/licenca")({
  component: () => (
    <AuthGate>
      <AppShell>
        <LicensePage />
      </AppShell>
    </AuthGate>
  ),
});

function LicensePage() {
  const navigate = useNavigate();
  const redeem = useServerFn(redeemLicenseCode);
  const { tenant, reload } = useTenant();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const activeUntil =
    tenant?.subscription_status === "active" && tenant.current_period_end
      ? new Date(tenant.current_period_end)
      : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await redeem({ data: { code: code.trim() } });
      const dt = new Date(res.expires_at).toLocaleDateString("pt-BR");
      toast.success(`Licença ${res.plan_name} ativada até ${dt}`);
      await reload();
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível ativar a licença.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-6">
      <div>
        <Link
          to="/billing"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para cobrança
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Ativar licença</CardTitle>
              <CardDescription>
                Possui um código de acesso? Insira abaixo para liberar o plano na sua empresa.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeUntil && (
            <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
              Sua empresa já está com acesso ativo até{" "}
              <strong>{activeUntil.toLocaleDateString("pt-BR")}</strong>.
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="license-code">Código de licença</Label>
              <Input
                id="license-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="EX: BOSCO1"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={32}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                O código é de uso único e libera o plano contratado pelo período definido.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !code.trim()}>
              {loading ? "Ativando…" : "Ativar licença"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
