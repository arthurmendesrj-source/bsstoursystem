## Causa

O OAuth já chegou no callback. O erro atual acontece ao salvar a conta Gmail no banco:

`there is no unique or exclusion constraint matching the ON CONFLICT specification`

A tabela `email_accounts` tem um índice parcial para `(user_id, provider)`, mas o salvamento usa conflito por `(user_id, provider)`, que exige uma constraint única normal. Além disso, a tabela ainda tem uma validação antiga que só permite `provider = 'gmail'`, enquanto o fluxo novo salva `provider = 'gmail_oauth'`.

## Plano de correção

1. **Ajustar a tabela `email_accounts`**
   - Atualizar a validação de `provider` para permitir `gmail` e `gmail_oauth`.
   - Remover o índice parcial antigo de `gmail_oauth`.
   - Criar uma constraint única real para `(user_id, provider)`.

2. **Manter o código atual de salvamento**
   - O callback já faz `upsert` por `user_id,provider`; com a constraint correta, ele passa a funcionar.
   - Não precisa mudar o fluxo OAuth para este erro específico.

3. **Validação após aplicar**
   - Tentar conectar Gmail novamente.
   - Esperado: página “Gmail conectado” e a aba `/email` detecta a conta conectada.

## Migração prevista

```sql
alter table public.email_accounts
  drop constraint if exists email_accounts_provider_check;

alter table public.email_accounts
  add constraint email_accounts_provider_check
  check (provider in ('gmail', 'gmail_oauth'));

drop index if exists public.email_accounts_user_provider_unique;

alter table public.email_accounts
  add constraint email_accounts_user_provider_key unique (user_id, provider);
```