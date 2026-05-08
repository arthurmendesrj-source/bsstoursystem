## Por que ainda não está pronto

Existem **dois** cron jobs Gmail rodando a cada minuto, chamando rotas diferentes:

| Job | URL | Status |
|---|---|---|
| `gmail-incremental-poll` | `/api/public/gmail-poll` | ✅ Já tem a guarda nova (espera mirror completo) |
| `gmail-mirror-tick` | `/api/public/gmail-cron-tick` | ❌ Rota legada, sem guarda — continua chamando `runIncrementalSync` e reescrevendo `last_history_id` para o valor antigo (`33256984`) |

Ou seja: toda vez que limpo o estado, o `gmail-cron-tick` roda em segundos e reescreve. Por isso o cursor antigo "ressuscita".

## Correções

### 1. Apagar a rota legada
Deletar `src/routes/api/public/gmail-cron-tick.ts`. A rota nova `gmail-poll.ts` já cobre 100% do que ela fazia (wipe + full sync + incremental + guarda).

### 2. Desagendar o cron legado
```sql
SELECT cron.unschedule('gmail-mirror-tick');
```
Mantém apenas `gmail-incremental-poll` (que aponta para `/api/public/gmail-poll`, a versão correta).

### 3. Limpar o estado novamente
```sql
UPDATE email_sync_state
SET last_history_id = NULL,
    last_incremental_sync_at = NULL,
    last_full_sync_at = NULL
WHERE owner_email = 'booking@adatours.com';
```
Agora vai ficar limpo permanentemente — só o cron novo (com a guarda) sobrou.

### 4. Verificar
Reler o estado depois de 1–2 minutos para confirmar que `last_history_id` continua `NULL` e que aparece `skip_waiting_full_sync` nos logs do `gmail-poll`.

## Resultado

Sobra um único cron correto que:
- Avança wipe se houver
- Avança full sync se em progresso
- **Pula incremental** enquanto `last_full_sync_at` for `NULL` (ou seja, espera você clicar em "Iniciar mirror completo")
- Só liga incremental depois que o mirror completo terminar pelo menos uma vez
