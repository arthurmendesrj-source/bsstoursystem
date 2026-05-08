
# Caixa de E-mail estilo Gmail (clone completo, somente leitura)

Objetivo: a caixa atual mostra apenas a INBOX (com algumas pastas básicas) e exige clique manual para sincronizar. Vamos transformá-la num **clone Gmail completo** que **espelha em tempo real** todas as caixas/labels do Gmail conectado, sem escrever de volta no Gmail (somente leitura).

---

## 1. Banco de dados (migration)

Adicionar tudo que falta para representar o estado completo do Gmail:

**Tabela `emails`** — novas colunas:
- `history_id` (bigint) — ID do histórico Gmail da mensagem
- `internal_date` (timestamptz) — data interna do Gmail (ordenação correta)
- `size_estimate` (int)
- `is_starred` (bool, default false), `is_important` (bool, default false)
- `category` (text) — PRIMARY/SOCIAL/PROMOTIONS/UPDATES/FORUMS

**Nova tabela `email_threads`**: `id` (text, PK = threadId), `subject`, `snippet`, `participants` (text[]), `last_message_at`, `message_count`, `is_unread`, `is_starred`, `is_important`, `labels` (text[]), `has_attachments`.

**Nova tabela `email_labels`**: `id` (text, PK = labelId Gmail), `name`, `type` (system/user), `color_bg`, `color_text`, `unread_count`, `total_count`, `parent_id`.

**Nova tabela `email_attachments`**: `id`, `email_id` (FK), `attachment_id` (Gmail), `filename`, `mime_type`, `size`, `cached_url` (nullable, se já baixado para storage).

**Nova tabela `email_sync_state`** (singleton por workspace/usuário): `user_email`, `last_history_id`, `last_full_sync_at`, `watch_expiration` (para Gmail push).

**RLS**: mesmas regras já usadas em `emails` (leitura para autenticados, escrita para staff).

---

## 2. Server functions Gmail (src/server/gmail.functions.ts e novos arquivos)

Expandir a integração para cobrir o Gmail completo:

- `gmailListLabels` — `GET /users/me/labels` → popula `email_labels` com cores, contadores, sistema vs custom.
- `gmailFullSync` — varre `messages.list` paginado por **todas as labels do sistema** (INBOX, SENT, DRAFT, SPAM, TRASH, STARRED, IMPORTANT, CHAT) + categorias (CATEGORY_PERSONAL, _SOCIAL, _PROMOTIONS, _UPDATES, _FORUMS) + labels customizadas. Salva `historyId` mais recente em `email_sync_state`.
- `gmailIncrementalSync` — usa `users.history.list?startHistoryId=...` e processa eventos `messageAdded`, `messageDeleted`, `labelAdded`, `labelRemoved` para manter espelho atualizado. Atualiza `email_sync_state.last_history_id`.
- `gmailGetThread` — `GET /users/me/threads/{id}?format=full` para abrir conversa inteira (lista de mensagens em ordem).
- `gmailGetAttachment` — `GET /users/me/messages/{id}/attachments/{attId}` → faz download base64 e responde como blob (ou cacheia em storage).
- `gmailWatch` / webhook (opcional): `users.watch` configurando Pub/Sub. **Adiar** — usaremos polling agressivo no curto prazo (ver §4).

Todos respeitam o padrão `createServerFn` + `requireSupabaseAuth` já existente.

---

## 3. UI — Clone Gmail (`src/components/email/EmailPanel.tsx` reescrito)

Layout 3 colunas estilo Gmail, todo com tokens semânticos do `styles.css`:

```text
┌──────────┬─────────────────────┬──────────────────────────┐
│ Sidebar  │ Lista de threads    │ Leitura da conversa      │
│  Compose │ (busca + filtros)   │ (mensagens em accordion) │
│  Inbox   │                     │                          │
│  Starred │ avatar | from       │ headers + corpo HTML     │
│  Snoozed │  subject — snippet  │ anexos clicáveis         │
│  Sent    │  data | labels      │ ações (estrela, lixeira  │
│  Drafts  │                     │ local, etiquetas locais) │
│  Spam    │                     │                          │
│  Trash   │                     │                          │
│  ───     │                     │                          │
│  Categ.  │                     │                          │
│  Labels  │                     │                          │
└──────────┴─────────────────────┴──────────────────────────┘
```

