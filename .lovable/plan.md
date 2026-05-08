## Problema

O cron `/api/public/gmail-poll` decide o que fazer por owner com esta lógica:

1. Se `wipe_status = 'wiping'` → roda batch de wipe
2. Se `full_sync_in_progress = true` → roda tick do full sync
3. Se ocioso há mais de 5 min → **roda incremental sync**
4. Caso contrário → skip

Como acabamos de zerar tudo, o owner cai no caso 3. O incremental chama o Gmail History API com o `last_history_id` antigo (`33256984`), que pode dar 404 ("history not found"), ou no melhor caso simplesmente avança o cursor sem trazer nada — e nunca dispara o mirror completo. Toda vez que limpo `last_history_id` no banco, o cron roda em segundos e reescreve.

## Solução

Adicionar uma trava no `gmail-poll.ts`: só chamar `runIncrementalSync` se já houve pelo menos um full sync bem-sucedido (`last_full_sync_at IS NOT NULL`). Enquanto não houver, o cron fica skipando o incremental e espera você clicar em "Iniciar mirror completo".

## Mudanças

### 1. `src/routes/api/public/gmail-poll.ts`

No bloco que decide o que fazer por owner, adicionar a guarda antes do branch incremental:

```ts
// Antes:
if (idleMinutes > 5) {
  await runIncrementalSync(owner_email);
  ...
}

// Depois:
if (!last_full_sync_at) {
  // Mirror completo nunca rodou — não tente incremental,
  // o usuário precisa iniciar o full sync manualmente.
  return { owner_email, action: 'skip_waiting_full_sync' };
}
if (idleMinutes > 5) {
  await runIncrementalSync(owner_email);
  ...
}
```

### 2. Limpar o estado restante (uma vez, depois do deploy)

Após o código estar no ar, rodar:

```sql
UPDATE email_sync_state
SET last_history_id = NULL,
    last_incremental_sync_at = NULL,
    last_full_sync_at = NULL
WHERE owner_email = 'booking@adatours.com';
```

Agora o cron não vai mais reescrever esses campos. O painel `/email` fica esperando você clicar em **"Iniciar mirror completo"**, que é o caminho correto.

### 3. Comportamento depois do mirror completo

Quando o full sync terminar com sucesso, `runFullSyncTick` (na função final) deve setar `last_full_sync_at = now()` e gravar o `last_history_id` atual do Gmail. A partir daí o cron volta a rodar incremental normalmente, sempre com um cursor válido.

Verificar no `gmail-mirror.server.ts` que essa gravação já acontece ao finalizar o full sync. Se não acontecer, ajustar para gravar.

## Resultado esperado

- Estado fica limpo e estável (sem cron sobrescrevendo).
- Botão "Iniciar mirror completo" funciona como único ponto de partida.
- Incremental só liga depois que o mirror completo terminar pelo menos uma vez.
- Sem mais erros 404 de history antigo.
