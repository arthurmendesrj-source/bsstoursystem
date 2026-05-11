## Contexto

Hoje o app usa **um único conector Gmail no nível do workspace** (a chave `GOOGLE_MAIL_API_KEY`), autorizado em `booking@adatours.com`. Toda chamada em `src/server/gmail-mirror.server.ts` usa esse mesmo token, então qualquer usuário que clica em "Sincronizar" acaba puxando os emails de `booking@adatours.com` — foi o que aconteceu com `boscobssteste2@gmail.com`.

Como o app precisa suportar **várias contas Gmail reais e diferentes**, a única solução correta é implementar **OAuth Google próprio, por usuário**. O conector Lovable não consegue fazer isso por design.

---

## Plano

### 1. Credenciais Google Cloud (você faz uma vez)
1. Em https://console.cloud.google.com/ criar (ou reutilizar) um projeto
2. Ativar a **Gmail API**
3. Configurar **OAuth consent screen** (External, modo Production)
4. Criar **OAuth 2.0 Client ID** do tipo *Web application* com Authorized redirect URIs:
   - `https://bsstoursystem.lovable.app/api/public/google/oauth/callback`
   - `https://id-preview--e04e61e2-142f-4f0a-97f1-8cfe086322f3.lovable.app/api/public/google/oauth/callback`
5. Escopos: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.readonly`, `gmail.modify`, `gmail.send`

Depois eu peço como secrets: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_STATE_SECRET` (para assinar o `state`).

### 2. Banco (migration)
- Tabela `user_gmail_tokens`:
  - `user_id uuid` (FK lógica para auth.users)
  - `email_address text` (lowercase)
  - `access_token text`, `refresh_token text`, `expires_at timestamptz`, `scope text`
  - `created_at`, `updated_at`
  - Unique `(user_id, email_address)`
- RLS:
  - Usuário só vê/edita os próprios tokens (campos sensíveis ficam acessíveis apenas via service role no backend)
  - Admin vê todos
- View pública `user_gmail_accounts_public` (sem tokens) com `email_address`, `connected_at` para a UI listar contas conectadas.

### 3. Rotas OAuth (server routes em `src/routes/api/public/google/oauth/`)
- `start.ts` (GET): exige usuário logado (lê access token do header), gera `state` HMAC com `user_id` + `nonce`, redireciona para `https://accounts.google.com/o/oauth2/v2/auth` com `access_type=offline&prompt=consent` para sempre vir refresh_token.
- `callback.ts` (GET): valida `state`, troca `code` por tokens em `https://oauth2.googleapis.com/token`, busca o `email` em `https://openidconnect.googleapis.com/v1/userinfo`, salva em `user_gmail_tokens` (upsert por `user_id+email_address`) e em `user_email_accounts`. Fecha o popup com `postMessage`.

### 4. Refator do mirror (`src/server/gmail-mirror.server.ts`)
- Trocar `gw(path)` (que usa o gateway Lovable) por `gmailFetch(userId, emailAddress, path)` que:
  - Carrega tokens do `user_gmail_tokens`
  - Se `expires_at` venceu, faz refresh via `oauth2.googleapis.com/token` e atualiza a linha
  - Chama `https://gmail.googleapis.com/gmail/v1{path}` com `Authorization: Bearer access_token`
- Todas as funções (`listAndPersistLabels`, sync de mensagens, threads, history) passam a receber `(supabase, userId, emailAddress)`.
- O `owner_email` continua vindo do `profile.emailAddress` do Gmail — agora coerente com a conta escolhida.
- Server functions chamadoras (em `src/server/gmail.functions.ts`) passam a exigir `emailAddress` selecionado pelo usuário.

### 5. UI (`src/components/email/EmailPanel.tsx` e correlatos)
- Novo botão **"Conectar conta Google"** abre popup `/api/public/google/oauth/start` (com header `Authorization`).
- Lista as contas conectadas do usuário (de `user_gmail_accounts_public`) num seletor.
- Botão **"Sincronizar"** e leitura de mensagens passam a usar a conta selecionada.
- Botão **"Desconectar conta"** (remove de `user_gmail_tokens` e opcionalmente revoga em `https://oauth2.googleapis.com/revoke`).

### 6. Conector Lovable atual
- O conector Gmail (`GOOGLE_MAIL_API_KEY`) **deixa de ser usado** para sincronização de caixa.
- Pode permanecer apenas para envios automáticos do sistema (ex.: vouchers a partir de `booking@adatours.com`) — confirmar com você se quer manter ou remover.

---

## Detalhes técnicos
- Substituímos o gateway `connector-gateway.lovable.dev/google_mail/gmail/v1` por chamadas diretas a `gmail.googleapis.com/gmail/v1` com tokens por usuário — necessário porque o gateway não suporta credenciais por end-user.
- Refresh: `POST oauth2.googleapis.com/token` com `grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...`. Margem de 60s antes do `expires_at`.
- `state` assinado com `crypto.createHmac('sha256', GOOGLE_OAUTH_STATE_SECRET)` para evitar CSRF, com validade de 10 min.
- Rotas em `/api/public/*` ignoram auth do site publicado, então o `start` exige `Authorization: Bearer` do usuário; o `callback` valida via `state`.
- Mantemos a tabela `user_email_accounts` e a chave composta `(owner_email, id)` em `email_labels` que já criamos.

---

## Próximo passo
Se aprovar este plano, eu começo pela migration (`user_gmail_tokens` + view) e em seguida peço os 3 secrets do Google. Depois implemento as rotas OAuth, o helper `gmailFetch`, refatoro o mirror e atualizo a UI para múltiplas contas.