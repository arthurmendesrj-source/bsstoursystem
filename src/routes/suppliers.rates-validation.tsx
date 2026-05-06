import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Loader2, RefreshCw } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/suppliers/rates-validation")({
  component: () => (
    <AuthGate>
      <AppShell>
        <RatesValidationPage />
      </AppShell>
    </AuthGate>
  ),
});

type Summary = {
  supplier_id: string;
  total: number;
  zero_price: number;
  empty_service: number;
  empty_city: number;
  unmapped_city: number;
  unmapped_service: number;
  unmapped_category: number;
  pax_invalid: number;
  suspicious_pax_min: number;
  suspicious_long_category: number;
};

type Issue = {
  id: string;
  supplier_id: string;
  service_name: string | null;
  city: string | null;
  category: string | null;
  pax_min: number | null;
  pax_max: number | null;
  unit_price: number | null;
  currency: string | null;
  issues: string[];
};

type Dup = {
  supplier_id: string;
  service_name: string | null;
  city: string | null;
  category: string | null;
  pax_min: number | null;
  pax_max: number | null;
  language: string | null;
  unit: string | null;
  occurrences: number;
  rate_ids: string[];
  prices: number[];
};

function RatesValidationPage() {
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [supplierId, setSupplierId] = useState<string>("all");
  const [summary, setSummary] = useState<Summary[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [dups, setDups] = useState<Dup[]>([]);

  const load = async () => {
    setLoading(true);
    const [s, sum, iss, du] = await Promise.all([
      supabase.from("suppliers").select("id,name").order("name"),
      supabase.from("v_supplier_rates_validation").select("*"),
      supabase.from("v_supplier_rates_issues").select("*").limit(500),
      supabase.from("v_supplier_rates_duplicates").select("*").order("occurrences", { ascending: false }).limit(200),
    ]);
    if (s.error || sum.error || iss.error || du.error) {
      toast.error("Erro ao carregar validação");
    }
    setSuppliers(s.data ?? []);
    setSummary((sum.data as Summary[]) ?? []);
    setIssues((iss.data as Issue[]) ?? []);
    setDups((du.data as Dup[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredSummary = supplierId === "all"
    ? aggregate(summary)
    : summary.find((r) => r.supplier_id === supplierId) ?? emptySummary();

  const filteredIssues = supplierId === "all" ? issues : issues.filter((i) => i.supplier_id === supplierId);
  const filteredDups = supplierId === "all" ? dups : dups.filter((d) => d.supplier_id === supplierId);

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Validação de Tarifas</h1>
          <p className="text-muted-foreground text-sm">
            Inconsistências detectadas nas tarifas importadas.{" "}
            <Link to="/suppliers" className="underline">← Voltar a Fornecedores</Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os fornecedores</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total" value={filteredSummary.total} tone="neutral" />
        <StatCard label="Preço zero/vazio" value={filteredSummary.zero_price} tone="error" />
        <StatCard label="Serviço vazio" value={filteredSummary.empty_service} tone="error" />
        <StatCard label="Cidade vazia" value={filteredSummary.empty_city} tone="error" />
        <StatCard label="Pax inválido" value={filteredSummary.pax_invalid} tone="error" />
        <StatCard label="Cidade não mapeada" value={filteredSummary.unmapped_city} tone="warn" />
        <StatCard label="Serviço não mapeado" value={filteredSummary.unmapped_service} tone="warn" />
        <StatCard label="Categoria não mapeada" value={filteredSummary.unmapped_category} tone="warn" />
        <StatCard label="Pax suspeito (>50)" value={filteredSummary.suspicious_pax_min} tone="warn" />
        <StatCard label="Categoria longa" value={filteredSummary.suspicious_long_category} tone="warn" />
      </div>

      <Tabs defaultValue="duplicates">
        <TabsList>
          <TabsTrigger value="duplicates">Duplicatas ({filteredDups.length})</TabsTrigger>
          <TabsTrigger value="issues">Outros problemas ({filteredIssues.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="duplicates" className="mt-4">
          <Card className="p-0 overflow-hidden">
            {filteredDups.length === 0 ? (
              <Empty label="Nenhuma duplicata encontrada" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Pax</TableHead>
                    <TableHead className="text-center">Ocorrências</TableHead>
                    <TableHead>Preços distintos</TableHead>
                    <TableHead>Fornecedor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDups.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="max-w-md truncate" title={d.service_name ?? ""}>{d.service_name}</TableCell>
                      <TableCell>{d.city}</TableCell>
                      <TableCell>{d.pax_min}{d.pax_max && d.pax_max !== d.pax_min ? `-${d.pax_max}` : ""}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="destructive" className="gap-1"><Copy className="h-3 w-3" />{d.occurrences}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{d.prices.join(", ")}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{supplierName(d.supplier_id)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="issues" className="mt-4">
          <Card className="p-0 overflow-hidden">
            {filteredIssues.length === 0 ? (
              <Empty label="Nenhum outro problema encontrado" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Pax</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Problemas</TableHead>
                    <TableHead>Fornecedor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIssues.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="max-w-md truncate" title={it.service_name ?? ""}>{it.service_name ?? <em className="text-muted-foreground">vazio</em>}</TableCell>
                      <TableCell>{it.city ?? <em className="text-muted-foreground">vazio</em>}</TableCell>
                      <TableCell>{it.pax_min}{it.pax_max && it.pax_max !== it.pax_min ? `-${it.pax_max}` : ""}</TableCell>
                      <TableCell>{it.unit_price} {it.currency}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {it.issues.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{supplierName(it.supplier_id)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "neutral" | "warn" | "error" }) {
  const isOk = value === 0;
  const color = isOk ? "text-emerald-600" : tone === "error" ? "text-destructive" : "text-amber-600";
  const Icon = isOk ? CheckCircle2 : AlertCircle;
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 flex items-center gap-2 text-2xl font-bold ${color}`}>
        <Icon className="h-5 w-5" /> {value.toLocaleString("pt-BR")}
      </div>
    </Card>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <CheckCircle2 className="h-10 w-10 text-emerald-600 mb-2" />
      {label}
    </div>
  );
}

function emptySummary(): Summary {
  return {
    supplier_id: "", total: 0, zero_price: 0, empty_service: 0, empty_city: 0,
    unmapped_city: 0, unmapped_service: 0, unmapped_category: 0, pax_invalid: 0,
    suspicious_pax_min: 0, suspicious_long_category: 0,
  };
}

function aggregate(rows: Summary[]): Summary {
  return rows.reduce<Summary>((a, r) => ({
    supplier_id: "all",
    total: a.total + r.total,
    zero_price: a.zero_price + r.zero_price,
    empty_service: a.empty_service + r.empty_service,
    empty_city: a.empty_city + r.empty_city,
    unmapped_city: a.unmapped_city + r.unmapped_city,
    unmapped_service: a.unmapped_service + r.unmapped_service,
    unmapped_category: a.unmapped_category + r.unmapped_category,
    pax_invalid: a.pax_invalid + r.pax_invalid,
    suspicious_pax_min: a.suspicious_pax_min + r.suspicious_pax_min,
    suspicious_long_category: a.suspicious_long_category + r.suspicious_long_category,
  }), emptySummary());
}
