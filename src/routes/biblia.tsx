import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Download, X } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/biblia")({
  component: () => (
    <AuthGate>
      <AppShell>
        <BibliaPage />
      </AppShell>
    </AuthGate>
  ),
});

type Row = {
  item_id: string;
  booking_id: string;
  customer_name: string | null;
  kind: string;
  description: string;
  city: string | null;
  item_date: string | null;
  check_out: string | null;
  pax: number | null;
  quantity: number;
  total: number;
  currency: string;
  status: string;
};

function statusBadge(s: string) {
  if (s === "confirmado") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30";
  if (s === "cancelado") return "bg-red-500/10 text-red-700 border-red-500/30";
  return "bg-amber-500/10 text-amber-700 border-amber-500/30";
}

function BibliaPage() {
  const { t } = useI18n();
  const { format: fmtCurrency } = useCurrency();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, quote_id, currency, customer_id");
      const quoteIds = (bookings ?? []).map((b) => b.quote_id).filter(Boolean) as string[];
      const customerIds = Array.from(new Set((bookings ?? []).map((b) => b.customer_id).filter(Boolean) as string[]));
      const bookingIds = (bookings ?? []).map((b) => b.id);

      const [{ data: items }, { data: customers }, { data: confs }] = await Promise.all([
        quoteIds.length
          ? supabase.from("quote_items").select("id, quote_id, kind, description, city, item_date, check_out, pax, quantity, total").in("quote_id", quoteIds)
          : Promise.resolve({ data: [] as any[] }),
        customerIds.length
          ? supabase.from("customers").select("id, full_name").in("id", customerIds)
          : Promise.resolve({ data: [] as any[] }),
        bookingIds.length
          ? supabase.from("booking_item_confirmations").select("booking_id, quote_item_id, status").in("booking_id", bookingIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const custMap = new Map((customers ?? []).map((c: any) => [c.id, c.full_name]));
      const bookingByQuote = new Map<string, any>();
      (bookings ?? []).forEach((b: any) => { if (b.quote_id) bookingByQuote.set(b.quote_id, b); });
      const confMap = new Map<string, string>();
      (confs ?? []).forEach((c: any) => confMap.set(`${c.booking_id}:${c.quote_item_id}`, c.status));

      const out: Row[] = [];
      (items ?? []).forEach((it: any) => {
        const b = bookingByQuote.get(it.quote_id);
        if (!b) return;
        out.push({
          item_id: it.id,
          booking_id: b.id,
          customer_name: b.customer_id ? (custMap.get(b.customer_id) as string) ?? null : null,
          kind: it.kind ?? "service",
          description: it.description ?? "",
          city: it.city,
          item_date: it.item_date,
          check_out: it.check_out,
          pax: it.pax,
          quantity: it.quantity ?? 1,
          total: Number(it.total ?? 0),
          currency: b.currency,
          status: confMap.get(`${b.id}:${it.id}`) ?? "pendente",
        });
      });
      out.sort((a, b) => (b.item_date ?? "").localeCompare(a.item_date ?? ""));
      setRows(out);
      setLoading(false);
    })();
  }, []);

  const kinds = useMemo(() => Array.from(new Set(rows.map((r) => r.kind))).sort(), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const fromS = from ? format(from, "yyyy-MM-dd") : null;
    const toS = to ? format(to, "yyyy-MM-dd") : null;
    return rows.filter((r) => {
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (fromS && (r.item_date ?? "") < fromS) return false;
      if (toS && (r.item_date ?? "") > toS) return false;
      if (s) {
        const hay = `${r.description} ${r.city ?? ""} ${r.customer_name ?? ""} ${r.booking_id}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, kindFilter, statusFilter, from, to, search]);

  const exportCsv = () => {
    const header = ["Reserva", "Cliente", "Tipo", "Descrição", "Cidade", "Data", "Check-out", "Pax", "Qtd", "Valor", "Moeda", "Status"];
    const lines = filtered.map((r) => [
      r.booking_id.slice(0, 8),
      r.customer_name ?? "",
      r.kind,
      r.description.replaceAll(",", " "),
      r.city ?? "",
      r.item_date ?? "",
      r.check_out ?? "",
      r.pax ?? "",
      r.quantity,
      r.total,
      r.currency,
      r.status,
    ].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `biblia-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setKindFilter("all");
    setStatusFilter("all");
    setFrom(undefined);
    setTo(undefined);
    setSearch("");
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("bibliaTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("bibliaIntro")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("filters") || "Filtros"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <Label className="text-xs">{t("search") || "Buscar"}</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="..." />
            </div>
            <div>
              <Label className="text-xs">{t("filterServiceType")}</Label>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("all") || "Todos"}</SelectItem>
                  {kinds.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("filterStatus")}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("all") || "Todos"}</SelectItem>
                  <SelectItem value="pendente">pendente</SelectItem>
                  <SelectItem value="confirmado">confirmado</SelectItem>
                  <SelectItem value="cancelado">cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("filterPeriod")} (de)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-normal", !from && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {from ? format(from, "dd/MM/yyyy") : "—"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={from} onSelect={setFrom} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">{t("filterPeriod")} (até)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-normal", !to && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {to ? format(to, "dd/MM/yyyy") : "—"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={to} onSelect={setTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={clearAll}><X className="mr-1 h-4 w-4" />{t("clearFilters")}</Button>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />{t("exportCsv")}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reserva</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead className="text-right">Pax/Qtd</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">{t("loading")}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">{t("noServicesFound")}</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.item_id}>
                  <TableCell>
                    <Link to="/bookings/$bookingId" params={{ bookingId: r.booking_id }} className="text-primary hover:underline text-xs">
                      {r.booking_id.slice(0, 8)}
                    </Link>
                    <div className="text-xs text-muted-foreground">{r.customer_name ?? "—"}</div>
                  </TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{r.kind}</Badge></TableCell>
                  <TableCell className="max-w-[280px] truncate" title={r.description}>{r.description}</TableCell>
                  <TableCell className="text-sm">{r.city ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.item_date ? format(new Date(r.item_date), "dd/MM/yyyy") : "—"}</TableCell>
                  <TableCell className="text-sm">{r.check_out ? format(new Date(r.check_out), "dd/MM/yyyy") : "—"}</TableCell>
                  <TableCell className="text-right text-sm">{r.pax ?? r.quantity}</TableCell>
                  <TableCell className="text-right text-sm">{fmtCurrency(r.total, r.currency as "BRL")}</TableCell>
                  <TableCell><Badge variant="outline" className={cn("text-xs", statusBadge(r.status))}>{r.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
