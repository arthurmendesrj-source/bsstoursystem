# Importação completa do Gmail — cópia fiel automática

## Objetivo
Espelhar 100% da conta Gmail conectada (`booking@adatours.com`) no banco do app: **todas as pastas/labels** (INBOX, SENT, DRAFT, SPAM, TRASH, IMPORTANT, STARRED + labels customizadas), **histórico completo** (sem limite de meses) e **todos os anexos** baixados para o storage. Sem necessidade de instalar nada no Gmail/Apps Script.

## Diagnóstico atual
- A infraestrutura de mirror já existe (`gmailFullSync`, `gmailIncrementalSync`, tabelas `emails`/`email_threads`/`email_labels`/`email_attachments`/`email_sync_state`, bucket `email-attachments`).
- A sincronização parou em `INBOX`, mês 0, com 125 emails — porque depende da UI re-invocar página por página manualmente.
- A lista de labels percorridos é fixa em 7 labels do sistema; labels customizadas ficam de fora.
- A janela máxima é 360 dias por padrão (10 anos no limite hard-coded).

## O que muda

### 1. Cobertura completa de labels
Em `src/server/gmail-mirror.functions.ts`:
- Substituir a constante `SYNC_LABELS` por uma função que, no início do full sync, busca todos os labels da conta via `email_labels` (preenchido por `gmailListLabels`) e percorre **todos**: sistema + customizados.
- O cursor `full_sync_current_label` passa a guardar o `id` real do label (ex.: `Label_1234`) em vez do nome enum.
- Em `gmailListLabels`, salvar a ordem de processamento (sistema primeiro: INBOX→SENT→DRAFT→SPAM→TRASH→IMPORTANT→STARRED, depois customizados em ordem alfabética).

### 2. Histórico completo (sem limite de janela)
- `windowDays` default passa a ser configurável; quando o usuário escolhe "histórico completo", usar a data do email mais antigo do Gmail como limite.
- Estratégia: começar `monthOffset = 0` e avançar até a página retornar `messages: []` por **3 meses consecutivos vazios** → encerra esse label e pula para o próximo. Evita cravar um número arbitrário de meses.

### 3. Loop automático via cron (sem depender da UI)
Criar nova rota pública `src/routes/api/public/gmail-full-sync-tick.ts`:
- Autenticação por `apikey` header (anon key).
- Lê `email_sync_state` de cada owner com `full_sync_in_progress = true`.
- Invoca a lógica do `gmailFullSync` uma vez (uma página) por owner.
- Retorna progresso resumido.

Agendar via `pg_cron` para rodar **a cada 1 minuto**:
```
SELECT cron.schedule('gmail-full-sync-tick', '* * * * *',
  $$SELECT net.http_post(url:='…/api/public/gmail-full-sync-tick',
    headers:='{"apikey":"<ANON>"}'::jsonb) as id;$$);
```
Quando `done = true`, o tick para sozinho (porque `full_sync_in_progress` vira `false`).

Adicionalmente, agendar `gmailIncrementalSync` (via outra rota pública `gmail-incremental-tick`) **a cada 5 minutos** para manter o espelho em dia depois que o full sync acabar.

### 4. Anexos (já implementado, manter)
`fetchAndStoreMessage` já baixa anexos até 25 MB para o bucket `email-attachments`. Sem mudanças.

### 5. UI — painel de progresso em `/email`
Substituir o botão atual por:
- Botão **"Importar tudo (cópia fiel)"** que chama uma nova server fn `gmailStartFullMirror` — ela faz: `gmailListLabels` + reset do `email_sync_state` (`full_sync_in_progress = true`, label = primeiro da lista, offset 0, sem `windowDays`).
- Card de progresso ao vivo (Realtime em `email_sync_state`) mostrando: label atual, mês corrente, total sincronizado, ETA aproximado.
- Mensagem clara: "A importação roda automaticamente em segundo plano. Você pode fechar a página."

### 6. Limpeza
- Remover/ocultar a pasta `gmail-addon/` em `/mnt/documents/` (não usada mais) e remover as rotas de webhook do Apps Script (`src/routes/api/public/gmail/*`) — ou manter inativas se o usuário quiser usar depois. **A confirmar**: por padrão, deixaremos os arquivos no repo mas removeremos as instruções do README.

## Detalhes técnicos

**Arquivos editados:**
- `src/server/gmail-mirror.functions.ts` — labels dinâmicos, encerramento por janela vazia, nova fn `gmailStartFullMirror`.
- `src/components/email/EmailPanel.tsx` — botão "Importar tudo" + card de progresso Realtime.

**Arquivos criados:**
- `src/routes/api/public/gmail-full-sync-tick.ts` — endpoint chamado pelo cron.
- `src/routes/api/public/gmail-incremental-tick.ts` — endpoint chamado pelo cron.

**Migração SQL:**
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.email_sync_state` (para Realtime na UI).
- Agendar 2 jobs `pg_cron` (full-sync-tick a cada 1 min, incremental a cada 5 min).
- Adicionar coluna `email_labels.sort_order int` para ordenar a fila de labels.

**Sem novos secrets** — usa o conector Gmail já configurado (`GOOGLE_MAIL_API_KEY_1`) e a anon key para o cron.

## O que o usuário precisa fazer
**Nada.** Clicar em "Importar tudo" uma vez. O cron continua até terminar (pode levar várias horas dependendo do volume).
