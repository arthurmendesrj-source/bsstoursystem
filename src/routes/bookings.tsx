import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Ticket } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useViewAs } from "@/lib/viewAs";
import { useCurrency } from "@/lib/currency";
import { Can, MaskedField, usePermissions } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/bookings")({
  component: () => (
    <AuthGate>
      <AppShell>
        <BookingsPage />
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
  voucher_code?: string | null;
  invoice_number?: string | null;
};

const STATUSES = ["pre_reserva", "confirmada", "em_viagem", "concluida", "cancelada"];

function BookingsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { viewAs } = useViewAs();
  const targetUserId = viewAs?.user_id ?? null;
  const { format } = useCurrency();
  const { can } = usePermissions();
  const [rows, setRows] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<{ id: string; full_name: string }[]>([]);
  const [pkgs, setPkgs] = useState<{ id: string; name: string; base_price: number; base_currency: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customer_id: "", package_id: "", total_amount: "", currency: "BRL",
    departure_date: "", return_date: "", status: "pre_reserva",
  });

  const load = async () => {
    let bookingsQ = supabase.from("bookings").select("*").order("created_at", { ascending: false });
    if (targetUserId) bookingsQ = bookingsQ.eq("created_by", targetUserId);
    const [b, c, p, v] = await Promise.all([
      bookingsQ,
      supabase.from("customers").select("id,full_name").order("full_name"),
      supabase.from("packages").select("id,name,base_price,base_currency").eq("active", true),
      supabase.from("vouchers").select("booking_id,code"),
    ]);
    const voucherMap = new Map<string, string>();
    ((v.data ?? []) as { booking_id: string; code: string }[]).forEach((row) => voucherMap.set(row.booking_id, row.code));
    const ids = ((b.data ?? []) as Booking[]).map((bk) => bk.id);
    let invMap = new Map<string, string>();
    if (ids.length) {
      const inv = await supabase.from("invoices").select("booking_id,number,created_at").in("booking_id", ids).order("created_at", { ascending: false });
      ((inv.data ?? []) as { booking_id: string; number: string | null }[]).forEach((row) => {
        if (row.booking_id && row.number && !invMap.has(row.booking_id)) invMap.set(row.booking_id, row.number);
      });
    }
    const bookings = ((b.data ?? []) as Booking[]).map((bk) => ({
      ...bk,
      voucher_code: voucherMap.get(bk.id) ?? null,
      invoice_number: invMap.get(bk.id) ?? null,
    }));
    setRows(bookings);
    setCustomers(c.data ?? []);
    setPkgs(p.data ?? []);
  };
  useEffect(() => { load(); }, [targetUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("bookings").insert({
      customer_id: form.customer_id || null,
      package_id: form.package_id || null,
      total_amount: Number(form.total_amount || 0),
      currency: form.currency as "BRL",
      departure_date: form.departure_date || null,
      return_date: form.return_date || null,
      status: form.status as "pre_reserva",
      created_by: user.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(t("saved"));
      setOpen(false);
      setForm({ customer_id: "", package_id: "", total_amount: "", currency: "BRL", departure_date: "", return_date: "", status: "pre_reserva" });
      load();
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("bookings").update({ status: status as "pre_reserva" }).eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  const generateVoucher = async (b: Booking) => {
    if (b.voucher_code) { toast.info(t("voucherAlreadyExists")); return; }
    // Build a simple sequential code: V + YYMMDD + first 4 chars of booking id
    const dt = new Date();
    const yymmdd = `${String(dt.getFullYear()).slice(2)}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}`;
    const code = `V${yymmdd}${b.id.slice(0, 4).toUpperCase()}`;
    const itinerary = [
      b.departure_date ? `${t("departureDate")}: ${b.departure_date}` : null,
      b.return_date ? `Retorno: ${b.return_date}` : null,
      pkgName(b.package_id) !== "—" ? `${t("packages")}: ${pkgName(b.package_id)}` : null,
    ].filter(Boolean).join("\n");
    const { error } = await supabase.from("vouchers").insert({
      booking_id: b.id,
      code,
      itinerary: itinerary || null,
    });
    if (error) toast.error(error.message);
    else { toast.success(t("voucherCreated")); load(); }
  };

  const customerName = (id: string | null) => customers.find((c) => c.id === id)?.full_name ?? "—";
  const pkgName = (id: string | null) => pkgs.find((p) => p.id === id)?.name ?? "—";

  const statusColor = (s: string) =>
    s === "confirmada" ? "bg-emerald-500/10 text-emerald-700" :
    s === "cancelada" ? "bg-red-500/10 text-red-700" :
    s === "em_viagem" ? "bg-blue-500/10 text-blue-700" :
    s === "concluida" ? "bg-slate-500/10 text-slate-700" :
    "bg-amber-500/10 text-amber-700";

  if (!can("bookings", "view")) {
    return <Card className="p-12 text-center text-muted-foreground">Sem permissão para visualizar Reservas</Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("bookings")}</h1>
          <p className="text-muted-foreground">{rows.length}</p>
        </div>
        <Can module="bookings" action="create">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />{t("new")}</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{t("new")} {t("bookings")}</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label>{t("customers")}</Label>
                <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("packages")}</Label>
                <Select value={form.package_id} onValueChange={(v) => {
                  const p = pkgs.find((x) => x.id === v);
                  setForm({ ...form, package_id: v, total_amount: p ? String(p.base_price) : form.total_amount, currency: p?.base_currency ?? form.currency });
                }}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{pkgs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("departureDate")}</Label><Input type="date" value={form.departure_date} onChange={(e) => setForm({ ...form, departure_date: e.target.value })} /></div>
                <div><Label>Retorno</Label><Input type="date" value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("price")}</Label><Input type="number" step="0.01" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} /></div>
                <div>
                  <Label>{t("currency")}</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="BRL">BRL</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t("status")}</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">{t("save")}</Button>
            </form>
          </DialogContent>
        </Dialog>
        </Can>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("customers")}</TableHead>
              <TableHead>{t("packages")}</TableHead>
              <TableHead>{t("departureDate")}</TableHead>
              <TableHead>{t("price")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="text-right">Voucher</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>
            ) : rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{customerName(b.customer_id)}</TableCell>
                <TableCell>{pkgName(b.package_id)}</TableCell>
                <TableCell>{b.departure_date ?? "—"}</TableCell>
                <TableCell>
                  <MaskedField module="bookings" field="total_amount" value={format(Number(b.total_amount), b.currency as "BRL")} />
                </TableCell>
                <TableCell>
                  <Select value={b.status} onValueChange={(v) => updateStatus(b.id, v)} disabled={!can("bookings", "edit")}>
                    <SelectTrigger className="h-8 w-36">
                      <Badge variant="outline" className={statusColor(b.status)}>{b.status}</Badge>
                    </SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  {b.voucher_code ? (
                    <Badge variant="outline" className="font-mono">{b.voucher_code}</Badge>
                  ) : b.status === "confirmada" || b.status === "em_viagem" || b.status === "concluida" ? (
                    <Button size="sm" variant="outline" onClick={() => generateVoucher(b)}>
                      <Ticket className="h-3.5 w-3.5 mr-1" />{t("generateVoucher")}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/bookings/$bookingId" params={{ bookingId: b.id }}>{t("openBooking")}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
