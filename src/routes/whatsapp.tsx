import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Send, Search, AlertCircle, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listWhatsappAccounts, sendWhatsappText } from "@/lib/whatsapp.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/whatsapp")({
  component: () => (
    <AuthGate>
      <AppShell>
        <WhatsappInbox />
      </AppShell>
    </AuthGate>
  ),
});

type Account = { id: string; display_phone: string; display_name: string | null };
type Conversation = {
  id: string;
  account_id: string;
  contact_phone: string;
  contact_name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  window_expires_at: string | null;
};
type Message = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  type: string;
  body: string | null;
  media_storage_path: string | null;
  media_url: string | null;
  status: string;
  sent_at: string;
};

function WhatsappInbox() {
  const listAccounts = useServerFn(listWhatsappAccounts);
  const sendText = useServerFn(sendWhatsappText);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load accounts
  useEffect(() => {
    listAccounts().then((r) => {
      setAccounts(r.accounts as Account[]);
      if (r.accounts.length > 0) setActiveAccount((r.accounts[0] as Account).id);
    });
  }, [listAccounts]);

  // Load conversations for active account + realtime
  useEffect(() => {
    if (!activeAccount) return;
    const load = async () => {
      const { data } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("account_id", activeAccount)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);
      setConversations((data ?? []) as Conversation[]);
    };
    load();
    const ch = supabase
      .channel(`wa-conv-${activeAccount}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations", filter: `account_id=eq.${activeAccount}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeAccount]);

  // Load messages for active conversation + realtime
  useEffect(() => {
    if (!activeConv) { setMessages([]); return; }
    const load = async () => {
      const { data } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", activeConv)
        .order("sent_at", { ascending: true })
        .limit(500);
      setMessages((data ?? []) as Message[]);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 50);
    };
    load();
    const ch = supabase
      .channel(`wa-msg-${activeConv}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages", filter: `conversation_id=eq.${activeConv}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeConv]);

  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.contact_phone.toLowerCase().includes(q) ||
        (c.contact_name?.toLowerCase().includes(q) ?? false) ||
        (c.last_message_preview?.toLowerCase().includes(q) ?? false),
    );
  }, [conversations, search]);

  const activeConvObj = conversations.find((c) => c.id === activeConv) ?? null;
  const windowExpired =
    activeConvObj?.window_expires_at &&
    new Date(activeConvObj.window_expires_at) < new Date();

  const handleSend = async () => {
    if (!draft.trim() || !activeConvObj || !activeAccount) return;
    setSending(true);
    try {
      await sendText({
        data: { accountId: activeAccount, to: activeConvObj.contact_phone, body: draft.trim() },
      });
      setDraft("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
    } finally {
      setSending(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="max-w-2xl">
        <Card className="p-8 text-center space-y-3">
          <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">Nenhum número WhatsApp conectado</h2>
          <p className="text-sm text-muted-foreground">
            Configure seu primeiro número em Configurações → WhatsApp para começar.
          </p>
          <Button asChild>
            <a href="/settings/whatsapp">Configurar agora</a>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-bold">WhatsApp</h1>
        <Select value={activeAccount} onValueChange={setActiveAccount}>
          <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.display_name ?? a.display_phone} ({a.display_phone})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-[320px_1fr] gap-3 flex-1 min-h-0">
        {/* Conversations list */}
        <Card className="flex flex-col min-h-0">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar conversa..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredConvs.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">Nenhuma conversa.</p>
            ) : (
              filteredConvs.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveConv(c.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 border-b hover:bg-accent transition-colors",
                    activeConv === c.id && "bg-accent",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm truncate">
                      {c.contact_name ?? c.contact_phone}
                    </div>
                    {c.unread_count > 0 && (
                      <Badge className="ml-2">{c.unread_count}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.last_message_preview ?? "—"}
                  </div>
                  {c.last_message_at && (
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(c.last_message_at).toLocaleString("pt-BR")}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Messages */}
        <Card className="flex flex-col min-h-0">
          {!activeConvObj ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Selecione uma conversa
            </div>
          ) : (
            <>
              <div className="p-3 border-b">
                <div className="font-medium">{activeConvObj.contact_name ?? activeConvObj.contact_phone}</div>
                <div className="text-xs text-muted-foreground">{activeConvObj.contact_phone}</div>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[70%] rounded-lg px-3 py-2 text-sm",
                      m.direction === "out"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-background border",
                    )}
                  >
                    {m.body && <div className="whitespace-pre-wrap">{m.body}</div>}
                    {m.media_storage_path && (
                      <div className="text-xs opacity-80 italic">[anexo: {m.type}]</div>
                    )}
                    <div className={cn("text-[10px] mt-1", m.direction === "out" ? "opacity-70" : "text-muted-foreground")}>
                      {new Date(m.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {m.direction === "out" && ` · ${m.status}`}
                    </div>
                  </div>
                ))}
              </div>
              {windowExpired && (
                <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/30 flex items-center gap-2 text-xs">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Janela de 24h expirou. Use um template aprovado para reabrir a conversa.
                </div>
              )}
              <div className="p-3 border-t flex gap-2">
                <Textarea
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={windowExpired ? "Janela expirada — use template" : "Mensagem..."}
                  disabled={!!windowExpired || sending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <Button onClick={handleSend} disabled={!draft.trim() || !!windowExpired || sending}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
