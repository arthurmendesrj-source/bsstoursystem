import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";

export type Subordinate = { user_id: string; full_name: string; role: AppRole };

const RANK: Record<AppRole, number> = {
  admin: 4, diretor: 3, gerente: 2, supervisor: 1, operador: 0,
  vendedor: 0, operacional: 0, financeiro: 0,
};

function maxRank(roles: AppRole[]): number {
  return roles.reduce((m, r) => Math.max(m, RANK[r] ?? -1), -1);
}

/** Lista usuários abaixo do usuário atual na hierarquia (admin/diretor → todos; gerente → supervisor+operador; etc). */
export function useSubordinates() {
  const { user, roles } = useAuth();
  const [list, setList] = useState<Subordinate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!user) { setList([]); setLoading(false); return; }
      const myRank = maxRank(roles);
      if (myRank <= 0) { setList([]); setLoading(false); return; }
      const [{ data: ur }, { data: pr }] = await Promise.all([
        supabase.from("user_roles").select("user_id,role"),
        supabase.from("profiles").select("user_id,full_name"),
      ]);
      if (cancel) return;
      const profileMap = new Map<string, string>();
      (pr ?? []).forEach((p) => profileMap.set(p.user_id, p.full_name ?? ""));
      // pega o maior papel de cada usuário
      const byUser = new Map<string, AppRole>();
      (ur ?? []).forEach((r) => {
        const cur = byUser.get(r.user_id);
        if (!cur || (RANK[r.role as AppRole] ?? -1) > (RANK[cur] ?? -1)) {
          byUser.set(r.user_id, r.role as AppRole);
        }
      });
      const out: Subordinate[] = [];
      byUser.forEach((role, uid) => {
        if (uid === user.id) return;
        const r = RANK[role] ?? -1;
        if (r >= 0 && r < myRank) {
          out.push({ user_id: uid, role, full_name: profileMap.get(uid) || "—" });
        }
      });
      out.sort((a, b) => a.full_name.localeCompare(b.full_name));
      setList(out);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [user?.id, roles.join(",")]);

  return { subordinates: list, loading };
}
