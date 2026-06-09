import { useEffect, useState } from "react";
import { useRouterState, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTenant } from "@/lib/tenant";
import { useEffectiveAuth } from "@/lib/viewAs";
import { getBillingAccess } from "@/lib/billing-access.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Lock } from "lucide-react";

/**
 * Blocks access to the app when the tenant's subscription is unpaid /
 * suspended. Always allows the `/billing` route so the owner can pay.
 */
export function BillingAccessGate({ children }: { children: React.ReactNode }) {
  const { tenant, isSuperAdmin } = useTenant();
  const { isAdmin } = useEffectiveAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const fetchAccess = useServerFn(getBillingAccess);
  const [state, setState] = useState<{
    blocked: boolean;
    status: string | null;
    grace_until: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!tenant?.id || isSuperAdmin) {
      setState(null);
      return;
    }
    fetchAccess({ data: { tenant_id: tenant.id } })
      .then((r) => {
        if (!cancelled) setState(r);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tenant?.id, isSuperAdmin, path, fetchAccess]);

  const onBilling = path === "/billing" || path.startsWith("/billing/");
  const blocked = state?.blocked && !isSuperAdmin && !onBilling;

  // Soft warning (past_due but still in grace) — banner only.
  const inGrace =
    state?.status === "past_due" &&
    state.grace_until &&
    new Date(state.grace_until) > new Date();

  if (blocked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="max-w-lg space-y-4 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">Acesso bloqueado</h1>
          <p className="text-muted-foreground">
            A assinatura está em aberto. Para restabelecer o acesso, regularize o
            pagamento na área de cobrança.
          </p>
          {isAdmin && (
            <Button onClick={() => navigate({ to: "/billing" })} className="w-full">
              Ir para Cobrança
            </Button>
          )}
          {!isAdmin && (
            <p className="text-sm text-muted-foreground">
              Solicite ao responsável da conta para regularizar o pagamento.
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <>
      {inGrace && !onBilling && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="flex-1">
            Pagamento da assinatura pendente. Regularize até{" "}
            <strong>
              {new Date(state!.grace_until!).toLocaleDateString("pt-BR")}
            </strong>{" "}
            para evitar bloqueio.
          </span>
          <Link to="/billing" className="font-medium underline">
            Resolver
          </Link>
        </div>
      )}
      {children}
    </>
  );
}
