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

export type FlightRow = {
  id?: string;
  quote_id: string;
  flight_date: string;
  flight_number: string;
  from_code: string;
  to_code: string;
  departure_time: string;
  arrival_time?: string | null;
  pax: number;
  total?: number | null;
  notes?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  quoteId: string;
  initial?: FlightRow | null;
  onSaved: () => void;
};

const empty = (quoteId: string): FlightRow => ({
  quote_id: quoteId,
  flight_date: format(new Date(), "yyyy-MM-dd"),
  flight_number: "",
  from_code: "",
  to_code: "",
  departure_time: "",
  arrival_time: "",
  pax: 1,
  total: null,
  notes: "",
});

const uniqOpts = (vals: (string | null | undefined)[]): ComboboxOption[] => {
  const set = new Set<string>();
  vals.forEach((v) => { const t = (v ?? "").toString().trim(); if (t) set.add(t); });
  return Array.from(set).sort().map((v) => ({ value: v, label: v }));
};

export function FlightDialog({ open, onOpenChange, quoteId, initial, onSaved }: Props) {
  const { user } = useAuth();
  const [row, setRow] = useState<FlightRow>(empty(quoteId));
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [numberOpts, setNumberOpts] = useState<ComboboxOption[]>([]);
  const [fromOpts, setFromOpts] = useState<ComboboxOption[]>([]);
  const [toOpts, setToOpts] = useState<ComboboxOption[]>([]);

  useEffect(() => {
    if (!open) return;
    setRow(initial ?? empty(quoteId));
    setErrors({});
    (async () => {
      const { data } = await supabase
        .from("quote_flights")
        .select("flight_number, from_code, to_code")
        .limit(2000);
      const rows = data ?? [];
      setNumberOpts(uniqOpts(rows.map((r) => r.flight_number)));
      setFromOpts(uniqOpts(rows.map((r) => r.from_code)));
      setToOpts(uniqOpts(rows.map((r) => r.to_code)));
    })();
  }, [open, initial, quoteId]);

  const dateObj = row.flight_date ? new Date(row.flight_date + "T00:00:00") : undefined;

  const validate = () => {
    const e: Record<string, boolean> = {};
    if (!row.flight_date) e.flight_date = true;
    if (!row.flight_number.trim()) e.flight_number = true;
    if (!row.from_code.trim()) e.from_code = true;
    if (!row.to_code.trim()) e.to_code = true;
    if (!row.departure_time) e.departure_time = true;
    if (!row.pax || row.pax < 1) e.pax = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!user) return;
    if (!validate()) return;
    setSaving(true);
    const payload = {
      quote_id: row.quote_id,
      flight_date: row.flight_date,
      flight_number: row.flight_number.trim(),
      from_code: row.from_code.trim().toUpperCase(),
      to_code: row.to_code.trim().toUpperCase(),
      departure_time: row.departure_time,
      arrival_time: row.arrival_time || null,
      pax: row.pax,
      total: row.total ?? null,
      notes: row.notes || null,
    };
    const { error } = row.id
      ? await supabase.from("quote_flights").update(payload).eq("id", row.id)
      : await supabase.from("quote_flights").insert({ ...payload, created_by: user.id });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Voo salvo");
    onSaved();
    onOpenChange(false);
  };

  const fieldErr = (k: string) => errors[k];
  const errClass = (k: string) => (fieldErr(k) ? "border-destructive" : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row.id ? "Editar voo" : "Adicionar voo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Data*</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start font-normal", !dateObj && "text-muted-foreground", errClass("flight_date"))}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateObj ? format(dateObj, "dd-MM-yyyy") : "—"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateObj} onSelect={(d) => setRow({ ...row, flight_date: d ? format(d, "yyyy-MM-dd") : "" })} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            {fieldErr("flight_date") && <p className="text-xs text-destructive mt-1">Obrigatório</p>}
          </div>
          <div>
            <Label className="text-xs">Número*</Label>
            <ComboboxAutocomplete
              options={numberOpts}
              value={row.flight_number}
              onChange={(v) => setRow({ ...row, flight_number: v })}
              placeholder="Ex.: AA1234"
              searchPlaceholder="Buscar voo..."
              allowCustom
              className={errClass("flight_number")}
            />
            {fieldErr("flight_number") && <p className="text-xs text-destructive mt-1">Obrigatório</p>}
          </div>
          <div>
            <Label className="text-xs">De*</Label>
            <ComboboxAutocomplete
              options={fromOpts}
              value={row.from_code}
              onChange={(v) => setRow({ ...row, from_code: v.toUpperCase() })}
              placeholder="GRU"
              searchPlaceholder="Buscar origem..."
              allowCustom
              className={errClass("from_code")}
            />
            {fieldErr("from_code") && <p className="text-xs text-destructive mt-1">Obrigatório</p>}
          </div>
          <div>
            <Label className="text-xs">Para*</Label>
            <ComboboxAutocomplete
              options={toOpts}
              value={row.to_code}
              onChange={(v) => setRow({ ...row, to_code: v.toUpperCase() })}
              placeholder="JFK"
              searchPlaceholder="Buscar destino..."
              allowCustom
              className={errClass("to_code")}
            />
            {fieldErr("to_code") && <p className="text-xs text-destructive mt-1">Obrigatório</p>}
          </div>
          <div>
            <Label className="text-xs">Partida*</Label>
            <Input type="time" value={row.departure_time} onChange={(e) => setRow({ ...row, departure_time: e.target.value })} className={errClass("departure_time")} />
            {fieldErr("departure_time") && <p className="text-xs text-destructive mt-1">Obrigatório</p>}
          </div>
          <div>
            <Label className="text-xs">Chegada</Label>
            <Input type="time" value={row.arrival_time ?? ""} onChange={(e) => setRow({ ...row, arrival_time: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Pax*</Label>
            <Input type="number" min={1} value={row.pax} onChange={(e) => setRow({ ...row, pax: Number(e.target.value) })} className={errClass("pax")} />
            {fieldErr("pax") && <p className="text-xs text-destructive mt-1">Obrigatório</p>}
          </div>
          <div>
            <Label className="text-xs">Total</Label>
            <Input type="number" step="0.01" value={row.total ?? ""} onChange={(e) => setRow({ ...row, total: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea rows={2} value={row.notes ?? ""} onChange={(e) => setRow({ ...row, notes: e.target.value })} />
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
