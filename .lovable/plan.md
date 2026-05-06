## Causa do erro

Os 50 emails da caixa são **fakes** (gmail_id `seed-2026-XX`) e moram só no banco. Mas `EmailPanel` chama o Gmail API de verdade em três pontos:

- `gmailSync` (botão "Sincronizar") — abre tela
- `gmailGet` (ao clicar em um email para abrir o corpo)
- `emailAnalyze` (botão "Triagem com IA")

Como as contas Gmail foram desconectadas, o gateway responde **403 `project_not_authorized`**. Resultado: nada abre e a triagem falha.

## O que ajustar (sem mexer em UI/visual, só lógica)

### 1. `EmailPanel.tsx` — abrir email seed direto do banco
Em `select(row)`: se `row.gmail_id` começa com `seed-`, montar o `FullMessage` a partir das colunas que já existem em `public.emails` (`from_email`, `from_name`, `to_emails`, `subject`, `received_at`, `body_text`, `body_html`, `snippet`, `thread_id`, `labels`) — sem chamar `gmailGet`. Pular também o `modifyFn` (marcar como lido) e atualizar só localmente via `supabase.from('emails').update({ is_unread:false })`.

### 2. `EmailPanel.tsx` — triagem com IA para emails seed
Em `analyze()`: se `selected.gmail_id` começa com `seed-`, chamar uma nova server function `emailAnalyzeLocal({ email_id })` que:
- lê a linha da tabela `emails`
- monta o prompt com `from_email`, `subject`, `body_text || snippet`
- chama o Lovable AI Gateway (`google/gemini-3-flash-preview`) com o mesmo tool `extract_lead` já usado em `emailAnalyze`
- grava `ai_suggestion` na tabela e retorna a sugestão

Reaproveita 90% do código do `emailAnalyze` atual — só troca a fonte do conteúdo (banco em vez do Gmail).

### 3. `EmailPanel.tsx` — botão Sincronizar
Quando não há Gmail conectado, `gmailSync` sempre vai falhar. Opções:
- (a) Esconder o botão se não houver Gmail (não temos como detectar do client → ruim)
- (b) Tratar o 403 silenciosamente — mostrar toast "Nenhuma conta Gmail conectada" em vez do erro técnico
- (c) Remover o `doSync()` automático no `useEffect` inicial

**Sugiro (b) + (c)**: para não disparar erro ao abrir a página, e dar uma mensagem amigável quando o usuário clica em Sincronizar.

### 4. Ações destrutivas (arquivar/lixeira/responder/encaminhar) em emails seed
Essas chamam Gmail API e vão dar 403. Como são emails fake de teste:
- Para arquivar/lixeira em seed: atualizar só o array `labels` no banco (adicionar `TRASH`, remover `INBOX`)
- Reply/forward: bloquear com toast "Email de teste — envio desabilitado"

### Não vou mexer
- Layout/visual da inbox
- Lógica para emails reais (caso reconecte Gmail no futuro, tudo continua funcionando)
- Tabelas, RLS, migrações

Confirma que posso aplicar?
