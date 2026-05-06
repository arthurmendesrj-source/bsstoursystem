## Página de Usuários — Convidar / Bloquear / Excluir (Admin + Diretor)

### Acesso
Hoje a página `/users` é acessível só para **admin**. Vou ampliar para **admin OU diretor**:
- Em `src/lib/auth.tsx`: expor `isDirector` (checa role `diretor`) e `canManageUsers = isAdmin || isDirector`.
- Em `src/routes/users.tsx`: trocar guard `isAdmin` por `canManageUsers`.

### Backend — Edge Function `admin-users`
Nova edge function (`supabase/functions/admin-users/index.ts`, `verify_jwt = true`) com 3 ações via POST `{ action, ... }`:

1. **`invite`** — `{ email, full_name?, roles?: AppRole[] }`
   - Valida com zod (email válido, full_name ≤100, roles ⊂ lista).
   - Verifica se chamador tem role `admin` ou `diretor` (consulta `user_roles` com service role).
   - **Diretor não pode convidar admin nem outro diretor** (apenas gerente/supervisor/operador). Admin pode tudo.
   - Usa `supabase.auth.admin.inviteUserByEmail(email, { data: { full_name } })` → envia e-mail de convite.
   - Insere roles em `user_roles` para o novo `user.id`.

2. **`block`** / **`unblock`** — `{ user_id, blocked: boolean }`
   - Mesmo guard de permissão. Diretor não pode bloquear admin/diretor.
   - Usa `supabase.auth.admin.updateUserById(user_id, { ban_duration: blocked ? "876000h" : "none" })` (≈100 anos = bloqueio efetivo; "none" remove).
   - Retorna estado atualizado.

3. **`delete`** — `{ user_id }`
   - Guard idem. Não permite excluir a si mesmo nem admin (se chamador é diretor).
   - Limpa dados vinculados em ordem segura: `quote_items`/`quote_flights` → `quotes` (do user), `bookings`, `leads`, `customers`, `interactions`, `notification_logs`, `notification_preferences`, `push_subscriptions`, `lead_alert_snoozes`, `ai_conversations` (cascata msgs), `user_module_permissions`, `user_field_permissions`, `user_roles`, `profiles`.
   - Por fim `supabase.auth.admin.deleteUser(user_id)`.

### Frontend — `src/routes/users.tsx`

Adicionar:
- **Botão "Convidar usuário"** no topo → abre `Dialog` com:
  - campo Email (obrigatório, validação zod)
  - campo Nome (opcional)
  - multi-select de papéis iniciais (filtrado conforme permissão do chamador)
  - botão "Enviar convite" → chama edge function, toast de sucesso, recarrega lista.

- **Coluna "Status"** mostrando se usuário está bloqueado (badge "Bloqueado" vermelho). Para isso a função `admin-users` ganha uma 4ª action **`list`** que retorna `[{ user_id, banned_until }]` — chamada junto com `load()`.

- **Coluna "Ações"** ganha 2 botões com ícones:
  - 🚫 **Bloquear / Desbloquear** (toggle, com `AlertDialog` de confirmação)
  - 🗑️ **Excluir** (`AlertDialog` com aviso forte; lista os dados que serão removidos)

- Diretor **não vê** botões de bloquear/excluir em linhas de admin/diretor (filtro client-side; servidor revalida).

### Filtro de hideAdmin
Mantém `filterAdmins` em produção; em dev admin aparece. Isso já existe.

### Texto de rodapé
Atualizar mensagem informando que o convite envia e-mail automático e que o usuário define a senha pelo link recebido.

### Resumo de arquivos
- `src/lib/auth.tsx` — adicionar `isDirector`, `canManageUsers`
- `src/routes/users.tsx` — UI completa (convite + bloquear + excluir + coluna status)
- `supabase/functions/admin-users/index.ts` — nova edge function
- `supabase/config.toml` — registrar função (verify_jwt = true)

Sem mudanças de schema no banco.
