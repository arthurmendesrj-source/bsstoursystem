import { useState } from "react";
import { ArrowLeft, Reply, Forward, Archive, Trash2, Star, Sparkles, Link2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { AssociateDialog, type AssociateEntity } from "@/components/AssociateDialog";
import { AiTriageDialog } from "@/components/email/AiTriageDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ThreadMessage = {
  id: string; labelIds: string[]; snippet: string;
  from: { name: string; email: string }; to: string[]; cc: string[]; subject: string;
  date: string | null; bodyHtml: string; bodyText: string; hasAttachments: boolean;
  attachments: Array<{ attachment_id: string; filename: string; mime_type: string; size: number }>;
  isUnread: boolean;
};

export type ReaderThread = {
  id: string; subject: string | null; is_starred: boolean;
};

function formatRelative(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: sameYear ? undefined : "2-digit" });
}
function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ThreadReader({
  thread, messages, loading,
  onBack, onArchive, onTrash, onStar, onReply, onForward, onDownloadAttachment,
  showBack = false,
}: {
  thread: ReaderThread;
  messages: ThreadMessage[] | null;
  loading: boolean;
  onBack?: () => void;
  onArchive?: () => void;
  onTrash?: () => void;
  onStar?: () => void;
  onReply: (m: ThreadMessage) => void;
  onForward: (m: ThreadMessage) => void;
  onDownloadAttachment: (msgId: string, att: ThreadMessage["attachments"][number]) => void;
  showBack?: boolean;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const [assocOpen, setAssocOpen] = useState(false);
  const lastMsg = messages && messages.length > 0 ? messages[messages.length - 1] : null;

  const onAssociate = async (e: AssociateEntity) => {
    setAssocOpen(false);
    try {
      const update: Record<string, string | null> = {
        lead_id: null, customer_id: null, supplier_id: null,
      };
      if (e.kind === "lead") { update.lead_id = e.lead_id; update.customer_id = e.customer_id; }
      else if (e.kind === "customer") { update.customer_id = e.customer_id; }
      else if (e.kind === "supplier") { update.supplier_id = e.supplier_id; }
      else if (e.kind === "quote" || e.kind === "booking") {
        if (e.lead_id) update.lead_id = e.lead_id;
        if (e.customer_id) update.customer_id = e.customer_id;
      }
      // remove nulls so we don't wipe other fields
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(update)) if (v) cleaned[k] = v;
      if (Object.keys(cleaned).length === 0) { toast.error("Sem dados para associar"); return; }
      const { error } = await supabase.from("emails").update(cleaned).eq("thread_id", thread.id);
      if (error) throw new Error(error.message);
      toast.success(`Associado a ${e.label}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao associar"); }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      <div className="border-b p-3 flex items-center gap-2 flex-wrap">
        {showBack && onBack && (
          <Button size="icon" variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        )}
        <h2 className="text-lg font-semibold flex-1 truncate min-w-0">{thread.subject || "(sem assunto)"}</h2>
        <Button size="sm" variant="outline" onClick={() => setAiOpen(true)} disabled={!lastMsg}>
          <Sparkles className="h-4 w-4 mr-1" /> Triagem IA
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAssocOpen(true)}>
          <Link2 className="h-4 w-4 mr-1" /> Associar
        </Button>
        {onArchive && <Button size="icon" variant="ghost" onClick={onArchive} title="Arquivar"><Archive className="h-4 w-4" /></Button>}
        {onTrash && <Button size="icon" variant="ghost" onClick={onTrash} title="Lixeira"><Trash2 className="h-4 w-4" /></Button>}
        {onStar && (
          <Button size="icon" variant="ghost" onClick={onStar} title="Estrela">
            <Star className={cn("h-4 w-4", thread.is_starred && "fill-yellow-400 text-yellow-400")} />
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3 max-w-4xl mx-auto">
          {loading && <div className="text-sm text-muted-foreground">Carregando…</div>}
          {messages?.map((m) => (
            <article key={m.id} className="border rounded-lg overflow-hidden bg-card">
              <header className="px-4 py-3 border-b flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center shrink-0">
                  {(m.from.name || m.from.email || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <div className="font-semibold text-sm truncate">{m.from.name || m.from.email}</div>
                    <div className="text-xs text-muted-foreground truncate">&lt;{m.from.email}&gt;</div>
                    <div className="text-xs text-muted-foreground ml-auto shrink-0">{formatRelative(m.date)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">para {m.to.join(", ") || "—"}{m.cc.length ? ` · cc ${m.cc.join(", ")}` : ""}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => onReply(m)}><Reply className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => onForward(m)}><Forward className="h-4 w-4" /></Button>
                </div>
              </header>
              <div className="p-4">
                {m.bodyHtml ? (
                  <iframe srcDoc={m.bodyHtml} sandbox="" className="w-full min-h-[200px] border-0" title={`msg-${m.id}`} />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm font-sans">{m.bodyText || m.snippet}</pre>
                )}
                {m.attachments.length > 0 && (
                  <>
                    <Separator className="my-3" />
                    <div className="flex flex-wrap gap-2">
                      {m.attachments.map((a) => (
                        <button key={a.attachment_id} onClick={() => onDownloadAttachment(m.id, a)}
                          className="flex items-center gap-2 px-3 py-2 rounded border hover:bg-muted text-sm">
                          <Paperclip className="h-4 w-4" />
                          <span className="truncate max-w-[14rem]">{a.filename}</span>
                          <span className="text-xs text-muted-foreground">{bytes(a.size)}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </ScrollArea>

      <AiTriageDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        gmailId={lastMsg?.id ?? null}
        threadId={thread.id}
        fromEmail={lastMsg?.from.email}
        fromName={lastMsg?.from.name}
        subject={thread.subject ?? undefined}
      />
      <AssociateDialog
        open={assocOpen}
        onOpenChange={setAssocOpen}
        onPick={(e) => void onAssociate(e)}
        title="Associar conversa"
      />
    </div>
  );
}

// Badge re-export to avoid unused import warning if needed elsewhere
export { Badge };
