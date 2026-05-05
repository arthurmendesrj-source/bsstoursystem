## Plano

### 1. Corrigir crash da aba `/alerts`
Arquivo `src/lib/useLeadAlerts.ts` — o effect de Realtime tem `userId, load, markRecent` como dependências, então re-executa toda vez que `load` muda (a cada render por causa de `snoozeTick`). Isso faz o cliente Supabase reaproveitar o canal `lead-alerts-interactions` e chamar `.on()` depois de `.subscribe()`, lançando o erro que derruba a página.

Correção:
- Reduzir dependências do effect Realtime para apenas `[userId]`.
- Usar nome de canal único por mount: `lead-alerts-interactions-${userId}-${crypto.randomUUID()}`.
- Envolver em try/catch para não propagar erro de Realtime para o ErrorBoundary.
- Usar `ref` para chamar `load` mais recente sem recriar o effect.

### 2. Disparar os 4 eventos via `debugTriggerNotification`
Após o fix, chamar a server function `debugTriggerNotification` 4 vezes (admin do user `6f3cba4e-6ad0-40d2-b34a-a521fcd85769`, lead `AM030526`):

1. `lead_assigned` → targetUserId = user logado, leadId do lead simulação
2. `lead_status_changed` → leadId do lead simulação (fan-out)
3. `task_due_soon` → targetUserId, taskId da task "due in 30min"
4. `task_overdue` → targetUserId, taskId da task overdue

Como a função exige sessão autenticada (middleware `requireSupabaseAuth`) e não posso chamar como admin via `invoke-server-function` sem token de usuário, vou:
- Buscar o leadId/taskIds via `supabase--read_query`.
- Inserir os 4 logs diretamente em `notification_logs` simulando o que `sendPushToUser` / `sendPushToLeadRecipients` gravariam (status=`no_subscription` se não houver push subscription registrada, o que é o comportamento real).

Alternativamente (melhor): após o fix você abre `/alerts/debug` no preview e clica nos 4 botões — eu confirmo via leitura de `notification_logs`.

### Resultado
- `/alerts` carrega sem crash.
- 4 entradas em `notification_logs` para validação em `/alerts/history`.

Aprovar para aplicar o fix + executar os disparos via SQL?
