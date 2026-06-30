## Problema
As triagens (análises IA por email) já são salvas no backend (`email_ai_cache`), mas o componente `EmailMailbox` só guarda em estado local (`aiResults`). Ao trocar de tela e voltar, o estado é perdido e os badges/sumários somem — embora o cache permaneça no banco.

## Solução
Pré-carregar as triagens já existentes do banco sempre que a lista de mensagens for carregada, populando `aiResults` automaticamente.

### Mudanças

1. **`src/lib/email-ai.functions.ts`** — adicionar `getCachedAiResultsFn`:
   - Recebe `{ targetUserId, gmailIds[] }`
   - Autoriza via `authorize()` (mesma regra das outras funções)
   - Lê `email_ai_cache` filtrando por `user_id` + `message_id IN (...)`
   - Retorna `Record<gmailId, EmailAiResult>`

2. **`src/components/email/EmailMailbox.tsx`**:
   - Importar e chamar `getCachedAiResultsFn` em um `useEffect` que dispara quando `messages` muda (e quando `targetUserId` muda).
   - Fazer merge com o `aiResults` atual (mantém análises feitas na sessão atual e adiciona as do cache).
   - Sem mudar a UI — os badges de prioridade/categoria e o painel de IA passam a aparecer imediatamente porque `aiResults[m.gmailId]` já estará preenchido.

### Resultado
Triagens persistem entre navegações e sessões. Reanalisar (botão "Re-analisar") continua funcionando via `force: true`.
