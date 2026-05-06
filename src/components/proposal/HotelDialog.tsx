import { useEffect, useState } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ComboboxAutocomplete, type ComboboxOption } from "@/components/ComboboxAutocomplete";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MEAL_PLANS = ["Room only", "Breakfast", "Half board", "Full board", "All inclusive"];
const CATEGORIES = ["3★", "4★", "5★", "Boutique", "Other"];

export type HotelInitial = {
  id: string;
  item_date?: string | null;
  check_out?: string | null;
  city?: string | null;
  description?: string | null;
  category?: string | null;
  meal_plan?: string | null;
  rooms?: number | null;
  total?: number | null;
  notes?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  quoteId: string;
  defaultMarkupPct?: number;
  initial?: HotelInitial | null;
  onSaved: () => void;
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function HotelDialog({ open, onOpenChange, quoteId, defaultMarkupPct = 0, initial, onSaved }: Props) {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const [checkIn, setCheckIn] = useState<string>(today);
  const [checkOut, setCheckOut] = useState<string>(today);
  const [city, setCity] = useState("");
  const [hotel, setHotel] = useState("");
  const [room, setRoom] = useState("");
  const [mealPlan, setMealPlan] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [qty, setQty] = useState<number>(1);
  const [total, setTotal] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const [cityOpts, setCityOpts] = useState<ComboboxOption[]>([]);
  const [hotelOpts, setHotelOpts] = useState<ComboboxOption[]>([]);

  useEffect(() => {
    if (!open) return;
    setCheckIn(initial?.item_date || today);
    setCheckOut(initial?.check_out || today);
    setCity(initial?.city ?? "");
    setHotel(initial?.description ?? "");
    setMealPlan(initial?.meal_plan ?? "");
    setCategory(initial?.category ?? "");
    setQty(initial?.rooms ?? 1);
    setTotal(initial?.total != null ? String(initial.total) : "");
    // Extract "Sala: ..." prefix from notes if present
    const rawNotes = initial?.notes ?? "";
    const m = rawNotes.match(/^Sala:\s*([^\n]*)\n?([\s\S]*)$/);
    if (m) {
      setRoom(m[1].trim());
      setNotes(m[2].trim());
    } else {
      setRoom("");
      setNotes(rawNotes);
    }
    setErrors({});
    (async () => {
      const [cRes, sRes] = await Promise.all([
        supabase.from("ref_cities").select("name").order("name").limit(500),
        supabase.from("ref_services").select("name").order("name").limit(1000),
      ]);
      setCityOpts((cRes.data ?? []).map((r: { name: string }) => ({ value: r.name, label: r.name })));
      setHotelOpts((sRes.data ?? []).map((r: { name: string }) => ({ value: r.name, label: r.name })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const inObj = checkIn ? new Date(checkIn + "T00:00:00") : undefined;
  const outObj = checkOut ? new Date(checkOut + "T00:00:00") : undefined;

  const validate = () => {
    const e: Record<string, boolean> = {};
    if (!checkIn) e.checkIn = true;
    if (!checkOut) e.checkOut = true;
    if (checkIn && checkOut && new Date(checkOut) < new Date(checkIn)) e.checkOut = true;
    if (!hotel.trim()) e.hotel = true;
    if (!room.trim()) e.room = true;
    if (!qty || qty < 1) e.qty = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const ensureRefCity = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (cityOpts.some((o) => norm(o.label) === norm(trimmed))) return;
    const slug = slugify(trimmed);
    if (!slug) return;
    const { data: existing } = await supabase
      .from("ref_cities").select("id").eq("slug", slug).maybeSingle();
    if (existing) return;
    const { error } = await supabase
      .from("ref_cities")
      .upsert({ name: trimmed, slug }, { onConflict: "slug", ignoreDuplicates: true });
    if (error) { console.warn("ref_cities upsert failed:", error.message); return; }
    toast.success(`Nova cidade cadastrada: ${trimmed}`);
  };

  const ensureRefHotel = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (hotelOpts.some((o) => norm(o.label) === norm(trimmed))) return;
    const slug = slugify(trimmed);
    if (!slug) return;
    const { data: existing } = await supabase
      .from("ref_services").select("id").eq("slug", slug).maybeSingle();
    if (existing) return;
    // Try to resolve hotel category
    const { data: cat } = await supabase
      .from("ref_service_categories")
      .select("id").eq("kind", "hotel").eq("slug", "hotel").maybeSingle();
    const { error } = await supabase
      .from("ref_services")
      .upsert({ name: trimmed, slug, category_id: cat?.id ?? null }, { onConflict: "slug", ignoreDuplicates: true });
    if (error) { console.warn("ref_services upsert failed:", error.message); return; }
    toast.success(`Novo hotel cadastrado: ${trimmed}`);
  };

  const save = async () => {
    if (!user) return;
    if (!validate()) return;
    setSaving(true);
    await Promise.all([ensureRefCity(city), ensureRefHotel(hotel)]);
    const nights = inObj && outObj ? Math.max(0, differenceInCalendarDays(outObj, inObj)) : 0;
    const totalNum = total === "" ? 0 : Number(total);
    const denom = nights > 0 ? nights : 1;
    const unitCost = +(totalNum / denom).toFixed(2);
    const combinedNotes = `Sala: ${room.trim()}${notes.trim() ? `\n${notes.trim()}` : ""}`;
    const payload = {
      quote_id: quoteId,
      kind: "hotel",
      description: hotel.trim(),
      city: city.trim() || null,
      item_date: checkIn,
      check_out: checkOut,
      nights,
      quantity: nights || qty,
      rooms: qty,
      category: category || null,
      meal_plan: mealPlan || null,
      unit_cost: unitCost,
      unit_price: unitCost,
      markup_pct: defaultMarkupPct,
      total: totalNum,
      notes: combinedNotes,
    };
    const { error } = initial?.id
      ? await supabase.from("quote_items").update(payload).eq("id", initial.id)
      : await supabase.from("quote_items").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(initial?.id ? "Hotel atualizado" : "Hotel adicionado");
    onSaved();
    onOpenChange(false);
  };

  const errClass = (k: string) => (errors[k] ? "border-destructive" : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Editar hotel" : "Adicionar hotel"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Em*</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start font-normal", !inObj && "text-muted-foreground", errClass("checkIn"))}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {inObj ? format(inObj, "dd-MM-yyyy") : "—"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={inObj} onSelect={(d) => setCheckIn(d ? format(d, "yyyy-MM-dd") : "")} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label className="text-xs">Fora*</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start font-normal", !outObj && "text-muted-foreground", errClass("checkOut"))}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {outObj ? format(outObj, "dd-MM-yyyy") : "—"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={outObj} onSelect={(d) => setCheckOut(d ? format(d, "yyyy-MM-dd") : "")} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            {errors.checkOut && <p className="text-xs text-destructive mt-1">Data inválida</p>}
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
            <Label className="text-xs">Hotel*</Label>
            <ComboboxAutocomplete
              options={hotelOpts}
              value={hotel}
              onChange={setHotel}
              placeholder="Digite para pesquisar ou entre livremente..."
              searchPlaceholder="Buscar hotel..."
              allowCustom
              className={errClass("hotel")}
            />
            {errors.hotel && <p className="text-xs text-destructive mt-1">Obrigatório</p>}
          </div>

          <div>
            <Label className="text-xs">Sala*</Label>
            <Input value={room} onChange={(e) => setRoom(e.target.value)} className={errClass("room")} placeholder="Ex.: Standard, Deluxe..." />
            {errors.room && <p className="text-xs text-destructive mt-1">Obrigatório</p>}
          </div>

          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={mealPlan || undefined} onValueChange={(v) => setMealPlan(v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {MEAL_PLANS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Avaliar</Label>
            <Select value={category || undefined} onValueChange={(v) => setCategory(v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Quantidade*</Label>
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className={errClass("qty")} />
          </div>

          <div>
            <Label className="text-xs">Total</Label>
            <Input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>

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
