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
  /** True while impersonating — UI shows banner; ações ainda permitidas (modo espelho). */
  isImpersonating: boolean;
  /** Deprecated: mantido por compat — sempre false no modo espelho. */
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
        isImpersonating: !!viewAs,
        readOnly: false,
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

/** Hook ergonômico: devolve o id efetivo (alvo da impersonação ou usuário logado). */
export function useEffectiveUser() {
  const { user } = useAuth();
  const { viewAs } = useViewAs();
  return {
    id: viewAs?.user_id ?? user?.id,
    isImpersonating: !!viewAs,
    target: viewAs,
    realUserId: user?.id,
  };
}
