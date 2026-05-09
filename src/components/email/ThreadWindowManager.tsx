import { forwardRef, useImperativeHandle, useRef, useState, useCallback } from "react";
import { Rnd } from "react-rnd";
import { Minus, Square, X, Copy as RestoreIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThreadReader, type ThreadMessage } from "@/components/email/ThreadReader";

export type WindowThreadInfo = { id: string; subject: string | null; is_starred: boolean };

type WState = "normal" | "min" | "max";
type WinRect = { x: number; y: number; width: number; height: number };
type Win = {
  id: string;
  thread: WindowThreadInfo;
  messages: ThreadMessage[] | null;
  loading: boolean;
  state: WState;
  rect: WinRect;        // current rect (used in normal)
  prevRect: WinRect;    // saved rect for restore from max
  z: number;
};

const LS_RECT = "email.window.lastRect";
const DEFAULT_W = 900;
const DEFAULT_H = 600;
const CASCADE = 32;
const MIN_W = 360;
const MIN_H = 280;

export type ThreadWindowManagerHandle = {
  openOrFocus: (thread: WindowThreadInfo) => void;
  hasOpen: (id: string) => boolean;
};

type Props = {
  fetchMessages: (threadId: string) => Promise<ThreadMessage[]>;
  onMarkRead?: (threadId: string) => void;
  onStar?: (thread: WindowThreadInfo) => void;
  onArchive?: (threadId: string) => void;
  onTrash?: (threadId: string) => void;
  onReply: (m: ThreadMessage) => void;
  onForward: (m: ThreadMessage) => void;
  onDownloadAttachment: (msgId: string, att: ThreadMessage["attachments"][number]) => void;
};

function readLastRect(): WinRect {
  if (typeof window === "undefined") return { x: 80, y: 80, width: DEFAULT_W, height: DEFAULT_H };
  try {
    const raw = localStorage.getItem(LS_RECT);
    if (raw) {
      const r = JSON.parse(raw) as WinRect;
      if (typeof r.width === "number" && typeof r.height === "number") return r;
    }
  } catch { /* ignore */ }
  const w = Math.min(DEFAULT_W, window.innerWidth - 120);
  const h = Math.min(DEFAULT_H, window.innerHeight - 160);
  return { x: Math.max(40, (window.innerWidth - w) / 2), y: 80, width: w, height: h };
}
function saveLastRect(r: WinRect) {
  try { localStorage.setItem(LS_RECT, JSON.stringify(r)); } catch { /* ignore */ }
}

