import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

export type AssociateEntity =
  | { kind: "lead"; id: string; lead_id: string; customer_id: string | null; label: string; sub?: string }
  | { kind: "customer"; id: string; customer_id: string; label: string; sub?: string }
  | { kind: "supplier"; id: string; supplier_id: string; label: string; sub?: string }
  | { kind: "quote"; id: string; lead_id: string | null; customer_id: string | null; label: string; sub?: string }
  | { kind: "booking"; id: string; lead_id: string | null; customer_id: string | null; label: string; sub?: string };

type Tab = "lead" | "customer" | "supplier" | "quote" | "booking";

export function AssociateDialog({
  open,
  onOpenChange,
  onPick,
  tabs = ["lead", "customer", "supplier", "quote", "booking"],
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (e: AssociateEntity) => void;
  tabs?: Tab[];
  title?: string;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(tabs[0]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AssociateEntity[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const term = q.trim();
    const like = term ? `%${term}%` : "%";
    (async () => {
      let out: AssociateEntity[] = [];
      if (tab === "lead") {
        const { data } = await supabase
          .from("leads")
          .select("id,name,code,email,destination,customer_id")
          .or(`name.ilike.${like},code.ilike.${like},email.ilike.${like},destination.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(20);
        out = ((data ?? []) as { id: string; name: string; code: string | null; destination: string | null; customer_id: string | null }[]).map(
          (l) => ({ kind: "lead", id: l.id, lead_id: l.id, customer_id: l.customer_id, label: `${l.code ?? ""} ${l.name}`.trim(), sub: l.destination ?? undefined }),
        );
      } else if (tab === "customer") {
        const { data } = await supabase
          .from("customers")
          .select("id,full_name,code,email,phone")
          .or(`full_name.ilike.${like},code.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(20);
        out = ((data ?? []) as { id: string; full_name: string; code: string | null; email: string | null }[]).map(
          (c) => ({ kind: "customer", id: c.id, customer_id: c.id, label: `${c.code ?? ""} ${c.full_name}`.trim(), sub: c.email ?? undefined }),
        );
      } else if (tab === "supplier") {
        const { data } = await supabase
          .from("suppliers")
          .select("id,name,code,email,category")
          .or(`name.ilike.${like},code.ilike.${like},email.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(20);
        out = ((data ?? []) as { id: string; name: string; code: string | null; category: string | null }[]).map(
          (s) => ({ kind: "supplier", id: s.id, supplier_id: s.id, label: `${s.code ?? ""} ${s.name}`.trim(), sub: s.category ?? undefined }),
        );
      } else if (tab === "quote") {
        const { data } = await supabase
          .from("quotes")
          .select("id,total_amount,currency,status,lead_id,customer_id,leads(name),customers(full_name)")
          .order("created_at", { ascending: false })
          .limit(50);
        out = ((data ?? []) as Array<{ id: string; total_amount: number; currency: string; status: string; lead_id: string | null; customer_id: string | null; leads: { name: string } | null; customers: { full_name: string } | null }>)
          .filter((r) => {
            if (!term) return true;
            const hay = `${r.id} ${r.leads?.name ?? ""} ${r.customers?.full_name ?? ""}`.toLowerCase();
            return hay.includes(term.toLowerCase());
          })
          .map((r) => ({
            kind: "quote", id: r.id, lead_id: r.lead_id, customer_id: r.customer_id,
            label: `#${r.id.slice(0, 8)} · ${r.customers?.full_name ?? r.leads?.name ?? "—"}`,
            sub: `${r.status} · ${r.currency} ${r.total_amount}`,
          }));
      } else if (tab === "booking") {
        const { data } = await supabase
          .from("bookings")
          .select("id,total_amount,currency,status,departure_date,lead_id,customer_id,customers(full_name)")
          .order("created_at", { ascending: false })
          .limit(50);
        out = ((data ?? []) as Array<{ id: string; total_amount: number; currency: string; status: string; departure_date: string | null; lead_id: string | null; customer_id: string | null; customers: { full_name: string } | null }>)
          .filter((r) => {
            if (!term) return true;
            const hay = `${r.id} ${r.customers?.full_name ?? ""}`.toLowerCase();
            return hay.includes(term.toLowerCase());
          })
          .map((r) => ({
            kind: "booking", id: r.id, lead_id: r.lead_id, customer_id: r.customer_id,
            label: `#${r.id.slice(0, 8)} · ${r.customers?.full_name ?? "—"}`,
            sub: `${r.status} · ${r.departure_date ?? ""}`,
          }));
      }
      if (!cancelled) setResults(out);
    })();
    return () => { cancelled = true; };
  }, [open, tab, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{title ?? t("associate")}</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="w-full">
            {tabs.includes("lead") && <TabsTrigger value="lead">{t("linkLead")}</TabsTrigger>}
            {tabs.includes("customer") && <TabsTrigger value="customer">{t("linkCustomer")}</TabsTrigger>}
            {tabs.includes("supplier") && <TabsTrigger value="supplier">{t("linkSupplier")}</TabsTrigger>}
            {tabs.includes("quote") && <TabsTrigger value="quote">{t("linkQuote")}</TabsTrigger>}
            {tabs.includes("booking") && <TabsTrigger value="booking">{t("linkBooking")}</TabsTrigger>}
          </TabsList>
          <TabsContent value={tab} className="space-y-3">
            <Input placeholder={t("searchPlaceholderAssociate")} value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="space-y-2 max-h-96 overflow-auto">
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">{t("noResults")}</p>
              ) : results.map((r) => (
                <Card key={`${r.kind}-${r.id}`} className="p-3 cursor-pointer hover:bg-accent" onClick={() => { onPick(r); onOpenChange(false); }}>
                  <div className="font-medium text-sm">{r.label}</div>
                  {r.sub && <div className="text-xs text-muted-foreground">{r.sub}</div>}
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
