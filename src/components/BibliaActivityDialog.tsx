import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type ActivityRow = {
  id?: string;
  booking_id?: string | null;
  invoice_code?: string | null;
  pax_name?: string | null;
  pax_count?: number | null;
  hotel?: string | null;
  driver?: string | null;
  supplier?: string | null;
  guide?: string | null;
  kind: string;
  description?: string | null;
  city?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  status: string;
  notes?: string | null;
  source?: string;
};

const KINDS = ["hotel", "transfer", "passeio", "voo", "ingresso", "refeicao", "outro"];
const STATUSES = ["pendente", "confirmado", "executado", "cancelado"];

export function BibliaActivityDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: ActivityRow | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<ActivityRow>({
    kind: "outro",
    status: "pendente",
  });

  useEffect(() => {
    if (open) {
      setRow(
        initial ?? {
          kind: "outro",
          status: "pendente",
          activity_date: format(new Date(), "yyyy-MM-dd"),
        }
      );
    }
  }, [open, initial]);

  const dateObj = row.activity_date ? new Date(row.activity_date + "T00:00:00") : undefined;

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const payload = {
      booking_id: row.booking_id || null,
      invoice_code: row.invoice_code || null,
      pax_name: row.pax_name || null,
      pax_count: row.pax_count ?? null,
      hotel: row.hotel || null,
      driver: row.driver || null,
      supplier: row.supplier || null,
      guide: row.guide || null,
      kind: row.kind,
      description: row.description || null,
      city: row.city || null,
      activity_date: row.activity_date || null,
      activity_time: row.activity_time || null,
      status: row.status,
      notes: row.notes || null,
    };
    let error;
    if (row.id) {
      ({ error } = await supabase.from("operations_activities").update(payload).eq("id", row.id));
    } else {
      ({ error } = await supabase
        .from("operations_activities")
        .insert({ ...payload, created_by: user.id, source: "manual" }));
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Atividade salva");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row.id ? "Editar atividade" : "Nova atividade"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Serviço</Label>
            <Input value={row.description ?? ""} onChange={(e) => setRow({ ...row, description: e.target.value })} placeholder="Ex.: Excursão HD ao Pão de Açúcar..." />
          </div>
          <div>
            <Label>Hotel</Label>
            <Input value={row.hotel ?? ""} onChange={(e) => setRow({ ...row, hotel: e.target.value })} />
          </div>
          <div>
            <Label>Motorista</Label>
            <Input value={row.driver ?? ""} onChange={(e) => setRow({ ...row, driver: e.target.value })} />
          </div>
          <div>
            <Label>Fornecedor</Label>
            <Input value={row.supplier ?? ""} onChange={(e) => setRow({ ...row, supplier: e.target.value })} />
          </div>
          <div>
            <Label>Guia</Label>
            <Input value={row.guide ?? ""} onChange={(e) => setRow({ ...row, guide: e.target.value })} />
          </div>
          <div>
            <Label>Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start font-normal", !dateObj && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateObj ? format(dateObj, "dd/MM/yyyy") : "—"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateObj} onSelect={(d) => setRow({ ...row, activity_date: d ? format(d, "yyyy-MM-dd") : null })} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label>Hora (P)</Label>
            <Input type="time" value={row.activity_time ?? ""} onChange={(e) => setRow({ ...row, activity_time: e.target.value })} />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input value={row.city ?? ""} onChange={(e) => setRow({ ...row, city: e.target.value })} />
          </div>
          <div>
            <Label>Pax (qtd)</Label>
            <Input
              type="number"
              min={0}
              value={row.pax_count ?? ""}
              onChange={(e) => setRow({ ...row, pax_count: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Fatura</Label>
            <Input value={row.invoice_code ?? ""} onChange={(e) => setRow({ ...row, invoice_code: e.target.value })} placeholder="INNI..." />
          </div>
          <div className="col-span-2">
            <Label>Nome Pax</Label>
            <Input value={row.pax_name ?? ""} onChange={(e) => setRow({ ...row, pax_name: e.target.value })} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={row.kind} onValueChange={(v) => setRow({ ...row, kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={row.status} onValueChange={(v) => setRow({ ...row, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>ID Reserva (opcional)</Label>
            <Input value={row.booking_id ?? ""} onChange={(e) => setRow({ ...row, booking_id: e.target.value })} placeholder="uuid" />
          </div>
          <div className="col-span-2">
            <Label>Observações</Label>
            <Textarea value={row.notes ?? ""} onChange={(e) => setRow({ ...row, notes: e.target.value })} rows={2} />
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
