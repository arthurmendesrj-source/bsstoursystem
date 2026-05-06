import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/leads")({
  component: () => (
    <AuthGate>
      <AppShell>
        <LeadsPage />
      </AppShell>
    </AuthGate>
  ),
});

type Lead = {
  id: string;
  code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  destination: string | null;
  estimated_value: number | null;
  currency: string;
};

const STATUSES = ["novo", "qualificado", "cotacao", "proposta", "fechado", "perdido"];

function LeadsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", destination: "", estimated_value: "", status: "novo" });

  const load = async () => {
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    setLeads((data as Lead[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("leads").insert({
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      destination: form.destination || null,
      estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
      status: form.status as "novo",
      created_by: user.id,
      assigned_to: user.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(t("saved"));
      setOpen(false);
      setForm({ name: "", email: "", phone: "", destination: "", estimated_value: "", status: "novo" });
      load();
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("leads").update({ status: status as "novo" }).eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const statusColor = (s: string) =>
    s === "fechado" ? "bg-emerald-500/10 text-emerald-700" :
    s === "perdido" ? "bg-red-500/10 text-red-700" :
    s === "proposta" ? "bg-violet-500/10 text-violet-700" :
    s === "cotacao" ? "bg-amber-500/10 text-amber-700" :
    s === "qualificado" ? "bg-blue-500/10 text-blue-700" :
    "bg-slate-500/10 text-slate-700";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("leads")}</h1>
          <p className="text-muted-foreground">{leads.length} {t("leads").toLowerCase()}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />{t("new")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("new")} {t("leads")}</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div>
                <Label>Código</Label>
                <Input disabled placeholder="Gerado automaticamente (ex: AM010426)" />
              </div>
              <div><Label>{t("name")}</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("email")}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>{t("phone")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div><Label>{t("destination")}</Label><Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></div>
              <div><Label>{t("estimatedValue")} (BRL)</Label><Input type="number" step="0.01" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} /></div>
              <div>
                <Label>{t("status")}</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">{t("save")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("destination")}</TableHead>
              <TableHead>{t("estimatedValue")}</TableHead>
              <TableHead>{t("status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">{t("noData")}</TableCell></TableRow>
            ) : leads.map((l) => (
              <TableRow key={l.id} className="cursor-pointer hover:bg-muted/50" onClick={() => window.location.assign(`/leads/${l.id}`)}>
                <TableCell><span className="font-mono text-xs">{l.code ?? "—"}</span></TableCell>
                <TableCell>
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{l.email ?? l.phone}</div>
                </TableCell>
                <TableCell>{l.destination ?? "—"}</TableCell>
                <TableCell>{l.estimated_value ? format(Number(l.estimated_value), l.currency as "BRL") : "—"}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select value={l.status} onValueChange={(v) => updateStatus(l.id, v)}>
                    <SelectTrigger className="h-8 w-36">
                      <Badge variant="outline" className={statusColor(l.status)}>{l.status}</Badge>
                    </SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
