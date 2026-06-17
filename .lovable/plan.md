# Cada usuário usa o próprio Gmail (OAuth por usuário)

## Regra (vou gravar na memória do projeto)

> Cada usuário acessa apenas o Gmail da própria conta cadastrada no app. Nunca usar conector Gmail do workspace, nem email compartilhado, nem caixa de outro usuário.

## O que estava errado

Eu estava usando o **conector Gmail do workspace** (`booking@adatours.com`), que é uma conexão única do builder — todos os usuários do app caíam nela. Isso viola a regra. Vou remover essa abordagem.

## Solução: OAuth Google por usuário

Cada usuário, ao entrar em **/email**, clica em "Conectar Gmail" → faz login no Google com a própria conta → autoriza os escopos → o app guarda o refresh token **dele** na tabela `email_accounts` (já existe). Daí em diante, toda leitura/envio é feita com o token desse usuário, no Gmail dele.

## O que precisa de você (uma vez)

Para o login Google funcionar com Gmail API, preciso de credenciais OAuth próprias suas no Google Cloud:

1. Acessar https://console.cloud.google.com/ → criar/escolher um projeto.
2. **APIs & Services → Library** → ativar **Gmail API**.
3. **OAuth consent screen** → configurar (External, nome do app, email de suporte). Adicionar os escopos:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `email`, `profile`, `openid`
4. **Credentials → Create OAuth Client ID → Web application**.
5. Em **Authorized redirect URIs** adicionar:
   - `https://bsstoursystem.lovable.app/api/public/google/callback`
   - `https://id-preview--e04e61e2-142f-4f0a-97f1-8cfe086322f3.lovable.app/api/public/google/callback`
6. Copiar **Client ID** e **Client Secret** — vou pedir como segredos (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`) no próximo passo.

## O que eu vou implementar

1. **Remover conector Gmail do workspace** do projeto (desconectar `booking@adatours.com`). Não usar mais `connector-gateway.lovable.dev/google_mail`.
2. **Server functions de OAuth por usuário** (`src/lib/google-oauth.functions.ts`):
   - `startGoogleOAuth`: gera URL de autorização com `state` (id do usuário + nonce) e `access_type=offline`, `prompt=consent`.
   - Rota pública `src/routes/api/public/google/callback.ts`: recebe o `code`, troca por `access_token`+`refresh_token`, busca o email do Google (`userinfo`), grava em `email_accounts` (campos `user_id`, `email`, `refresh_token`, `access_token`, `expires_at`, `provider='google'`), e redireciona para `/email?connected=1`.
3. **Helper de chamada Gmail API por usuário** (`src/lib/gmail-user.server.ts`):
   - Lê o `email_accounts` do `userId` autenticado.
   - Se `access_token` expirou, faz refresh com `refresh_token` + Client ID/Secret e atualiza o registro.
   - Chama `https://gmail.googleapis.com/gmail/v1/users/me/...` diretamente (sem gateway).
4. **Reescrever `email.functions.ts`** para usar esse helper em `listMessagesFn`, `fetchMessageFn`, `markReadFn`, `sendEmailFn`, `getMyAccount`, `disconnectGmail`. Toda função exige `requireSupabaseAuth` e nunca acessa caixa de outro usuário (filtro por `user_id = context.userId`, garantido por RLS).
5. **`connectGmail` server fn** vira apenas "retorne a URL de autorização"; o front (`src/routes/email.tsx`) faz `window.location.href = url` para iniciar o fluxo. Botão muda para "Conectar minha conta Google".
6. **`disconnectGmail`** apaga só a linha de `email_accounts` do próprio usuário e (opcional) revoga o token no Google.
7. **RLS de `email_accounts`**: confirmar que a policy é `user_id = auth.uid()` para SELECT/INSERT/UPDATE/DELETE (já tem 1 policy — vou checar e ajustar se faltar).
8. Remover `src/lib/gmail-api.server.ts` (gateway do workspace) e qualquer referência a `GOOGLE_MAIL_API_KEY`/`LOVABLE_API_KEY` para Gmail.

## Arquivos afetados

- criar: `src/lib/google-oauth.functions.ts`, `src/lib/gmail-user.server.ts`, `src/routes/api/public/google/callback.ts`
- editar: `src/lib/email.functions.ts`, `src/routes/email.tsx`, `src/components/email/EmailMailbox.tsx`
- remover: `src/lib/gmail-api.server.ts`, conexão do conector `google_mail` no projeto
- migration (se necessário): ajustar policies/colunas de `email_accounts`

## Próximos passos

Confirme que vai criar as credenciais no Google Cloud (passos 1–6 acima). Assim que confirmar, eu desconecto o conector antigo, peço os dois segredos (`GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET`) e implemento tudo.
