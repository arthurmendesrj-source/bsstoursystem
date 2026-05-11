import { createContext, useContext, useRef, type ReactNode } from "react";
import { FloatingWindowManager, type FloatingWindowManagerHandle, type FloatingWindowOpenOpts } from "@/components/FloatingWindowManager";

type Ctx = {
  openWindow: (opts: FloatingWindowOpenOpts) => void;
  closeWindow: (id: string) => void;
  minimizeAllWindows: () => void;
};

const WorkspaceWindowsContext = createContext<Ctx | null>(null);

export function useWorkspaceWindows(): Ctx {
  const ctx = useContext(WorkspaceWindowsContext);
  if (!ctx) {
    return { openWindow: () => {}, closeWindow: () => {}, minimizeAllWindows: () => {} };
  }
  return ctx;
}

export function WorkspaceWindowsProvider({ children }: { children: ReactNode }) {
  const ref = useRef<FloatingWindowManagerHandle>(null);
  const value: Ctx = {
    openWindow: (opts) => ref.current?.openOrFocus(opts),
    closeWindow: (id) => ref.current?.close(id),
    minimizeAllWindows: () => ref.current?.minimizeAll(),
  };
  return (
    <WorkspaceWindowsContext.Provider value={value}>
      {children}
      <FloatingWindowManager ref={ref} />
    </WorkspaceWindowsContext.Provider>
  );
}
