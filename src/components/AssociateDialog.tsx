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
  | { kind: "booking"; id: string; lead_id: string | null; customer_id: string | null; label: string; sub?: string }
  | { kind: "activity"; id: string; activity_id: string; booking_id: string | null; lead_id: string | null; customer_id: string | null; label: string; sub?: string };

type Tab = "all" | "lead" | "customer" | "supplier" | "quote" | "booking" | "activity";

const SECTION_LABELS: Record<Exclude<Tab, "all">, string> = {
  lead: "Leads",
  customer: "Clientes",
  supplier: "Fornecedores",
  quote: "Cotações",
  booking: "Reservas",
  activity: "Atividades",
};

async function searchLeads(like: string): Promise<AssociateEntity[]> {
  const { data } = await supabase
    .from("leads")
    .select("id,name,code,email,destination,customer_id")
    .or(`name.ilike.${like},code.ilike.${like},email.ilike.${like},destination.ilike.${like}`)
    .order("created_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as { id: string; name: string; code: string | null; destination: string | null; customer_id: string | null }[]).map(
    (l) => ({ kind: "lead", id: l.id, lead_id: l.id, customer_id: l.customer_id, label: `${l.code ?? ""} ${l.name}`.trim(), sub: l.destination ?? undefined }),
  );
}

