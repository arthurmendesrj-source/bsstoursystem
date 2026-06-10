# Diagnóstico do Google OAuth

Página nova em `/settings/google-diagnostico` (rota autenticada) para identificar exatamente onde o fluxo `/api/public/google/oauth/start` → Google → `/api/public/google/oauth/callback` quebra.

## O que a página mostra

Lista de checks executados em ordem, cada um com status (ok / erro / aviso) e detalhes expansíveis (JSON cru, headers relevantes, mensagem completa):

1. **Sessão Supabase** — usuário logado, `user.id`, e-mail, validade do access_token.
2. **Variáveis de ambiente do servidor** — presença (sem valor) de `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_STATE_SECRET`. Feito por nova serverFn `diagnoseGoogleOauth` que só retorna booleans + tamanho dos secrets.
3. **Redirect URI esperado** — calcula `${window.location.origin}/api/public/google/oauth/callback` e mostra para o usuário copiar e comparar com o Google Cloud Console.
4. **Probe do endpoint `/start`** — `fetch('/api/public/google/oauth/start', { redirect: 'manual', headers: Authorization })` e mostra status, `location` header, ou corpo do erro 4xx/5xx.
5. **Probe do `state` HMAC** — serverFn gera um state de teste e devolve para validar que `GOOGLE_OAUTH_STATE_SECRET` está configurado.
6. **Tokens Gmail já salvos** — consulta `user_gmail_tokens` do usuário atual: se há linha, mostra `email_address`, `expires_at`, `scope`. Indica se "já está conectado".
7. **Últimos eventos de auditoria** — últimas 10 linhas de `gmail_connection_audit` do usuário (event, reason, metadata, created_at).
8. **Botão "Iniciar OAuth em nova aba com log"** — abre `/api/public/google/oauth/start` em popup e escuta `postMessage` do callback (`type: 'gmail-oauth'`) para registrar `ok`/`message` na própria página.

## Arquivos

- `src/lib/google-oauth-diagnose.functions.ts` — serverFn `diagnoseGoogleOauth` (env presence, gera state de teste, lê tokens + audit do `userId` do middleware `requireSupabaseAuth`).
- `src/routes/settings_.google-diagnostico.tsx` — UI da página, dentro de `AuthGate`+`AppShell`, executa todos os checks ao montar e reexecuta no botão "Rodar novamente".
- Link de acesso: adicionar item "Diagnóstico Google" em `src/routes/settings.tsx`.

## Notas técnicas

- Nenhum secret é retornado em texto, só `present: boolean` + comprimento.
- O probe do `/start` usa `redirect: 'manual'` para capturar o 302 sem seguir até o Google.
- A página é só para diretor/super_admin (mesma checagem usada em outras telas de settings).
- Sem alteração no fluxo OAuth real — somente leitura/diagnóstico.
