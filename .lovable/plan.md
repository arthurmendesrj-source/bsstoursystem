# Ocultar conta Admin em produção (visível apenas em desenvolvimento)

A conta admin **ARTHUR BOSCO LIMA MENDES** (única com role `admin`) deve ser invisível para todos os listings da interface em produção, mas continuar aparecendo no ambiente de desenvolvimento para manutenção. A conta **continua existindo e funcionando** — só deixa de aparecer em listas/pickers.

## Estratégia

Criar um helper central `src/lib/hideAdmin.ts` com:

```ts
export const HIDE_ADMIN_USERS = !import.meta.env.DEV;

// Recebe a lista de profiles + lista de user_roles e retorna profiles sem admins (em prod)
export function filterAdmins<T extends { user_id: string }>(
  profiles: T[],
  roles: { user_id: string; role: string }[],
): T[] {
  if (!HIDE_ADMIN_USERS) return profiles;
  const adminIds = new Set(roles.filter(r => r.role === "admin").map(r => r.user_id));
  return profiles.filter(p => !adminIds.has(p.user_id));
}
```

Critério: em **dev** (`bun dev` / preview do Lovable) tudo aparece; no app **publicado** (build de produção), perfis com role `admin` são removidos das listagens.

## Arquivos a ajustar

Aplicar `filterAdmins` (ou equivalente) onde profiles/usuários são listados na UI:

1. **`src/routes/users.tsx`** — gestão de usuários (lista principal + atribuição de roles).
2. **`src/routes/gerencial.tsx`** — painel gerencial mostra equipe.
3. **`src/lib/viewAs.tsx`** + componente que abre o picker "Visualizar como" — não permitir entrar como admin em produção.
4. **`src/lib/hierarchy.ts`** — usado em pickers de "responsável", subordinados, etc. Excluir admin da árvore em prod.
5. **`src/routes/alerts.tsx`, `alerts.sla.tsx`, `alerts.history.tsx`** — listagens/filtros por usuário.
6. **`src/routes/settings.tsx`, `settings.templates.tsx`** — qualquer dropdown de usuário.
7. **`src/lib/messageTemplates.ts`** — se expõe lista de usuários, filtrar.
8. **`src/components/ActivityTimeline.tsx`** — exibição de autor: se for admin em prod, mostrar como "Sistema" em vez de ocultar a linha (preserva histórico das ações).

## O que NÃO muda

- Login da conta admin continua funcionando normalmente.
- RLS e permissões no banco permanecem inalteradas.
- Dados criados pelo admin continuam visíveis (apenas o nome aparece como "Sistema" no histórico em prod).
- Em desenvolvimento, tudo aparece normalmente para manutenção.

## Detalhes técnicos

- A flag usa `import.meta.env.DEV` (Vite) — `true` em dev, `false` no build de produção.
- O filtro é feito **no cliente** após a query — alternativa mais robusta seria uma RLS policy, mas isso quebraria a hierarquia/auditoria. A abordagem cliente é suficiente porque o objetivo é **ocultar visualmente**, não restringir acesso aos dados.
- Em todos os locais onde já há query de `profiles`, adicionar a query paralela de `user_roles` (quando ainda não houver) para alimentar o filtro.

Após implementação, ao publicar o sistema, a conta admin deixa de aparecer em qualquer lista/picker, mas você ainda pode logar nela e gerenciar tudo normalmente.
