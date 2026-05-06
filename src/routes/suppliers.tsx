import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Eye, Star, Sparkles, FileText, Loader2, Pencil, Trash2 } from "lucide-react";
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
import { useI18n, type TKey } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Can, MaskedField, usePermissions } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/suppliers")({
  component: () => (
    <AuthGate>
      <AppShell>
        <SuppliersPage />
      </AppShell>
    </AuthGate>
  ),
});

const CATEGORIES = ["hotel", "aerea", "receptivo", "transfer", "seguro", "operadora", "passeio", "aluguel_carro", "outro"] as const;
type Category = typeof CATEGORIES[number];
const CAT_LABEL: Record<Category, TKey> = {
  hotel: "catHotel", aerea: "catAerea", receptivo: "catReceptivo", transfer: "catTransfer",
  seguro: "catSeguro", operadora: "catOperadora", passeio: "catPasseio",
  aluguel_carro: "catAluguelCarro", outro: "catOutro",
};

type Supplier = {
  id: string;
  name: string;
  trade_name: string | null;
  tax_id: string | null;
  category: Category;
  status: "ativo" | "inativo" | "homologacao";
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  address_city: string | null;
  address_country: string | null;
  payment_terms: string | null;
  default_currency: string;
  commission_pct: number | null;
  iata_code: string | null;
  cadastur: string | null;
  notes: string | null;
  tags: string[] | null;
  rating: number | null;
  created_at: string;
};

const emptyForm = {
  name: "", trade_name: "", tax_id: "",
  category: "hotel" as Category,
  status: "ativo" as "ativo" | "inativo" | "homologacao",
  contact_name: "", email: "", phone: "", whatsapp: "", website: "",
  address_street: "", address_number: "", address_complement: "",
  address_district: "", address_city: "", address_state: "",
  address_country: "", address_zip: "",
  payment_terms: "", default_currency: "BRL",
  commission_pct: "", iata_code: "", cadastur: "",
  notes: "", tags: "", rating: "",
};

function SuppliersPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { can } = usePermissions();
  const [rows, setRows] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selected, setSelected] = useState<Supplier | null>(null);

  const load = async () => {
    const { data } = await supabase.from("suppliers").select("*").order("created_at", { ascending: false });
    setRows((data as unknown as Supplier[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterCat !== "all" && r.category !== filterCat) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (!q) return true;
      return [r.name, r.trade_name, r.email, r.tax_id, r.address_city]
        .filter(Boolean).some((v) => v!.toLowerCase().includes(q));
    });
  }, [rows, search, filterCat, filterStatus]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const tags = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
    const payload: any = {
      name: form.name,
      trade_name: form.trade_name || null,
      tax_id: form.tax_id || null,
      category: form.category,
      status: form.status,
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      whatsapp: form.whatsapp || null,
      website: form.website || null,
      address_street: form.address_street || null,
      address_number: form.address_number || null,
      address_complement: form.address_complement || null,
      address_district: form.address_district || null,
      address_city: form.address_city || null,
      address_state: form.address_state || null,
      address_country: form.address_country || null,
      address_zip: form.address_zip || null,
      payment_terms: form.payment_terms || null,
      default_currency: form.default_currency as any,
      commission_pct: form.commission_pct ? Number(form.commission_pct) : 0,
      iata_code: form.iata_code || null,
      cadastur: form.cadastur || null,
      notes: form.notes || null,
      tags,
      rating: form.rating ? Number(form.rating) : null,
      created_by: user.id,
    };
    const { error } = await supabase.from("suppliers").insert(payload);
    if (error) toast.error(error.message);
    else {
      toast.success(t("saved"));
      setOpen(false);
      setForm(emptyForm);
      load();
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir "${name}"?`)) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(t("saved")); load(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("suppliers")}</h1>
          <p className="text-muted-foreground">{filtered.length} / {rows.length}</p>
        </div>
        <div className="flex gap-2">
          <BulkAIButtons />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />{t("addManually")}</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("new")} {t("suppliers")}</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>{t("category")}</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(CAT_LABEL[c])}</SelectItem>)}
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
                      <SelectItem value="homologacao">{t("statusHomologation")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("currency")}</Label>
                  <Select value={form.default_currency} onValueChange={(v) => setForm({ ...form, default_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">BRL</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("name")}</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>{t("tradeName")}</Label><Input value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>{t("taxId")}</Label><Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} /></div>
                <div><Label>{t("iataCode")}</Label><Input value={form.iata_code} onChange={(e) => setForm({ ...form, iata_code: e.target.value })} /></div>
                <div><Label>{t("cadastur")}</Label><Input value={form.cadastur} onChange={(e) => setForm({ ...form, cadastur: e.target.value })} /></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("contactName")}</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
                <div><Label>{t("website")}</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>{t("email")}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>{t("phone")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>{t("whatsapp")}</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
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

              <div className="grid grid-cols-3 gap-3">
                <div><Label>{t("paymentTerms")}</Label><Input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="30/60/90" /></div>
                <div><Label>{t("commission")}</Label><Input type="number" step="0.01" value={form.commission_pct} onChange={(e) => setForm({ ...form, commission_pct: e.target.value })} /></div>
                <div><Label>{t("rating")} (1-5)</Label><Input type="number" min="1" max="5" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} /></div>
              </div>

              <div><Label>{t("tags")} (vírgula)</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></div>
              <div><Label>{t("notes")}</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

              <Button type="submit" className="w-full">{t("save")}</Button>
            </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{t("suppliers")}</h2>
          <div className="relative w-full max-w-md">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("category")}</TableHead>
              <TableHead>Código da Cidade</TableHead>
              <TableHead>Código do país</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>{t("email")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>
            ) : filtered.map((s, i) => (
              <TableRow key={s.id} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(s.id, s.name); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
                <TableCell className="font-semibold">{s.name}</TableCell>
                <TableCell><Badge variant="outline">{t(CAT_LABEL[s.category])}</Badge></TableCell>
                <TableCell>{s.address_city ?? ""}</TableCell>
                <TableCell>{s.address_country ?? ""}</TableCell>
                <TableCell>{s.phone ?? ""}</TableCell>
                <TableCell>{s.email ?? ""}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => setSelected(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <SupplierDrawer supplier={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function SupplierDrawer({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const { t } = useI18n();
  const [contacts, setContacts] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => {
    if (!supplier) return;
    const [c, e, b, d, r] = await Promise.all([
      supabase.from("supplier_contacts").select("*").eq("supplier_id", supplier.id).order("is_primary", { ascending: false }),
      supabase.from("emails").select("id,subject,from_email,received_at").eq("supplier_id", supplier.id).order("received_at", { ascending: false }).limit(20),
      supabase.from("booking_suppliers").select("id,service_type,confirmation_code,cost,currency,status,booking_id").eq("supplier_id", supplier.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("supplier_documents").select("*").eq("supplier_id", supplier.id).order("created_at", { ascending: false }),
      supabase.from("supplier_rates").select("*").eq("supplier_id", supplier.id).order("city").limit(200),
    ]);
    setContacts(c.data ?? []); setEmails(e.data ?? []); setBookings(b.data ?? []);
    setDocs(d.data ?? []); setRates(r.data ?? []);
  };
  useEffect(() => { reload(); }, [supplier]);

  const runAI = async (fn: "extract-supplier-contacts" | "extract-supplier-rates") => {
    if (!supplier) return;
    setBusy(fn);
    const { data, error } = await supabase.functions.invoke(fn, { body: { supplier_id: supplier.id } });
    setBusy(null);
    if (error) toast.error(error.message);
    else { toast.success(`${data?.processed ?? 0} doc(s) processado(s)`); reload(); }
  };

  return (
    <Sheet open={!!supplier} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {supplier && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center justify-between gap-2">
                <span>{supplier.name}</span>
                <span className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => runAI("extract-supplier-contacts")}>
                    {busy === "extract-supplier-contacts" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    <span className="ml-1 text-xs">Contatos</span>
                  </Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => runAI("extract-supplier-rates")}>
                    {busy === "extract-supplier-rates" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                    <span className="ml-1 text-xs">Tarifas</span>
                  </Button>
                </span>
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <Tabs defaultValue="info">
                <TabsList className="grid grid-cols-6 w-full">
                  <TabsTrigger value="info">{t("details")}</TabsTrigger>
                  <TabsTrigger value="contacts">{t("contacts")}</TabsTrigger>
                  <TabsTrigger value="docs">Docs ({docs.length})</TabsTrigger>
                  <TabsTrigger value="rates">Tarifas ({rates.length})</TabsTrigger>
                  <TabsTrigger value="bookings">{t("bookings")}</TabsTrigger>
                  <TabsTrigger value="emails">{t("email")}</TabsTrigger>
                </TabsList>
                <TabsContent value="info" className="space-y-2 text-sm">
                  <Row k={t("category")} v={t(CAT_LABEL[supplier.category])} />
                  <Row k={t("status")} v={supplier.status} />
                  <Row k={t("tradeName")} v={supplier.trade_name} />
                  <Row k={t("taxId")} v={supplier.tax_id} />
                  <Row k={t("iataCode")} v={supplier.iata_code} />
                  <Row k={t("cadastur")} v={supplier.cadastur} />
                  <Row k={t("contactName")} v={supplier.contact_name} />
                  <Row k={t("email")} v={supplier.email} />
                  <Row k={t("phone")} v={supplier.phone} />
                  <Row k={t("whatsapp")} v={supplier.whatsapp} />
                  <Row k={t("website")} v={supplier.website} />
                  <Row k={t("address")} v={[supplier.address_city, supplier.address_country].filter(Boolean).join(", ") || null} />
                  <Row k={t("paymentTerms")} v={supplier.payment_terms} />
                  <Row k={t("commission")} v={supplier.commission_pct != null ? `${supplier.commission_pct}%` : null} />
                  <Row k={t("currency")} v={supplier.default_currency} />
                  <Row k={t("rating")} v={supplier.rating?.toString() ?? null} />
                  <Row k={t("tags")} v={supplier.tags?.join(", ") || null} />
                  <Row k={t("notes")} v={supplier.notes} />
                </TabsContent>
                <TabsContent value="contacts">
                  {contacts.length === 0
                    ? <div className="py-8 text-center text-sm text-muted-foreground">{t("noData")}</div>
                    : <div className="space-y-2 mt-2">{contacts.map((c) => (
                        <Card key={c.id} className="p-3 text-sm">
                          <div className="font-medium">{c.name} {c.is_primary && <Badge className="ml-1">★</Badge>}</div>
                          <div className="text-muted-foreground">{[c.role, c.email, c.phone].filter(Boolean).join(" · ")}</div>
                        </Card>
                      ))}</div>}
                </TabsContent>
                <TabsContent value="bookings">
                  {bookings.length === 0
                    ? <div className="py-8 text-center text-sm text-muted-foreground">{t("noData")}</div>
                    : <div className="space-y-2 mt-2">{bookings.map((b) => (
                        <Card key={b.id} className="p-3 text-sm">{b.service_type ?? "—"} · {b.confirmation_code ?? "—"} · {b.currency} {Number(b.cost ?? 0).toFixed(2)}</Card>
                      ))}</div>}
                </TabsContent>
                <TabsContent value="emails">
                  {emails.length === 0
                    ? <div className="py-8 text-center text-sm text-muted-foreground">{t("noData")}</div>
                    : <div className="space-y-2 mt-2">{emails.map((e) => (
                        <Card key={e.id} className="p-3 text-sm">{e.subject ?? "(sem assunto)"} — {e.from_email}</Card>
                      ))}</div>}
                </TabsContent>
                <TabsContent value="docs">
                  {docs.length === 0
                    ? <div className="py-8 text-center text-sm text-muted-foreground">{t("noData")}</div>
                    : <div className="space-y-2 mt-2">{docs.map((d) => (
                        <Card key={d.id} className="p-3 text-sm flex items-center justify-between">
                          <div>
                            <div className="font-medium">{d.original_filename}</div>
                            <div className="text-xs text-muted-foreground">{d.file_format?.toUpperCase()} · {d.kind}{d.language ? ` · ${d.language}` : ""}{d.rates_extracted_at ? " · ✓ tarifas" : ""}{d.contacts_extracted_at ? " · ✓ contatos" : ""}</div>
                          </div>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            const { data } = await supabase.storage.from("supplier-docs").createSignedUrl(d.storage_path, 60);
                            if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                          }}>Abrir</Button>
                        </Card>
                      ))}</div>}
                </TabsContent>
                <TabsContent value="rates">
                  {rates.length === 0
                    ? <div className="py-8 text-center text-sm text-muted-foreground">{t("noData")}</div>
                    : <div className="mt-2 max-h-[60vh] overflow-y-auto"><Table><TableHeader><TableRow><TableHead>Serviço</TableHead><TableHead>Cidade</TableHead><TableHead>Pax</TableHead><TableHead className="text-right">Preço</TableHead></TableRow></TableHeader><TableBody>
                        {rates.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs">{r.service_name}{r.category ? ` (${r.category})` : ""}</TableCell>
                            <TableCell className="text-xs">{r.city ?? "—"}</TableCell>
                            <TableCell className="text-xs">{r.pax_min ?? "—"}{r.pax_max ? `-${r.pax_max}` : ""}</TableCell>
                            <TableCell className="text-right text-xs">{r.currency} {Number(r.unit_price).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody></Table></div>}
                </TabsContent>
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

function BulkAIButtons() {
  const [loading, setLoading] = useState<"contacts" | "rates" | null>(null);
  const run = async (kind: "contacts" | "rates") => {
    setLoading(kind);
    const fn = kind === "contacts" ? "extract-supplier-contacts" : "extract-supplier-rates";
    const { data, error } = await supabase.functions.invoke(fn, { body: { all: true } });
    setLoading(null);
    if (error) toast.error(error.message);
    else toast.success(`${data?.processed ?? 0} documentos processados`);
  };
  return (
    <>
      <Button variant="outline" disabled={!!loading} onClick={() => run("contacts")}>
        {loading === "contacts" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        IA: Contatos
      </Button>
      <Button variant="outline" disabled={!!loading} onClick={() => run("rates")}>
        {loading === "rates" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
        IA: Tarifas
      </Button>
    </>
  );
}
