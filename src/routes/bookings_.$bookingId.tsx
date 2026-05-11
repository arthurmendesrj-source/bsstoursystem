import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, XCircle, Paperclip, Download, RotateCcw, Link2, Mail, Ticket, Plus, Trash2 } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProofAssociateDialog, type ProofPick } from "@/components/ProofAssociateDialog";
import { VoucherDialog } from "@/components/booking/VoucherDialog";
import { ComboboxAutocomplete } from "@/components/ComboboxAutocomplete";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MaskedField } from "@/lib/permissions";

export const Route = createFileRoute("/bookings_/$bookingId")({
  component: () => (
    <AuthGate>
      <AppShell>
        <BookingDetailPage />
      </AppShell>
    </AuthGate>
  ),
});

type Booking = {
  id: string;
  status: string;
  total_amount: number;
  currency: string;
  departure_date: string | null;
  return_date: string | null;
  customer_id: string | null;
  package_id: string | null;
  quote_id: string | null;
  created_by: string | null;
};

type QuoteItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  kind: string;
  city?: string | null;
  category?: string | null;
  item_date?: string | null;
  check_out?: string | null;
  nights?: number | null;
  rooms?: number | null;
  meal_plan?: string | null;
  pax?: number | null;
  ways?: number | null;
  guide_type?: string | null;
  notes?: string | null;
};

const ITEM_FIELDS = "id,description,quantity,unit_price,total,kind,city,category,item_date,check_out,nights,rooms,meal_plan,pax,ways,guide_type,notes";

function diffNights(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return null;
  const n = Math.round((d2 - d1) / 86400000);
  return n > 0 ? n : null;
}

type Confirmation = {
  id?: string;
  booking_id: string;
  quote_item_id: string;
  status: string;
  proof_type: string | null;
  proof_storage_path: string | null;
  proof_text: string | null;
  proof_reference: string | null;
  proof_email_id?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
};

