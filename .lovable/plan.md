## Objetivo

A caixa em `/email` deve refletir 1:1 o Gmail da `booking@adatours.com`:
todas as mensagens (sem teto), anexos baixados e armazenados, e atualização contínua sem depender da aba estar aberta.

## Estado atual

- `gmailFullSync` está limitado a `maxPerLabel: 300` (botão da UI) e tem hard-cap nos primeiros 100–300 IDs. Inbox real tem milhares.
- Anexos: só metadado é gravado. O binário só é puxado quando o usuário clica para baixar (`gmailGetAttachment`).
- "Tempo real": polling a cada 30s **só enquanto a aba está visível** + Supabase Realtime na UI. Se ninguém abrir o painel, nada sincroniza.

## Mudanças

### 1. Sync completo, paginado e retomável (sem teto)

- Adicionar colunas em `email_sync_state`: `full_sync_page_token text`, `full_sync_in_progress bool`, `full_sync_started_at timestamptz`, `full_sync_total_synced int`.
- Reescrever `gmailFullSync` para processar **um lote por invocação** (~150 mensagens, ~25–30s) e retornar `{ done, nextPageToken, syncedSoFar }`. Ele:
  - Lê `full_sync_page_token` da última execução
  - Lista 1 página de IDs (`maxResults=500`) usando `q=` (sem filtro) + `includeSpamTrash=true`
  - Persiste cada mensagem com `fetchAndStoreMessage` (concorrência 6)
  - Salva o `nextPageToken` ou marca `done=true` quando acabar
- UI: o botão "Sincronizar Gmail" dispara um loop client-side que chama `gmailFullSync` até `done`, mostrando progresso ("X mensagens sincronizadas…"). Sai do loop se a aba fechar; o estado fica salvo no banco e retoma na próxima execução.

### 2. Download e armazenamento de anexos

- Criar bucket privado `email-attachments` no Storage com policies que liberam leitura para usuários cujo `auth.uid()` está em `user_email_accounts` para o `owner_email` do email pai. Path convencionado: `{owner_email}/{email_id}/{attachment_id}_{filename}`.
- Em `fetchAndStoreMessage`, após inserir os registros em `email_attachments`, baixar cada anexo via `users/me/messages/{id}/attachments/{attId}`, decodificar base64url e fazer upload no bucket. Gravar `storage_path` em `email_attachments` (renomear `cached_url`→`storage_path` ou adicionar coluna).
- Em `gmailGetAttachment` (download via UI) priorizar leitura do Storage; só cair no Gmail se faltar.
- Adicionar limite de tamanho (ex.: pular > 25 MB e logar).

### 3. Atualização contínua no servidor (não depende da aba aberta)

- Criar rota pública `src/routes/api/public/gmail-poll.ts` que executa `gmailIncrementalSync` para cada `owner_email` em `user_email_accounts`. Protegida por header `X-Cron-Secret` (segredo `GMAIL_CRON_SECRET`).
- Agendar pg_cron a cada 1 minuto chamando essa rota na URL estável `project--{id}.lovable.app`.
- Manter Supabase Realtime (`postgres_changes` em `email_threads`/`email_labels`) — ele já está ligado e fará a UI atualizar instantaneamente quando o cron gravar novas linhas.
- Reduzir o polling client-side para 15s como fallback quando a aba está visível.
- Lidar com `needsFullSync` (historyId expirou): o cron dispara automaticamente um lote do full sync resumível.

### 4. Detalhes técnicos

- O sync incremental atual já cobre `messagesAdded`, `messagesDeleted`, `labelsAdded`, `labelsRemoved` — manter, mas garantir que ao re-puxar uma mensagem com label alterada, os anexos não sejam re-baixados se já existem no Storage.
- Adicionar índice em `emails(thread_id)` e `emails(owner_email, internal_date desc)` para acelerar queries da caixa.
- Migration garante que `cached_url` em `email_attachments` vira `storage_path text` (ou adicionamos a nova coluna ao lado).

## Pontos de atenção

- Inbox grande: a primeira sincronização completa pode levar horas. O esquema retomável evita perda de progresso e timeouts da função serverless.
- Cota Gmail: 250 unidades/usuário/segundo. A concorrência 6 + lote 150 fica bem dentro do limite, mas adicionamos retry exponencial (já existe no `gw`).
- Custo de Storage: anexos podem somar GBs. O usuário deve estar ciente.

## Pergunta

Confirma o uso do Storage do Lovable Cloud para guardar os anexos (privado, com RLS por `user_email_accounts`)? Sem isso, "espelho fiel com anexos" não é possível — só ficaríamos com o metadado e o binário viria do Google sob demanda.