## Objetivo
Quando criar Lead ou Atividade a partir de um email, o conteúdo do email fica anexado ao registro — visível direto na tela do Lead/Atividade, sem precisar voltar à caixa de entrada.

Emails sincronizados já ficam salvos no banco (`public.emails`), então o trabalho aqui é só **vincular** o email ao Lead/Tarefa criada e **renderizar** esse email no detalhe.

## Mudanças

### 1. Banco (migração)
Adicionar em `public.leads` e `public.tasks`:
- `source_email_id uuid` → FK para `public.emails(id)` ON DELETE SET NULL
- `source_email_subject text`
- `source_email_from text`
- `source_email_snippet text` (até ~2000 chars do corpo/snippet)
- `source_email_received_at timestamptz`

Índices em `source_email_id`. Sem mudar RLS existente.

### 2. Criação a partir do email (`src/components/email/EmailMailbox.tsx`)
- `CreateLeadForm` e `CreateActivityForm` passam a receber o `EmailRow` selecionado como prop.
- No `insert`, gravar os 5 campos acima a partir do email (subject, from, snippet truncado, received_at e id).
- Manter a inclusão atual no `notes`/`description` do resumo da IA.

### 3. Detalhe do Lead (`src/routes/leads.$leadId.tsx`)
- Quando `source_email_id` existir, exibir card "Email de origem" com: assunto, remetente, data, snippet (com `whitespace-pre-wrap`) e botão "Abrir na caixa de entrada" (link para `/email?id={source_email_id}`).
- Se o registro em `emails` ainda existir, fazer um `select` leve (subject, from_address, snippet, body_text, received_at) para mostrar conteúdo mais completo; senão, usar os campos snapshot salvos no próprio lead.

### 4. Detalhe da Atividade
- Hoje as tarefas abrem em modal/edição em `src/routes/activities.tsx`. Adicionar o mesmo card "Email de origem" no painel/modal de detalhe da tarefa.

### 5. Deep link `/email?id=...`
- Em `src/routes/email.tsx` (ou `EmailMailbox`), ler `search.id` e pré-selecionar a mensagem correspondente quando presente.

## Fora de escopo
- Não muda sincronização nem cache de emails (já persistente).
- Não cria relação N:N email↔lead; um lead/atividade aponta para um único email de origem (o caso atual).