export const ThreadWindowManager = forwardRef<ThreadWindowManagerHandle, Props>(function ThreadWindowManager(props, ref) {
  const [windows, setWindows] = useState<Win[]>([]);
  const zCounter = useRef(10);
  const cascadeIdx = useRef(0);

  const focus = useCallback((id: string) => {
    setWindows((prev) => {
      const top = ++zCounter.current;
      return prev.map((w) => (w.id === id ? { ...w, z: top, state: w.state === "min" ? "normal" : w.state } : w));
    });
  }, []);

  const close = useCallback((id: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const minimize = useCallback((id: string) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, state: "min" } : w)));
  }, []);

  const toggleMax = useCallback((id: string) => {
    setWindows((prev) => prev.map((w) => {
      if (w.id !== id) return w;
      if (w.state === "max") return { ...w, state: "normal", rect: w.prevRect };
      return { ...w, state: "max", prevRect: w.rect };
    }));
  }, []);

  const setRect = useCallback((id: string, rect: WinRect) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, rect } : w)));
    saveLastRect(rect);
  }, []);

  useImperativeHandle(ref, () => ({
    hasOpen: (id) => windows.some((w) => w.id === id),
    openOrFocus: (thread) => {
      setWindows((prev) => {
        const existing = prev.find((w) => w.id === thread.id);
        const top = ++zCounter.current;
        if (existing) {
          return prev.map((w) => (w.id === thread.id
            ? { ...w, thread, z: top, state: w.state === "min" ? "normal" : w.state }
            : w));
        }
        const base = readLastRect();
        const offset = (cascadeIdx.current++ % 8) * CASCADE;
        const rect: WinRect = {
          x: Math.max(8, Math.min(base.x + offset, (typeof window !== "undefined" ? window.innerWidth : 1280) - base.width - 8)),
          y: Math.max(8, Math.min(base.y + offset, (typeof window !== "undefined" ? window.innerHeight : 800) - 200)),
          width: base.width,
          height: base.height,
        };
        const w: Win = { id: thread.id, thread, messages: null, loading: true, state: "normal", rect, prevRect: rect, z: top };
        // fire fetch
        void props.fetchMessages(thread.id).then((msgs) => {
          setWindows((cur) => cur.map((x) => (x.id === thread.id ? { ...x, messages: msgs, loading: false } : x)));
          props.onMarkRead?.(thread.id);
        }).catch(() => {
          setWindows((cur) => cur.map((x) => (x.id === thread.id ? { ...x, loading: false } : x)));
        });
        return [...prev, w];
      });
    },
  }), [windows, props]);

  const visible = windows.filter((w) => w.state !== "min");
  const minimized = windows.filter((w) => w.state === "min");

  return (
    <>
      {/* Camada das janelas — pointer-events-none no fundo, ativo só nas janelas */}
      <div className="fixed inset-0 pointer-events-none z-40">
        {visible.map((w) => {
          const isMax = w.state === "max";
          const size = isMax
            ? { width: typeof window !== "undefined" ? window.innerWidth : 1280, height: typeof window !== "undefined" ? window.innerHeight - 64 : 800 }
            : { width: w.rect.width, height: w.rect.height };
          const position = isMax ? { x: 0, y: 64 } : { x: w.rect.x, y: w.rect.y };
          return (
            <Rnd
              key={w.id}
              size={size}
              position={position}
              minWidth={MIN_W}
              minHeight={MIN_H}
              bounds="window"
              dragHandleClassName="email-window-drag"
              disableDragging={isMax}
              enableResizing={!isMax}
              onDragStop={(_, d) => setRect(w.id, { ...w.rect, x: d.x, y: d.y })}
              onResizeStop={(_, __, refEl, ___, pos) => setRect(w.id, {
                width: parseInt(refEl.style.width, 10),
                height: parseInt(refEl.style.height, 10),
                x: pos.x, y: pos.y,
              })}
              style={{ zIndex: w.z, pointerEvents: "auto" }}
            >
              <div
                onMouseDown={() => focus(w.id)}
                className={cn(
                  "h-full w-full bg-background border rounded-lg shadow-2xl flex flex-col overflow-hidden",
                  isMax && "rounded-none border-0"
                )}
              >
                {/* Title bar */}
                <div className="email-window-drag h-9 px-3 flex items-center gap-2 border-b bg-muted/60 cursor-move select-none">
                  <span className="text-sm font-medium truncate flex-1">{w.thread.subject || "(sem assunto)"}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => minimize(w.id)} title="Minimizar">
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleMax(w.id)} title={isMax ? "Restaurar" : "Maximizar"}>
                    {isMax ? <RestoreIcon className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-destructive hover:text-destructive-foreground" onClick={() => close(w.id)} title="Fechar">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {/* Conteúdo */}
                <div className="flex-1 min-h-0 flex flex-col">
                  <ThreadReader
                    thread={{ id: w.thread.id, subject: w.thread.subject, is_starred: w.thread.is_starred }}
                    messages={w.messages}
                    loading={w.loading}
                    onArchive={props.onArchive ? () => { props.onArchive!(w.id); close(w.id); } : undefined}
                    onTrash={props.onTrash ? () => { props.onTrash!(w.id); close(w.id); } : undefined}
                    onStar={props.onStar ? () => props.onStar!(w.thread) : undefined}
                    onReply={(m) => props.onReply(m)}
                    onForward={(m) => props.onForward(m)}
                    onDownloadAttachment={(id, a) => props.onDownloadAttachment(id, a)}
                  />
                </div>
              </div>
            </Rnd>
          );
        })}
      </div>

      {/* Barra de minimizadas */}
      {minimized.length > 0 && (
        <div className="fixed bottom-2 right-2 z-50 flex flex-wrap gap-2 max-w-[80vw] justify-end">
          {minimized.map((w) => (
            <div key={w.id} className="flex items-center gap-1 bg-background border rounded-full shadow-md pl-3 pr-1 py-1">
              <button
                onClick={() => focus(w.id)}
                className="text-xs font-medium truncate max-w-[16rem] text-left hover:underline"
                title={w.thread.subject || "(sem assunto)"}
              >
                {w.thread.subject || "(sem assunto)"}
              </button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => close(w.id)} title="Fechar">
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </>
  );
});