async function searchCustomers(like: string): Promise<AssociateEntity[]> {
  const { data } = await supabase
    .from("customers")
    .select("id,full_name,code,email,phone")
    .or(`full_name.ilike.${like},code.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
    .order("created_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as { id: string; full_name: string; code: string | null; email: string | null }[]).map(
    (c) => ({ kind: "customer", id: c.id, customer_id: c.id, label: `${c.code ?? ""} ${c.full_name}`.trim(), sub: c.email ?? undefined }),
  );
}

async function searchSuppliers(like: string): Promise<AssociateEntity[]> {
  const { data } = await supabase
    .from("suppliers")
    .select("id,name,code,email,category")
    .or(`name.ilike.${like},code.ilike.${like},email.ilike.${like}`)
    .order("created_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as { id: string; name: string; code: string | null; category: string | null }[]).map(
    (s) => ({ kind: "supplier", id: s.id, supplier_id: s.id, label: `${s.code ?? ""} ${s.name}`.trim(), sub: s.category ?? undefined }),
  );
}

async function searchQuotes(term: string): Promise<AssociateEntity[]> {
  const { data } = await supabase
    .from("quotes")
    .select("id,total_amount,currency,status,lead_id,customer_id,leads(name),customers(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as Array<{ id: string; total_amount: number; currency: string; status: string; lead_id: string | null; customer_id: string | null; leads: { name: string } | null; customers: { full_name: string } | null }>)
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
}

async function searchBookings(term: string): Promise<AssociateEntity[]> {
  const { data } = await supabase
    .from("bookings")
    .select("id,total_amount,currency,status,departure_date,lead_id,customer_id,customers(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as Array<{ id: string; total_amount: number; currency: string; status: string; departure_date: string | null; lead_id: string | null; customer_id: string | null; customers: { full_name: string } | null }>)
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

async function searchActivities(term: string, like: string): Promise<AssociateEntity[]> {
  let q = supabase
    .from("operations_activities")
    .select("id,description,city,activity_date,activity_time,kind,status,booking_id,hotel,supplier,guide,driver,pax_name,invoice_code,bookings(lead_id,customer_id)")
    .order("created_at", { ascending: false })
    .limit(50);
  const t = term.trim();
  if (t) {
    q = q.or(
      `description.ilike.${like},city.ilike.${like},hotel.ilike.${like},supplier.ilike.${like},guide.ilike.${like},driver.ilike.${like},pax_name.ilike.${like},invoice_code.ilike.${like}`,
    );
  }
  const { data } = await q;
  return ((data ?? []) as Array<{ id: string; description: string | null; city: string | null; activity_date: string | null; activity_time: string | null; kind: string; status: string; booking_id: string | null; bookings: { lead_id: string | null; customer_id: string | null } | null }>).map((a) => ({
    kind: "activity",
    id: a.id,
    activity_id: a.id,
    booking_id: a.booking_id,
    lead_id: a.bookings?.lead_id ?? null,
    customer_id: a.bookings?.customer_id ?? null,
    label: `${a.kind} · ${a.description ?? "—"}${a.city ? ` (${a.city})` : ""}`,
    sub: `${a.activity_date ?? ""} ${a.activity_time ?? ""}${a.booking_id ? ` · booking #${a.booking_id.slice(0, 8)}` : ""}`,
  }));
}

export function AssociateDialog({
  open,
  onOpenChange,
  onPick,
  tabs = ["all", "lead", "customer", "supplier", "quote", "booking", "activity"],
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
      if (tab === "all") {
        const enabled: Exclude<Tab, "all">[] = (tabs.filter((x) => x !== "all") as Exclude<Tab, "all">[]);
        const runners: Array<Promise<AssociateEntity[]>> = enabled.map((k) => {
          if (k === "lead") return searchLeads(like);
          if (k === "customer") return searchCustomers(like);
          if (k === "supplier") return searchSuppliers(like);
          if (k === "quote") return searchQuotes(term);
          if (k === "booking") return searchBookings(term);
          return searchActivities(term, like);
        });
        const arrays = await Promise.all(runners);
        out = arrays.flatMap((arr) => arr.slice(0, 5));
      } else if (tab === "lead") out = await searchLeads(like);
      else if (tab === "customer") out = await searchCustomers(like);
      else if (tab === "supplier") out = await searchSuppliers(like);
      else if (tab === "quote") out = await searchQuotes(term);
      else if (tab === "booking") out = await searchBookings(term);
      else if (tab === "activity") out = await searchActivities(term, like);
      if (!cancelled) setResults(out);
    })();
    return () => { cancelled = true; };
  }, [open, tab, q, tabs]);

  // Group results in "all" view by kind preserving section order.
  const grouped: Array<{ kind: Exclude<Tab, "all">; items: AssociateEntity[] }> = (() => {
    if (tab !== "all") return [];
    const order: Exclude<Tab, "all">[] = (tabs.filter((x) => x !== "all") as Exclude<Tab, "all">[]);
    return order
      .map((k) => ({ kind: k, items: results.filter((r) => r.kind === k) }))
      .filter((g) => g.items.length > 0);
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{title ?? t("associate")}</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="w-full flex flex-wrap h-auto">
            {tabs.includes("all") && <TabsTrigger value="all">Todos</TabsTrigger>}
            {tabs.includes("lead") && <TabsTrigger value="lead">{t("linkLead")}</TabsTrigger>}
            {tabs.includes("customer") && <TabsTrigger value="customer">{t("linkCustomer")}</TabsTrigger>}
            {tabs.includes("supplier") && <TabsTrigger value="supplier">{t("linkSupplier")}</TabsTrigger>}
            {tabs.includes("quote") && <TabsTrigger value="quote">{t("linkQuote")}</TabsTrigger>}
            {tabs.includes("booking") && <TabsTrigger value="booking">{t("linkBooking")}</TabsTrigger>}
            {tabs.includes("activity") && <TabsTrigger value="activity">Atividades</TabsTrigger>}
          </TabsList>
          <TabsContent value={tab} className="space-y-3">
            <Input placeholder={t("searchPlaceholderAssociate")} value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="space-y-2 max-h-96 overflow-auto">
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">{t("noResults")}</p>
              ) : tab === "all" ? (
                grouped.map((g) => (
                  <div key={g.kind} className="space-y-1">
                    <div className="text-xs font-semibold uppercase text-muted-foreground px-1 pt-2">{SECTION_LABELS[g.kind]}</div>
                    {g.items.map((r) => (
                      <Card key={`${r.kind}-${r.id}`} className="p-3 cursor-pointer hover:bg-accent" onClick={() => { onPick(r); onOpenChange(false); }}>
                        <div className="font-medium text-sm">{r.label}</div>
                        {r.sub && <div className="text-xs text-muted-foreground">{r.sub}</div>}
                      </Card>
                    ))}
                  </div>
                ))
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
