import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Download, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { lineSubtotal, lineUnitPrice, type ProposalItemKind } from "@/lib/proposal-totals";

type LeadHeader = {
  leadId: string;
  leadCode: string | null;
  leadName?: string | null;
  customerId: string | null;
  customerName?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

type QuoteHeader = {
  quoteId: string;
  currency: string;
  defaultMarkupPct: number;
  notes: string | null;
  validUntil: string | null;
};

type ItemForExport = {
  kind: ProposalItemKind;
  description: string;
  city?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  item_date?: string | null;
  quantity: number;
  unit_cost: number;
  markup_pct: number;
};

type ParsedItem = {
  kind: ProposalItemKind;
  description: string;
  city: string | null;
  check_in: string | null;
  check_out: string | null;
  item_date: string | null;
  quantity: number;
  unit_cost: number;
  markup_pct: number;
};

type Props = {
  lead: LeadHeader;
  quote: QuoteHeader;
  items: ItemForExport[];
  disabled?: boolean;
  onUploaded?: () => void;
};

const ITEMS_HEADERS = [
  "kind",
  "description",
  "city",
  "check_in",
  "check_out",
  "item_date",
  "quantity",
  "unit_cost",
  "markup_pct",
] as const;

function safe(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function QuoteSpreadsheetButton({ lead, quote, items, disabled, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingItems, setPendingItems] = useState<ParsedItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const handleDownload = () => {
    const wb = XLSX.utils.book_new();

    // Lead sheet (read-only fields)
    const leadAOA: (string | number | null)[][] = [
      ["Campo", "Valor"],
      ["Lead ID", lead.leadId],
      ["Código do Lead", safe(lead.leadCode)],
      ["Nome do Lead", safe(lead.leadName)],
      ["Customer ID", safe(lead.customerId)],
      ["Cliente", safe(lead.customerName)],
      ["Destino", safe(lead.destination)],
      ["Data início", safe(lead.startDate)],
      ["Data fim", safe(lead.endDate)],
      ["Quote ID", quote.quoteId],
      ["Moeda", quote.currency],
      ["Markup padrão %", quote.defaultMarkupPct],
      ["Validade", safe(quote.validUntil)],
      ["Notas", safe(quote.notes)],
    ];
    const leadWs = XLSX.utils.aoa_to_sheet(leadAOA);
    leadWs["!cols"] = [{ wch: 22 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, leadWs, "Lead");

    // Itens sheet (editable)
    const itemsAOA: (string | number | null)[][] = [ITEMS_HEADERS as unknown as string[]];
    for (const it of items) {
      itemsAOA.push([
        it.kind,
        it.description ?? "",
        it.city ?? "",
        it.kind === "hotel" ? (it.check_in ?? it.item_date ?? "") : "",
        it.kind === "hotel" ? (it.check_out ?? "") : "",
        it.kind === "service" ? (it.item_date ?? "") : "",
        Number(it.quantity) || 0,
        Number(it.unit_cost) || 0,
        Number(it.markup_pct) || 0,
      ]);
    }
    if (items.length === 0) {
      // Add a blank example row to make it obvious where to type
      itemsAOA.push(["service", "", "", "", "", "", 1, 0, Number(quote.defaultMarkupPct) || 0]);
    }
    const itemsWs = XLSX.utils.aoa_to_sheet(itemsAOA);
    itemsWs["!cols"] = [
      { wch: 10 },
      { wch: 45 },
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 9 },
      { wch: 12 },
      { wch: 11 },
    ];
    XLSX.utils.book_append_sheet(wb, itemsWs, "Itens");

    // Instruções sheet
    const instr: string[][] = [
      ["Instruções"],
      [""],
      ["1. Não renomeie as abas (Lead, Itens) nem as colunas da aba Itens."],
      ["2. Não altere o Quote ID na aba Lead — ele é usado para validar o upload."],
      ["3. Coluna kind: 'hotel' ou 'service'."],
      ["4. Para hotel preencha check_in e check_out (formato AAAA-MM-DD)."],
      ["5. Para service preencha item_date (formato AAAA-MM-DD)."],
      ["6. quantity, unit_cost e markup_pct devem ser numéricos."],
      ["7. Ao fazer upload, TODOS os itens da proposta serão substituídos pelos da aba Itens."],
    ];
    const instrWs = XLSX.utils.aoa_to_sheet(instr);
    instrWs["!cols"] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, instrWs, "Instruções");

    const fileName = `cotacao_${(lead.leadCode ?? "lead").replace(/[^a-zA-Z0-9_-]/g, "")}_${quote.quoteId.slice(0, 8)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleFileSelected = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      // Validate Quote ID from Lead sheet (if present)
      const leadSheet = wb.Sheets["Lead"];
      if (leadSheet) {
        const leadRows = XLSX.utils.sheet_to_json<(string | number)[]>(leadSheet, { header: 1 });
        const quoteIdRow = leadRows.find(
          (r) => Array.isArray(r) && String(r[0]).trim().toLowerCase() === "quote id",
        );
        if (quoteIdRow && String(quoteIdRow[1]).trim() && String(quoteIdRow[1]).trim() !== quote.quoteId) {
          toast.error("Quote ID da planilha não bate com a proposta atual. Operação bloqueada.");
          return;
        }
      }

      const itemsSheet = wb.Sheets["Itens"];
      if (!itemsSheet) {
        toast.error("Aba 'Itens' não encontrada na planilha.");
        return;
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(itemsSheet, { defval: "" });
      const parsed: ParsedItem[] = [];
      for (const row of rows) {
        const kindRaw = String(row.kind ?? "").trim().toLowerCase();
        if (kindRaw !== "hotel" && kindRaw !== "service") continue;
        const description = String(row.description ?? "").trim();
        if (!description && !row.city && !row.check_in && !row.item_date) continue;
        const qty = Math.max(1, Math.round(num(row.quantity) || 1));
        parsed.push({
          kind: kindRaw,
          description,
          city: row.city ? String(row.city).trim() : null,
          check_in: kindRaw === "hotel" && row.check_in ? String(row.check_in).trim() : null,
          check_out: kindRaw === "hotel" && row.check_out ? String(row.check_out).trim() : null,
          item_date:
            kindRaw === "service" && row.item_date
              ? String(row.item_date).trim()
              : kindRaw === "hotel" && row.check_in
                ? String(row.check_in).trim()
                : null,
          quantity: qty,
          unit_cost: num(row.unit_cost),
          markup_pct: num(row.markup_pct),
        });
      }
      if (parsed.length === 0) {
        toast.error("Nenhum item válido encontrado na aba 'Itens'.");
        return;
      }
      setPendingItems(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao ler a planilha");
    }
  };

  const confirmReplace = async () => {
    if (!pendingItems) return;
    setBusy(true);
    try {
      const { error: delErr } = await supabase
        .from("quote_items")
        .delete()
        .eq("quote_id", quote.quoteId);
      if (delErr) {
        toast.error(`Erro ao limpar itens: ${delErr.message}`);
        return;
      }
      const payload = pendingItems.map((it) => ({
        quote_id: quote.quoteId,
        description: `[${it.kind === "hotel" ? "HOTEL" : "SERVICE"}] ${it.description}`,
        quantity: it.quantity,
        unit_cost: it.unit_cost,
        markup_pct: it.markup_pct,
        unit_price: lineUnitPrice(it.unit_cost, it.markup_pct),
        total: lineSubtotal(it.unit_cost, it.markup_pct, it.quantity),
        kind: it.kind,
        city: it.city,
        item_date: it.item_date,
        check_out: it.kind === "hotel" ? it.check_out : null,
      }));
      const { error: insErr } = await supabase.from("quote_items").insert(payload);
      if (insErr) {
        toast.error(`Erro ao inserir itens: ${insErr.message}`);
        return;
      }
      toast.success(`${pendingItems.length} itens importados.`);
      setPendingItems(null);
      onUploaded?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Planilha de Cotação
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => handleDownload()}>
            <Download className="h-4 w-4 mr-2" /> Baixar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Upload
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void handleFileSelected(f);
        }}
      />

      <AlertDialog open={!!pendingItems} onOpenChange={(o) => !o && !busy && setPendingItems(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir itens da proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai remover todos os itens atuais e inserir{" "}
              <strong>{pendingItems?.length ?? 0}</strong> itens da planilha. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmReplace(); }} disabled={busy}>
              {busy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Substituindo…</> : "Substituir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
