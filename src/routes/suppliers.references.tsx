import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/suppliers/references")({
  head: () => ({
    meta: [
      { title: "Referências — Cidades, Categorias e Serviços" },
      { name: "description", content: "Administração das tabelas de referência usadas pelas tarifas." },
    ],
  }),
  component: () => (
    <AuthGate>
      <AppShell>
        <ReferencesPage />
      </AppShell>
    </AuthGate>
  ),
});

const KINDS = ["transfer", "tour", "hotel", "restaurant", "outro"] as const;
type Kind = typeof KINDS[number];

type City = { id: string; name: string; country: string | null; state: string | null; slug: string };
type Category = { id: string; name: string; kind: Kind; slug: string };
type Service = { id: string; name: string; category_id: string | null; slug: string };

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");

function ReferencesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Referências</h1>
        <p className="text-muted-foreground text-sm">
          Cidades, categorias e serviços usados nas tarifas dos fornecedores.{" "}
          <Link to="/suppliers" className="underline">← Fornecedores</Link>
        </p>
      </div>

      <Tabs defaultValue="cities">
        <TabsList>
          <TabsTrigger value="cities">Cidades</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="services">Serviços</TabsTrigger>
        </TabsList>
        <TabsContent value="cities" className="mt-4"><CitiesTab /></TabsContent>
        <TabsContent value="categories" className="mt-4"><CategoriesTab /></TabsContent>
        <TabsContent value="services" className="mt-4"><ServicesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------- Cities -------------- */
function CitiesTab() {
  const [rows, setRows] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<City | null>(null);
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("ref_cities").select("*").order("name");
    setLoading(false);
    if (error) return toast.error("Erro ao carregar cidades");
    setRows((data as City[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return t ? rows.filter((r) => r.name.toLowerCase().includes(t) || (r.country ?? "").toLowerCase().includes(t)) : rows;
  }, [rows, q]);

  const save = async (form: { name: string; country: string; state: string }) => {
    const slug = slugify(form.name);
    if (!slug) return toast.error("Nome inválido");
    const country = form.country.trim() || null;
    // uniqueness check (country, slug)
    const dup = rows.find((r) =>
      r.slug === slug && (r.country ?? "") === (country ?? "") && r.id !== editing?.id
    );
    if (dup) return toast.error("Já existe uma cidade com esse nome neste país");

    const payload = { name: form.name.trim(), country, state: form.state.trim() || null, slug };
    const res = editing
      ? await supabase.from("ref_cities").update(payload).eq("id", editing.id)
      : await supabase.from("ref_cities").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Salvo");
    setOpen(false); setEditing(null); load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("ref_cities").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removido"); setDeleteId(null); load();
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar cidade ou país" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nova cidade</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead><TableHead>País</TableHead><TableHead>Estado</TableHead>
              <TableHead>Slug</TableHead><TableHead className="w-24"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.country ?? "—"}</TableCell>
                  <TableCell>{r.state ?? "—"}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{r.slug}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <CityDialog open={open} onOpenChange={setOpen} editing={editing} onSave={save} />
      <ConfirmDelete open={!!deleteId} onCancel={() => setDeleteId(null)} onConfirm={() => deleteId && remove(deleteId)} />
    </div>
  );
}

