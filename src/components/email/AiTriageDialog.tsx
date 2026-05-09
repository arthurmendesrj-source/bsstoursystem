import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Languages, Link2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { emailAnalyze, emailTranslate } from "@/server/gmail.functions";
import { supabase } from "@/integrations/supabase/client";
import { linkEmailThread } from "@/lib/linkEmailToEntity";
import { useAuth } from "@/lib/auth";
import { useSubordinates } from "@/lib/hierarchy";
import { AssociateDialog, type AssociateEntity } from "@/components/AssociateDialog";

type Suggestion = {
  summary?: string;
  suggested_action?: "create_lead" | "create_task" | "ignore";
  suggested_task_category?: "negocio" | "suporte" | null;
  suggested_task_priority?: "baixa" | "media" | "alta" | null;
  suggested_task_title?: string | null;
  is_lead?: boolean;
  intent?: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  destination?: string | null;
  expected_travel_date?: string | null;
  pax?: number | null;
  estimated_value?: number | null;
  currency?: "BRL" | "USD" | "EUR" | null;
  notes?: string | null;
};

export function AiTriageDialog({
  open, onOpenChange, gmailId, threadId, fromEmail, fromName, subject,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gmailId: string | null;
  threadId: string | null;
  fromEmail?: string;
  fromName?: string;
  subject?: string;
}) {
  const analyzeFn = useServerFn(emailAnalyze);
  const translateFn = useServerFn(emailTranslate);
  const { user, roles } = useAuth();
  const { subordinates, loading: loadingSubs } = useSubordinates();
  const canAssign = roles.some((r) => ["admin", "diretor", "gerente", "supervisor"].includes(r));
  const [loading, setLoading] = useState(false);
  const [sug, setSug] = useState<Suggestion | null>(null);
  const [mode, setMode] = useState<"summary" | "lead" | "task">("summary");
  const [saving, setSaving] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string>("");

  // translation
  const [targetLang, setTargetLang] = useState<string>("Português");
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState<string>("");

  // associate
  const [associateOpen, setAssociateOpen] = useState(false);
  const [linkedTo, setLinkedTo] = useState<{ kind: string; label: string } | null>(null);

  // lead form
  const [lName, setLName] = useState("");
  const [lEmail, setLEmail] = useState("");
  const [lPhone, setLPhone] = useState("");
  const [lDest, setLDest] = useState("");
  const [lValue, setLValue] = useState("");
  const [lDate, setLDate] = useState("");
  const [lNotes, setLNotes] = useState("");

  // task form
  const [tTitle, setTTitle] = useState("");
  const [tCategory, setTCategory] = useState<"negocio" | "suporte">("suporte");
  const [tPriority, setTPriority] = useState<"baixa" | "media" | "alta">("media");
  const [tDescription, setTDescription] = useState("");
  const [tDue, setTDue] = useState("");

  useEffect(() => {
    if (!open || !gmailId) return;
    setSug(null); setMode("summary"); setLoading(true);
    setTranslation(""); setTranslating(false);
    setLinkedTo(null);
    setAssignedTo(user?.id ?? "");
    analyzeFn({ data: { gmail_id: gmailId } })
      .then((r: any) => {
        const s = r?.suggestion ?? {};
        setSug(s);
        setLName(s.customer_name || fromName || "");
        setLEmail(s.customer_email || fromEmail || "");
        setLPhone(s.customer_phone || "");
        setLDest(s.destination || "");
        setLValue(s.estimated_value ? String(s.estimated_value) : "");
        setLDate(s.expected_travel_date || "");
        setLNotes(s.notes || s.summary || "");
        setTTitle(s.suggested_task_title || subject || "Atividade do email");
        setTCategory((s.suggested_task_category as any) || "suporte");
        setTPriority((s.suggested_task_priority as any) || "media");
        setTDescription(s.summary || "");
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro IA"))
      .finally(() => setLoading(false));
  }, [open, gmailId, user?.id]);

  const doTranslate = async () => {
    if (!gmailId) return;
    setTranslating(true);
    try {
      const r: any = await translateFn({ data: { gmail_id: gmailId, target_language: targetLang } });
      setTranslation(r?.translated ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao traduzir");
    } finally {
      setTranslating(false);
    }
  };

  const onAssociate = async (e: AssociateEntity) => {
    if (!threadId) { toast.error("Thread indisponível"); return; }
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      let n = 0;
      if (e.kind === "lead") {
        n = await linkEmailThread(threadId, { lead_id: e.lead_id, customer_id: e.customer_id ?? undefined });
      } else if (e.kind === "customer") {
        n = await linkEmailThread(threadId, { customer_id: e.customer_id });
      } else if (e.kind === "supplier") {
        n = await linkEmailThread(threadId, { supplier_id: e.supplier_id });
      } else if (e.kind === "booking") {
        // emails table has no booking_id; mirror to email_message_links per message
        const { data: msgs } = await supabase
          .from("emails")
          .select("gmail_id, thread_id, from_email, subject, snippet")
          .eq("thread_id", threadId);
        const rows = (msgs ?? []).map((m: any) => ({
          gmail_message_id: m.gmail_id,
          gmail_thread_id: m.thread_id,
          from_email: m.from_email,
          subject: m.subject,
          snippet: m.snippet,
          booking_id: e.id,
          lead_id: e.lead_id,
          customer_id: e.customer_id,
          created_by: uid,
        }));
        if (rows.length > 0) {
          const { error } = await supabase.from("email_message_links").insert(rows);
          if (error) throw new Error(error.message);
        }
        n = rows.length;
      } else if (e.kind === "quote") {
        // quote not in chosen scope; treat as lead/customer link if available
        n = await linkEmailThread(threadId, {
          lead_id: e.lead_id ?? undefined,
          customer_id: e.customer_id ?? undefined,
        });
      }
      setLinkedTo({ kind: e.kind, label: e.label });
      toast.success(`Vinculado · ${n} mensagem(ns)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao associar");
    }
  };


  const createLead = async () => {
    if (!lName.trim()) { toast.error("Nome obrigatório"); return; }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      const { data, error } = await supabase.from("leads").insert({
        name: lName, email: lEmail || null, phone: lPhone || null,
        destination: lDest || null, source: "email",
        estimated_value: lValue ? Number(lValue) : null,
        expected_travel_date: lDate || null,
        notes: lNotes || null,
        created_by: uid, assigned_to: assignedTo || uid,
      }).select("id").single();
      if (error) throw new Error(error.message);
      // link this thread + register in email_message_links
      let linked = 0;
      if (threadId && data?.id) {
        linked = await linkEmailThread(threadId, { lead_id: data.id });
      }
      toast.success(`Lead criado${linked ? ` · ${linked} mensagens vinculadas` : ""}`);
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setSaving(false); }
  };

  const createTask = async () => {
    if (!tTitle.trim()) { toast.error("Título obrigatório"); return; }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      // find an email_id for this thread + inherit lead/customer if any
      let emailId: string | null = null;
      let leadFromThread: string | null = null;
      let customerFromThread: string | null = null;
      if (threadId) {
        const { data: er } = await supabase
          .from("emails")
          .select("id, lead_id, customer_id")
          .eq("thread_id", threadId)
          .limit(1)
          .maybeSingle();
        emailId = er?.id ?? null;
        leadFromThread = er?.lead_id ?? null;
        customerFromThread = er?.customer_id ?? null;
      }
      const { error } = await supabase.from("tasks").insert({
        title: tTitle, description: tDescription || null,
        category: tCategory, priority: tPriority,
        due_date: tDue ? new Date(tDue).toISOString() : null,
        source: "email", email_id: emailId,
        lead_id: leadFromThread, customer_id: customerFromThread,
        created_by: uid, assigned_to: assignedTo || uid,
      });
      if (error) throw new Error(error.message);
      toast.success("Atividade criada");
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setSaving(false); }
  };

  const ignore = async () => {
    if (threadId) {
      await supabase.from("email_threads").update({ is_unread: false }).eq("id", threadId);
      await supabase.from("emails").update({ is_unread: false }).eq("thread_id", threadId);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Triagem com IA
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Analisando email…
          </div>
        )}

        {!loading && sug && mode === "summary" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resumo</div>
              <p className="text-sm">{sug.summary || "—"}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {sug.intent && <Badge variant="secondary">{sug.intent}</Badge>}
                {sug.is_lead && <Badge variant="default">lead potencial</Badge>}
                {sug.destination && <Badge variant="outline">{sug.destination}</Badge>}
                {sug.pax != null && <Badge variant="outline">{sug.pax} pax</Badge>}
                {sug.estimated_value != null && (
                  <Badge variant="outline">{sug.currency || "BRL"} {Number(sug.estimated_value).toLocaleString("pt-BR")}</Badge>
                )}
              </div>
            </div>
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Languages className="h-4 w-4 text-muted-foreground" />
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Traduzir email</Label>
                <div className="flex-1" />
                <Select value={targetLang} onValueChange={setTargetLang}>
                  <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Português">Português</SelectItem>
                    <SelectItem value="Inglês">Inglês</SelectItem>
                    <SelectItem value="Espanhol">Espanhol</SelectItem>
                    <SelectItem value="Francês">Francês</SelectItem>
                    <SelectItem value="Italiano">Italiano</SelectItem>
                    <SelectItem value="Alemão">Alemão</SelectItem>
                    <SelectItem value="Japonês">Japonês</SelectItem>
                    <SelectItem value="Chinês">Chinês</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => void doTranslate()} disabled={translating}>
                  {translating ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Traduzindo…</> : "Traduzir"}
                </Button>
              </div>
              {translation && (
                <pre className="text-sm whitespace-pre-wrap font-sans bg-muted/40 rounded p-2 max-h-72 overflow-y-auto">{translation}</pre>
              )}
            </div>
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Associar a registro existente</Label>
                <div className="flex-1" />
                {linkedTo ? (
                  <Button size="sm" variant="outline" onClick={() => setAssociateOpen(true)}>Trocar</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setAssociateOpen(true)}>
                    <Link2 className="h-3 w-3 mr-1" /> Associar
                  </Button>
                )}
              </div>
              {linkedTo ? (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-muted-foreground capitalize">{linkedTo.kind}:</span>
                  <span className="font-medium">{linkedTo.label}</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Vincule este e-mail a um lead, cliente, fornecedor ou reserva já cadastrado.</p>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Recomendação da IA: <strong>{sug.suggested_action === "create_lead" ? "Criar Lead" : sug.suggested_action === "create_task" ? "Criar Atividade" : "Ignorar"}</strong>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant={sug.suggested_action === "create_lead" ? "default" : "outline"} onClick={() => setMode("lead")}>Criar Lead</Button>
              <Button variant={sug.suggested_action === "create_task" ? "default" : "outline"} onClick={() => setMode("task")}>Criar Atividade</Button>
              <Button variant="ghost" onClick={() => void ignore()}>Ignorar</Button>
            </div>
          </div>
        )}

        {!loading && mode === "lead" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome</Label><Input value={lName} onChange={(e) => setLName(e.target.value)} /></div>
              <div><Label>Email</Label><Input value={lEmail} onChange={(e) => setLEmail(e.target.value)} /></div>
              <div><Label>Telefone</Label><Input value={lPhone} onChange={(e) => setLPhone(e.target.value)} /></div>
              <div><Label>Destino</Label><Input value={lDest} onChange={(e) => setLDest(e.target.value)} /></div>
              <div><Label>Valor estimado</Label><Input type="number" value={lValue} onChange={(e) => setLValue(e.target.value)} /></div>
              <div><Label>Data viagem</Label><Input type="date" value={lDate} onChange={(e) => setLDate(e.target.value)} /></div>
            </div>
            {canAssign && (
              <div>
                <Label>Atribuir a</Label>
                <Select value={assignedTo || (user?.id ?? "")} onValueChange={setAssignedTo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {user?.id && <SelectItem value={user.id}>Eu</SelectItem>}
                    {loadingSubs && <SelectItem value="__loading" disabled>Carregando…</SelectItem>}
                    {!loadingSubs && subordinates.length === 0 && (
                      <SelectItem value="__empty" disabled>Nenhum subordinado disponível</SelectItem>
                    )}
                    {subordinates.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>{s.full_name} ({s.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Notas</Label><Textarea rows={4} value={lNotes} onChange={(e) => setLNotes(e.target.value)} /></div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMode("summary")}>Voltar</Button>
              <Button onClick={() => void createLead()} disabled={saving}>{saving ? "Salvando…" : "Criar Lead"}</Button>
            </DialogFooter>
          </div>
        )}

        {!loading && mode === "task" && (
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={tTitle} onChange={(e) => setTTitle(e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select value={tCategory} onValueChange={(v) => setTCategory(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="negocio">Negócio</SelectItem>
                    <SelectItem value="suporte">Suporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={tPriority} onValueChange={(v) => setTPriority(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Vencimento</Label><Input type="datetime-local" value={tDue} onChange={(e) => setTDue(e.target.value)} /></div>
            </div>
            {canAssign && (
              <div>
                <Label>Atribuir a</Label>
                <Select value={assignedTo || (user?.id ?? "")} onValueChange={setAssignedTo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {user?.id && <SelectItem value={user.id}>Eu</SelectItem>}
                    {loadingSubs && <SelectItem value="__loading" disabled>Carregando…</SelectItem>}
                    {!loadingSubs && subordinates.length === 0 && (
                      <SelectItem value="__empty" disabled>Nenhum subordinado disponível</SelectItem>
                    )}
                    {subordinates.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>{s.full_name} ({s.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Descrição</Label><Textarea rows={5} value={tDescription} onChange={(e) => setTDescription(e.target.value)} /></div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMode("summary")}>Voltar</Button>
              <Button onClick={() => void createTask()} disabled={saving}>{saving ? "Salvando…" : "Criar Atividade"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
