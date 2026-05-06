import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useAuth, type AppRole } from "@/lib/auth";

type ViewAsTarget = {
  user_id: string;
  full_name: string;
  role: AppRole;
};

type ViewAsCtx = {
  viewAs: ViewAsTarget | null;
  enterViewAs: (target: ViewAsTarget) => void;
  exitViewAs: () => void;
  /** Returns the user id whose data should be shown (impersonated id or your own). */
  effectiveUserId: () => string | undefined;
  /** True while impersonating — UI must stay read-only except admin-level actions. */
  readOnly: boolean;
};

const Ctx = createContext<ViewAsCtx | null>(null);

const STORAGE_KEY = "viewAs:target:v1";

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, hasRole } = useAuth();
  const allowed = isAdmin || hasRole("diretor") || hasRole("gerente") || hasRole("supervisor");

  const [viewAs, setViewAs] = useState<ViewAsTarget | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ViewAsTarget) : null;
    } catch {
      return null;
    }
  });

  // Clear if the logged-in user can no longer impersonate, or is impersonating themselves.
  useEffect(() => {
    if (!user) {
      setViewAs(null);
      return;
    }
    if (viewAs && (!allowed || viewAs.user_id === user.id)) {
      setViewAs(null);
    }
  }, [user?.id, allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (viewAs) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(viewAs));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, [viewAs]);

  const enterViewAs = useCallback((target: ViewAsTarget) => {
    if (!allowed || !user || target.user_id === user.id) return;
    setViewAs(target);
  }, [allowed, user?.id]);

  const exitViewAs = useCallback(() => setViewAs(null), []);

  const effectiveUserId = useCallback(() => viewAs?.user_id ?? user?.id, [viewAs, user?.id]);

  return (
    <Ctx.Provider
      value={{
        viewAs,
        enterViewAs,
        exitViewAs,
        effectiveUserId,
        readOnly: !!viewAs,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useViewAs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useViewAs must be used within ViewAsProvider");
  return ctx;
}
