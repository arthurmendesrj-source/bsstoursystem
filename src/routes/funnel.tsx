import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/funnel")({
  component: () => (
    <AuthGate>
      <AppShell>
        <FunnelPage />
      </AppShell>
    </AuthGate>
  ),
});

type Lead = {
  id: string;
  name: string;
  destination: string | null;
  estimated_value: number | null;
  currency: string;
  status: string;
};

const COLUMNS = [
  { key: "novo", label: "Novo", color: "border-slate-400" },
  { key: "qualificado", label: "Qualificado", color: "border-blue-400" },
  { key: "cotacao", label: "Cotação", color: "border-amber-400" },
  { key: "proposta", label: "Proposta", color: "border-violet-400" },
  { key: "fechado", label: "Fechado", color: "border-emerald-500" },
  { key: "perdido", label: "Perdido", color: "border-red-400" },
];

function FunnelPage() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("leads").select("id,name,destination,estimated_value,currency,status");
    setLeads((data as Lead[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const onDrop = async (status: string) => {
    if (!dragId) return;
    const { error } = await supabase.from("leads").update({ status: status as "novo" }).eq("id", dragId);
    if (error) toast.error(error.message);
    else { setLeads((cur) => cur.map((l) => (l.id === dragId ? { ...l, status } : l))); }
    setDragId(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("funnel")}</h1>
        <p className="text-muted-foreground">Drag & drop</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {COLUMNS.map((col) => {
          const items = leads.filter((l) => l.status === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(col.key)}
              className={`flex flex-col rounded-lg border-t-4 ${col.color} bg-muted/30 p-3`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold">{col.label}</span>
                <span className="rounded-full bg-background px-2 text-xs">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((l) => (
                  <Card
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    className="cursor-move p-3 hover:shadow-md"
                  >
                    <div className="text-sm font-medium">{l.name}</div>
                    {l.destination && <div className="text-xs text-muted-foreground">{l.destination}</div>}
                    {l.estimated_value && (
                      <div className="mt-1 text-xs font-semibold text-primary">
                        {format(Number(l.estimated_value), l.currency as "BRL")}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
