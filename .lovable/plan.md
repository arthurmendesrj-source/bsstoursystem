## Objetivo

Na tela de **Atendimento** (detalhe do lead), a aba **Email** deve mostrar **apenas o email de origem** que gerou o lead/atividade — não replicar a caixa de entrada por endereço.

## Regra (a partir de agora)

- Ao criar Lead ou Atividade a partir de um email → salvar o vínculo **somente daquele email específico** (via `source_email_id` / `lead_id` no registro do email). ✅ Já é o comportamento atual da criação.
- Na aba Email do lead → listar **somente** os emails com `lead_id = <lead atual>`. Sem busca por `from_email` / `to_emails`, sem backfill automático.
- Novos emails que chegarem do mesmo remetente **não** entram automaticamente no lead. Só entram se o usuário criar manualmente outra atividade/lead a partir deles (decisão futura: botão "vincular a este lead" — fora deste escopo).
- Leads já existentes (os 3 criados antes desta regra): **ignorados**, sem migração nem limpeza.

## Mudanças técnicas

**`src/routes/leads.$leadId.tsx`** — aba Email:
1. Remover a query secundária que busca emails por `from_email` / `to_emails` contendo o endereço do lead.
2. Remover o **backfill** que escrevia `lead_id` em emails encontrados por endereço.
3. Manter apenas: `select ... from emails where lead_id = $leadId order by date desc`.
4. Manter o auto-refresh de 30s (só re-executa a query estrita).

Nada muda em `EmailMailbox.tsx`, no fluxo de criar Lead/Atividade, nem no schema — o vínculo já é salvo corretamente.

## Resultado

- Leads novos: aba Email mostra exatamente o(s) email(s) que o usuário escolheu vincular.
- Leads antigos (os 3): podem aparecer vazios ou com o que já foi vinculado — sem ação.
