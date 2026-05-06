import { useEffect, useState } from "react";
import { useRouterState, Link } from "@tanstack/react-router";
import { Sparkles, Maximize2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { listConversations, createConversation } from "@/server/assistant.functions";
import { useAuth } from "@/lib/auth";

export function AssistantFab() {
  const { user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || convId || !user) return;
    (async () => {
      const r = await listConversations();
      if (r.conversations[0]) setConvId(r.conversations[0].id);
      else {
        const c = await createConversation({ data: {} });
        setConvId(c.conversation.id);
      }
    })();
  }, [open, user]);

  if (!user) return null;
  if (path.startsWith("/assistant") || path.startsWith("/login")) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform"
        aria-label="Abrir assistente IA"
      >
        <Sparkles className="h-6 w-6" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Assistente IA</SheetTitle>
            <Button asChild size="sm" variant="ghost">
              <Link to="/assistant" onClick={() => setOpen(false)}>
                <Maximize2 className="h-4 w-4" />
              </Link>
            </Button>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            {convId && <AssistantChat conversationId={convId} />}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
