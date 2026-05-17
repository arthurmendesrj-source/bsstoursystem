import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Search,
  Download,
  Trash2,
  Sparkles,
  X,
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { tenantPath } from "@/lib/tenantStorage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/itineraries")({
  component: () => (
    <AuthGate>
      <AppShell>
        <ItinerariesPage />
      </AppShell>
    </AuthGate>
  ),
});

type Itinerary = {
  id: string;
  title: string;
  original_filename: string;
  storage_path: string;
  file_format: string;
  destinations: string[] | null;
  duration_days: number | null;
  trip_type: string | null;
  price_range: string | null;
  tags: string[] | null;
  year: number | null;
  summary: string | null;
  processing_status: "pending" | "processing" | "ready" | "failed";
  processing_error: string | null;
  language: string | null;
  created_at: string;
};

type UploadJob = {
  id: string;
  filename: string;
  size: number;
  status: "queued" | "uploading" | "processing" | "ready" | "failed";
  error?: string;
};

const TRIP_TYPES = [
  { v: "lua_de_mel", l: "Lua de mel" },
  { v: "familia", l: "Família" },
  { v: "aventura", l: "Aventura" },
  { v: "luxo", l: "Luxo" },
  { v: "cultural", l: "Cultural" },
  { v: "corporativo", l: "Corporativo" },
  { v: "grupo", l: "Grupo" },
  { v: "outro", l: "Outro" },
];

function formatType(t: string | null) {
  return TRIP_TYPES.find((x) => x.v === t)?.l ?? t ?? "—";
}

