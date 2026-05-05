import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, AlertTriangle, Bell, CalendarCheck, FileCheck, Loader2, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useLeadAlerts } from "@/lib/useLeadAlerts";
import { cn } from "@/lib/utils";

type PendingQuote = {
  id: string;
  total_amount: number;
  currency: string;
  created_at: string;
  lead_id: string | null;
  customer_id: string | null;
};
type PendingBooking = {
  id: string;
  total_amount: number;
  currency: string;
  status: string;
  departure_date: string | null;
  return_date: string | null;
  package_id: string | null;
};

export function NotificationBell() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [quotes, setQuotes] = useState<PendingQuote[]>([]);
  const [bookings, setBookings] = useState<PendingBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [quoteDialog, setQuoteDialog] = useState<PendingQuote | null>(null);
  const [quoteForm, setQuoteForm] = useState({ departure: "", ret: "" });
  const [bookingDialog, setBookingDialog] = useState<PendingBooking | null>(null);
  const [voucherForm, setVoucherForm] = useState({ code: "", itinerary: "", emergency: "" });

  const load = useCallback(async () => {
    setLoading(true);
    // Approved quotes
    const { data: qs } = await supabase
      .from("quotes")
      .select("id,total_amount,currency,created_at,lead_id,customer_id")
      .eq("status", "aprovada")
      .order("created_at", { ascending: false });
    // Bookings tied to those quotes
    const { data: bks } = await supabase
      .from("bookings")
      .select("id,total_amount,currency,status,departure_date,return_date,package_id,quote_id");
    // Vouchers
    const { data: vs } = await supabase.from("vouchers").select("booking_id");

    const bookedQuoteIds = new Set(
      ((bks ?? []) as { quote_id: string | null }[])
        .map((b) => b.quote_id)
        .filter((x): x is string => Boolean(x)),
    );
    const voucherBookingIds = new Set(
      ((vs ?? []) as { booking_id: string }[]).map((v) => v.booking_id),
    );

    const pendingQuotes = ((qs ?? []) as PendingQuote[]).filter(
      (q) => !bookedQuoteIds.has(q.id),
    );
    const eligibleStatuses = new Set(["confirmada", "em_viagem", "concluida"]);
    const pendingBookings = ((bks ?? []) as PendingBooking[]).filter(
      (b) => eligibleStatuses.has(b.status) && !voucherBookingIds.has(b.id),
    );

    setQuotes(pendingQuotes);
    setBookings(pendingBookings);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const openQuoteDialog = async (q: PendingQuote) => {
    const { data: its } = await supabase
      .from("quote_items").select("item_date,check_out").eq("quote_id", q.id);
    const dates = ((its ?? []) as { item_date: string | null; check_out: string | null }[])
      .flatMap((it) => [it.item_date, it.check_out])
      .filter((d): d is string => Boolean(d)).sort();
    setQuoteForm({ departure: dates[0] ?? "", ret: dates[dates.length - 1] ?? dates[0] ?? "" });
    setQuoteDialog(q);
  };

  const convertQuote = async () => {
    const q = quoteDialog;
    if (!q) return;
    setBusyId(q.id);
    try {
      const { data: existing } = await supabase
        .from("bookings").select("id").eq("quote_id", q.id).maybeSingle();
      if (existing) { toast.info(t("alreadyConverted")); setQuoteDialog(null); load(); return; }
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return;
      const { error } = await supabase.from("bookings").insert({
        lead_id: q.lead_id, customer_id: q.customer_id, quote_id: q.id,
        total_amount: q.total_amount, currency: q.currency as "BRL",
        departure_date: quoteForm.departure || null,
        return_date: quoteForm.ret || quoteForm.departure || null,
        status: "pre_reserva", created_by: uid,
      });
      if (error) toast.error(error.message);
      else { toast.success(t("bookingCreated")); setQuoteDialog(null); load(); }
    } finally {
      setBusyId(null);
    }
  };

  const openBookingDialog = (b: PendingBooking) => {
    const dt = new Date();
    const yymmdd = `${String(dt.getFullYear()).slice(2)}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}`;
    const code = `V${yymmdd}${b.id.slice(0, 4).toUpperCase()}`;
    const itinerary = [
      b.departure_date ? `${t("departureDate")}: ${b.departure_date}` : null,
      b.return_date ? `Retorno: ${b.return_date}` : null,
    ].filter(Boolean).join("\n");
    setVoucherForm({ code, itinerary, emergency: "" });
    setBookingDialog(b);
  };

  const generateVoucher = async () => {
    const b = bookingDialog;
    if (!b) return;
    setBusyId(b.id);
    try {
      const { error } = await supabase.from("vouchers").insert({
        booking_id: b.id,
        code: voucherForm.code,
        itinerary: voucherForm.itinerary || null,
        emergency_contact: voucherForm.emergency || null,
      });
      if (error) toast.error(error.message);
      else { toast.success(t("voucherCreated")); setBookingDialog(null); load(); }
    } finally {
      setBusyId(null);
    }
  };


  const total = quotes.length + bookings.length;
  const fmt = (n: number, c: string) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(n);
    } catch {
      return `${c} ${n.toFixed(2)}`;
    }
  };

  return (
    <>
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {total > 0 && (
            <Badge
              variant="destructive"
              className={cn(
                "absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
              )}
            >
              {total > 9 ? "9+" : total}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="px-4 py-3 border-b">
          <div className="font-semibold text-sm">{t("notifications")}</div>
          <div className="text-xs text-muted-foreground">
            {loading ? t("loading") : `${total} ${t("pendingItems")}`}
          </div>
        </div>
        <ScrollArea className="max-h-96">
          {total === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("nothingPending")}
            </div>
          ) : (
            <div className="divide-y">
              {quotes.length > 0 && (
                <div className="px-4 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
                    <FileCheck className="h-3 w-3" />
                    {t("approvedNoBooking")} · {quotes.length}
                  </div>
                  <div className="space-y-1.5">
                    {quotes.map((q) => (
                      <div key={q.id} className="p-2 rounded hover:bg-muted text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            to="/workspace"
                            search={q.lead_id ? { lead: q.lead_id } : {}}
                            onClick={() => setOpen(false)}
                            className="flex-1 min-w-0 flex items-center justify-between gap-2"
                          >
                            <span className="font-mono text-muted-foreground">#{q.id.slice(0, 8)}</span>
                            <span className="font-semibold">{fmt(Number(q.total_amount), q.currency)}</span>
                          </Link>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">{new Date(q.created_at).toLocaleDateString()}</span>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={busyId !== null} onClick={() => openQuoteDialog(q)}>
                            {busyId === q.id
                              ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              : <CalendarCheck className="h-3 w-3 mr-1" />}
                            {t("convertToBooking")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {bookings.length > 0 && (
                <div className="px-4 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
                    <Ticket className="h-3 w-3" />
                    {t("confirmedNoVoucher")} · {bookings.length}
                  </div>
                  <div className="space-y-1.5">
                    {bookings.map((b) => (
                      <div key={b.id} className="p-2 rounded hover:bg-muted text-xs space-y-1.5">
                        <Link
                          to="/bookings"
                          onClick={() => setOpen(false)}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="font-mono text-muted-foreground">#{b.id.slice(0, 8)}</span>
                          <span className="font-semibold">{fmt(Number(b.total_amount), b.currency)}</span>
                        </Link>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground capitalize">
                            {b.status.replace("_", " ")}
                            {b.departure_date && ` · ${new Date(b.departure_date).toLocaleDateString()}`}
                          </span>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={busyId !== null} onClick={() => openBookingDialog(b)}>
                            {busyId === b.id
                              ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              : <Ticket className="h-3 w-3 mr-1" />}
                            {t("generateVoucher")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>

    <Dialog open={!!quoteDialog} onOpenChange={(o) => { if (!o && busyId === null) setQuoteDialog(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("convertToBooking")}</DialogTitle>
          <DialogDescription>{t("convertQuoteConfirm")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="dep">{t("departureDate")}</Label>
            <Input id="dep" type="date" value={quoteForm.departure}
              onChange={(e) => setQuoteForm((f) => ({ ...f, departure: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ret">Retorno</Label>
            <Input id="ret" type="date" value={quoteForm.ret}
              onChange={(e) => setQuoteForm((f) => ({ ...f, ret: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setQuoteDialog(null)} disabled={busyId !== null}>{t("cancel")}</Button>
          <Button onClick={convertQuote} disabled={busyId !== null}>
            {busyId === quoteDialog?.id && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t("convertToBooking")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!bookingDialog} onOpenChange={(o) => { if (!o && busyId === null) setBookingDialog(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("generateVoucher")}</DialogTitle>
          <DialogDescription>{t("generateVoucherConfirm")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="vcode">Código</Label>
            <Input id="vcode" value={voucherForm.code}
              onChange={(e) => setVoucherForm((f) => ({ ...f, code: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vit">Roteiro</Label>
            <Textarea id="vit" rows={5} value={voucherForm.itinerary}
              onChange={(e) => setVoucherForm((f) => ({ ...f, itinerary: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vem">Contato de emergência</Label>
            <Input id="vem" value={voucherForm.emergency}
              onChange={(e) => setVoucherForm((f) => ({ ...f, emergency: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBookingDialog(null)} disabled={busyId !== null}>{t("cancel")}</Button>
          <Button onClick={generateVoucher} disabled={busyId !== null || !voucherForm.code}>
            {busyId === bookingDialog?.id && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t("generateVoucher")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
