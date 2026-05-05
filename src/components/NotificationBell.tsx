import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CalendarCheck, FileCheck, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
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

  const total = quotes.length + bookings.length;
  const fmt = (n: number, c: string) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(n);
    } catch {
      return `${c} ${n.toFixed(2)}`;
    }
  };

  return (
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
                      <Link
                        key={q.id}
                        to="/workspace"
                        search={q.lead_id ? { lead: q.lead_id } : {}}
                        onClick={() => setOpen(false)}
                        className="block p-2 rounded hover:bg-muted text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-muted-foreground">#{q.id.slice(0, 8)}</span>
                          <span className="font-semibold">{fmt(Number(q.total_amount), q.currency)}</span>
                        </div>
                        <div className="text-muted-foreground">
                          {new Date(q.created_at).toLocaleDateString()}
                        </div>
                      </Link>
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
                      <Link
                        key={b.id}
                        to="/bookings"
                        onClick={() => setOpen(false)}
                        className="block p-2 rounded hover:bg-muted text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-muted-foreground">#{b.id.slice(0, 8)}</span>
                          <span className="font-semibold">{fmt(Number(b.total_amount), b.currency)}</span>
                        </div>
                        <div className="text-muted-foreground capitalize">
                          {b.status.replace("_", " ")}
                          {b.departure_date && ` · ${new Date(b.departure_date).toLocaleDateString()}`}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
