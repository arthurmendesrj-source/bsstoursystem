# Fase 5 — Envio real de Push Notifications pelo backend

Habilitar push notifications reais (Web Push com VAPID) para que usuários recebam alertas mesmo com o app fechado.

## O que será criado

### 1. Banco de dados
- Tabela `push_subscriptions`:
  - `id` uuid pk
  - `user_id` uuid (não nulo)
  - `endpoint` text (único)
  - `p256dh` text
  - `auth` text
  - `user_agent` text
  - `created_at`, `updated_at` timestamptz
- RLS:
  - usuário insere/lê/atualiza/deleta apenas as próprias subscriptions
  - admin lê todas

### 2. Secrets (VAPID)
- `VAPID_PUBLIC_KEY` (também exposto como `VITE_VAPID_PUBLIC_KEY` para o cliente)
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (ex: `mailto:admin@dominio.com`)

Vou gerar o par de chaves e pedir que o usuário cole nas configurações de secrets (e a public key como build/runtime var).

### 3. Cliente (`src/lib/pushNotifications.ts`)
- Atualizar `subscribeToPush()` para:
  - usar `VITE_VAPID_PUBLIC_KEY` como `applicationServerKey`
  - chamar server function `savePushSubscription` com `endpoint/p256dh/auth/userAgent`
- `unsubscribeFromPush()` chama `deletePushSubscription` com o endpoint

### 4. Server functions (`src/server/push.functions.ts` + `push.server.ts`)
- `savePushSubscription` (auth) — upsert por `endpoint`
- `deletePushSubscription` (auth) — remove por `endpoint`
- `sendPushToUser({ userId, title, body, url?, leadId? })` (auth, admin-only ou interno):
  - busca todas as subscriptions do usuário
  - para cada uma, monta payload JWT VAPID (via `crypto.subtle`, sem dependência Node-only) e faz `fetch` POST ao endpoint
  - grava em `notification_logs` (success/error com `error_detail`) usando o admin client
  - remove subscriptions com 404/410 (gone)
- `sendTestPush()` (auth) — envia push real para o próprio usuário (substitui o teste local atual)

### 5. UI
- Em `/alerts`, o botão "Enviar teste" passa a chamar `sendTestPush` (push real round-trip), mantendo fallback local se não houver subscription.
- Toast confirma sucesso/erro com base no retorno.

## Detalhes técnicos

- Web Push assinatura VAPID feita manualmente com `crypto.subtle` (ECDSA P-256) — evita dependências Node-only no Worker.
- Payload é criptografado com aesgcm (RFC 8291). Para simplificar e manter compatibilidade Worker, o payload será enviado **sem criptografia de conteúdo** (apenas headers VAPID) e o `sw.js` exibirá um título/corpo padrão quando não houver `event.data` — alternativamente, incluiremos uma lib pura JS leve (`@negrel/webpush` ou implementação inline) compatível com Workers para criptografar o payload. Vou usar implementação inline mínima para garantir compatibilidade.
- `notification_logs` continua sendo a fonte única de histórico (Fase 4).

## Arquivos afetados

- **Migração:** nova tabela `push_subscriptions` + RLS
- **Novo:** `src/server/push.server.ts`, `src/server/push.functions.ts`
- **Editado:** `src/lib/pushNotifications.ts`, `public/sw.js` (tratar payload criptografado), `src/routes/alerts.tsx` (teste real)
- **Secrets:** pedir VAPID keys após gerá-las

## Próximo passo

Ao aprovar, gero as chaves VAPID e te peço para colar nos secrets antes de seguir com migração e código.
