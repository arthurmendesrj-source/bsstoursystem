
## Objetivo

Nova rota **/inbox-ia/email** dedicada à **Função Email da Inbox IA**: o operador escolhe pasta + período, vê a lista de e-mails **não lidos** e dispara a **Triagem IA** direto na linha, sem precisar abrir o e-mail.

---

## Fluxo do usuário

1. Entra em **Inbox IA → Email** (nova rota).
2. Escolhe a **conta de email** (se tiver mais de uma vinculada).
3. Escolhe a **pasta** (Inbox, Importante, Spam, ou qualquer label do Gmail).
4. Escolhe o **período** (Hoje, Últimos 7 dias, 30 dias, 90 dias, ou range custom).
5. Vê a **lista de e-mails não lidos** desse recorte, ordenados pelo mais recente.
6. Em cada linha, três ações: **Triagem IA** (principal), **Abrir** (opcional), **Marcar como lido**.
7. Clicar em **Triagem IA** abre o `AiTriageDialog` já existente — sem abrir a thread.
8. Após decisão (criar lead / criar atividade / ignorar), o e-mail some da lista (foi tratado).

Há também um botão **"Atualizar do Gmail"** no topo (modo híbrido): por padrão lê do banco espelhado; sob demanda dispara `gmailIncrementalSync` para puxar o que chegou desde o último sync.

---

## Layout da tela

```text
┌─────────────────────────────────────────────────────────────┐
│ Inbox IA · Email                                            │
│ [Conta ▾]  [Pasta ▾]  [Período ▾]   [↻ Atualizar do Gmail] │
├─────────────────────────────────────────────────────────────┤
│ 24 e-mails não lidos · período: últimos 7 dias              │
├─────────────────────────────────────────────────────────────┤
│ ● Maria Silva · maria@...           há 2h    [✨ Triagem]  │
│   Cotação para Bariloche 5 noites                           │
│   "Olá, gostaria de uma proposta para..."   [Abrir] [✓Lido]│
├─────────────────────────────────────────────────────────────┤
│ ● João Souza · joao@...             há 5h    [✨ Triagem]  │
│   ...                                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Detalhes técnicos

### Arquivos novos
- **`src/routes/inbox-ia.email.tsx`** — nova rota dentro do shell autenticado, monta `<TriageEmailPanel />`.
- **`src/components/inbox-ia/TriageEmailPanel.tsx`** — componente principal com filtros + lista + ações.

### Reaproveitamento (sem duplicar lógica)
- **Pastas/contas**: reutiliza queries já existentes (`user_email_accounts`, `email_labels`).
- **Lista de e-mails não lidos**: query nova em `emails` (não em `email_threads`, porque queremos granularidade por mensagem) com `is_unread = true`, `owner_email IN (contas)`, `internal_date >= cutoff`, `labels @> [pasta]`.
- **Sync sob demanda**: chama `gmailIncrementalSync` (já existente) no clique do botão "Atualizar do Gmail".
- **Triagem IA**: reusa `AiTriageDialog` (já existe e faz tudo: analisar, criar lead, criar atividade, ignorar).
- **Marcar como lido**: chama `gmailModify` com `removeLabelIds: ["UNREAD"]` + atualiza otimisticamente.

### Período
Botões rápidos: **Hoje**, **7d**, **30d**, **90d**, **Custom** (abre dois date pickers). Default: 7d. Persistido em `localStorage` (`inboxia.email.window`).

### Pasta
Dropdown com pastas do sistema (Inbox, Importante, Spam, Lixeira, etc.) + labels do usuário, populadas de `email_labels`. Default: **INBOX**. Persistido em `localStorage` (`inboxia.email.label`).

### Conta
Se só tem 1 conta vinculada, esconde o dropdown. Se >1, mostra todas e permite "Todas".

### Estado vazio
- Sem conta vinculada → CTA para ir em /email vincular.
- Sem e-mails não lidos no recorte → mensagem "Nenhum e-mail não lido neste período. [Atualizar do Gmail]".

### Após triagem
Quando `AiTriageDialog` fecha com sucesso (lead/atividade criada ou ignorado), removemos a linha da lista local. Para "Ignorar", o dialog já marca a thread como lida.

### Menu lateral
Adicionar item **"Email"** como sub-item de **Inbox IA** no `AppShell` (ou criar uma seção colapsável "Inbox IA" com sub-itens "Ações" e "Email").

---

## Fora de escopo (para próximos passos)

- Triagem em lote (selecionar vários e processar de uma vez) — pode vir depois.
- Triagem automática em background (cron lê não-lidos e enfileira sugestões em `assistant_actions`).
- Outras pastas além da inbox (já suportado pelo dropdown, mas não testado a fundo).
- Edição inline do payload sugerido pela IA antes de aprovar.

---

## Validação

- Abrir `/inbox-ia/email` lista corretamente os não lidos do INBOX dos últimos 7 dias.
- Trocar pasta/período recarrega a lista.
- "Atualizar do Gmail" puxa novos e-mails e atualiza a lista.
- Botão **Triagem IA** na linha abre o dialog sem abrir a thread.
- Após criar lead/atividade, o e-mail desaparece da lista.
- "Marcar como lido" chama Gmail e remove a linha.
- Permissões: respeita `user_email_accounts` (cada user só vê suas contas).
