import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { useEffectiveAuth } from "@/lib/viewAs";
import { Megaphone, Send, Users, Workflow } from "lucide-react";

export const Route = createFileRoute("/marketing")({
  head: () => ({
    meta: [
      { title: "Marketing" },
      { name: "description", content: "Módulo Marketing — campanhas, leads por canal e automações." },
    ],
  }),
  component: () => (
    <AuthGate>
      <AppShell>
        <MarketingPage />
      </AppShell>
    </AuthGate>
  ),
});

function MarketingPage() {
  const { isAdmin, hasRole } = useEffectiveAuth();
  const allowed = isAdmin || hasRole("diretor") || hasRole("gerente");

  if (!allowed) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">Acesso negado</h1>
        <p className="mt-2 text-muted-foreground">
          Você não tem permissão para acessar o módulo Marketing.
        </p>
      </div>
    );
  }

  const cards = [
    { title: "Campanhas", desc: "Disparos por e-mail, WhatsApp e redes sociais.", icon: Send },
    { title: "Leads por Canal", desc: "Origem dos leads e performance por canal.", icon: Users },
    { title: "Automações", desc: "Fluxos automatizados de nutrição e follow-up.", icon: Workflow },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
          <p className="text-muted-foreground">Visão geral do módulo de marketing.</p>
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
