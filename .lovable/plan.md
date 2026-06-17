## Implementar fluxo "Conectar Gmail" por usuário

Hoje a tela `/email` usa o conector Gmail compartilhado do workspace (errado — sempre cai no `booking@adatours.com`). Vou trocar pelo OAuth próprio do Google, onde cada usuário conecta o Gmail dele.

### Como vai funcionar

1. Usuário clica **Conectar Gmail** em `/email`.
2. É redirecionado para a tela de consentimento do Google (ele escolhe a conta — ex. `diretorturismos@gmail.com`).
3. Google volta para `/api/public/google/callback` com um código.
4. O backend troca o código por `access_token` + `refresh_token` e salva em `email_accounts` com `user_id` = usuário logado.
5. A tela `/email` passa a listar Gmail dele mesmo. Outros usuários conectados conectam o próprio Gmail e cada um vê só o seu.

### Arquivos a criar/alterar

- `src/lib/google-oauth.server.ts` (novo) — funções: `buildAuthUrl(state, redirectUri)`, `exchangeCode(code, redirectUri)`, `refreshAccessToken(refreshToken)`. Usa `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET`.
- `src/lib/gmail-api.server.ts` — reescrever para aceitar `userId`, buscar tokens em `email_accounts` via `supabaseAdmin`, renovar se expirou, chamar `https://gmail.googleapis.com/gmail/v1/...` direto com `Authorization: Bearer <access_token>` (sem mais conector compartilhado).
- `src/lib/email.functions.ts` — `connectGmail` passa a retornar `{ authUrl }`; `getMyAccount` lê de `email_accounts` por `user_id`; `disconnectGmail` apaga linha; demais fns passam `context.userId` ao gmail-api.
- `src/routes/email.tsx` — botão "Conectar Gmail" abre `authUrl` em nova janela; após retornar, recarrega status.
- `src/routes/api/public/google.callback.ts` (novo) — recebe `?code&state`, troca código, descobre email via `gmail/v1/users/me/profile`, faz upsert em `email_accounts` (chave `user_id`), responde HTML que fecha a janela.

### Escopos e Redirect URIs

- Escopos: `openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify` + `access_type=offline&prompt=consent` (garante refresh_token).
- Redirect URIs que precisam estar cadastrados no Google Cloud Console (já listei no tutorial):
  - `https://bsstoursystem.lovable.app/api/public/google/callback`
  - `https://id-preview--e04e61e2-142f-4f0a-97f1-8cfe086322f3.lovable.app/api/public/google/callback`

### Migração de banco

A coluna `provider` provavelmente precisa marcar `'gmail_oauth'`. As colunas `access_token`, `refresh_token`, `token_expires_at`, `scope` já foram adicionadas. Vou aproveitar e apagar registros antigos `provider != 'gmail_oauth'` se houver, e garantir `UNIQUE (user_id)` para upsert por usuário.

### Segurança

- `state` da OAuth = `user_id` assinado com HMAC usando `LOVABLE_API_KEY` para impedir troca de identidade.
- Tokens só lidos no servidor; nunca expostos ao browser.
- `email_accounts` já tem RLS por `user_id`.