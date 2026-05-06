// Em produção, contas com role "admin" são ocultadas de listagens da UI.
// Em desenvolvimento (import.meta.env.DEV) tudo aparece normalmente.
export const HIDE_ADMIN_USERS = !import.meta.env.DEV;

export function getAdminIds(roles: { user_id: string; role: string }[]): Set<string> {
  return new Set(roles.filter((r) => r.role === "admin").map((r) => r.user_id));
}

export function filterAdmins<T extends { user_id: string }>(
  profiles: T[],
  roles: { user_id: string; role: string }[],
): T[] {
  if (!HIDE_ADMIN_USERS) return profiles;
  const adminIds = getAdminIds(roles);
  return profiles.filter((p) => !adminIds.has(p.user_id));
}

export function shouldHideAdmin(userId: string | null | undefined, adminIds: Set<string>): boolean {
  if (!HIDE_ADMIN_USERS) return false;
  if (!userId) return false;
  return adminIds.has(userId);
}
