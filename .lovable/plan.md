## Causa

A sessão atual é da Alexandra **impersonada** por um gerente. O `useAuth().user.email` retorna o email do gerente (usuário realmente logado no Supabase Auth), não da Alexandra. Como o filtro `to_emails contains user.email` usa o email do gerente, nenhum email seed bate e a caixa fica vazia.

## Plano

Trocar a fonte do "email efetivo" para respeitar o modo impersonação (`viewAs`):

1. **`EmailPanel.tsx`**:
   - Importar `useViewAs` de `@/lib/viewAs`.
   - Calcular `effectiveEmail`: se `viewAs` está ativo, usar o email do usuário impersonado; senão, `user?.email`.
   - Usar `effectiveEmail` no `query.contains("to_emails", [effectiveEmail])` e na dependência do `useEffect`.

2. **Como obter o email do usuário impersonado** (o `viewAs` só guarda `user_id`, `full_name`, `role`):
   - Adicionar um pequeno `useEffect` no `EmailPanel` que, quando `viewAs?.user_id` muda, busca o email via edge function `admin-users` (já usada em `routes/users.tsx`) ou via uma chamada simples — vou usar `supabase.functions.invoke("admin-users", { body: { action: "get", id: viewAs.user_id } })` se disponível, senão fazer fallback derivando do `full_name` no padrão `nome.sobrenome@sim.local` (que é o padrão dos seeds: `alexandra.ermolaeva@sim.local`, etc.).
   - Fallback simples e suficiente para os seeds: `slugify(full_name) + "@sim.local"` — deriva corretamente os 3 emails (Alexandra, Agrafena, Mikhail).

Vou usar o **fallback por slug do nome** porque é determinístico, não depende de RLS/edge function e atende exatamente os usuários seed. Quando o usuário não está impersonando, continua usando `user.email` real.

### Não vou mexer
- Layout, RLS, migrações, lógica de Gmail/IA.

Confirma?