## Problema

`booking@adatours.com` ainda existe em `auth.users` (id `d3dc917b...`), mesmo após "exclusão". Restaram 1 `tenant_members` e 3 `leads` ligados a ele, e o usuário em `auth.users` nunca foi removido. Por isso o convite falha — o e-mail já está cadastrado no Auth.

Causas no `supabase/functions/admin-users/index.ts` (ação `delete`):
- Não limpa `email_accounts` nem `email_ai_cache` (FKs para `auth.users`) → bloqueiam `deleteUser`.
- Não trata `tenants.created_by` (FK) → se o usuário criou um tenant, `deleteUser` falha silenciosamente.
- Erros parciais não retornam ao cliente: alguns `await` ignoram erro e seguem; quando `auth.admin.deleteUser` falha, o front pode achar que excluiu.
- Não há fallback no `invite`: se já existe `auth.users` órfão (sem `tenant_members` ativo), o convite não tem caminho de recuperação.

## Plano

### 1) Endurecer `admin-users` ação `delete` (cascata completa + verificação)

Editar `supabase/functions/admin-users/index.ts`:
- Adicionar limpeza explícita antes do `deleteUser`:
  - `email_accounts` where `user_id = targetId`
  - `email_ai_cache` where `user_id = targetId`
  - `tenants` where `created_by = targetId` AND não há outros `tenant_members` ativos (caso contrário, abortar com mensagem clara pedindo transferência de propriedade).
- Capturar e propagar erros de cada delete crítico (não engolir).
- Após `admin.auth.admin.deleteUser`, fazer `getUserById` para confirmar remoção; se ainda existir, retornar 500 com detalhe.
- Registrar `audit` com `success: boolean`.

### 2) Tornar `invite` resiliente a órfãos

Na ação `invite`:
- Antes de chamar `inviteUserByEmail`, fazer `listUsers` + filtrar pelo e-mail. Se existir e **não tiver** `tenant_members` ativo nem `profiles`, considerar órfão e:
  - Rodar a mesma cascata de cleanup do passo 1 nesse `user_id`.
  - Chamar `deleteUser` e seguir com o `inviteUserByEmail`.
- Se existir e **tiver** vínculo ativo, retornar 409 com mensagem "Usuário já cadastrado em outro tenant/ativo".

### 3) Cleanup pontual de `booking@adatours.com`

Migração única para destravar agora:
- `DELETE FROM public.tenant_members WHERE user_id = 'd3dc917b-c042-4f25-8cd5-fb5456444955';`
- `DELETE FROM public.leads WHERE created_by = '...' OR assigned_to = '...';`
- Limpar quaisquer outras FKs remanescentes (loop pelas tabelas do passo 1).
- Em seguida, via edge function admin, chamar `deleteUser` para remover de `auth.users` (não dá para deletar de `auth.users` por migração).

### 4) Documentação / norma

Adicionar bloco no `.lovable/plan.md`:
> "Norma: toda exclusão de usuário usa `admin-users action=delete`, que executa cascata completa (incluindo `email_accounts`, `email_ai_cache`, `tenants` órfãos) e confirma remoção em `auth.users`. Convite a e-mail órfão limpa o resíduo automaticamente."

## Fora de escopo

- Mudar UI de gestão de usuários (continua chamando a mesma função).
- Transferência automática de propriedade de tenant (apenas mensagem de erro pedindo ação manual).
- Soft-delete / arquivamento.

## Detalhes técnicos

Arquivos afetados:
- `supabase/functions/admin-users/index.ts` — adicionar deletes faltantes + verificação pós-`deleteUser` + auto-cleanup de órfão no `invite`.
- `supabase/migrations/<timestamp>_cleanup_booking_adatours.sql` — DELETEs públicos do usuário órfão.
- Após migração, executar `delete` via admin-users para remover de `auth.users` (passo manual via UI ou um one-shot call).
- `.lovable/plan.md` — registrar a norma.

Sem mudança de schema, sem alteração de RLS.
