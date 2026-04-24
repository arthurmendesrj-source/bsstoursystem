import { useState } from "react";
import { Loader2, FileText } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = {
  quoteId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onGenerated?: () => void;
};

type PriceMode = "final" | "detailed" | "category_table";
type DocLang = "pt" | "en" | "es" | "ru";
type Tone = "formal" | "inspirational";

export function GenerateDocDialog({ quoteId, open, onOpenChange, onGenerated }: Props) {
  const { t } = useI18n();
  const [priceMode, setPriceMode] = useState<PriceMode>("detailed");
  const [language, setLanguage] = useState<DocLang>("en");
  const [includeItinerary, setIncludeItinerary] = useState(true);
  const [tone, setTone] = useState<Tone>("inspirational");
  const [briefing, setBriefing] = useState("");
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-proposal-doc", {
        body: {
          quote_id: quoteId,
          price_mode: priceMode,
          language,
          tone,
          include_itinerary: includeItinerary,
          briefing: briefing.trim() || undefined,
        },
      });
      if (error) {
        const status = (error as any).context?.status;
        if (status === 429) toast.error("Rate limit — try again in a moment");
        else if (status === 402) toast.error("AI credits exhausted");
        else toast.error(error.message);
        return;
      }
      if (data?.signed_url) {
        const a = document.createElement("a");
        a.href = data.signed_url;
        a.download = data.file_name ?? "proposal.docx";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      toast.success(t("documentGenerated"));
      onGenerated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> {t("generateDocument")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">{t("priceMode")}</Label>
            <Select value={priceMode} onValueChange={(v) => setPriceMode(v as PriceMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="final">{t("priceModeFinal")}</SelectItem>
                <SelectItem value="detailed">{t("priceModeDetailed")}</SelectItem>
                <SelectItem value="category_table">{t("priceModeCategory")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("language")}</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as DocLang)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt">Português</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="ru">{t("languageRussian")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("tone")}</Label>
            <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inspirational">{t("inspirational")}</SelectItem>
                <SelectItem value="formal">{t("formal")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="incl-itinerary" className="text-sm">
              {t("includeItinerary")}
            </Label>
            <Switch
              id="incl-itinerary"
              checked={includeItinerary}
              onCheckedChange={setIncludeItinerary}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-briefing" className="text-xs">
              {t("aiBriefing")}
            </Label>
            <Textarea
              id="ai-briefing"
              value={briefing}
              onChange={(e) => setBriefing(e.target.value.slice(0, 2000))}
              placeholder={t("aiBriefingPlaceholder")}
              rows={4}
              maxLength={2000}
              className="resize-none text-sm"
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">{t("aiBriefingHelp")}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {briefing.length}/2000
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button onClick={generate} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t("loading")}
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-1" /> {t("generateDocument")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
