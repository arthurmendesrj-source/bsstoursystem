## Objetivo

Reverter a criação automática de atividades a partir de emails. Em vez disso, a IA gera apenas um **resumo + sugestão**, e o operador decide manualmente: criar Lead, criar Atividade (Suporte/Negócio) ou ignorar.

## Mudanças

### 1. Banco de dados (migration)

- Remover triggers `trg_email_create_task` e `trg_email_sync_task_link`.
- Remover funções `create_task_from_email()` e `sync_task_from_email()`.
- **Não excluir** as atividades já criadas pela rotina anterior — ficam disponíveis no painel /activities, e o operador pode descartar manualmente o que não quiser.

### 2. Server function `emailAnalyze` (`src/server/gmail.functions.ts`)

Ampliar o tool-call da IA para retornar, além dos campos do lead:

- `summary` — resumo curto (2-3 frases) em português do conteúdo do email.
- `suggested_action` — `"create_lead" | "create_task" | "ignore"`.
- `suggested_task_category` — `"negocio" | "suporte"` (quando `create_task`).
- `suggested_task_priority` — `"baixa" | "media" | "alta"`.
- `suggested_task_title` — título sugerido para a atividade.

Persistir tudo em `emails.ai_suggestion`.

### 3. EmailPanel (`src/components/email/EmailPanel.tsx`)

Substituir o botão único "Analisar IA → Criar Lead" por um fluxo de triagem:

1. Botão **"Analisar com IA"** → chama `emailAnalyze` e abre um painel/modal de triagem com:
   - Resumo gerado pela IA.
   - Recomendação destacada (Lead / Atividade / Ignorar).
   - Três botões de ação: **Criar Lead**, **Criar Atividade**, **Ignorar**.
2. **Criar Lead** → abre o diálogo atual já pré-preenchido (mantém comportamento existente).
3. **Criar Atividade** → abre novo diálogo simples com: título, categoria (negócio/suporte), prioridade, descrição (resumo), data prevista, vincular ao lead (se já existir vínculo no email). Salva em `tasks` com `source='email'` e `email_id` preenchido.
4. **Ignorar** → fecha o painel; opcionalmente marca o email como lido/arquivado (já existem botões para isso).

Manter os botões manuais já existentes ("Criar Lead manual"). Adicionar também botão manual **"Criar Atividade"** para quando o operador não quiser usar IA.

### 4. i18n (`src/lib/i18n.tsx`)

Novas chaves PT/EN/ES: `aiSummary`, `aiRecommendation`, `createTaskFromEmail`, `ignoreEmail`, `taskTitle`, `taskCategory`, `taskPriority`, etc.

## Resultado

- Nenhuma atividade é criada automaticamente.
- A IA serve como apoio: resume e sugere, sem agir.
- O operador valida e escolhe explicitamente o destino de cada email recebido.