function CityDialog({ open, onOpenChange, editing, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: City | null;
  onSave: (f: { name: string; country: string; state: string }) => void;
}) {
  const [name, setName] = useState(""); const [country, setCountry] = useState(""); const [state, setState] = useState("");
  useEffect(() => {
    if (open) { setName(editing?.name ?? ""); setCountry(editing?.country ?? ""); setState(editing?.state ?? ""); }
  }, [open, editing]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar cidade" : "Nova cidade"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome*</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>País (BR, AR…)</Label><Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} /></div>
            <div><Label>Estado/Província</Label><Input value={state} onChange={(e) => setState(e.target.value)} /></div>
          </div>
          {name && <div className="text-xs text-muted-foreground">Slug: <span className="font-mono">{slugify(name)}</span></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSave({ name, country, state })} disabled={!name.trim()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------- Categories -------------- */
function CategoriesTab() {
  const [rows, setRows] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("ref_service_categories").select("*").order("kind").order("name");
    setLoading(false);
    if (error) return toast.error("Erro ao carregar categorias");
    setRows((data as Category[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return t ? rows.filter((r) => r.name.toLowerCase().includes(t) || r.kind.includes(t)) : rows;
  }, [rows, q]);

  const save = async (form: { name: string; kind: Kind }) => {
    const slug = slugify(form.name);
    if (!slug) return toast.error("Nome inválido");
    const dup = rows.find((r) => r.slug === slug && r.id !== editing?.id);
    if (dup) return toast.error("Já existe uma categoria com esse slug");
    const payload = { name: form.name.trim(), kind: form.kind, slug };
    const res = editing
      ? await supabase.from("ref_service_categories").update(payload).eq("id", editing.id)
      : await supabase.from("ref_service_categories").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Salvo"); setOpen(false); setEditing(null); load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("ref_service_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removido"); setDeleteId(null); load();
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar categoria ou tipo" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nova categoria</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Slug</TableHead><TableHead className="w-24"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="outline">{r.kind}</Badge></TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{r.slug}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <CategoryDialog open={open} onOpenChange={setOpen} editing={editing} onSave={save} />
      <ConfirmDelete open={!!deleteId} onCancel={() => setDeleteId(null)} onConfirm={() => deleteId && remove(deleteId)} />
    </div>
  );
}

function CategoryDialog({ open, onOpenChange, editing, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: Category | null;
  onSave: (f: { name: string; kind: Kind }) => void;
}) {
  const [name, setName] = useState(""); const [kind, setKind] = useState<Kind>("outro");
  useEffect(() => {
    if (open) { setName(editing?.name ?? ""); setKind(editing?.kind ?? "outro"); }
  }, [open, editing]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar categoria" : "Nova categoria"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome*</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>Tipo*</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {name && <div className="text-xs text-muted-foreground">Slug: <span className="font-mono">{slugify(name)}</span></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSave({ name, kind })} disabled={!name.trim()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------- Services -------------- */
function ServicesTab() {
  const [rows, setRows] = useState<Service[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [editing, setEditing] = useState<Service | null>(null);
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [r, c] = await Promise.all([
      supabase.from("ref_services").select("*").order("name").limit(2000),
      supabase.from("ref_service_categories").select("*").order("name"),
    ]);
    setLoading(false);
    if (r.error || c.error) return toast.error("Erro ao carregar serviços");
    setRows((r.data as Service[]) ?? []);
    setCats((c.data as Category[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const catName = (id: string | null) => cats.find((c) => c.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    let res = rows;
    if (catFilter !== "all") res = res.filter((r) => r.category_id === catFilter);
    if (q) {
      const t = q.toLowerCase();
      res = res.filter((r) => r.name.toLowerCase().includes(t));
    }
    return res;
  }, [rows, q, catFilter]);

  const save = async (form: { name: string; category_id: string }) => {
    const slug = slugify(form.name);
    if (!slug) return toast.error("Nome inválido");
    if (!form.category_id) return toast.error("Categoria obrigatória");
    const dup = rows.find((r) => r.slug === slug && r.category_id === form.category_id && r.id !== editing?.id);
    if (dup) return toast.error("Já existe um serviço com esse nome nesta categoria");
    const payload = { name: form.name.trim(), category_id: form.category_id, slug };
    const res = editing
      ? await supabase.from("ref_services").update(payload).eq("id", editing.id)
      : await supabase.from("ref_services").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Salvo"); setOpen(false); setEditing(null); load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("ref_services").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removido"); setDeleteId(null); load();
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar serviço" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.kind})</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Novo serviço</Button>
      </div>

      <div className="text-sm text-muted-foreground">{filtered.length} de {rows.length}</div>

      <Card className="p-0 overflow-hidden">
        {loading ? <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Slug</TableHead><TableHead className="w-24"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.slice(0, 500).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium max-w-md truncate" title={r.name}>{r.name}</TableCell>
                  <TableCell>{catName(r.category_id)}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-xs">{r.slug}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {filtered.length > 500 && (
          <div className="p-2 text-xs text-center text-muted-foreground border-t">Exibindo 500 de {filtered.length} — refine os filtros.</div>
        )}
      </Card>

      <ServiceDialog open={open} onOpenChange={setOpen} editing={editing} cats={cats} onSave={save} />
      <ConfirmDelete open={!!deleteId} onCancel={() => setDeleteId(null)} onConfirm={() => deleteId && remove(deleteId)} />
    </div>
  );
}

function ServiceDialog({ open, onOpenChange, editing, cats, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: Service | null; cats: Category[];
  onSave: (f: { name: string; category_id: string }) => void;
}) {
  const [name, setName] = useState(""); const [categoryId, setCategoryId] = useState("");
  useEffect(() => {
    if (open) { setName(editing?.name ?? ""); setCategoryId(editing?.category_id ?? ""); }
  }, [open, editing]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar serviço" : "Novo serviço"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome*</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>Categoria*</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.kind})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {name && <div className="text-xs text-muted-foreground">Slug: <span className="font-mono">{slugify(name)}</span></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSave({ name, category_id: categoryId })} disabled={!name.trim() || !categoryId}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------- shared -------------- */
function ConfirmDelete({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar exclusão?</AlertDialogTitle>
          <AlertDialogDescription>
            Tarifas vinculadas terão a referência removida (não serão excluídas).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
