## Causa do erro "Database error saving new user"

A tabela `public.user_email_accounts` foi removida em uma migration anterior (`20260610203625_...`), mas duas coisas ainda tentam escrever nela:

1. **O trigger `handle_new_user`** (que roda automaticamente toda vez que o Supabase Auth cria um usuário), faz:
   ```sql
   INSERT INTO public.user_email_accounts (...)
   ```
   Como a tabela não existe mais, o trigger falha → o Auth aborta a criação do usuário convidado → você vê **"Database error saving new user"**.

2. **A edge function `admin-users`** (linhas 211–216) faz um `upsert` na mesma tabela inexistente após o convite.

Esses dois pontos são o que está bloqueando todo convite hoje, independente do papel escolhido.

## Plano

### Passo 1 — Migration para corrigir o trigger

Recriar `public.handle_new_user` removendo o bloco que insere em `public.user_email_accounts`. Tudo o mais (criação de profile, detecção de convite, criação de tenant para signup direto) permanece igual.

### Passo 2 — Limpar a edge function

Em `supabase/functions/admin-users/index.ts` (bloco da action `invite`), remover o `await admin.from("user_email_accounts").upsert(...)`. O convite passa a criar profile + roles + vínculo de tenant, sem tocar na tabela que não existe.

### Passo 3 — Teste

Você reenvia o convite para `boscobssteste1@gmail.com` como **Operador** (ou outro papel permitido). Esperado:
- Toast "Convite enviado";
- E-mail de convite enviado pelo Supabase Auth para o endereço;
- Linha do convite aparece em "Convites pendentes";
- Quando o convidado clicar no link e definir senha, ele entra no tenant **Diretor1** como `member`.

Se aparecer outro erro, agora o toast já mostra o motivo real (correção do turno anterior), e ajustamos.

## Detalhes técnicos

- 1 nova migration SQL recriando a função `public.handle_new_user`.
- 1 edição em `supabase/functions/admin-users/index.ts` (remoção do bloco `user_email_accounts`).
- Nenhum schema novo, nenhuma RLS nova.
- Não recriar a tabela `user_email_accounts`: ela foi intencionalmente removida no histórico e nenhuma feature ativa hoje depende dela; o vínculo "qual e-mail é desse usuário" já está em `auth.users.email`.
