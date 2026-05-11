import { useEffect, useState } from "react";
import { Loader2, FileText, FileType2, FileCheck, Users, Building2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEFAULT_BANK_INFO = `The money can be transfered to:
Beneficiary Bank : BANK OF AMERICA
Bank address: 801 E. HALLANDALE BEACH BLVD. FLORIDA , 3309.
SWIFT: BOFAUS3N
BANK ACCOUNT : 898092533700
ABA : 026009593`;

const DEFAULT_BENEFICIARY = `Beneficiary: VIPDELUXETRAVEL LLC
Beneficiary Address : 200 S. PARK RD. SUITE 301. HOLLYWOOD. FL 33021`;

type Format = "xlsx" | "pdf" | "both";
type Version = "client" | "admin";

type Props = {
  bookingId?: string;
  quoteId?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
};

export function GenerateInvoiceDialog({ bookingId, quoteId, open, onOpenChange }: Props) {
  const [format, setFormat] = useState<Format>("xlsx");
  const [version, setVersion] = useState<Version>("client");
  const [bankInfo, setBankInfo] = useState(DEFAULT_BANK_INFO);
  const [beneficiary, setBeneficiary] = useState(DEFAULT_BENEFICIARY);
  const [busy, setBusy] = useState(false);
  const [resolvedBookingId, setResolvedBookingId] = useState<string | null>(bookingId ?? null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (bookingId) { setResolvedBookingId(bookingId); return; }
    if (!open || !quoteId) return;
    let cancel = false;
    (async () => {
      setResolving(true);
      const { data } = await supabase
        .from("bookings")
        .select("id")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancel) {
        setResolvedBookingId(data?.id ?? null);
        setResolving(false);
      }
    })();
    return () => { cancel = true; };
  }, [bookingId, quoteId, open]);

  const generate = async () => {
    if (!resolvedBookingId) {
      toast.error("Sem reserva vinculada a este invoice");
      return;
    }
    setBusy(true);
    try {
      const formats = format === "both" ? ["xlsx", "pdf"] : [format];
      const { data, error } = await supabase.functions.invoke("generate-invoice-doc", {
        body: {
          booking_id: resolvedBookingId,
          formats,
          bank_info: bankInfo,
          beneficiary,
          version,
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const baseName = data?.file_name ?? "invoice";
      const downloads: { url: string; ext: string }[] = [];
      if (data?.xlsx_signed_url) downloads.push({ url: data.xlsx_signed_url, ext: "xlsx" });
      if (data?.pdf_signed_url) downloads.push({ url: data.pdf_signed_url, ext: "pdf" });
      for (const d of downloads) {
        const a = document.createElement("a");
        a.href = d.url;
        a.download = `${baseName}.${d.ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      toast.success("Invoice gerada");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar invoice");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Gerar Invoice
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!bookingId && (
            <div className="text-xs text-muted-foreground">
              {resolving
                ? "Buscando reserva vinculada…"
                : resolvedBookingId
                  ? `Reserva: ${resolvedBookingId.slice(0, 8)}`
                  : "Sem reserva vinculada — não é possível gerar."}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Versão</Label>
            <RadioGroup
              value={version}
              onValueChange={(v) => setVersion(v as Version)}
              className="grid grid-cols-2 gap-2"
            >
              <label className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="client" id="ver-c" />
                <Users className="h-4 w-4" />
                <span className="text-sm font-medium">Cliente (sem notas)</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="admin" id="ver-a" />
                <Building2 className="h-4 w-4" />
                <span className="text-sm font-medium">Administrativo (com notas)</span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Formato</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as Format)}
              className="grid grid-cols-3 gap-2"
            >
              <label className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="xlsx" id="fmt-x" />
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">XLSX</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="pdf" id="fmt-p" />
                <FileType2 className="h-4 w-4" />
                <span className="text-sm font-medium">PDF</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="both" id="fmt-b" />
                <FileCheck className="h-4 w-4" />
                <span className="text-sm font-medium">Ambos</span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-1">
            <Label htmlFor="bank-info" className="text-xs">
              Dados bancários (célula A29)
            </Label>
            <Textarea
              id="bank-info"
              value={bankInfo}
              onChange={(e) => setBankInfo(e.target.value)}
              rows={6}
              className="resize-none text-sm font-mono"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="beneficiary" className="text-xs">
              Beneficiário (célula F29)
            </Label>
            <Textarea
              id="beneficiary"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              rows={3}
              className="resize-none text-sm font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={generate} disabled={busy || !resolvedBookingId}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando…
              </>
            ) : (
              <>
                <FileCheck className="h-4 w-4 mr-1" /> Gerar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
