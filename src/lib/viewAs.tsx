import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useAuth, type AppRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

type ViewAsTarget = {
  user_id: string;
  full_name: string;
  role: AppRole;
};

type ViewAsCtx = {
  viewAs: ViewAsTarget | null;
  targetRoles: AppRole[];
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
const ROLES_STORAGE_KEY = "viewAs:targetRoles:v1";

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

  const [targetRoles, setTargetRoles] = useState<AppRole[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = sessionStorage.getItem(ROLES_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AppRole[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!user) {
      setViewAs(null);
      setTargetRoles([]);
      return;
    }
    if (viewAs && (!allowed || viewAs.user_id === user.id)) {
      setViewAs(null);
      setTargetRoles([]);
    }
  }, [user?.id, allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch roles for the impersonated user
  useEffect(() => {
    if (!viewAs) {
      setTargetRoles([]);
      return;
    }
    let cancel = false;
    supabase.from("user_roles").select("role").eq("user_id", viewAs.user_id).then(({ data }) => {
      if (cancel) return;
      const roles = (data ?? []).map((r: { role: AppRole }) => r.role);
      setTargetRoles(roles.length > 0 ? roles : [viewAs.role]);
    });
    return () => { cancel = true; };
  }, [viewAs?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (viewAs) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(viewAs));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, [viewAs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (targetRoles.length > 0) sessionStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(targetRoles));
    else sessionStorage.removeItem(ROLES_STORAGE_KEY);
  }, [targetRoles]);

  const enterViewAs = useCallback((target: ViewAsTarget) => {
    if (!allowed || !user || target.user_id === user.id) return;
    setViewAs(target);
    setTargetRoles([target.role]); // optimistic — refined by fetch
  }, [allowed, user?.id]);

  const exitViewAs = useCallback(() => {
    setViewAs(null);
    setTargetRoles([]);
  }, []);

  const effectiveUserId = useCallback(() => viewAs?.user_id ?? user?.id, [viewAs, user?.id]);

  return (
    <Ctx.Provider
      value={{
        viewAs,
        targetRoles,
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

/**
 * Hook ergonômico: devolve auth efetivo (papéis do alvo da impersonação ou do usuário real).
 * Útil para gating de UI (sidebar, menus) — quando impersonando, a UI deve refletir o que o alvo veria.
 */
export function useEffectiveAuth() {
  const { user, roles: realRoles, isAdmin: realIsAdmin, hasRole: realHasRole } = useAuth();
  const { viewAs, targetRoles } = useViewAs();
  if (!viewAs) {
    return {
      userId: user?.id,
      roles: realRoles,
      isAdmin: realIsAdmin,
      hasRole: realHasRole,
      isImpersonating: false,
    };
  }
  return {
    userId: viewAs.user_id,
    roles: targetRoles,
    isAdmin: targetRoles.includes("admin"),
    hasRole: (r: AppRole) => targetRoles.includes(r),
    isImpersonating: true,
  };
}
