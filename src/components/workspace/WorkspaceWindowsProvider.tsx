import { createContext, useContext, useRef, type ReactNode } from "react";
import { FloatingWindowManager, type FloatingWindowManagerHandle, type FloatingWindowOpenOpts } from "@/components/FloatingWindowManager";

type Ctx = {
  openWindow: (opts: FloatingWindowOpenOpts) => void;
  closeWindow: (id: string) => void;
};

const WorkspaceWindowsContext = createContext<Ctx | null>(null);

export function useWorkspaceWindows(): Ctx {
  const ctx = useContext(WorkspaceWindowsContext);
  if (!ctx) {
    // Safe no-op fallback so child components don't crash outside provider
    return { openWindow: () => {}, closeWindow: () => {} };
  }
  return ctx;
}

export function WorkspaceWindowsProvider({ children }: { children: ReactNode }) {
  const ref = useRef<FloatingWindowManagerHandle>(null);
  const value: Ctx = {
    openWindow: (opts) => ref.current?.openOrFocus(opts),
    closeWindow: (id) => ref.current?.close(id),
  };
  return (
    <WorkspaceWindowsContext.Provider value={value}>
      {children}
      <FloatingWindowManager ref={ref} />
    </WorkspaceWindowsContext.Provider>
  );
}
