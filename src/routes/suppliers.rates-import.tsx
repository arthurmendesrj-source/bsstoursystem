import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ComboboxAutocomplete } from "@/components/ComboboxAutocomplete";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/suppliers/rates-import")({
  head: () => ({
    meta: [
      { title: "Importar Tarifas — Fornecedores" },
      { name: "description", content: "Importação CSV de tarifários com validação de slugs e auto-vínculo às referências." },
    ],
  }),
  component: () => (
    <AuthGate>
      <AppShell>
        <RatesImportPage />
      </AppShell>
    </AuthGate>
  ),
});

const KINDS = ["transfer", "tour", "hotel", "restaurant", "outro"] as const;
const UNITS = ["per_person", "per_night", "per_service"] as const;
const CURRENCIES = ["USD", "BRL", "EUR", "ARS", "GBP"] as const;

type Supplier = { id: string; name: string };
type ParsedRow = {
  line: number;
  service_name: string;
  service_type: string;
  city: string;
  category: string;
  pax_min: number | null;
  pax_max: number | null;
  unit: string;
  unit_price: number;
  currency: string;
  language: string | null;
  valid_from: string | null;
  valid_until: string | null;
  errors: string[];
};

const REQUIRED = ["service_name", "service_type", "unit_price"];
const OPTIONAL = ["city", "category", "pax_min", "pax_max", "unit", "currency", "language", "valid_from", "valid_until"];
const TEMPLATE = [...REQUIRED, ...OPTIONAL].join(",") + "\n" +
  `Transfer IGU airport->hotel,transfer,Foz do Iguaçu,private,1,3,per_service,120,USD,en,2026-01-01,2026-12-31\n` +
  `Macuco Safari,tour,Foz do Iguaçu,adventure,1,,per_person,95,USD,en,,\n` +
  `Belmond Cataratas,hotel,Foz do Iguaçu,5*,,,per_night,650,USD,en,,`;

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

function RatesImportPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [csvText, setCsvText] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ inserted: number } | null>(null);

  useEffect(() => {
    supabase.from("suppliers").select("id,name").order("name").then(({ data }) => {
      setSuppliers((data ?? []) as Supplier[]);
    });
  }, []);

  const stats = useMemo(() => {
    const valid = parsed.filter((r) => r.errors.length === 0).length;
    const invalid = parsed.length - valid;
    const cities = new Set(parsed.map((r) => slugify(r.city)).filter(Boolean));
    const services = new Set(parsed.map((r) => slugify(r.service_name)).filter(Boolean));
    const categories = new Set(parsed.map((r) => slugify(r.category)).filter(Boolean));
    return { valid, invalid, cities: cities.size, services: services.size, categories: categories.size };
  }, [parsed]);

  function handleParse(text: string) {
    setDone(null);
    setCsvText(text);
    const { headers: hs, rows } = parseCsv(text);
    setHeaders(hs);
    if (rows.length === 0) { setParsed([]); return; }
    const idx = (k: string) => hs.indexOf(k);
    const out: ParsedRow[] = rows.map((cells, i) => {
      const get = (k: string) => (idx(k) >= 0 ? (cells[idx(k)] ?? "").trim() : "");
      const errors: string[] = [];
      const service_name = get("service_name");
      const service_type = get("service_type").toLowerCase();
      const unit_priceRaw = get("unit_price").replace(",", ".");
      const unit_price = Number(unit_priceRaw);
      const unit = get("unit") || "per_person";
      const currency = (get("currency") || "USD").toUpperCase();
      const pax_min = get("pax_min") ? Number(get("pax_min")) : null;
      const pax_max = get("pax_max") ? Number(get("pax_max")) : null;

      if (!service_name) errors.push("service_name vazio");
      if (!service_type) errors.push("service_type vazio");
      else if (!(KINDS as readonly string[]).includes(service_type)) errors.push(`service_type inválido (${service_type})`);
      if (!unit_priceRaw || isNaN(unit_price) || unit_price <= 0) errors.push("unit_price inválido");
      if (!(UNITS as readonly string[]).includes(unit)) errors.push(`unit inválido (${unit})`);
      if (!(CURRENCIES as readonly string[]).includes(currency)) errors.push(`currency inválida (${currency})`);
      if (pax_min !== null && isNaN(pax_min)) errors.push("pax_min inválido");
      if (pax_max !== null && isNaN(pax_max)) errors.push("pax_max inválido");
      if (pax_min !== null && pax_max !== null && pax_max < pax_min) errors.push("pax_max < pax_min");
      if (service_name && slugify(service_name) === "") errors.push("service_name não gera slug");

      return {
        line: i + 2,
        service_name,
        service_type,
        city: get("city"),
        category: get("category"),
        pax_min,
        pax_max,
        unit,
        unit_price,
        currency,
        language: get("language") || null,
        valid_from: get("valid_from") || null,
        valid_until: get("valid_until") || null,
        errors,
      };
    });
    setParsed(out);
  }

  async function handleFile(file: File) {
    const text = await file.text();
    handleParse(text);
  }

  async function handleImport() {
    if (!supplierId) { toast.error("Selecione o fornecedor"); return; }
    const valid = parsed.filter((r) => r.errors.length === 0);
    if (valid.length === 0) { toast.error("Nada para importar"); return; }
    setBusy(true);
    const payload = valid.map((r) => ({
      supplier_id: supplierId,
      service_name: r.service_name,
      service_type: r.service_type,
      city: r.city || null,
      category: r.category || null,
      pax_min: r.pax_min,
      pax_max: r.pax_max,
      unit: r.unit,
      unit_price: r.unit_price,
      currency: r.currency,
      language: r.language,
      valid_from: r.valid_from,
      valid_until: r.valid_until,
    }));
    // Insert in chunks of 500
    let inserted = 0;
    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const { error, count } = await supabase
        .from("supplier_rates")
        .insert(chunk as any, { count: "exact" });
      if (error) {
        setBusy(false);
        toast.error(`Falha no lote ${i / 500 + 1}: ${error.message}`);
        return;
      }
      inserted += count ?? chunk.length;
    }
    setBusy(false);
    setDone({ inserted });
    toast.success(`${inserted} tarifas importadas e vinculadas às referências.`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Importar Tarifas</h1>
        <p className="text-muted-foreground text-sm">
          CSV → validação de slugs → vínculo automático com cidades, categorias e serviços.{" "}
          <Link to="/suppliers" className="underline">← Fornecedores</Link>
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Fornecedor</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Arquivo CSV</Label>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => {
              const f = e.target.files?.[0]; if (f) handleFile(f);
            }} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <Label>Ou cole o CSV abaixo</Label>
            <Button size="sm" variant="outline" onClick={() => handleParse(TEMPLATE)}>Usar template</Button>
          </div>
          <Textarea
            rows={6}
            value={csvText}
            onChange={(e) => handleParse(e.target.value)}
            placeholder="service_name,service_type,city,category,pax_min,pax_max,unit,unit_price,currency,language,valid_from,valid_until"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Obrigatórios: service_name, service_type ({KINDS.join("/")}), unit_price.
            Opcionais: city, category, pax_min, pax_max, unit ({UNITS.join("/")}), currency, language, valid_from, valid_until.
          </p>
        </div>
      </Card>

      {parsed.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="secondary">Linhas: {parsed.length}</Badge>
            <Badge className="bg-emerald-600">Válidas: {stats.valid}</Badge>
            {stats.invalid > 0 && <Badge variant="destructive">Com erro: {stats.invalid}</Badge>}
            <Badge variant="outline">Cidades únicas: {stats.cities}</Badge>
            <Badge variant="outline">Categorias únicas: {stats.categories}</Badge>
            <Badge variant="outline">Serviços únicos: {stats.services}</Badge>
            <div className="ml-auto flex gap-2">
              <Button onClick={handleImport} disabled={busy || stats.valid === 0 || !supplierId}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Importar {stats.valid} válidas
              </Button>
            </div>
          </div>

          {done && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> {done.inserted} tarifas inseridas. As referências (cidade/categoria/serviço) foram vinculadas automaticamente.
            </div>
          )}

          <div className="max-h-[60vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Pax</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead>Validação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.slice(0, 300).map((r) => (
                  <TableRow key={r.line} className={r.errors.length ? "bg-destructive/5" : ""}>
                    <TableCell className="text-xs text-muted-foreground">{r.line}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{r.service_name || <span className="text-destructive">—</span>}</div>
                      {r.service_name && <div className="text-[10px] text-muted-foreground font-mono">slug: {slugify(r.service_name)}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{r.service_type}</TableCell>
                    <TableCell className="text-xs">
                      {r.city || "—"}
                      {r.city && <div className="text-[10px] text-muted-foreground font-mono">{slugify(r.city)}</div>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.category || "—"}
                      {r.category && <div className="text-[10px] text-muted-foreground font-mono">{slugify(r.category)}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{r.pax_min ?? "—"}{r.pax_max ? `-${r.pax_max}` : ""}</TableCell>
                    <TableCell className="text-right text-xs">{r.currency} {r.unit_price.toFixed(2)}</TableCell>
                    <TableCell className="text-xs">
                      {r.errors.length === 0
                        ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> ok</span>
                        : <span className="inline-flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> {r.errors.join("; ")}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {parsed.length > 300 && (
              <div className="p-2 text-xs text-muted-foreground text-center">
                Mostrando 300 de {parsed.length} linhas. A importação processa todas as válidas.
              </div>
            )}
          </div>

          {headers.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Cabeçalhos detectados: <span className="font-mono">{headers.join(", ")}</span>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
