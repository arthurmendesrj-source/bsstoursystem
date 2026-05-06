import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { Button } from "@/components/ui/button";
import { listConversations, createConversation, deleteConversation } from "@/server/assistant.functions";
import { Plus, Trash2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/assistant")({
  component: AssistantPage,
});

function AssistantPage() {
  const [convs, setConvs] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const reload = async () => {
    const r = await listConversations();
    setConvs(r.conversations);
    if (!activeId && r.conversations[0]) setActiveId(r.conversations[0].id);
  };
  useEffect(() => { reload(); }, []);

  const newConv = async () => {
    const r = await createConversation({ data: {} });
    await reload();
    setActiveId(r.conversation.id);
  };

  const remove = async (id: string) => {
    await deleteConversation({ data: { id } });
    if (activeId === id) setActiveId(null);
    await reload();
  };

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-8rem)] gap-4">
        <aside className="w-64 border rounded-lg flex flex-col bg-card">
          <div className="p-3 border-b">
            <Button onClick={newConv} className="w-full" size="sm">
              <Plus className="h-4 w-4 mr-2" />Nova conversa
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {convs.map((c) => (
              <div
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer",
                  activeId === c.id ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="flex-1 truncate">{c.title}</span>
                <button onClick={(e) => { e.stopPropagation(); remove(c.id); }} className="opacity-0 group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            ))}
            {convs.length === 0 && (
              <p className="text-xs text-muted-foreground p-3 text-center">Nenhuma conversa. Crie uma nova.</p>
            )}
          </div>
        </aside>
        <main className="flex-1 border rounded-lg bg-card overflow-hidden">
          {activeId ? (
            <AssistantChat conversationId={activeId} onTitleChange={reload} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Selecione ou crie uma conversa
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}
