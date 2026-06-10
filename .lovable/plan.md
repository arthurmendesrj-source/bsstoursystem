# Reset total da função de email e reconstrução SMTP/IMAP

Vou apagar **todo o código e todos os dados** relacionados a email (Gmail OAuth + SMTP atual) e reconstruir do zero apenas com login + senha (SMTP para enviar, IMAP para ler). Sem Google OAuth, sem triagem por IA, sem sync para banco — apenas: conectar conta, ler caixa de entrada, enviar email.

⚠️ A limpeza dos dados é **irreversível**.

---

## Parte 1 — Limpeza (1 migração + remoção de arquivos)

### 1a. Migração SQL (drop)
Apaga tabelas, dados e dependências:
- `emails`, `email_threads`, `email_attachments`, `email_labels`, `email_message_links`, `email_sync_state`
- `email_smtp_accounts`, `user_gmail_tokens`, `gmail_connection_audit`, `user_email_accounts`
- Funções/triggers órfãs: `link_email_thread`, `auto_link_email_by_thread`, `user_has_email_account`
- Secret `CRM_GMAIL_ADDON_TOKEN` (continua disponível como secret no projeto, só não é mais usado)

### 1b. Remoção de arquivos
**Componentes e telas**
- `src/components/GmailConnectCard.tsx`
- `src/components/SmtpEmailConnectCard.tsx`
- `src/components/email/` (pasta inteira: `EmailPanel`, `SmtpInbox`, `AiTriageDialog`, `ThreadReader`, `ThreadWindowManager`)
- `src/components/inbox-ia/TriageEmailPanel.tsx`
- `src/routes/email.tsx`, `src/routes/inbox-ia.tsx`, `src/routes/inbox-ia_.email.tsx`
- `src/routes/google-oauth-popup.tsx`, `src/routes/settings_.google-diagnostico.tsx`

**Lib / server**
- `src/lib/email-smtp.functions.ts`, `src/lib/gmail.functions.ts`, `src/lib/gmail-audit.functions.ts`, `src/lib/gmail-mirror.functions.ts`, `src/lib/gmail-auth-middleware.ts`, `src/lib/google-oauth-diagnose.functions.ts`, `src/lib/linkEmailToEntity.ts`
- `src/server/email-smtp.server.ts`, `src/server/gmail-auth.server.ts`, `src/server/gmail-mirror.server.ts`
- `src/routes/api/public/gmail/` (pasta inteira), `src/routes/api/public/gmail-poll.ts`, `src/routes/api/public/google/` (pasta inteira)

**Ajustes mínimos em arquivos que ficam**
- `src/routes/settings.tsx`: remover `GmailConnectCard` e `SmtpEmailConnectCard` (depois adiciono o card novo).
- `src/routes/workspace.tsx`: remover import e usos de `EmailPanel` (aba "email" do lead deixa de existir — mostro mensagem "Email em /email").

---

## Parte 2 — Reconstrução mínima (SMTP/IMAP)

### 2a. Nova tabela `email_accounts`
Por usuário, guarda credenciais (senha cifrada com `pgcrypto` usando segredo `EMAIL_ENCRYPTION_KEY`):
- `email`, `display_name`
- `smtp_host`, `smtp_port`, `smtp_secure`
- `imap_host`, `imap_port`, `imap_secure`
- `username`, `password_encrypted`
- RLS: dono lê/grava o seu; service_role acessa para os server fns.

Presets de provedor (Gmail / Outlook / Yahoo / iCloud / Outro) ficam **só no código**, não no banco.

### 2b. Server functions (`src/lib/email.functions.ts` + `src/server/email.server.ts`)
Todas autenticadas via `requireSupabaseAuth`:
- `connectEmailAccount({ provider, email, password, displayName? })` — testa SMTP+IMAP, cifra e salva
- `listEmailAccounts()`
- `deleteEmailAccount({ id })`
- `fetchInbox({ accountId, mailbox: "INBOX"|"SENT", limit })` — usa `imapflow`
- `fetchMessage({ accountId, mailbox, uid })` — parse com `mailparser`
- `sendEmail({ accountId, to, cc?, subject, text, html? })` — usa `nodemailer`
- `markRead({ accountId, mailbox, uid, read })`

### 2c. UI
- **`src/routes/email.tsx`** — nova tela inteira: seletor de conta no topo, sidebar (Inbox/Enviados/Novo), lista de mensagens, leitor, diálogo de composição.
- **`src/components/email/ConnectEmailCard.tsx`** — em `/settings`: selecionar provedor, digitar email + senha de app, conectar.

### 2d. Menu/AppShell
Manter link "Email" no menu apontando para `/email`. Remover qualquer link para "Inbox IA".

---

## Riscos e fora de escopo

- **Risco baixo**: dados de email atuais são perdidos (é o pedido). Conexões precisam ser refeitas.
- **Fora de escopo**: triagem por IA, vinculação automática email↔lead/cliente, sync periódico para o banco, anexos no enviar, busca dentro da caixa. Podemos adicionar depois quando a base estiver estável.

---

## Detalhes técnicos

```text
Camadas:
 UI (/email, /settings ConnectEmailCard)
   └─ serverFn (email.functions.ts, requireSupabaseAuth)
        └─ helpers Node (email.server.ts: nodemailer, imapflow, mailparser, decrypt)
             └─ Postgres: email_accounts (RLS por user_id, senha cifrada com pgcrypto)
```

- Segredo novo: `EMAIL_ENCRYPTION_KEY` (32+ chars). Pedirei após aprovação do plano.
- Senha guardada como `bytea` via `pgp_sym_encrypt(password, key)`; decifrada apenas dentro da serverFn.
- `imapflow`/`nodemailer`/`mailparser` já estão no projeto — reaproveito.
