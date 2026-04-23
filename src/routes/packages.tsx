import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, MapPin, Clock } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/packages")({
  component: () => (
    <AuthGate>
      <AppShell>
        <PackagesPage />
      </AppShell>
    </AuthGate>
  ),
});

type Pkg = {
  id: string;
  name: string;
  destination: string;
  duration_days: number;
  base_price: number;
  base_currency: string;
  description_pt: string | null;
  photo_url: string | null;
};

function PackagesPage() {
  const { t, lang } = useI18n();
  const { user, isAdmin, hasRole } = useAuth();
  const { format } = useCurrency();
  const [rows, setRows] = useState<Pkg[]>([]);
  const [open, setOpen] = useState(false);
  const canManage = isAdmin || hasRole("operacional");
  const [form, setForm] = useState({
    name: "", destination: "", duration_days: "7", base_price: "", base_currency: "BRL",
    description: "", photo_url: "",
  });

  const load = async () => {
    const { data } = await supabase.from("packages").select("*").eq("active", true).order("created_at", { ascending: false });
    setRows((data as Pkg[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const desc = form.description || null;
    const { error } = await supabase.from("packages").insert({
      name: form.name,
      destination: form.destination,
      duration_days: Number(form.duration_days),
      base_price: Number(form.base_price),
      base_currency: form.base_currency as "BRL",
      description_pt: desc, description_en: desc, description_es: desc,
      photo_url: form.photo_url || null,
      created_by: user.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(t("saved"));
      setOpen(false);
      setForm({ name: "", destination: "", duration_days: "7", base_price: "", base_currency: "BRL", description: "", photo_url: "" });
      load();
    }
  };

  const description = (p: Pkg) => p.description_pt;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("packages")}</h1>
          <p className="text-muted-foreground">{rows.length}</p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />{t("new")}</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{t("new")} {t("packages")}</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div><Label>{t("name")}</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t("destination")}</Label><Input required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></div>
                  <div><Label>{t("duration")} ({t("days")})</Label><Input type="number" required value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t("price")}</Label><Input type="number" step="0.01" required value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} /></div>
                  <div>
                    <Label>{t("currency")}</Label>
                    <Select value={form.base_currency} onValueChange={(v) => setForm({ ...form, base_currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="BRL">BRL</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Foto URL</Label><Input value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} /></div>
                <div><Label>{t("notes")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <Button type="submit" className="w-full">{t("save")}</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.length === 0 && <p className="text-muted-foreground">{t("noData")}</p>}
        {rows.map((p) => (
          <Card key={p.id} className="overflow-hidden p-0">
            {p.photo_url ? (
              <img src={p.photo_url} alt={p.name} className="h-40 w-full object-cover" />
            ) : (
              <div className="h-40 w-full bg-gradient-to-br from-primary/20 to-accent" />
            )}
            <div className="space-y-2 p-4">
              <h3 className="font-semibold">{p.name}</h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{p.destination}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{p.duration_days} {t("days")}</span>
              </div>
              {description(p) && <p className="line-clamp-2 text-sm text-muted-foreground">{description(p)}</p>}
              <div className="text-lg font-bold text-primary">{format(Number(p.base_price), p.base_currency as "BRL")}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
