import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { useEffectiveAuth } from "@/lib/viewAs";
import { Wallet, ArrowDownCircle, ArrowUpCircle, LineChart } from "lucide-react";

export const Route = createFileRoute("/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro" },
      { name: "description", content: "Módulo Financeiro — visão geral de contas e fluxo de caixa." },
    ],
  }),
  component: () => (
    <AuthGate>
      <AppShell>
        <FinanceiroPage />
      </AppShell>
    </AuthGate>
  ),
});

function FinanceiroPage() {
  const { isAdmin, hasRole } = useEffectiveAuth();
  const allowed = isAdmin || hasRole("diretor") || hasRole("financeiro");

  if (!allowed) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">Acesso negado</h1>
        <p className="mt-2 text-muted-foreground">
          Você não tem permissão para acessar o módulo Financeiro.
        </p>
      </div>
    );
  }

  const cards = [
    { title: "Contas a Pagar", desc: "Compromissos com fornecedores e parceiros.", icon: ArrowUpCircle },
    { title: "Contas a Receber", desc: "Recebíveis de clientes e reservas.", icon: ArrowDownCircle },
    { title: "Fluxo de Caixa", desc: "Entradas e saídas previstas e realizadas.", icon: LineChart },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground">Visão geral do módulo financeiro.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.title} className="p-5">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">{c.title}</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{c.desc}</p>
              <p className="mt-4 text-xs text-muted-foreground/70">Em breve</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
