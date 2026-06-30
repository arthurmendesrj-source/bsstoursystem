## Problema

Na aba **Email** da tela de atendimento (`/leads/$leadId`), a consulta filtra apenas por `emails.lead_id = leadId`. No banco, todos os emails sincronizados estão com `lead_id = NULL` (só ficaria preenchido nos casos em que o usuário cria o Lead pelo botão da IA). Resultado: a aba aparece vazia mesmo quando há emails do mesmo contato na caixa.

Exemplo: lead `Egor Bad'in` (`office@dolcetravel.ru`) → 2 emails existem na caixa com esse remetente, nenhum aparece.

## Solução

Mostrar na aba Email todo email do usuário cujo remetente/destinatário bata com o email do lead (além dos já vinculados explicitamente). Fazer *backfill* gravando `lead_id` para acelerar consultas futuras. Atualizar automaticamente sempre que o sync em background trouxer emails novos.

### Mudanças

**1. `src/routes/leads.$leadId.tsx` — função `loadAll` (aba Email)**

Substituir a consulta única por duas em paralelo:
- a) `emails` com `lead_id = leadId` (vínculos explícitos da IA).
- b) `emails` com `user_id = auth.uid()` filtrando por `from_email ILIKE lead.email` OU `lead.email = ANY(to_emails)` — só roda se `lead.email` existir.

Unir/deduplicar por `id`, ordenar por `internal_date desc`, limitar a 100.

Após carregar, disparar `update` em lote (best-effort, sem bloquear UI) gravando `lead_id = leadId` nas linhas do grupo (b) que ainda estavam sem `lead_id`.

**2. Auto-atualização**

Adicionar `useEffect` que escuta `document.visibilitychange` + `setInterval(30s)` chamando `loadAll` enquanto a aba está visível. Mantém a aba sincronizada com o cache que o `useEmailBackgroundSync` global já preenche a cada 30s.

**3. Sem mudanças de schema**

Colunas `lead_id`, `from_email`, `to_emails`, `user_id` já existem; índice `idx_emails_lead` já existe. RLS de `emails` já permite o usuário ler/atualizar seus próprios emails.

### Como testar

- Abrir lead `Egor Bad'in` → aba Email lista os 2 emails de `office@dolcetravel.ru`.
- Recarregar → vêm direto pelo `lead_id` (backfill aplicado).
- Enviar um email novo para esse contato e aguardar até 30s → aparece sem refresh manual.
- Criar lead novo pela IA a partir de um email → email-fonte aparece imediatamente.