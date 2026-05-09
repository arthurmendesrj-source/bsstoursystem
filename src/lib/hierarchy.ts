import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";

export type Subordinate = { user_id: string; full_name: string; role: AppRole };

const RANK: Record<AppRole, number> = {
  admin: 5, diretor: 4, gerente: 3, coordenador: 2, supervisor: 1, operador: 0,
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

      // Usa a função SECURITY DEFINER no banco que respeita a hierarquia,
      // contornando a RLS de user_roles (que só permite admin ler tudo).
      const { data: subs, error } = await supabase.rpc("get_subordinates", { _user_id: user.id });
      if (cancel) return;
      if (error || !subs || subs.length === 0) {
        setList([]); setLoading(false); return;
      }
      const ids = (subs as Array<{ get_subordinates: string } | string>).map((s: any) =>
        typeof s === "string" ? s : s.get_subordinates ?? s
      );
      const [{ data: ur }, { data: pr }] = await Promise.all([
        supabase.from("user_roles").select("user_id,role").in("user_id", ids),
        supabase.from("profiles").select("user_id,full_name").in("user_id", ids),
      ]);
      if (cancel) return;
      const profileMap = new Map<string, string>();
      (pr ?? []).forEach((p) => profileMap.set(p.user_id, p.full_name ?? ""));
      const byUser = new Map<string, AppRole>();
      (ur ?? []).forEach((r) => {
        const cur = byUser.get(r.user_id);
        if (!cur || (RANK[r.role as AppRole] ?? -1) > (RANK[cur] ?? -1)) {
          byUser.set(r.user_id, r.role as AppRole);
        }
      });
      const out: Subordinate[] = [];
      ids.forEach((uid: string) => {
        const role = byUser.get(uid);
        if (!role) return;
        out.push({ user_id: uid, role, full_name: profileMap.get(uid) || "—" });
      });
      out.sort((a, b) => a.full_name.localeCompare(b.full_name));
      setList(out);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [user?.id, roles.join(",")]);

  return { subordinates: list, loading };
}