function ItinerariesPage() {
  const { user, isAdmin, hasRole } = useAuth();
  const canManage = isAdmin || hasRole("operacional");
  const [rows, setRows] = useState<Itinerary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tripType, setTripType] = useState<string>("all");
  const [language, setLanguage] = useState<string>("all");
  const [semanticQuery, setSemanticQuery] = useState("");
  const [semanticIds, setSemanticIds] = useState<string[] | null>(null);
  const [semanticBusy, setSemanticBusy] = useState(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [detail, setDetail] = useState<Itinerary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("itineraries")
      .select("*")
      .order("created_at", { ascending: false });
    setRows((data as Itinerary[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Realtime: refresh when processing finishes
  useEffect(() => {
    const channel = supabase
      .channel("itineraries-rt")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "itineraries" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = rows.filter((r) => {
    if (semanticIds && !semanticIds.includes(r.id)) return false;
    if (tripType !== "all" && r.trip_type !== tripType) return false;
    if (language !== "all" && r.language !== language) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [
        r.title,
        r.original_filename,
        ...(r.destinations ?? []),
        ...(r.tags ?? []),
        r.summary ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const runSemantic = async () => {
    if (!semanticQuery.trim()) {
      setSemanticIds(null);
      return;
    }
    setSemanticBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("itinerary-search", {
        body: { query: semanticQuery },
      });
      if (error) throw error;
      const ids = (data?.results ?? []).map((r: any) => r.itinerary_id);
      setSemanticIds(Array.from(new Set(ids)));
    } catch (e: any) {
      toast.error(e?.message ?? "Erro na busca semântica");
    } finally {
      setSemanticBusy(false);
    }
  };

  const downloadFile = async (it: Itinerary) => {
    const { data, error } = await supabase.storage
      .from("itineraries")
      .createSignedUrl(it.storage_path, 600);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Erro");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = it.original_filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const removeItinerary = async (it: Itinerary) => {
    if (!confirm(`Excluir "${it.title}"?`)) return;
    await supabase.storage.from("itineraries").remove([it.storage_path]);
    const { error } = await supabase.from("itineraries").delete().eq("id", it.id);
    if (error) toast.error(error.message);
    else load();
  };

  // ---- Upload em massa ----
  const handleFiles = async (files: File[]) => {
    if (!user) return;
    if (!canManage) {
      toast.error("Apenas admin/operacional podem cadastrar roteiros");
      return;
    }

    // Expand zips
    const expanded: File[] = [];
    for (const f of files) {
      if (f.name.toLowerCase().endsWith(".zip")) {
        try {
          const zip = await JSZip.loadAsync(f);
          for (const [name, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const lower = name.toLowerCase();
            if (!/\.(docx|pdf|doc)$/.test(lower)) continue;
            const blob = await entry.async("blob");
            expanded.push(new File([blob], name.split("/").pop() ?? name, { type: blob.type }));
          }
        } catch (e: any) {
          toast.error(`ZIP ${f.name}: ${e?.message}`);
        }
      } else {
        expanded.push(f);
      }
    }

    const valid = expanded.filter((f) => /\.(docx|pdf|doc)$/i.test(f.name));
    if (valid.length === 0) {
      toast.error("Nenhum .docx/.pdf encontrado");
      return;
    }

    // ---- Detectar duplicados (mesmo nome + tamanho) ----
    const { data: existing } = await supabase
      .from("itineraries")
      .select("original_filename,file_size_bytes")
      .eq("created_by", user.id);
    const existingKeys = new Set(
      (existing ?? []).map((r) => `${r.original_filename}::${r.file_size_bytes ?? ""}`),
    );
    const seenInBatch = new Set<string>();
    const unique: File[] = [];
    const duplicates: File[] = [];
    for (const f of valid) {
      const key = `${f.name}::${f.size}`;
      if (existingKeys.has(key) || seenInBatch.has(key)) {
        duplicates.push(f);
      } else {
        seenInBatch.add(key);
        unique.push(f);
      }
    }
    if (duplicates.length > 0) {
      toast.warning(`${duplicates.length} arquivo(s) duplicado(s) ignorado(s)`);
    }
    if (unique.length === 0) return;

    const dupJobs: UploadJob[] = duplicates.map((f) => ({
      id: crypto.randomUUID(),
      filename: f.name,
      size: f.size,
      status: "failed",
      error: "Já existe — duplicado ignorado",
    }));
    const newJobs: UploadJob[] = unique.map((f) => ({
      id: crypto.randomUUID(),
      filename: f.name,
      size: f.size,
      status: "queued",
    }));
    setJobs((prev) => [...dupJobs, ...newJobs, ...prev]);

    // Concurrency 2 (process-itinerary is memory-heavy)
    const queue = unique.map((f, idx) => ({ file: f, jobId: newJobs[idx].id }));
    const CONCURRENCY = 2;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) break;
        await processOne(item.file, item.jobId);
      }
    });
    await Promise.all(workers);
    load();
  };

  const updateJob = (id: string, patch: Partial<UploadJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  };

  const processOne = async (file: File, jobId: string) => {
    if (!user) return;
    updateJob(jobId, { status: "uploading" });
    try {
      const ext = file.name.split(".").pop()!.toLowerCase();
      const fmt = ext === "doc" ? "doc" : ext === "pdf" ? "pdf" : "docx";
      const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("itineraries")
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw upErr;

      const baseTitle = file.name.replace(/\.[^.]+$/, "");
      const { data: ins, error: insErr } = await supabase
        .from("itineraries")
        .insert({
          title: baseTitle,
          original_filename: file.name,
          storage_path: path,
          file_format: fmt,
          file_size_bytes: file.size,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      if (fmt === "doc") {
        await supabase
          .from("itineraries")
          .update({
            processing_status: "failed",
            processing_error:
              "Formato .doc legado não é suportado para extração automática. Converta para .docx ou .pdf e reenvie.",
          })
          .eq("id", ins.id);
        updateJob(jobId, { status: "failed", error: "converta .doc para .docx/.pdf" });
        return;
      }

      // Mark as ready (uploaded). Processing runs in background; status reflected via realtime.
      updateJob(jobId, { status: "ready" });
      // Fire-and-forget: don't block the upload worker on AI processing
      supabase.functions
        .invoke("process-itinerary", { body: { itinerary_id: ins.id } })
        .catch((err) => console.warn("process-itinerary kickoff failed", err));
    } catch (e: any) {
      let msg = e?.message ?? String(e);
      if (/duplicate key|itineraries_unique_per_user/i.test(msg)) msg = "Já existe — duplicado ignorado";
      else if (/memory limit/i.test(msg)) msg = "Documento muito grande — tente dividir";
      if (msg.length > 140) msg = msg.slice(0, 140) + "…";
      updateJob(jobId, { status: "failed", error: msg });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length) handleFiles(files);
  };

  const stats = {
    total: rows.length,
    ready: rows.filter((r) => r.processing_status === "ready").length,
    processing: rows.filter(
      (r) => r.processing_status === "processing" || r.processing_status === "pending",
    ).length,
    failed: rows.filter((r) => r.processing_status === "failed").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Biblioteca de Roteiros</h1>
        <p className="text-muted-foreground">
          {stats.total} roteiros · {stats.ready} prontos · {stats.processing} processando ·{" "}
          {stats.failed} com erro
        </p>
      </div>

      {canManage && (
        <Card
          className="border-dashed border-2 p-6 text-center cursor-pointer hover:bg-muted/30 transition"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
          <p className="font-medium">Arraste arquivos aqui ou clique para selecionar</p>
          <p className="text-sm text-muted-foreground mt-1">
            Aceita .docx, .pdf ou .zip (extraído automaticamente). Concorrência: 3
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".docx,.pdf,.doc,.zip"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) handleFiles(files);
              e.target.value = "";
            }}
          />
        </Card>
      )}

      {jobs.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Uploads recentes</h3>
            <Button size="sm" variant="ghost" onClick={() => setJobs([])}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center gap-3 py-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{j.filename}</div>
                  {j.error && <div className="text-xs text-destructive truncate">{j.error}</div>}
                </div>
                {j.status === "queued" && (
                  <Badge variant="outline" className="text-xs">
                    Fila
                  </Badge>
                )}
                {(j.status === "uploading" || j.status === "processing") && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {j.status === "uploading" ? "Enviando" : "Processando IA"}
                  </span>
                )}
                {j.status === "ready" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                {j.status === "failed" && <AlertCircle className="h-4 w-4 text-destructive" />}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="grid gap-2 md:grid-cols-[1fr,180px,160px,1fr,auto]">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por texto, destino, tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={tripType} onValueChange={setTripType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {TRIP_TYPES.map((t) => (
                <SelectItem key={t.v} value={t.v}>
                  {t.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os idiomas</SelectItem>
              <SelectItem value="en">Inglês</SelectItem>
              <SelectItem value="es">Espanhol</SelectItem>
              <SelectItem value="ru">Russo</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Sparkles className="absolute left-2 top-2.5 h-4 w-4 text-primary" />
            <Input
              placeholder='IA: "lua de mel 7 dias na Patagônia..."'
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSemantic()}
              className="pl-8"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={runSemantic} disabled={semanticBusy}>
              {semanticBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
            </Button>
            {semanticIds && (
              <Button variant="ghost" onClick={() => { setSemanticIds(null); setSemanticQuery(""); }}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">Nenhum roteiro encontrado.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((it) => (
            <Card key={it.id} className="p-4 space-y-2 cursor-pointer hover:border-primary/50 transition" onClick={() => setDetail(it)}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold line-clamp-2">{it.title}</h3>
                <StatusBadge s={it.processing_status} />
              </div>
              <div className="text-xs text-muted-foreground line-clamp-1">
                {(it.destinations ?? []).join(", ") || it.original_filename}
              </div>
              <div className="flex flex-wrap gap-1 text-xs">
                {it.duration_days && <Badge variant="secondary">{it.duration_days} dias</Badge>}
                {it.trip_type && <Badge variant="outline">{formatType(it.trip_type)}</Badge>}
                {it.year && <Badge variant="outline">{it.year}</Badge>}
              </div>
              {it.summary && (
                <p className="text-sm text-muted-foreground line-clamp-3">{it.summary}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detail && (
            <ItineraryDetail
              it={detail}
              canManage={canManage}
              onDownload={() => downloadFile(detail)}
              onDelete={async () => {
                await removeItinerary(detail);
                setDetail(null);
              }}
              onSaved={(updated) => {
                setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
                setDetail(updated);
              }}
              onReprocess={async () => {
                toast.info("Reprocessando...");
                await supabase.from("itineraries").update({ processing_status: "pending" }).eq("id", detail.id);
                await supabase.functions.invoke("process-itinerary", { body: { itinerary_id: detail.id } });
                load();
                setDetail(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ s }: { s: Itinerary["processing_status"] }) {
  if (s === "ready") return <Badge className="bg-green-600 hover:bg-green-700 text-white">Pronto</Badge>;
  if (s === "failed") return <Badge variant="destructive">Erro</Badge>;
  return (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      {s === "processing" ? "Processando" : "Fila"}
    </Badge>
  );
}

function ItineraryDetail({
  it,
  canManage,
  onDownload,
  onDelete,
  onSaved,
  onReprocess,
}: {
  it: Itinerary;
  canManage: boolean;
  onDownload: () => void;
  onDelete: () => void;
  onSaved: (it: Itinerary) => void;
  onReprocess: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: it.title,
    destinations: (it.destinations ?? []).join(", "),
    duration_days: it.duration_days?.toString() ?? "",
    trip_type: it.trip_type ?? "outro",
    tags: (it.tags ?? []).join(", "),
    year: it.year?.toString() ?? "",
    summary: it.summary ?? "",
  });

  const save = async () => {
    const { data, error } = await supabase
      .from("itineraries")
      .update({
        title: form.title,
        destinations: form.destinations.split(",").map((s) => s.trim()).filter(Boolean),
        duration_days: form.duration_days ? Number(form.duration_days) : null,
        trip_type: form.trip_type || null,
        tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
        year: form.year ? Number(form.year) : null,
        summary: form.summary || null,
      })
      .eq("id", it.id)
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Salvo");
    setEditing(false);
    onSaved(data as Itinerary);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {it.title}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <StatusBadge s={it.processing_status} />
          <span className="text-muted-foreground">{it.original_filename}</span>
        </div>
        {it.processing_error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {it.processing_error}
          </div>
        )}
        {!editing ? (
          <div className="space-y-2 text-sm">
            <Field label="Destinos" value={(it.destinations ?? []).join(", ")} />
            <Field label="Duração" value={it.duration_days ? `${it.duration_days} dias` : "—"} />
            <Field label="Tipo" value={formatType(it.trip_type)} />
            <Field label="Ano" value={it.year?.toString() ?? "—"} />
            <Field label="Tags" value={(it.tags ?? []).join(", ") || "—"} />
            {it.summary && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Resumo da IA</div>
                <p className="whitespace-pre-wrap">{it.summary}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <LabeledInput label="Título" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
            <LabeledInput label="Destinos (vírgula)" value={form.destinations} onChange={(v) => setForm({ ...form, destinations: v })} />
            <div className="grid grid-cols-3 gap-2">
              <LabeledInput label="Dias" value={form.duration_days} onChange={(v) => setForm({ ...form, duration_days: v })} />
              <LabeledInput label="Ano" value={form.year} onChange={(v) => setForm({ ...form, year: v })} />
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tipo</label>
                <Select value={form.trip_type} onValueChange={(v) => setForm({ ...form, trip_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIP_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <LabeledInput label="Tags (vírgula)" value={form.tags} onChange={(v) => setForm({ ...form, tags: v })} />
            <div>
              <label className="text-xs font-medium text-muted-foreground">Resumo</label>
              <Textarea rows={5} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </div>
          </div>
        )}
      </div>
      <DialogFooter className="gap-2 flex-wrap">
        <Button variant="outline" onClick={onDownload}>
          <Download className="h-4 w-4 mr-1" />
          Baixar
        </Button>
        {canManage && it.processing_status !== "processing" && (
          <Button variant="outline" onClick={onReprocess}>
            <Sparkles className="h-4 w-4 mr-1" />
            Reprocessar
          </Button>
        )}
        {canManage && !editing && (
          <Button variant="outline" onClick={() => setEditing(true)}>Editar</Button>
        )}
        {canManage && editing && (
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </>
        )}
        {canManage && (
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            Excluir
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px,1fr] gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
