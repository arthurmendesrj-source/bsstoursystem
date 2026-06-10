import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Eye } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/customers")({
  component: () => (
    <AuthGate>
      <AppShell>
        <CustomersPage />
      </AppShell>
    </AuthGate>
  ),
});

type Customer = {
  id: string;
  type: "pf" | "pj";
  status: "ativo" | "inativo" | "bloqueado";
  full_name: string;
  company_name: string | null;
  trade_name: string | null;
  tax_id: string | null;
  email: string | null;
  secondary_email: string | null;
  phone: string | null;
  whatsapp: string | null;
  document_number: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  nationality: string | null;
  gender: string | null;
  marital_status: string | null;
  birth_date: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_city: string | null;
  address_state: string | null;
  address_country: string | null;
  address_zip: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  tags: string[] | null;
  origin: string | null;
  notes: string | null;
  created_at: string;
};

const emptyForm = {
  type: "pf" as "pf" | "pj",
  status: "ativo" as "ativo" | "inativo" | "bloqueado",
  full_name: "", company_name: "", trade_name: "", tax_id: "",
  email: "", secondary_email: "", phone: "", whatsapp: "",
  document_number: "", passport_number: "", passport_expiry: "",
  nationality: "", gender: "", marital_status: "", birth_date: "",
  address_street: "", address_number: "", address_complement: "",
  address_district: "", address_city: "", address_state: "",
  address_country: "", address_zip: "",
  emergency_contact_name: "", emergency_contact_phone: "",
  tags: "", origin: "", notes: "",
};

function CustomersPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [rows, setRows] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selected, setSelected] = useState<Customer | null>(null);

  const load = async () => {
    const { data } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
    setRows((data as unknown as Customer[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterType !== "all" && r.type !== filterType) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (!q) return true;
      return [r.full_name, r.company_name, r.email, r.tax_id, r.phone]
        .filter(Boolean).some((v) => v!.toLowerCase().includes(q));
    });
  }, [rows, search, filterType, filterStatus]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const tags = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
    const payload: any = {
      type: form.type,
      status: form.status,
      full_name: form.full_name,
      company_name: form.company_name || null,
      trade_name: form.trade_name || null,
      tax_id: form.tax_id || null,
      email: form.email || null,
      secondary_email: form.secondary_email || null,
      phone: form.phone || null,
      whatsapp: form.whatsapp || null,
      document_number: form.document_number || null,
      passport_number: form.passport_number || null,
      passport_expiry: form.passport_expiry || null,
      nationality: form.nationality || null,
      gender: form.gender || null,
      marital_status: form.marital_status || null,
      birth_date: form.birth_date || null,
      address_street: form.address_street || null,
      address_number: form.address_number || null,
      address_complement: form.address_complement || null,
      address_district: form.address_district || null,
      address_city: form.address_city || null,
      address_state: form.address_state || null,
      address_country: form.address_country || null,
      address_zip: form.address_zip || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      tags,
      origin: form.origin || null,
      notes: form.notes || null,
      created_by: user.id,
    };
    const { error } = await supabase.from("customers").insert(payload);
    if (error) toast.error(error.message);
    else {
      toast.success(t("saved"));
      setOpen(false);
      setForm(emptyForm);
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("customers")}</h1>
          <p className="text-muted-foreground">{filtered.length} / {rows.length}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />{t("addManually")}</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("new")} {t("customers")}</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>{t("type")}</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pf">{t("pf")}</SelectItem>
                      <SelectItem value="pj">{t("pj")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("status")}</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">{t("statusActive")}</SelectItem>
                      <SelectItem value="inativo">{t("statusInactive")}</SelectItem>
                      <SelectItem value="bloqueado">{t("statusBlocked")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>{t("origin")}</Label><Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} /></div>
              </div>

              {form.type === "pj" && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t("companyName")}</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
                  <div><Label>{t("tradeName")}</Label><Input value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} /></div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("fullName")}</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div><Label>{t("taxId")}</Label><Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} /></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("email")}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>{t("secondaryEmail")}</Label><Input type="email" value={form.secondary_email} onChange={(e) => setForm({ ...form, secondary_email: e.target.value })} /></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("phone")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>{t("whatsapp")}</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div><Label>{t("document")}</Label><Input value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} /></div>
                <div><Label>{t("passport")}</Label><Input value={form.passport_number} onChange={(e) => setForm({ ...form, passport_number: e.target.value })} /></div>
                <div><Label>{t("passport")} validade</Label><Input type="date" value={form.passport_expiry} onChange={(e) => setForm({ ...form, passport_expiry: e.target.value })} /></div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div><Label>{t("nationality")}</Label><Input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} /></div>
                <div><Label>{t("gender")}</Label><Input value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} /></div>
                <div><Label>{t("maritalStatus")}</Label><Input value={form.marital_status} onChange={(e) => setForm({ ...form, marital_status: e.target.value })} /></div>
              </div>

              <div className="text-sm font-medium mt-2">{t("address")}</div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><Label>{t("street")}</Label><Input value={form.address_street} onChange={(e) => setForm({ ...form, address_street: e.target.value })} /></div>
                <div><Label>{t("number")}</Label><Input value={form.address_number} onChange={(e) => setForm({ ...form, address_number: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>{t("complement")}</Label><Input value={form.address_complement} onChange={(e) => setForm({ ...form, address_complement: e.target.value })} /></div>
                <div><Label>{t("district")}</Label><Input value={form.address_district} onChange={(e) => setForm({ ...form, address_district: e.target.value })} /></div>
                <div><Label>{t("zip")}</Label><Input value={form.address_zip} onChange={(e) => setForm({ ...form, address_zip: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>{t("city")}</Label><Input value={form.address_city} onChange={(e) => setForm({ ...form, address_city: e.target.value })} /></div>
                <div><Label>{t("state")}</Label><Input value={form.address_state} onChange={(e) => setForm({ ...form, address_state: e.target.value })} /></div>
                <div><Label>{t("country")}</Label><Input value={form.address_country} onChange={(e) => setForm({ ...form, address_country: e.target.value })} /></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("emergencyContact")} ({t("name")})</Label><Input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} /></div>
                <div><Label>{t("emergencyContact")} ({t("phone")})</Label><Input value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} /></div>
              </div>

              <div><Label>{t("tags")} (vírgula)</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="VIP, recorrente" /></div>
              <div><Label>{t("notes")}</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

              <Button type="submit" className="w-full">{t("save")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40"><SelectValue placeholder={t("type")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all")}</SelectItem>
              <SelectItem value="pf">{t("pf")}</SelectItem>
              <SelectItem value="pj">{t("pj")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue placeholder={t("status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all")}</SelectItem>
              <SelectItem value="ativo">{t("statusActive")}</SelectItem>
              <SelectItem value="inativo">{t("statusInactive")}</SelectItem>
              <SelectItem value="bloqueado">{t("statusBlocked")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead>{t("email")}</TableHead>
              <TableHead>{t("phone")}</TableHead>
              <TableHead>{t("taxId")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>
            ) : filtered.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
                <TableCell className="font-medium">{c.full_name}{c.company_name ? <span className="text-muted-foreground"> · {c.company_name}</span> : null}</TableCell>
                <TableCell><Badge variant="outline">{c.type === "pf" ? t("pf") : t("pj")}</Badge></TableCell>
                <TableCell>{c.email ?? "—"}</TableCell>
                <TableCell>{c.phone ?? c.whatsapp ?? "—"}</TableCell>
                <TableCell>{c.tax_id ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "ativo" ? "default" : c.status === "bloqueado" ? "destructive" : "secondary"}>
                    {c.status === "ativo" ? t("statusActive") : c.status === "inativo" ? t("statusInactive") : t("statusBlocked")}
                  </Badge>
                </TableCell>
                <TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <CustomerDrawer customer={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function CustomerDrawer({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { t } = useI18n();
  const [leads, setLeads] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    if (!customer) return;
    (async () => {
      const [l, b, e, i, ts] = await Promise.all([
        supabase.from("leads").select("id,name,status,destination,created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }),
        supabase.from("bookings").select("id,status,total_amount,currency,departure_date,created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }),
        Promise.resolve({ data: [] as any[] }),
        supabase.from("interactions").select("id,type,subject,occurred_at").eq("customer_id", customer.id).order("occurred_at", { ascending: false }).limit(20),
        supabase.from("tasks").select("id,title,completed,due_date").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(20),
      ]);
      setLeads(l.data ?? []); setBookings(b.data ?? []); setEmails(e.data ?? []);
      setInteractions(i.data ?? []); setTasks(ts.data ?? []);
    })();
  }, [customer]);

  return (
    <Sheet open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {customer && (
          <>
            <SheetHeader><SheetTitle>{customer.full_name}</SheetTitle></SheetHeader>
            <div className="mt-4">
              <Tabs defaultValue="info">
                <TabsList className="grid grid-cols-6 w-full">
                  <TabsTrigger value="info">{t("details")}</TabsTrigger>
                  <TabsTrigger value="leads">{t("leads")}</TabsTrigger>
                  <TabsTrigger value="bookings">{t("bookings")}</TabsTrigger>
                  <TabsTrigger value="emails">{t("email")}</TabsTrigger>
                  <TabsTrigger value="interactions">Int.</TabsTrigger>
                  <TabsTrigger value="tasks">Task</TabsTrigger>
                </TabsList>
                <TabsContent value="info" className="space-y-2 text-sm">
                  <Row k={t("type")} v={customer.type === "pf" ? t("pf") : t("pj")} />
                  <Row k={t("status")} v={customer.status} />
                  <Row k={t("companyName")} v={customer.company_name} />
                  <Row k={t("taxId")} v={customer.tax_id} />
                  <Row k={t("email")} v={customer.email} />
                  <Row k={t("secondaryEmail")} v={customer.secondary_email} />
                  <Row k={t("phone")} v={customer.phone} />
                  <Row k={t("whatsapp")} v={customer.whatsapp} />
                  <Row k={t("document")} v={customer.document_number} />
                  <Row k={t("passport")} v={customer.passport_number} />
                  <Row k={t("nationality")} v={customer.nationality} />
                  <Row k={t("address")} v={[customer.address_street, customer.address_number, customer.address_city, customer.address_country].filter(Boolean).join(", ") || null} />
                  <Row k={t("emergencyContact")} v={[customer.emergency_contact_name, customer.emergency_contact_phone].filter(Boolean).join(" · ") || null} />
                  <Row k={t("tags")} v={customer.tags?.join(", ") || null} />
                  <Row k={t("origin")} v={customer.origin} />
                  <Row k={t("notes")} v={customer.notes} />
                </TabsContent>
                <TabsContent value="leads"><HistoryList items={leads} render={(l) => `${l.name} — ${l.status}${l.destination ? " · " + l.destination : ""}`} /></TabsContent>
                <TabsContent value="bookings"><HistoryList items={bookings} render={(b) => `${b.status} — ${b.currency} ${Number(b.total_amount).toFixed(2)}`} /></TabsContent>
                <TabsContent value="emails"><HistoryList items={emails} render={(e) => `${e.subject ?? "(sem assunto)"} — ${e.from_email ?? ""}`} /></TabsContent>
                <TabsContent value="interactions"><HistoryList items={interactions} render={(i) => `${i.type} — ${i.subject ?? ""}`} /></TabsContent>
                <TabsContent value="tasks"><HistoryList items={tasks} render={(t) => `${t.completed ? "✓ " : ""}${t.title}`} /></TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return <div className="flex gap-2"><span className="text-muted-foreground w-32 shrink-0">{k}</span><span className="flex-1">{v}</span></div>;
}

function HistoryList<T extends { id: string }>({ items, render }: { items: T[]; render: (x: T) => string }) {
  const { t } = useI18n();
  if (items.length === 0) return <div className="py-8 text-center text-sm text-muted-foreground">{t("noData")}</div>;
  return (
    <div className="space-y-2 mt-2">
      {items.map((it) => (
        <Card key={it.id} className="p-3 text-sm">{render(it)}</Card>
      ))}
    </div>
  );
}