function BookingDetailPage() {
  const { bookingId } = Route.useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [confs, setConfs] = useState<Record<string, Confirmation>>({});
  const [vouchers, setVouchers] = useState<Record<string, { id: string; code: string }>>({});
  const [openVoucherId, setOpenVoucherId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    setLoading(true);
    const { data: b } = await supabase.from("bookings").select("*").eq("id", bookingId).maybeSingle();
    if (!b) { setLoading(false); return; }
    setBooking(b as Booking);
    if (b.customer_id) {
      const { data: c } = await supabase.from("customers").select("full_name").eq("id", b.customer_id).maybeSingle();
      setCustomerName(c?.full_name ?? "");
    }
    if (b.quote_id) {
      const { data: qi } = await supabase.from("quote_items").select(ITEM_FIELDS).eq("quote_id", b.quote_id).order("created_at", { ascending: true });
      setItems((qi ?? []) as QuoteItem[]);
    } else {
      setItems([]);
    }
    const { data: cfs } = await supabase.from("booking_item_confirmations").select("*").eq("booking_id", bookingId);
    const map: Record<string, Confirmation> = {};
    ((cfs ?? []) as Confirmation[]).forEach((c) => { map[c.quote_item_id] = c; });
    setConfs(map);
    const { data: vs } = await supabase.from("vouchers").select("id,code,quote_item_id").eq("booking_id", bookingId);
    const vMap: Record<string, { id: string; code: string }> = {};
    ((vs ?? []) as { id: string; code: string; quote_item_id: string | null }[]).forEach((v) => {
      if (v.quote_item_id) vMap[v.quote_item_id] = { id: v.id, code: v.code };
    });
    setVouchers(vMap);
    const { data: sup } = await supabase.from("suppliers").select("id,name").order("name");
    setSuppliers((sup ?? []) as { id: string; name: string }[]);
    // Invoice: by booking_id, fallback to quote_id
    let invNum: string | null = null;
    const { data: invByBooking } = await supabase.from("invoices").select("number").eq("booking_id", bookingId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (invByBooking?.number) invNum = invByBooking.number;
    else if (b.quote_id) {
      const { data: invByQuote } = await supabase.from("invoices").select("number").eq("quote_id", b.quote_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (invByQuote?.number) invNum = invByQuote.number;
    }
    setInvoiceNumber(invNum);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [bookingId]);

  const updateLocal = (itemId: string, patch: Partial<Confirmation>) => {
    setConfs((prev) => {
      const base: Confirmation = prev[itemId] ?? { booking_id: bookingId, quote_item_id: itemId, status: "pendente", proof_type: null, proof_storage_path: null, proof_text: null, proof_reference: null, proof_email_id: null };
      return { ...prev, [itemId]: { ...base, ...patch } };
    });
  };

  const persist = async (itemId: string, patch: Partial<Confirmation>) => {
    const merged = { ...(confs[itemId] ?? { booking_id: bookingId, quote_item_id: itemId, status: "pendente", proof_type: null, proof_storage_path: null, proof_text: null, proof_reference: null, proof_email_id: null }), ...patch };
    const { data, error } = await supabase
      .from("booking_item_confirmations")
      .upsert({
        booking_id: bookingId,
        quote_item_id: itemId,
        status: merged.status,
        proof_type: merged.proof_type,
        proof_storage_path: merged.proof_storage_path,
        proof_text: merged.proof_text,
        proof_reference: merged.proof_reference,
        proof_email_id: merged.proof_email_id ?? null,
        supplier_id: merged.supplier_id ?? null,
        supplier_name: merged.supplier_name ?? null,
        confirmed_at: merged.status === "confirmado" ? new Date().toISOString() : null,
        confirmed_by: merged.status === "confirmado" ? user?.id ?? null : null,
      } as never, { onConflict: "booking_id,quote_item_id" })
      .select()
      .single();
    if (error) { toast.error(error.message); return null; }
    setConfs((prev) => ({ ...prev, [itemId]: data as Confirmation }));
    return data as Confirmation;
  };

  const [associateItem, setAssociateItem] = useState<QuoteItem | null>(null);

  const handleProofPick = async (item: QuoteItem, p: ProofPick) => {
    if (p.type === "email") {
      await persist(item.id, {
        proof_type: "email",
        proof_reference: p.reference,
        proof_text: p.text,
        proof_email_id: p.email_id,
      });
      toast.success(t("saved"));
    } else {
      let storagePath: string | null = null;
      if (p.file) {
        if (p.file.size > 10 * 1024 * 1024) { toast.error("Max 10 MB"); return; }
        const ext = p.file.name.split(".").pop() || "bin";
        storagePath = `${bookingId}/${item.id}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("booking-proofs").upload(storagePath, p.file, { upsert: true });
        if (error) { toast.error(error.message); return; }
      }
      await persist(item.id, {
        proof_type: "whatsapp",
        proof_reference: p.phone,
        proof_text: p.text || null,
        ...(storagePath ? { proof_storage_path: storagePath } : {}),
      });
      toast.success(t("saved"));
    }
  };


  const onUpload = async (item: QuoteItem, file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10 MB"); return; }
    const ext = file.name.split(".").pop() || "bin";
    const path = `${bookingId}/${item.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("booking-proofs").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    await persist(item.id, { proof_storage_path: path });
    toast.success(t("saved"));
  };

  const downloadProof = async (path: string) => {
    const { data, error } = await supabase.storage.from("booking-proofs").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) { toast.error(error?.message ?? "Error"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const setStatus = async (item: QuoteItem, status: string) => {
    await persist(item.id, { status });
    toast.success(t("saved"));
  };

  const generateItemVoucher = async (item: QuoteItem) => {
    if (vouchers[item.id]) { setOpenVoucherId(vouchers[item.id].id); return; }
    const code = `VCH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data, error } = await supabase.from("vouchers").insert({
      booking_id: bookingId,
      quote_item_id: item.id,
      code,
      created_by: user?.id ?? null,
    } as never).select("id,code").single();
    if (error) { toast.error(error.message); return; }
    toast.success(t("voucherCreated"));
    const row = data as { id: string; code: string };
    setVouchers((prev) => ({ ...prev, [item.id]: { id: row.id, code: row.code } }));
    setOpenVoucherId(row.id);
  };

  const updateItemLocal = (itemId: string, patch: Partial<QuoteItem>) => {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  };

  const persistItem = async (itemId: string, patch: Partial<QuoteItem>) => {
    const current = items.find((i) => i.id === itemId);
    if (!current) return;
    const next: Partial<QuoteItem> = { ...patch };
    // Recalculate nights for hotels when dates change
    const itemDate = "item_date" in next ? next.item_date : current.item_date;
    const checkOut = "check_out" in next ? next.check_out : current.check_out;
    if (current.kind === "hotel" && ("item_date" in next || "check_out" in next)) {
      next.nights = diffNights(itemDate, checkOut);
    }
    // Recalculate total when qty/price change
    const qty = "quantity" in next ? Number(next.quantity ?? 0) : Number(current.quantity ?? 0);
    const price = "unit_price" in next ? Number(next.unit_price ?? 0) : Number(current.unit_price ?? 0);
    if ("quantity" in next || "unit_price" in next) {
      next.total = qty * price;
    }
    updateItemLocal(itemId, next);
    const { error } = await supabase.from("quote_items").update(next as never).eq("id", itemId);
    if (error) toast.error(error.message);
  };

  const addItem = async (kind: string) => {
    if (!booking?.quote_id) return;
    const { data, error } = await supabase
      .from("quote_items")
      .insert({ quote_id: booking.quote_id, kind, description: "", quantity: 1, unit_price: 0, total: 0 } as never)
      .select(ITEM_FIELDS)
      .single();
    if (error) { toast.error(error.message); return; }
    setItems((prev) => [...prev, data as QuoteItem]);
    toast.success(t("saved"));
  };

  const removeItem = async (item: QuoteItem) => {
    if (!confirm(t("removeItemConfirm"))) return;
    await supabase.from("vouchers").delete().eq("quote_item_id", item.id);
    await supabase.from("booking_item_confirmations").delete().eq("quote_item_id", item.id);
    const { error } = await supabase.from("quote_items").delete().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setVouchers((prev) => { const cp = { ...prev }; delete cp[item.id]; return cp; });
    setConfs((prev) => { const cp = { ...prev }; delete cp[item.id]; return cp; });
    toast.success(t("saved"));
  };

  const confirmedCount = useMemo(() => items.filter((i) => confs[i.id]?.status === "confirmado").length, [items, confs]);
  const allConfirmed = items.length > 0 && confirmedCount === items.length;

  const markBookingConfirmed = async () => {
    const { error } = await supabase.from("bookings").update({ status: "confirmada" as "pre_reserva" }).eq("id", bookingId);
    if (error) toast.error(error.message);
    else { toast.success(t("saved")); load(); }
  };

  const reopenBooking = async () => {
    if (!confirm(t("reopenBookingConfirm"))) return;
    const { error } = await supabase.from("bookings").update({ status: "pre_reserva" as "pre_reserva" }).eq("id", bookingId);
    if (error) toast.error(error.message);
    else { toast.success(t("saved")); load(); }
  };

  if (loading) return <div className="p-8 text-muted-foreground">{t("loading")}</div>;
  if (!booking) return <div className="p-8">{t("noData")}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/bookings" })}>
            <ArrowLeft className="mr-1 h-4 w-4" />{t("backToBookings")}
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{customerName || t("bookings")}</h1>
            <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
              {invoiceNumber ? (
                <Badge variant="outline" className="font-mono">{t("invoiceNumber")}: {invoiceNumber}</Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30" title={t("noInvoiceForBooking")}>{t("invoiceNumber")}: —</Badge>
              )}
              <span>·</span>
              <span>{booking.departure_date ?? "—"}</span>
              <span>·</span>
              <MaskedField module="bookings" field="total_amount" value={format(Number(booking.total_amount), booking.currency as "BRL")} />
              <span>·</span>
              <Badge variant="outline">{booking.status}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {allConfirmed && booking.status !== "confirmada" && (
            <Button onClick={markBookingConfirmed}><CheckCircle2 className="mr-2 h-4 w-4" />{t("markBookingConfirmed")}</Button>
          )}
          {booking.status === "confirmada" && (
            <Button variant="outline" onClick={reopenBooking}><RotateCcw className="mr-2 h-4 w-4" />{t("reopenBooking")}</Button>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{confirmedCount} / {items.length} {t("itemsConfirmed")}</span>
            <span className="text-muted-foreground">{Math.round((confirmedCount / items.length) * 100)}%</span>
          </div>
          <Progress value={(confirmedCount / items.length) * 100} />
        </Card>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">{t("bookingItems")}</h2>
        {booking.quote_id && (
          <div className="flex items-center gap-2">
            <Select onValueChange={(v) => addItem(v)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder={t("selectKind")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hotel">Hotel</SelectItem>
                <SelectItem value="service">Serviço</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="tour">Tour</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => addItem("service")}>
              <Plus className="mr-1 h-4 w-4" />{t("addItem")}
            </Button>
          </div>
        )}
      </div>

      {!booking.quote_id ? (
        <Card className="p-6 text-sm text-muted-foreground">{t("noQuoteLinked")}</Card>
      ) : items.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">{t("noData")}</Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const c = confs[item.id];
            const status = c?.status ?? "pendente";
            const statusBadge = status === "confirmado" ? "bg-emerald-500/10 text-emerald-700"
              : status === "cancelado" ? "bg-red-500/10 text-red-700"
              : "bg-amber-500/10 text-amber-700";
            const isHotel = item.kind === "hotel";
            const isService = item.kind === "service" || item.kind === "transfer" || item.kind === "tour";
            return (
              <Card key={item.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="uppercase text-[10px]">{item.kind}</Badge>
                      <Input
                        className="font-medium border-0 px-0 focus-visible:ring-0 h-7"
                        value={item.description ?? ""}
                        onChange={(e) => updateItemLocal(item.id, { description: e.target.value })}
                        onBlur={(e) => persistItem(item.id, { description: e.target.value })}
                        placeholder={t("description")}
                      />
                    </div>
                  </div>
                  <Badge variant="outline" className={statusBadge}>
                    {status === "confirmado" ? t("confirmed") : status === "cancelado" ? t("canceled") : t("pending")}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => removeItem(item)} title={t("removeItem")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">{t("city")}</Label>
                    <Input value={item.city ?? ""} onChange={(e) => updateItemLocal(item.id, { city: e.target.value })} onBlur={(e) => persistItem(item.id, { city: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">{t("category")}</Label>
                    <Input value={item.category ?? ""} onChange={(e) => updateItemLocal(item.id, { category: e.target.value })} onBlur={(e) => persistItem(item.id, { category: e.target.value })} />
                  </div>
                  {isHotel ? (
                    <>
                      <div>
                        <Label className="text-xs">{t("checkIn")}</Label>
                        <Input type="date" value={item.item_date ?? ""} onChange={(e) => persistItem(item.id, { item_date: e.target.value || null })} />
                      </div>
                      <div>
                        <Label className="text-xs">{t("checkOut")}</Label>
                        <Input type="date" value={item.check_out ?? ""} onChange={(e) => persistItem(item.id, { check_out: e.target.value || null })} />
                      </div>
                      <div>
                        <Label className="text-xs">{t("nights")}</Label>
                        <Input type="number" min={0} value={item.nights ?? ""} onChange={(e) => updateItemLocal(item.id, { nights: e.target.value === "" ? null : Number(e.target.value) })} onBlur={(e) => persistItem(item.id, { nights: e.target.value === "" ? null : Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label className="text-xs">{t("rooms")}</Label>
                        <Input type="number" min={0} value={item.rooms ?? ""} onChange={(e) => updateItemLocal(item.id, { rooms: e.target.value === "" ? null : Number(e.target.value) })} onBlur={(e) => persistItem(item.id, { rooms: e.target.value === "" ? null : Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label className="text-xs">{t("mealPlan")}</Label>
                        <Input value={item.meal_plan ?? ""} onChange={(e) => updateItemLocal(item.id, { meal_plan: e.target.value })} onBlur={(e) => persistItem(item.id, { meal_plan: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">{t("pax")}</Label>
                        <Input type="number" min={0} value={item.pax ?? ""} onChange={(e) => updateItemLocal(item.id, { pax: e.target.value === "" ? null : Number(e.target.value) })} onBlur={(e) => persistItem(item.id, { pax: e.target.value === "" ? null : Number(e.target.value) })} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label className="text-xs">{t("itemDate")}</Label>
                        <Input type="date" value={item.item_date ?? ""} onChange={(e) => persistItem(item.id, { item_date: e.target.value || null })} />
                      </div>
                      <div>
                        <Label className="text-xs">{t("pax")}</Label>
                        <Input type="number" min={0} value={item.pax ?? ""} onChange={(e) => updateItemLocal(item.id, { pax: e.target.value === "" ? null : Number(e.target.value) })} onBlur={(e) => persistItem(item.id, { pax: e.target.value === "" ? null : Number(e.target.value) })} />
                      </div>
                      {isService && (
                        <>
                          <div>
                            <Label className="text-xs">{t("ways")}</Label>
                            <Input type="number" min={0} value={item.ways ?? ""} onChange={(e) => updateItemLocal(item.id, { ways: e.target.value === "" ? null : Number(e.target.value) })} onBlur={(e) => persistItem(item.id, { ways: e.target.value === "" ? null : Number(e.target.value) })} />
                          </div>
                          <div>
                            <Label className="text-xs">{t("guideType")}</Label>
                            <Input value={item.guide_type ?? ""} onChange={(e) => updateItemLocal(item.id, { guide_type: e.target.value })} onBlur={(e) => persistItem(item.id, { guide_type: e.target.value })} />
                          </div>
                        </>
                      )}
                    </>
                  )}
                  <div>
                    <Label className="text-xs">{t("quantity")}</Label>
                    <Input type="number" min={0} value={item.quantity ?? 0} onChange={(e) => updateItemLocal(item.id, { quantity: Number(e.target.value) })} onBlur={(e) => persistItem(item.id, { quantity: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-xs">{t("unitPrice")}</Label>
                    <Input type="number" step="0.01" min={0} value={item.unit_price ?? 0} onChange={(e) => updateItemLocal(item.id, { unit_price: Number(e.target.value) })} onBlur={(e) => persistItem(item.id, { unit_price: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-xs">{t("totalToPay")}</Label>
                    <div className="h-9 flex items-center text-sm font-medium">
                      <MaskedField module="quotes" field="total_amount" value={format(Number(item.total ?? 0), booking.currency as "BRL")} />
                    </div>
                  </div>
                </div>

                <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide">Fornecedor</Label>
                  <ComboboxAutocomplete
                    options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                    value={c?.supplier_id ?? (c?.supplier_name ?? "")}
                    allowCustom
                    placeholder="Selecione ou digite o fornecedor…"
                    searchPlaceholder="Buscar fornecedor…"
                    emptyMessage="Nenhum fornecedor cadastrado."
                    onChange={(v) => {
                      const match = suppliers.find((s) => s.id === v);
                      const patch: Partial<Confirmation> = match
                        ? { supplier_id: match.id, supplier_name: match.name }
                        : { supplier_id: null, supplier_name: v ? (v.trim() || null) : null };
                      updateLocal(item.id, patch);
                      persist(item.id, patch);
                    }}
                  />
                </div>

                <div>
                  <Label className="text-xs">{t("notes")}</Label>
                  <Textarea rows={2} value={item.notes ?? ""} onChange={(e) => updateItemLocal(item.id, { notes: e.target.value })} onBlur={(e) => persistItem(item.id, { notes: e.target.value })} />
                </div>


                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">{t("proofType")}</Label>
                    <Select value={c?.proof_type ?? ""} onValueChange={(v) => { updateLocal(item.id, { proof_type: v }); persist(item.id, { proof_type: v }); }}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">{t("proofEmail")}</SelectItem>
                        <SelectItem value="whatsapp">{t("proofWhatsapp")}</SelectItem>
                        <SelectItem value="outro">{t("proofOther")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">{t("proofReference")}</Label>
                    <Input
                      value={c?.proof_reference ?? ""}
                      onChange={(e) => updateLocal(item.id, { proof_reference: e.target.value })}
                      onBlur={(e) => persist(item.id, { proof_reference: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">{t("proofContent")}</Label>
                  <Textarea
                    rows={3}
                    value={c?.proof_text ?? ""}
                    onChange={(e) => updateLocal(item.id, { proof_text: e.target.value })}
                    onBlur={(e) => persist(item.id, { proof_text: e.target.value })}
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.eml,.txt"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(item, f); e.target.value = ""; }}
                    />
                    <Button asChild variant="outline" size="sm"><span><Paperclip className="mr-1 h-4 w-4" />{t("attachProof")}</span></Button>
                  </label>
                  <Button size="sm" variant="outline" onClick={() => setAssociateItem(item)}>
                    <Link2 className="mr-1 h-4 w-4" />{t("associate")}
                  </Button>
                  {c?.proof_storage_path && (
                    <Button size="sm" variant="ghost" onClick={() => downloadProof(c.proof_storage_path!)}>
                      <Download className="mr-1 h-4 w-4" />{t("downloadProof")}
                    </Button>
                  )}
                  {c?.proof_email_id && (
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-700">
                      <Mail className="mr-1 h-3 w-3" />{t("emailLinkedBadge")}
                    </Badge>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {status !== "confirmado" ? (
                      <Button size="sm" onClick={() => setStatus(item, "confirmado")}>
                        <CheckCircle2 className="mr-1 h-4 w-4" />{t("confirmItem")}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setStatus(item, "pendente")}>
                        <RotateCcw className="mr-1 h-4 w-4" />{t("reopenItem")}
                      </Button>
                    )}
                    {status === "pendente" ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(item, "cancelado")}>
                        <XCircle className="mr-1 h-4 w-4" />{t("cancelItem")}
                      </Button>
                    ) : status === "cancelado" ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(item, "pendente")}>
                        <RotateCcw className="mr-1 h-4 w-4" />{t("revertToPending")}
                      </Button>
                    ) : null}
                    {status === "confirmado" && (
                      vouchers[item.id] ? (
                        <Button size="sm" variant="secondary" onClick={() => setOpenVoucherId(vouchers[item.id].id)}>
                          <Ticket className="mr-1 h-4 w-4" />{t("openVoucher")}
                          <span className="ml-2 text-xs opacity-70">{vouchers[item.id].code}</span>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => generateItemVoucher(item)}>
                          <Ticket className="mr-1 h-4 w-4" />{t("generateVoucher")}
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ProofAssociateDialog
        open={!!associateItem}
        onOpenChange={(v) => !v && setAssociateItem(null)}
        customerId={booking.customer_id}
        onPick={(p) => { if (associateItem) handleProofPick(associateItem, p); }}
      />

      <VoucherDialog
        voucherId={openVoucherId}
        open={!!openVoucherId}
        onOpenChange={(v) => !v && setOpenVoucherId(null)}
      />
    </div>
  );
}
