import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Download, Plus, RefreshCw, Trash2, Pencil, X } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BibliaActivityDialog, type ActivityRow } from "@/components/BibliaActivityDialog";

export const Route = createFileRoute("/biblia")({
  component: () => (
    <AuthGate>
      <AppShell>
        <BibliaPage />
      </AppShell>
    </AuthGate>
  ),
});

type Row = ActivityRow & { id: string; created_by: string };

function statusBadge(s: string) {
  if (s === "confirmado") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30";
  if (s === "executado") return "bg-blue-500/10 text-blue-700 border-blue-500/30";
  if (s === "cancelado") return "bg-red-500/10 text-red-700 border-red-500/30";
  return "bg-amber-500/10 text-amber-700 border-amber-500/30";
}

function BibliaPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [from, setFrom] = useState<Date | undefined>(new Date());
  const [to, setTo] = useState<Date | undefined>(new Date());
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("operations_activities")
      .select("*")
      .order("activity_date", { ascending: true, nullsFirst: false })
      .order("activity_time", { ascending: true, nullsFirst: false });
    if (error) toast.error(error.message);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const importFromBookings = async () => {
    if (!user) return;
    setImporting(true);
    const fromS = from ? format(from, "yyyy-MM-dd") : null;
    const toS = to ? format(to, "yyyy-MM-dd") : null;

    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, quote_id, customer_id, lead_id, departure_date");
    const filteredBookings = (bookings ?? []).filter((b: any) => {
      if (!b.quote_id) return false;
      if (fromS && b.departure_date && b.departure_date < fromS) return false;
      if (toS && b.departure_date && b.departure_date > toS) return false;
      return true;
    });
    if (filteredBookings.length === 0) { toast.info("Nenhuma reserva no período"); setImporting(false); return; }

    const quoteIds = filteredBookings.map((b: any) => b.quote_id);
    const customerIds = Array.from(new Set(filteredBookings.map((b: any) => b.customer_id).filter(Boolean)));
    const leadIds = Array.from(new Set(filteredBookings.map((b: any) => b.lead_id).filter(Boolean)));

    const [{ data: items }, { data: customers }, { data: leads }, { data: existing }] = await Promise.all([
      supabase.from("quote_items").select("id, quote_id, kind, description, city, item_date, pax").in("quote_id", quoteIds),
      customerIds.length ? supabase.from("customers").select("id, full_name").in("id", customerIds) : Promise.resolve({ data: [] as any[] }),
      leadIds.length ? supabase.from("leads").select("id, code").in("id", leadIds) : Promise.resolve({ data: [] as any[] }),
      supabase.from("operations_activities").select("quote_item_id").not("quote_item_id", "is", null),
    ]);

    const custMap = new Map((customers ?? []).map((c: any) => [c.id, c.full_name]));
    const leadMap = new Map((leads ?? []).map((l: any) => [l.id, l.code]));
    const bookingByQuote = new Map<string, any>();
    filteredBookings.forEach((b: any) => bookingByQuote.set(b.quote_id, b));
    const existingIds = new Set((existing ?? []).map((e: any) => e.quote_item_id));

    const toInsert: any[] = [];
    (items ?? []).forEach((it: any) => {
      if (existingIds.has(it.id)) return;
      const b = bookingByQuote.get(it.quote_id);
      if (!b) return;
      const itemDate = it.item_date ?? b.departure_date ?? null;
      if (fromS && itemDate && itemDate < fromS) return;
      if (toS && itemDate && itemDate > toS) return;
      const code = b.lead_id ? leadMap.get(b.lead_id) : null;
      toInsert.push({
        booking_id: b.id,
        quote_item_id: it.id,
        invoice_code: code ? `IN${code}` : null,
        pax_name: b.customer_id ? custMap.get(b.customer_id) ?? null : null,
        kind: it.kind ?? "service",
        description: it.description ?? null,
        city: it.city ?? null,
        activity_date: itemDate,
        status: "pendente",
        source: "imported",
        created_by: user.id,
      });
    });

    if (toInsert.length === 0) { toast.info("Nada novo a importar"); setImporting(false); return; }
    const { error } = await supabase.from("operations_activities").insert(toInsert);
    setImporting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${toInsert.length} atividade(s) importada(s)`);
    load();
  };

  const deleteRow = async (id: string) => {
    if (!confirm("Excluir esta atividade?")) return;
    const { error } = await supabase.from("operations_activities").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído");
    load();
  };

  const kinds = useMemo(() => Array.from(new Set(rows.map((r) => r.kind))).sort(), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const fromS = from ? format(from, "yyyy-MM-dd") : null;
    const toS = to ? format(to, "yyyy-MM-dd") : null;
    return rows.filter((r) => {
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (fromS && (r.activity_date ?? "") < fromS) return false;
      if (toS && (r.activity_date ?? "") > toS) return false;
      if (s) {
        const hay = `${r.description ?? ""} ${r.city ?? ""} ${r.pax_name ?? ""} ${r.invoice_code ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, kindFilter, statusFilter, from, to, search]);

  const exportCsv = () => {
    const header = ["Invoice", "Pax", "Tipo", "Descrição", "Cidade", "Data", "Hora", "Status"];
    const lines = filtered.map((r) => [
      r.invoice_code ?? "",
      r.pax_name ?? "",
      r.kind,
      (r.description ?? "").replaceAll(",", " "),
      r.city ?? "",
      r.activity_date ?? "",
      r.activity_time ?? "",
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Bíblia Operacional</h1>
          <p className="text-sm text-muted-foreground">Atividades do dia para execução. Importe das reservas ou cadastre manualmente.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={importFromBookings} disabled={importing}>
            <RefreshCw className={cn("mr-1 h-4 w-4", importing && "animate-spin")} />
            Importar de Reservas
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Nova atividade
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <Label className="text-xs">Buscar</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pax, invoice, descrição..." />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {kinds.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendente">pendente</SelectItem>
                  <SelectItem value="confirmado">confirmado</SelectItem>
                  <SelectItem value="executado">executado</SelectItem>
                  <SelectItem value="cancelado">cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">De</Label>
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
              <Label className="text-xs">Até</Label>
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
            <Button variant="ghost" size="sm" onClick={clearAll}><X className="mr-1 h-4 w-4" />Limpar</Button>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />Exportar CSV</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Pax</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">Nenhuma atividade encontrada</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-mono">
                    {r.booking_id ? (
                      <Link to="/bookings/$bookingId" params={{ bookingId: r.booking_id }} className="text-primary hover:underline">
                        {r.invoice_code ?? r.booking_id.slice(0, 8)}
                      </Link>
                    ) : (r.invoice_code ?? "—")}
                  </TableCell>
                  <TableCell className="text-sm">{r.pax_name ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{r.kind}</Badge></TableCell>
                  <TableCell className="max-w-[260px] truncate text-sm" title={r.description ?? ""}>{r.description ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.city ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.activity_date ? format(new Date(r.activity_date + "T00:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                  <TableCell className="text-sm font-mono">{r.activity_time?.slice(0, 5) ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={cn("text-xs", statusBadge(r.status))}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(r); setDialogOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRow(r.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <BibliaActivityDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} onSaved={load} />
    </div>
  );
}
