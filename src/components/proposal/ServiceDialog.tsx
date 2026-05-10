import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ComboboxAutocomplete, type ComboboxOption } from "@/components/ComboboxAutocomplete";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";

const GUIDE_TYPES = [
  "English Guide",
  "Portuguese Guide",
  "Spanish Guide",
  "French Guide",
  "German Guide",
  "Russian Guide",
  "Italian Guide",
  "Other",
];

export type ServiceInitial = {
  id: string;
  item_date?: string | null;
  city?: string | null;
  description?: string | null;
  guide_type?: string | null;
  pax?: number | null;
  total?: number | null;
  notes?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  quoteId: string;
  defaultMarkupPct?: number;
  initial?: ServiceInitial | null;
  onSaved: () => void;
};

export function ServiceDialog({ open, onOpenChange, quoteId, defaultMarkupPct = 0, initial, onSaved }: Props) {
  const { user } = useAuth();
  const { canField } = usePermissions();
  const canEditCost = canField("quotes", "unit_cost", "edit");
  const canViewCost = canField("quotes", "unit_cost", "view");
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [city, setCity] = useState("");
  const [service, setService] = useState("");
  const [guideType, setGuideType] = useState<string>("");
  const [pax, setPax] = useState<number>(1);
  const [total, setTotal] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const [cityOpts, setCityOpts] = useState<ComboboxOption[]>([]);
  const [serviceOpts, setServiceOpts] = useState<ComboboxOption[]>([]);
  const [guideOpts, setGuideOpts] = useState<ComboboxOption[]>(GUIDE_TYPES.map((g) => ({ value: g, label: g })));

  useEffect(() => {
    if (!open) return;
    setDate(initial?.item_date || format(new Date(), "yyyy-MM-dd"));
    setCity(initial?.city ?? "");
    setService(initial?.description ?? "");
    setGuideType(initial?.guide_type ?? "");
    setPax(initial?.pax ?? 1);
    setTotal(initial?.total != null ? String(initial.total) : "");
    setNotes(initial?.notes ?? "");
    setErrors({});
    (async () => {
      const { data } = await supabase
        .from("quote_items")
        .select("city, description, guide_type")
        .eq("kind", "service")
        .limit(2000);
      const cities = new Set<string>();
      const services = new Set<string>();
      const guides = new Set<string>();
      (data ?? []).forEach((r: { city: string | null; description: string | null; guide_type: string | null }) => {
        if (r.city?.trim()) cities.add(r.city.trim());
        if (r.description?.trim()) services.add(r.description.trim());
        if (r.guide_type?.trim()) guides.add(r.guide_type.trim());
      });
      setCityOpts(Array.from(cities).sort().map((v) => ({ value: v, label: v })));
      setServiceOpts(Array.from(services).sort().map((v) => ({ value: v, label: v })));
      const merged = Array.from(new Set([...GUIDE_TYPES, ...guides]));
      setGuideOpts(merged.map((v) => ({ value: v, label: v })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const dateObj = date ? new Date(date + "T00:00:00") : undefined;

  const validate = () => {
    const e: Record<string, boolean> = {};
    if (!date) e.date = true;
    if (!pax || pax < 1) e.pax = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!user) return;
    if (!validate()) return;
    setSaving(true);
    const totalNum = total === "" ? null : Number(total);
    const unitCost = totalNum != null && pax > 0 ? +(totalNum / pax).toFixed(2) : 0;
    const unitPrice = unitCost;
    const payload = {
      quote_id: quoteId,
      kind: "service",
      description: service || "",
      city: city || null,
      item_date: date,
      pax,
      quantity: pax,
      unit_cost: unitCost,
      unit_price: unitPrice,
      markup_pct: defaultMarkupPct,
      total: totalNum ?? +(unitPrice * pax).toFixed(2),
      guide_type: guideType || null,
      notes: notes || null,
    };
    const { error } = initial?.id
      ? await supabase.from("quote_items").update(payload).eq("id", initial.id)
      : await supabase.from("quote_items").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(initial?.id ? "Serviço atualizado" : "Serviço adicionado");
    onSaved();
    onOpenChange(false);
  };

  const errClass = (k: string) => (errors[k] ? "border-destructive" : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Editar serviço" : "Adicionar serviço"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Data*</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start font-normal", !dateObj && "text-muted-foreground", errClass("date"))}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateObj ? format(dateObj, "dd-MM-yyyy") : "—"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateObj} onSelect={(d) => setDate(d ? format(d, "yyyy-MM-dd") : "")} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            {errors.date && <p className="text-xs text-destructive mt-1">Obrigatório</p>}
          </div>

          <div>
            <Label className="text-xs">Cidade</Label>
            <ComboboxAutocomplete
              options={cityOpts}
              value={city}
              onChange={setCity}
              placeholder="Selecione ou digite..."
              searchPlaceholder="Buscar cidade..."
              allowCustom
            />
          </div>

          <div>
            <Label className="text-xs">Serviço</Label>
            <ComboboxAutocomplete
              options={serviceOpts}
              value={service}
              onChange={setService}
              placeholder="Digite para pesquisar ou entre livremente..."
              searchPlaceholder="Buscar serviço..."
              allowCustom
            />
          </div>

          <div>
            <Label className="text-xs">Tipo de guia</Label>
            <ComboboxAutocomplete
              options={guideOpts}
              value={guideType}
              onChange={setGuideType}
              placeholder="Selecione ou digite..."
              searchPlaceholder="Buscar tipo..."
              allowCustom
            />
          </div>

          <div>
            <Label className="text-xs">Pax*</Label>
            <Input type="number" min={1} value={pax} onChange={(e) => setPax(Number(e.target.value))} className={errClass("pax")} />
            {errors.pax && <p className="text-xs text-destructive mt-1">Obrigatório</p>}
          </div>

          {canViewCost && (
            <div>
              <Label className="text-xs">Total</Label>
              <Input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} disabled={!canEditCost} />
            </div>
          )}

          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
