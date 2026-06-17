## Objetivo

Cada usuário tem sua própria caixa Gmail conectada via senha de app. O endereço usado é o mesmo do login (do convite). A caixa é privada — apenas o dono e gestores (subordinado em `get_subordinates`) podem acessar, e gestores também podem **enviar em nome do usuário** pela aba Gerência.

## Como vai funcionar (visão do usuário)

1. **Primeiro acesso em /email**: card "Conectar Gmail" com o email do login já preenchido. Pede só a senha de app + link "Como gerar senha de app".
2. **Após conectar**: caixa com abas **Recebidos** e **Enviados**, botão **Novo email**, leitura com botão **Responder**.
3. **Gerência (`/gerencial/:userId`)** → aba E-mails: gestor vê Recebidos e Enviados espelhados, abre mensagens e pode **Responder/Novo** enviando pela caixa do subordinado. Header mostra "Espelho de {nome}" + aviso "Suas ações são registradas".

## Pastas suportadas

- **INBOX** (Recebidos)
- **[Gmail]/Sent Mail** / `\Sent` (Enviados) — detectado automaticamente via special-use flag do IMAP, com fallback para os nomes em português ("[Gmail]/E-mails enviados").

Mesma UI/lista para ambas; a aba só troca a pasta consultada.

## Segurança

- **RLS** em `email_accounts`: continua `auth.uid() = user_id`. Gestores nunca leem a senha — IMAP/SMTP roda só no servidor.
- **Senha criptografada** (`password_encrypted` bytea) via `pgp_sym_encrypt`/`pgp_sym_decrypt` (pgcrypto) com `EMAIL_ENCRYPTION_KEY` do secret.
- **Autorização do gestor** em toda server function: `caller === target || is_subordinate_of(target, caller) || is_admin(caller)`. Caso contrário, 403.
- **Auditoria**: envio do gestor pela caixa do subordinado grava em `user_audit_log` (`action='email_sent_as_user'`, payload com to/subject/messageId/folder).

## Telas

- **/email**
  - `ConnectGmailCard`: email pré-preenchido (read-only), input senha de app, botão Conectar, link de instruções.
  - Conectado: abas **Recebidos / Enviados**, busca simples, botão Novo, painel de leitura à direita com Responder.
- **/gerencial/:userId** — aba E-mails: mesmas abas Recebidos/Enviados em modo gestor.

## Backend (TanStack server functions, todas com `requireSupabaseAuth`)

`src/lib/email.functions.ts`:
- `connectGmail({ password })` — força provider=gmail e email=email do usuário logado, testa SMTP+IMAP, criptografa, salva.
- `getMyAccount()` → `{ connected, email }`.
- `disconnectGmail()`.
- `listMessages({ targetUserId, folder: 'inbox' | 'sent', page, search })` — autoriza, abre IMAP, retorna últimas 50.
- `fetchMessage({ targetUserId, folder, uid })` — retorna corpo (texto + HTML sanitizado) e headers.
- `markRead({ targetUserId, uid })` — só faz sentido em Recebidos.
- `sendEmail({ targetUserId, to, cc, bcc, subject, body, inReplyTo? })` — envia via SMTP do alvo; Gmail copia automaticamente para Enviados; se caller ≠ dono, grava `user_audit_log`.

`src/lib/email.server.ts` (server-only): `imapflow` + `mailparser` + `nodemailer`; resolve pasta Sent via special-use; chama RPC `decrypt_email_password(account_id)` com `supabaseAdmin`.

## Banco (migração única)

1. Garantir `pgcrypto`.
2. Funções SECURITY DEFINER restritas a service_role:
   - `encrypt_email_password(plain text) returns bytea`
   - `decrypt_email_password(account_id uuid) returns text`
3. Check constraint em `email_accounts.provider` = 'gmail' (por enquanto).
4. RLS atual fica como está.

## Pacotes
`imapflow`, `nodemailer`, `mailparser`, `isomorphic-dompurify`.

## Fora de escopo agora
Sync para banco, anexos, triagem por IA, outras pastas (Drafts/Spam/Trash), outros provedores.

## Ação sua antes de eu implementar
Vou pedir o secret `EMAIL_ENCRYPTION_KEY` (qualquer string aleatória de 32+ chars). Sem ela as senhas não podem ser criptografadas.

## Riscos
- Senha de app dá acesso total à caixa — se a chave vazar, todas as senhas vazam.
- IMAP ao vivo pode ser lento; limitado a 50 mensagens por aba.
- Trocou a senha de app no Google → app mostra "Reconectar".
