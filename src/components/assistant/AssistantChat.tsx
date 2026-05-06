import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Send, Loader2, Check, X, Sparkles } from "lucide-react";
import { approveAction, rejectAction } from "@/server/assistant.functions";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

type Message = {
  id?: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string | null;
  tool_calls?: any;
  name?: string;
};

type PendingAction = {
  id: string;
  action_type: string;
  payload: any;
  status: string;
  result?: any;
  error?: string;
};

export function AssistantChat({ conversationId, onTitleChange }: { conversationId: string; onTitleChange?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = async () => {
    const [{ data: msgs }, { data: acts }] = await Promise.all([
      supabase.from("ai_messages").select("*").eq("conversation_id", conversationId).order("created_at"),
      supabase.from("ai_pending_actions").select("*").eq("conversation_id", conversationId).order("created_at"),
    ]);
    setMessages((msgs ?? []) as any);
    setActions((acts ?? []) as any);
  };

  useEffect(() => {
    load();
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setStreaming(true);
    setStreamingText("");

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const resp = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversationId, message: text }),
        signal: ac.signal,
      });
      if (!resp.ok || !resp.body) throw new Error("Falha no chat");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "delta") {
              acc += ev.content;
              setStreamingText(acc);
            } else if (ev.type === "error") {
              toast.error(ev.message);
            } else if (ev.type === "pending_action") {
              setActions((a) => [...a, ev.action]);
            } else if (ev.type === "tool_result") {
              // optional indicator
            } else if (ev.type === "image") {
              // image markdown will appear in assistant text usually
            } else if (ev.type === "done") {
              // reload to get persisted messages cleanly
            }
          } catch {}
        }
      }
      await load();
      setStreamingText("");
      onTitleChange?.();
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error(e.message);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveAction({ data: { id } });
      toast.success("Ação aprovada e executada");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao aprovar");
      await load();
    }
  };
  const handleReject = async (id: string) => {
    try {
      await rejectAction({ data: { id } });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !streamingText && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            <p className="font-medium">Como posso ajudar hoje?</p>
            <p className="text-xs max-w-sm">Liste meus leads quentes • Crie um pacote para Bariloche • Gere um post para Instagram sobre Fernando de Noronha</p>
          </div>
        )}
        {messages.filter((m) => m.role !== "tool" && m.role !== "system").map((m, i) => (
          <MessageBubble key={i} role={m.role as any} content={m.content ?? ""} />
        ))}
        {streamingText && <MessageBubble role="assistant" content={streamingText} />}
        {streaming && !streamingText && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> pensando...
          </div>
        )}
        {actions.filter((a) => a.status === "pending").map((a) => (
          <PendingActionCard key={a.id} action={a} onApprove={() => handleApprove(a.id)} onReject={() => handleReject(a.id)} />
        ))}
      </div>
      <div className="border-t p-3 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Pergunte ou peça uma ação..."
          className="min-h-[50px] max-h-32 resize-none"
          disabled={streaming}
        />
        <Button onClick={send} disabled={streaming || !input.trim()} size="icon" className="h-auto">
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted",
      )}>
        {isUser ? (
          <div className="whitespace-pre-wrap">{content}</div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function PendingActionCard({ action, onApprove, onReject }: { action: PendingAction; onApprove: () => void; onReject: () => void }) {
  const labels: Record<string, string> = {
    propose_create_lead: "Criar Lead",
    propose_update_lead: "Atualizar Lead",
    propose_create_interaction: "Registrar Interação",
    propose_create_activity: "Criar Atividade Operacional",
  };
  return (
    <Card className="p-3 border-amber-500/50 bg-amber-50 dark:bg-amber-950/30">
      <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-2">
        Ação pendente: {labels[action.action_type] ?? action.action_type}
      </div>
      <pre className="text-xs bg-background/50 rounded p-2 overflow-x-auto mb-2">
        {JSON.stringify(action.payload, null, 2)}
      </pre>
      <div className="flex gap-2">
        <Button size="sm" onClick={onApprove}><Check className="h-4 w-4 mr-1" />Aprovar</Button>
        <Button size="sm" variant="outline" onClick={onReject}><X className="h-4 w-4 mr-1" />Rejeitar</Button>
      </div>
    </Card>
  );
}
