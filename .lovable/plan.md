## Problema

A caixa está vazia porque o `owner_email` salvo no banco está como `Booking@adatours.com` (com B maiúsculo, como o Gmail retorna), mas o `user_email_accounts.email_address` está como `booking@adatours.com` (minúsculo). O `EmailPanel` faz `.toLowerCase()` nos emails autorizados e filtra com `.in("owner_email", [...])` — comparação case-sensitive, então nenhuma linha bate.

Estado atual no banco:
- `emails`: 300 linhas com `Booking@adatours.com` + 50 órfãs sem owner
- `email_threads`: 120 linhas com `Booking@adatours.com`
- `email_labels`: 15 linhas com `Booking@adatours.com`
- `user_email_accounts`: `booking@adatours.com`

## Correção

### 1. Migration — normalizar dados existentes e prevenir recorrência
- `UPDATE` em `emails`, `email_threads`, `email_labels`, `email_sync_state` para `owner_email = lower(owner_email)`.
- Apagar as 50 linhas órfãs em `emails` com `owner_email` vazio/nulo (lixo de sync antiga, sem dono → bloqueado por RLS de qualquer jeito).
- Adicionar constraint `CHECK (owner_email = lower(owner_email))` nas 4 tabelas para garantir consistência futura.
- Garantir o mesmo em `user_email_accounts.email_address` (já está ok, mas adicionar a constraint).

### 2. Código — `src/server/gmail-mirror.functions.ts`
- Normalizar `const owner = profile.emailAddress.toLowerCase()` em `gmailListLabels`, `gmailFullSync` e `gmailIncrementalSync`, antes de usar em qualquer upsert ou query.

### 3. Validação
- Após migration, rodar query confirmando todos os `owner_email` em minúsculo.
- Pedir à Alexandra recarregar `/email` — a caixa de entrada deve mostrar as 120 conversas existentes imediatamente (sem precisar resync).
- Botão "Sincronizar Gmail" continuará funcionando e gravará em minúsculo.