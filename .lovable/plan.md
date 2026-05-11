## Problema identificado

Após conectar várias contas Gmail, a Caixa de Entrada e Enviados estão **misturando emails de todas as contas autorizadas**, em vez de mostrar apenas os da conta selecionada no seletor.

Causa raiz em `src/components/email/EmailPanel.tsx`:
- Todas as queries usam `.in("owner_email", authorizedEmails)` (todas as contas) em vez de filtrar pela conta ativa (`selectedAccount`).
- Isto afeta: lista de pastas (`email_labels`), threads da Caixa de Entrada (`email_threads`), mensagens de SENT/DRAFT/TRASH/SPAM (`emails`), busca, e estado do espelhamento (`email_sync_state`).
- O filtro de "remetente igual ao dono" em SENT também usa todas as contas, então emails enviados pela conta A aparecem listados quando a conta B está selecionada.

Adicionalmente, as tabelas `emails` e `email_threads` têm chaves únicas globais (`gmail_id`, `id`) sem incluir `owner_email`. Em teoria os IDs do Gmail são por‑caixa, mas se duas contas espelhadas trocarem mensagens entre si pode haver colisão de upsert. A correção blindando isto evita "vazamento" futuro entre contas.

## Plano de correção

**Frontend — `src/components/email/EmailPanel.tsx`**
1. Criar um helper `currentOwners()` que devolve `[selectedAccount]` quando há conta selecionada, e `authorizedEmails` apenas como fallback (quando `selectedAccount` é `null`).
2. Substituir todos os `.in("owner_email", authorizedEmails!)` pelas chamadas a `currentOwners()` em:
   - `loadFolders` (pastas/labels)
   - `loadThreads` (INBOX e ramo OUTBOUND para SENT/DRAFT/TRASH/SPAM)
   - busca por `thread_id` (`threadIdHits`)
   - estado do mirror (`email_sync_state`)
3. No ramo OUTBOUND, restringir o filtro `from_email.ilike` à conta selecionada (remetente = dono da caixa), garantindo que SENT mostra apenas o que foi enviado por essa conta.
4. Quando o utilizador troca de conta no seletor, recarregar pastas e threads (já há efeitos em `activeLabel` e `selectedAccount` — confirmar dependência de `selectedAccount` nos `useCallback`/`useEffect` e adicioná‑la onde faltar para forçar refresh).
5. Em `LeadEmailMini` (segunda metade do ficheiro) já lê `selectedAccount` do `localStorage`; manter, mas garantir que as queries diretas a `emails`/`email_threads` por `thread_id` não voltam a juntar contas (filtrar `owner_email = selectedAccount` quando aplicável).

**Backend — migração SQL**
6. Substituir o índice único global por composto, para isolar contas:
   - `emails`: drop `emails_gmail_id_key` → `UNIQUE (owner_email, gmail_id)`.
   - `email_threads`: tornar a PK composta `(owner_email, id)` (ou manter PK em `id` e adicionar `UNIQUE (owner_email, id)` + ajustar upserts em `rebuildThread`/`startFullMirror` para `onConflict: "owner_email,id"`).
7. Atualizar `gmail-mirror.server.ts`:
   - `rebuildThread`: filtrar `select ... from emails` também por `owner_email`.
   - Upserts de `email_threads` usar `onConflict: "owner_email,id"`.

**Validação**
8. Conectar duas contas, alternar no seletor e confirmar:
   - Caixa de Entrada mostra só os emails recebidos pela conta ativa.
   - Enviados mostra só os emails enviados pela conta ativa.
   - Trocar de conta troca o conjunto integralmente, sem mistura.
9. Confirmar que `email_sync_state` no rodapé reflete o progresso da conta ativa.

## Notas técnicas

- Não altera o esquema lógico das tabelas além das chaves únicas; nenhum dado é movido.
- A migração de índice único é segura porque `(owner_email, gmail_id)` é mais permissiva do que `(gmail_id)`; nenhuma linha existente viola o novo índice.
- Mantém compatibilidade com `LeadEmailMini` (que já passa `emailAddress` ao backend).
