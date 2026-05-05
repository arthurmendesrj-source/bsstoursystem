import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, XCircle, Paperclip, Download, RotateCcw } from "lucide-react";
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
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
};

type Confirmation = {
  id?: string;
  booking_id: string;
  quote_item_id: string;
  status: string;
  proof_type: string | null;
  proof_storage_path: string | null;
  proof_text: string | null;
  proof_reference: string | null;
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
  const [customerName, setCustomerName] = useState<string>("");
  const [loading, setLoading] = useState(true);

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
      const { data: qi } = await supabase.from("quote_items").select("id,description,quantity,unit_price,total,kind").eq("quote_id", b.quote_id).order("created_at", { ascending: true });
      setItems((qi ?? []) as QuoteItem[]);
    } else {
      setItems([]);
    }
    const { data: cfs } = await supabase.from("booking_item_confirmations").select("*").eq("booking_id", bookingId);
    const map: Record<string, Confirmation> = {};
    ((cfs ?? []) as Confirmation[]).forEach((c) => { map[c.quote_item_id] = c; });
    setConfs(map);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [bookingId]);

  const updateLocal = (itemId: string, patch: Partial<Confirmation>) => {
    setConfs((prev) => {
      const base: Confirmation = prev[itemId] ?? { booking_id: bookingId, quote_item_id: itemId, status: "pendente", proof_type: null, proof_storage_path: null, proof_text: null, proof_reference: null };
      return { ...prev, [itemId]: { ...base, ...patch } };
    });
  };

  const persist = async (itemId: string, patch: Partial<Confirmation>) => {
    const merged = { ...(confs[itemId] ?? { booking_id: bookingId, quote_item_id: itemId, status: "pendente", proof_type: null, proof_storage_path: null, proof_text: null, proof_reference: null }), ...patch };
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
        confirmed_at: merged.status === "confirmado" ? new Date().toISOString() : null,
        confirmed_by: merged.status === "confirmado" ? user?.id ?? null : null,
      }, { onConflict: "booking_id,quote_item_id" })
      .select()
      .single();
    if (error) { toast.error(error.message); return null; }
    setConfs((prev) => ({ ...prev, [itemId]: data as Confirmation }));
    return data as Confirmation;
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

  const confirmedCount = useMemo(() => items.filter((i) => confs[i.id]?.status === "confirmado").length, [items, confs]);
  const allConfirmed = items.length > 0 && confirmedCount === items.length;

  const markBookingConfirmed = async () => {
    const { error } = await supabase.from("bookings").update({ status: "confirmada" as "pre_reserva" }).eq("id", bookingId);
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
            <p className="text-sm text-muted-foreground">
              {booking.departure_date ?? "—"} · {format(Number(booking.total_amount), booking.currency as "BRL")} · <Badge variant="outline">{booking.status}</Badge>
            </p>
          </div>
        </div>
        {allConfirmed && booking.status !== "confirmada" && (
          <Button onClick={markBookingConfirmed}><CheckCircle2 className="mr-2 h-4 w-4" />{t("markBookingConfirmed")}</Button>
        )}
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

      <h2 className="text-lg font-semibold">{t("bookingItems")}</h2>

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
            return (
              <Card key={item.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium">{item.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.kind} · {t("quantity") || "Qtd"}: {item.quantity} · {format(Number(item.total), booking.currency as "BRL")}
                    </div>
                  </div>
                  <Badge variant="outline" className={statusBadge}>
                    {status === "confirmado" ? t("confirmed") : status === "cancelado" ? t("canceled") : t("pending")}
                  </Badge>
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
                  {c?.proof_storage_path && (
                    <Button size="sm" variant="ghost" onClick={() => downloadProof(c.proof_storage_path!)}>
                      <Download className="mr-1 h-4 w-4" />{t("downloadProof")}
                    </Button>
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
                    {status !== "cancelado" ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(item, "cancelado")}>
                        <XCircle className="mr-1 h-4 w-4" />{t("cancelItem")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
