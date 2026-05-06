import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComboboxAutocomplete } from "@/components/ComboboxAutocomplete";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/suppliers/rates-search")({
  head: () => ({
    meta: [
      { title: "Buscar Tarifas — Fornecedores" },
      { name: "description", content: "Consulte tarifas por cidade, serviço, tipo, pax e unidade." },
    ],
  }),
  component: () => (
    <AuthGate>
      <AppShell>
        <RatesSearchPage />
      </AppShell>
    </AuthGate>
  ),
});

type Rate = {
  id: string;
  supplier_id: string;
  service_name: string;
  service_type: string | null;
  city: string | null;
  category: string | null;
  pax_min: number | null;
  pax_max: number | null;
  unit: string | null;
  unit_price: number;
  currency: string;
  language: string | null;
};

const KINDS = [
  { value: "all", label: "Todos os tipos" },
  { value: "transfer", label: "Transfer" },
  { value: "tour", label: "Tour" },
  { value: "hotel", label: "Hotel" },
  { value: "restaurant", label: "Restaurante" },
  { value: "outro", label: "Outro" },
];

const UNITS = [
  { value: "all", label: "Todas as unidades" },
  { value: "per_person", label: "Por pessoa" },
  { value: "per_night", label: "Por noite" },
  { value: "per_service", label: "Por serviço" },
];

function RatesSearchPage() {
  const [loading, setLoading] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<Rate[]>([]);

  // filters
  const [q, setQ] = useState("");
  const [city, setCity] = useState("all");
  const [kind, setKind] = useState("all");
  const [unit, setUnit] = useState("all");
  const [supplierId, setSupplierId] = useState("all");
  const [pax, setPax] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [c, s] = await Promise.all([
        supabase.from("ref_cities").select("name").order("name"),
        supabase.from("suppliers").select("id,name").order("name"),
      ]);
      setCities((c.data ?? []).map((r: { name: string }) => r.name));
      setSuppliers(s.data ?? []);
    })();
  }, []);

  const search = async () => {
    setLoading(true);
    let query = supabase
      .from("supplier_rates")
      .select("id, supplier_id, service_name, service_type, city, category, pax_min, pax_max, unit, unit_price, currency, language")
      .order("city")
      .order("service_name")
      .limit(500);

    if (q.trim()) query = query.ilike("service_name", `%${q.trim()}%`);
    if (city !== "all") query = query.ilike("city", city);
    if (kind !== "all") query = query.eq("service_type", kind);
    if (unit !== "all") query = query.eq("unit", unit);
    if (supplierId !== "all") query = query.eq("supplier_id", supplierId);
    if (pax) {
      const n = parseInt(pax, 10);
      if (!isNaN(n)) {
        query = query.lte("pax_min", n).gte("pax_max", n);
      }
    }
    if (maxPrice) {
      const n = parseFloat(maxPrice);
      if (!isNaN(n)) query = query.lte("unit_price", n);
    }

    const { data, error } = await query;
    setLoading(false);
    if (error) {
      toast.error("Erro na busca");
      return;
    }
    setRows((data as Rate[]) ?? []);
  };

  useEffect(() => { search(); /* initial */ /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const reset = () => {
    setQ(""); setCity("all"); setKind("all"); setUnit("all"); setSupplierId("all"); setPax(""); setMaxPrice("");
    setTimeout(search, 0);
  };

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id.slice(0, 8);

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const prices = rows.map((r) => Number(r.unit_price)).filter((n) => n > 0);
    const min = Math.min(...prices), max = Math.max(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    return { min, max, avg };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Buscar Tarifas</h1>
          <p className="text-muted-foreground text-sm">
            Filtre por cidade, serviço, tipo, pax e unidade.{" "}
            <Link to="/suppliers" className="underline">← Fornecedores</Link>
          </p>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Buscar serviço</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="ex.: Transfer, Sugarloaf"
                onKeyDown={(e) => e.key === "Enter" && search()} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Cidade</Label>
            <ComboboxAutocomplete
              options={[{ value: "all", label: "Todas as cidades" }, ...cities.map((c) => ({ value: c, label: c }))]}
              value={city}
              onChange={(v) => setCity(v || "all")}
              placeholder="Todas as cidades"
              searchPlaceholder="Buscar cidade…"
              emptyMessage="Nenhuma cidade"
              clearable={false}
            />
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <ComboboxAutocomplete
              options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
              value={kind}
              onChange={(v) => setKind(v || "all")}
              placeholder="Todos os tipos"
              searchPlaceholder="Buscar tipo…"
              clearable={false}
            />
          </div>
          <div>
            <Label className="text-xs">Unidade</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Fornecedor</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Pax (dentro do range)</Label>
            <Input type="number" min="1" value={pax} onChange={(e) => setPax(e.target.value)}
              placeholder="ex.: 4"
              onKeyDown={(e) => e.key === "Enter" && search()} />
          </div>
          <div>
            <Label className="text-xs">Preço máximo</Label>
            <Input type="number" min="0" step="0.01" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="ex.: 100"
              onKeyDown={(e) => e.key === "Enter" && search()} />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={search} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
              Buscar
            </Button>
            <Button variant="outline" onClick={reset} title="Limpar filtros"><X className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{rows.length} resultado(s){rows.length === 500 ? " (limite atingido — refine os filtros)" : ""}</span>
        {stats && (
          <span>
            Mín {stats.min.toFixed(2)} · Méd {stats.avg.toFixed(2)} · Máx {stats.max.toFixed(2)}
          </span>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">Nenhuma tarifa encontrada</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Pax</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead>Fornecedor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-md truncate" title={r.service_name}>{r.service_name}</TableCell>
                  <TableCell>{r.city}</TableCell>
                  <TableCell>{r.service_type && <Badge variant="outline">{r.service_type}</Badge>}</TableCell>
                  <TableCell>{r.pax_min}{r.pax_max && r.pax_max !== r.pax_min ? `-${r.pax_max}` : ""}</TableCell>
                  <TableCell className="text-xs">{r.unit}</TableCell>
                  <TableCell className="text-right font-mono">{Number(r.unit_price).toFixed(2)} {r.currency}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{supplierName(r.supplier_id)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
