import { useState } from "react";
import { Loader2, FileText, FileType2, FileCheck, Sparkles, Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = {
  quoteId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onGenerated?: () => void;
};

type DocType = "executive" | "tour_program" | "combined";
type PriceMode = "detailed" | "final";
type DocLang = "pt" | "en" | "es" | "ru";
type Tone = "formal" | "inspirational";
type Format = "docx" | "pdf";

export function GenerateDocumentDialog({ quoteId, open, onOpenChange, onGenerated }: Props) {
  const [docType, setDocType] = useState<DocType>("executive");
  const [priceMode, setPriceMode] = useState<PriceMode>("detailed");
  const [format, setFormat] = useState<Format>("docx");
  const [language, setLanguage] = useState<DocLang>("pt");
  const [tone, setTone] = useState<Tone>("inspirational");
  const [includeItinerary, setIncludeItinerary] = useState(true);
  const [includeSchedule, setIncludeSchedule] = useState(true);
  const [includeCityHighlights, setIncludeCityHighlights] = useState(true);
  const [includeItemDescriptions, setIncludeItemDescriptions] = useState(true);
  const [briefing, setBriefing] = useState("");
  const [busy, setBusy] = useState(false);

  const showPriceMode = docType !== "tour_program";
  const showSchedule = docType !== "tour_program";
  const showProgramOpts = docType !== "executive";

  const actionLabel =
    docType === "executive"
      ? "Gerar Proposta Executiva"
      : docType === "tour_program"
        ? "Gerar Programa Turístico"
        : "Gerar Documento Completo";

  const generate = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-proposal-doc", {
        body: {
          quote_id: quoteId,
          doc_type: docType,
          price_mode: priceMode,
          format,
          language,
          tone,
          include_itinerary: includeItinerary,
          include_schedule: includeSchedule,
          include_city_highlights: includeCityHighlights,
          include_item_descriptions: includeItemDescriptions,
          briefing: briefing.trim() || undefined,
        },
      });
      if (error) {
        const status = (error as any).context?.status;
        if (status === 429) toast.error("Rate limit — tente novamente em instantes");
        else if (status === 402) toast.error("Créditos de IA esgotados");
        else toast.error(error.message);
        return;
      }
      if (data?.signed_url) {
        const a = document.createElement("a");
        a.href = data.signed_url;
        a.download = data.file_name ?? `documento.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      toast.success("Documento gerado");
      onGenerated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Gerar Documento
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Tipo de documento</Label>
            <RadioGroup value={docType} onValueChange={(v) => setDocType(v as DocType)} className="grid grid-cols-1 gap-2">
              <label className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="executive" id="dt-e" className="mt-0.5" />
                <FileCheck className="h-4 w-4 mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium">Proposta Executiva</div>
                  <div className="text-xs text-muted-foreground">Documento comercial com preços e cronograma.</div>
                </div>
              </label>
              <label className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="tour_program" id="dt-p" className="mt-0.5" />
                <Sparkles className="h-4 w-4 mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium">Programa Turístico</div>
                  <div className="text-xs text-muted-foreground">Apresentação promocional das cidades e itens (sem preços).</div>
                </div>
              </label>
              <label className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="combined" id="dt-c" className="mt-0.5" />
                <Layers className="h-4 w-4 mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium">Proposta Executiva + Programa Turístico</div>
                  <div className="text-xs text-muted-foreground">Programa promocional seguido da proposta comercial.</div>
                </div>
              </label>
            </RadioGroup>
          </div>

          {showPriceMode && (
            <div className="space-y-2">
              <Label className="text-xs">Apresentação dos valores</Label>
              <RadioGroup value={priceMode} onValueChange={(v) => setPriceMode(v as PriceMode)} className="grid grid-cols-1 gap-2">
                <label className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                  <RadioGroupItem value="detailed" id="pm-d" className="mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium">Valor por item</div>
                    <div className="text-xs text-muted-foreground">Mostra cada item com valor unitário, subtotal e total geral.</div>
                  </div>
                </label>
                <label className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                  <RadioGroupItem value="final" id="pm-f" className="mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium">Somente valor total</div>
                    <div className="text-xs text-muted-foreground">Mostra apenas o valor total da proposta.</div>
                  </div>
                </label>
              </RadioGroup>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Formato do arquivo</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as Format)} className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="docx" id="ft-d" />
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">DOCX</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="pdf" id="ft-p" />
                <FileType2 className="h-4 w-4" />
                <span className="text-sm font-medium">PDF</span>
              </label>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Idioma</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as DocLang)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt">Português</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="ru">Русский</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tom</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inspirational">Inspiracional</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-2">
            <Label htmlFor="incl-itin" className="text-sm">Incluir roteiro dia a dia</Label>
            <Switch id="incl-itin" checked={includeItinerary} onCheckedChange={setIncludeItinerary} />
          </div>
          {showSchedule && (
            <div className="flex items-center justify-between rounded-md border p-2">
              <Label htmlFor="incl-sched" className="text-sm">Incluir cronograma consolidado (datas + horários)</Label>
              <Switch id="incl-sched" checked={includeSchedule} onCheckedChange={setIncludeSchedule} />
            </div>
          )}
          {showProgramOpts && (
            <>
              <div className="flex items-center justify-between rounded-md border p-2">
                <Label htmlFor="incl-cities" className="text-sm">Incluir destaques das cidades</Label>
                <Switch id="incl-cities" checked={includeCityHighlights} onCheckedChange={setIncludeCityHighlights} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-2">
                <Label htmlFor="incl-desc" className="text-sm">Incluir descrição dos hotéis e serviços</Label>
                <Switch id="incl-desc" checked={includeItemDescriptions} onCheckedChange={setIncludeItemDescriptions} />
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Briefing para a IA (opcional)</Label>
            <Textarea
              value={briefing}
              onChange={(e) => setBriefing(e.target.value.slice(0, 2000))}
              placeholder="Ex: público sênior, passos curtos, foco em gastronomia…"
              rows={3}
              className="resize-none text-sm"
            />
            <p className="text-[11px] text-muted-foreground text-right tabular-nums">{briefing.length}/2000</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={generate} disabled={busy}>
            {busy ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Gerando…</>
            ) : (
              <><FileCheck className="h-4 w-4 mr-1" /> {actionLabel}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
