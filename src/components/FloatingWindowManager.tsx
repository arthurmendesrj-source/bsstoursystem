import { forwardRef, useImperativeHandle, useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import { Rnd } from "react-rnd";
import { Minus, Square, X, Copy as RestoreIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FloatingWindowSize = { width: number; height: number };
export type FloatingWindowOpenOpts = {
  id: string;
  title: string;
  content: ReactNode;
  /** localStorage key suffix used to remember last rect (defaults to "default") */
  sizeKey?: string;
  defaultSize?: FloatingWindowSize;
  icon?: ReactNode;
};

type WState = "normal" | "min" | "max";
type WinRect = { x: number; y: number; width: number; height: number };
type Win = {
  id: string;
  title: string;
  content: ReactNode;
  icon?: ReactNode;
  sizeKey: string;
  state: WState;
  rect: WinRect;
  prevRect: WinRect;
  z: number;
};

const CASCADE = 32;
const MIN_W = 360;
const MIN_H = 240;

export type FloatingWindowManagerHandle = {
  openOrFocus: (opts: FloatingWindowOpenOpts) => void;
  close: (id: string) => void;
  hasOpen: (id: string) => boolean;
  minimizeAll: () => void;
};

function readLastRect(sizeKey: string, def: FloatingWindowSize): WinRect {
  if (typeof window === "undefined") return { x: 80, y: 80, ...def };
  try {
    const raw = localStorage.getItem(`window.last.${sizeKey}`);
    if (raw) {
      const r = JSON.parse(raw) as WinRect;
      if (typeof r.width === "number" && typeof r.height === "number") return r;
    }
  } catch { /* ignore */ }
  const w = Math.min(def.width, window.innerWidth - 120);
  const h = Math.min(def.height, window.innerHeight - 160);
  return { x: Math.max(40, (window.innerWidth - w) / 2), y: 80, width: w, height: h };
}
function saveLastRect(sizeKey: string, r: WinRect) {
  try { localStorage.setItem(`window.last.${sizeKey}`, JSON.stringify(r)); } catch { /* ignore */ }
}

export const FloatingWindowManager = forwardRef<FloatingWindowManagerHandle>(function FloatingWindowManager(_props, ref) {
  const [windows, setWindows] = useState<Win[]>([]);
  const zCounter = useRef(10);
  const cascadeIdx = useRef(0);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1280,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
    setWindows((prev) => {
      const w = prev.find((x) => x.id === id);
      if (w) saveLastRect(w.sizeKey, rect);
      return prev.map((x) => (x.id === id ? { ...x, rect } : x));
    });
  }, []);

  useImperativeHandle(ref, () => ({
    hasOpen: (id) => windows.some((w) => w.id === id),
    close,
    openOrFocus: ({ id, title, content, sizeKey, defaultSize, icon }) => {
      const key = sizeKey ?? "default";
      const def = defaultSize ?? { width: 900, height: 600 };
      setWindows((prev) => {
        const existing = prev.find((w) => w.id === id);
        const top = ++zCounter.current;
        if (existing) {
          return prev.map((w) => (w.id === id
            ? { ...w, title, content, icon, z: top, state: w.state === "min" ? "normal" : w.state }
            : w));
        }
        const base = readLastRect(key, def);
        const offset = (cascadeIdx.current++ % 8) * CASCADE;
        const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;
        const rect: WinRect = {
          x: Math.max(8, Math.min(base.x + offset, vw - base.width - 8)),
          y: Math.max(8, Math.min(base.y + offset, vh - 200)),
          width: base.width,
          height: base.height,
        };
        const w: Win = { id, title, content, icon, sizeKey: key, state: "normal", rect, prevRect: rect, z: top };
        return [...prev, w];
      });
    },
  }), [windows, close]);

  const visible = windows.filter((w) => w.state !== "min");
  const minimized = windows.filter((w) => w.state === "min");

  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-40">
        {visible.map((w) => {
          const isMax = w.state === "max";
          const size = isMax ? { width: viewport.w, height: viewport.h } : { width: w.rect.width, height: w.rect.height };
          const position = isMax ? { x: 0, y: 0 } : { x: w.rect.x, y: w.rect.y };
          return (
            <Rnd
              key={w.id}
              size={size}
              position={position}
              minWidth={MIN_W}
              minHeight={MIN_H}
              bounds="window"
              dragHandleClassName="floating-window-drag"
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
                <div className="floating-window-drag h-9 px-3 flex items-center gap-2 border-b bg-muted/60 cursor-move select-none">
                  {w.icon}
                  <span className="text-sm font-medium truncate flex-1">{w.title || "(sem título)"}</span>
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
                <div className="flex-1 min-h-0 overflow-auto">
                  {w.content}
                </div>
              </div>
            </Rnd>
          );
        })}
      </div>

      {minimized.length > 0 && (
        <div className="fixed bottom-2 right-2 z-50 flex flex-wrap gap-2 max-w-[80vw] justify-end">
          {minimized.map((w) => (
            <div key={w.id} className="flex items-center gap-1 bg-background border rounded-full shadow-md pl-3 pr-1 py-1">
              <button
                onClick={() => focus(w.id)}
                className="text-xs font-medium truncate max-w-[16rem] text-left hover:underline flex items-center gap-1.5"
                title={w.title}
              >
                {w.icon}
                {w.title || "(sem título)"}
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