Funcionalidades:
- **Sidebar** carregada de `email_labels` (system primeiro, custom depois) com badges de contagem e cores reais do Gmail.
- **Categorias** (Primary/Social/Promotions/Updates) como abas dentro da Inbox (igual Gmail web).
- **Lista de threads** (não mais de mensagens individuais): agrupa por `thread_id`, mostra remetentes encadeados (`A, B, você 3`), assunto, snippet, data relativa, ícones de anexo/estrela/importante, chips de labels coloridas. Ordenação por `internal_date DESC`.
- **Busca** em tempo real (debounced) sobre `subject/snippet/from`. Suporte a operadores estilo Gmail (`from:`, `has:attachment`, `is:unread`, `label:`).
- **Leitor de thread**: abre conversa inteira via `gmailGetThread`, mostra cada mensagem como card colapsável (último expandido). Renderiza HTML em iframe sandbox para isolamento + segurança.
- **Anexos**: lista com ícone, nome, tamanho, botão baixar (chama `gmailGetAttachment`).
- **Atalhos de teclado** estilo Gmail: `j/k` navegar, `Enter` abrir, `e` arquivar (local), `#` lixeira (local), `s` estrela (local), `/` focar busca, `c` compor, `Esc` voltar.
- **Compose** mantém UX atual (responder/encaminhar/novo) — único ponto que escreve no Gmail (envio), permitido pelas escopos já configurados.
- **Ações de organização** (arquivar, lixeira, estrela, marcar lida, aplicar label) ficam **somente locais** no banco (conforme escolha do usuário) — Gmail não é alterado.
- **Manter** funcionalidades CRM já existentes: triagem com IA, criar lead, criar atividade, associar a lead/cliente/fornecedor (movidas para um painel lateral "CRM" no leitor).

Arquivos novos:
- `src/components/email/EmailSidebar.tsx`
- `src/components/email/EmailThreadList.tsx`
- `src/components/email/EmailThreadReader.tsx`
- `src/components/email/EmailComposeDialog.tsx` (extraído)
- `src/components/email/EmailCrmPanel.tsx` (triagem IA + associações, mantém código atual)
- `src/components/email/useGmailKeyboard.ts`
- `src/components/email/useGmailSearch.ts`

`EmailPanel.tsx` vira o orquestrador (estado global + roteamento entre os 3 painéis).

---

## 4. Sincronização "tempo real"

Estratégia híbrida (Gmail Push real exige Google Cloud Pub/Sub, fora do escopo direto):

1. **Full sync inicial** ao primeiro acesso (popula tudo).
2. **Incremental sync** via `historyId` — chamado:
   - Ao abrir o painel.
   - A cada **30s** enquanto a aba está visível (`document.visibilityState === 'visible'` + `setInterval`).
   - Ao voltar foco para a janela.
3. **Realtime Supabase**: habilitar realtime nas tabelas `emails` e `email_threads`; o front faz `subscribe` e atualiza lista/contadores instantaneamente quando o sync grava novas linhas. Isso garante propagação imediata para qualquer aba aberta após o sync.
4. **Cron server-side opcional** (futuro): rota `/api/public/cron/gmail-sync` chamada por pg_cron a cada 1 min para sincronizar mesmo com app fechado — anotado como próximo passo, não incluso nesta entrega para evitar custos surpresa.

---

## 5. Performance & UX

- Paginação virtual na lista (react-window) para suportar milhares de threads.
- Cache de corpo HTML (já está no banco — `body_html`).
- Skeletons enquanto carrega; toasts discretos para sync em background.
- Indicador "Sincronizando…" sutil no topo da sidebar.

---

## Resumo dos arquivos

**Migration**: novas colunas em `emails`; novas tabelas `email_threads`, `email_labels`, `email_attachments`, `email_sync_state`; realtime habilitado em `emails` e `email_threads`.

**Server**: `src/server/gmail.functions.ts` expandido com `gmailListLabels`, `gmailFullSync`, `gmailIncrementalSync`, `gmailGetThread`, `gmailGetAttachment`.

**UI**: `EmailPanel.tsx` reescrito + 6 novos componentes/hooks em `src/components/email/`.

**i18n**: novas chaves para todos os labels do sistema, categorias, atalhos e estados.

---

## Confirmações antes de implementar

1. Confirma que o **envio** de e-mail (responder/encaminhar) **deve continuar funcionando** (única escrita no Gmail)? Ou virar 100% somente leitura sem envio?
2. OK avançar **sem Gmail Push real (Pub/Sub)** nesta entrega, usando polling de 30s + realtime Supabase como "tempo real"?
3. **Anexos**: baixar sob demanda (clicar = chama API e devolve blob) é suficiente, ou prefere pré-download para storage do Lovable Cloud (mais espaço, mais rápido)?
