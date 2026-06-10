
## Objetivo

1. Eliminar o falso "Sessão expirada — faça login novamente." que aparece ao clicar em **Conectar Gmail** mesmo já logado.
2. Permitir usar no painel `/email` as contas conectadas via **email + senha (SMTP/IMAP)** — listar a inbox e enviar emails sem depender do Gmail OAuth.

## Parte 1 — Corrigir "Sessão expirada"

**Causa:** `startGoogleConnect` em `EmailPanel.tsx` (e o mesmo padrão em `GmailConnectCard.tsx`) chama `supabase.auth.getSession()` e falha se o `access_token` em memória está vencido — mesmo que o `refresh_token` ainda seja válido. Como a página está atrás do `AuthGate`, o usuário está logado; o token só precisa ser refrescado.

**Correção:** antes de mostrar o erro, tentar `supabase.auth.refreshSession()`. Só mostrar "Sessão expirada" se o refresh também falhar. Aplicar em:
- `src/components/email/EmailPanel.tsx` → `startGoogleConnect`
- `src/components/GmailConnectCard.tsx` → handler equivalente (linha ~109)

## Parte 2 — Integrar contas SMTP/IMAP no `/email`

O painel hoje só lê contas de `user_gmail_tokens`. Vou expandir o seletor de conta para incluir também as contas em `email_smtp_accounts` e rotear a leitura/envio para os server functions já criados (`fetchInbox`, `fetchEmailBody`, `sendEmailViaSmtp`).

### Mudanças no `EmailPanel.tsx`

- **Tipo de conta:** trocar o array `authorizedEmails: string[]` por `accounts: Array<{ email: string; kind: "gmail" | "smtp"; id?: string }>` (id = `email_smtp_accounts.id` quando SMTP). Persistir a seleção atual mantendo email no `localStorage` (já existe), mas resolvendo o tipo a partir da lista.
- **`loadAccounts`:** além de `user_gmail_tokens`, buscar `email_smtp_accounts (id, email_address)` do usuário e juntar as duas listas. Ordenar Gmail primeiro, depois SMTP.
- **Seletor de conta (dropdown):** mostrar um pequeno selo "SMTP" ao lado dos itens vindos de `email_smtp_accounts`.
- **Modo SMTP (render alternativo):** quando a conta selecionada for `kind === "smtp"`, renderizar um painel simplificado em vez do mirror de Gmail:
  - Sidebar: apenas "Caixa de entrada" (IMAP INBOX) + "Enviados" (SENT) — sem labels customizadas, sem sync windows.
  - Lista de threads: chamar `fetchInbox({ accountId, mailbox: "INBOX" | "[Gmail]/Sent" | "Sent", limit: 50 })` via `useServerFn`. Cada mensagem vira uma linha (assunto, remetente, data, flag de não-lida). Botão de refresh refaz o fetch.
  - Leitura: ao clicar em uma mensagem, abrir uma janela do `ThreadWindowManager` exibindo o corpo carregado via `fetchEmailBody({ accountId, uid })`. Como `fetchEmailBody` hoje retorna `raw` (RFC 822 cru), adicionar parsing leve no servidor para extrair `text` e `html` (usando `mailparser`, pacote já compatível com Workers) — ou fazer parsing no cliente. Decisão: parsing no servidor com `mailparser` (mais simples, mantém o cliente leve).
  - Envio: o `Dialog` de compose existente passa a chamar `sendEmailViaSmtp({ accountId, to:[...], subject, text/html })` quando a conta é SMTP, mantendo o fluxo de `gmailSend` para Gmail OAuth.
  - Ações Gmail-only (sync incremental, labels, estrelar, marcar importante, lixeira/spam) ficam ocultas no modo SMTP. Marcar como lido: usa `markEmailAsRead` existente.

### Server-side

- Em `src/lib/email-smtp.functions.ts`:
  - Atualizar `fetchEmailBody` para usar `mailparser.simpleParser(raw)` e retornar `{ subject, from, to, date, text, html }` ao invés de só `raw`.
  - Adicionar `listMailboxes(accountId)` opcional (descobrir o nome correto da pasta de enviados — varia entre provedores). V1 pode tentar `"Sent"`, `"[Gmail]/Sent Mail"`, `"Sent Items"` na ordem, e cachear o nome bom.
- Em `src/server/email-smtp.server.ts`: nada novo.
- Instalar dependência: `mailparser` + `@types/mailparser`.

### Banco de dados

Nenhuma migração nova — a tabela `email_smtp_accounts` já existe.

## Detalhes técnicos

- O refresh de sessão usa: `const { data, error } = await supabase.auth.refreshSession(); const token = data.session?.access_token;`. Se `error` ou `!token`, então sim mostrar "Sessão expirada".
- `mailparser` funciona no runtime do Worker com `nodejs_compat` (usa `stream`, `Buffer`, `iconv-lite` puro JS). Sem binários nativos.
- `ThreadWindowManager` espera `ThreadMessage` no formato atual; criar um adapter `imapMessageToThread(parsed)` que mapeia campos do `mailparser`.
- Manter `selectedAccount` em `localStorage` por email; ao carregar, resolver o tipo a partir da lista para escolher Gmail vs SMTP.

## Fora de escopo

- Sincronização periódica/push de IMAP para o banco (`email_threads`/`emails`) — V2.
- Anexos no modo SMTP (envio e download) — V2.
- Pastas customizadas IMAP além de INBOX/Sent — V2.
- Triagem IA (`AiTriageDialog`) no modo SMTP — V2.

## Risco / validação

- Pequeno: o refresh de sessão pode ainda falhar se o `refresh_token` foi revogado; nesse caso a mensagem original é correta.
- Médio: parsing de emails grandes (vários MB) via `mailparser` no Worker pode estourar tempo/CPU. Mitigação: limitar tamanho em `fetchEmailBody` (truncar `raw` acima de ~5 MB e marcar como "muito grande para visualizar inline").
