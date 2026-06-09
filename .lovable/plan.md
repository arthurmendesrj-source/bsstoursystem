## Objetivo

Resolver o problema de múltiplas contas Gmail por usuário, padronizando: **1 usuário = 1 Gmail**, **visibilidade da thread = quem tem acesso ao lead**, **envio sempre pela conta dona da thread**.

---

## 1. Banco (migração única)

### 1.1 Garantir 1 conta por usuário e 1 dono por conta Gmail
- `user_gmail_tokens`: criar índice **único parcial** em `user_id` (1 token vivo por usuário) e manter `UNIQUE (email_address)` global (impedir mesma caixa em 2 usuários).
- Limpar duplicatas se existirem (consulta + delete dos mais antigos) antes de criar a constraint.

### 1.2 OAuth callback rejeita 2ª conta
- Em `src/routes/api/public/google/oauth/callback.ts`: antes do upsert, se já existe token para este `user_id` com **outro** `email_address`, retornar tela de erro pedindo desconectar a anterior. Se a conta Gmail já está em **outro** `user_id`, idem.

### 1.3 Visibilidade por lead (não por dono da caixa)
- Alterar política RLS de `emails`, `email_threads`, `email_message_links`, `email_attachments`:
  - SELECT permitido se `tenant_id = current_tenant_id()` **E** (`lead_id IS NULL` ou `can_access_lead(lead_id, auth.uid())` ou `customer_id` acessível ou `user_has_email_account(auth.uid(), owner_email)`).
- Hoje a regra é via `user_has_email_account`; vamos relaxar para incluir threads ligadas a leads/clientes que o usuário enxerga.

### 1.4 Telemetria
- Aproveitar `gmail_connection_audit` já existente para registrar tentativas rejeitadas (event = `connect_rejected_conflict`).

---

## 2. Backend / Server functions

### 2.1 Resolver “conta dona da thread” no envio
- `gmailSend` hoje usa `requireGmailAccount` que pega a conta mais antiga. Mudar para:
  - Receber `threadId` opcional → buscar `emails.owner_email` do thread → forçar `emailAddress = owner_email`.
  - Se o usuário logado **não é dono dessa caixa** (consulta `user_gmail_tokens.user_id`), bloquear com mensagem clara: "Apenas {dono} pode responder esta thread".
- Resposta/encaminhamento no `ThreadReader` passa `threadId` explicitamente.

### 2.2 Polling `/gmail-poll`
- Já itera por todas as contas conectadas — sem mudança necessária.

### 2.3 Remover seleção implícita
- `requireGmailAccount`: quando `emailAddress` não vem, usar a **única** conta do usuário; se houver >1 (não deveria mais), logar warning e usar a primária.

---

## 3. Frontend

### 3.1 `/settings` — `GmailConnectCard`
- Esconder botão "Conectar Gmail" se já existe 1 token; mostrar mensagem "Desconecte a conta atual para conectar outra".
- Mostrar com destaque a única conta vinculada.

### 3.2 `EmailPanel`
- Remover qualquer suposição de "primeira conta"; carregar a conta única do usuário (via novo serverFn `getMyGmailAccount`).
- Banner se o usuário não tem conta conectada (CTA → `/settings`).
- Listagem de threads agora pode incluir threads de **outras caixas** vinculadas a leads que o usuário acessa (vinda do banco, não do Gmail API). Renderizar badge "via {owner_email}" quando `owner_email ≠ minha conta`.

### 3.3 `ThreadReader` / resposta
- Botão "Responder" desabilitado quando `owner_email` da thread não é a conta do usuário logado; tooltip explica e sugere encaminhar via nota interna ou pedir ao dono.

---

## 4. Detalhes técnicos

```text
Migração SQL (resumo):
  -- limpeza
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) rn
    FROM public.user_gmail_tokens
  )
  DELETE FROM public.user_gmail_tokens WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

  -- 1 token por usuário
  CREATE UNIQUE INDEX user_gmail_tokens_user_unique ON public.user_gmail_tokens(user_id);

  -- 1 dono por caixa Gmail (já existe UNIQUE user_id+email_address; trocar por unique só em email_address)
  ALTER TABLE public.user_gmail_tokens
    DROP CONSTRAINT IF EXISTS user_gmail_tokens_user_id_email_address_key,
    ADD CONSTRAINT user_gmail_tokens_email_unique UNIQUE (email_address);

  -- RLS emails (recriar)
  DROP POLICY ... ; CREATE POLICY "emails read by lead access" ON public.emails
    FOR SELECT TO authenticated USING (
      tenant_id = public.current_tenant_id() AND (
        public.user_has_email_account(auth.uid(), owner_email)
        OR (lead_id IS NOT NULL AND public.can_access_lead(lead_id, auth.uid()))
        OR public.is_admin(auth.uid())
      )
    );
  -- repetir lógica análoga em email_threads / email_message_links / email_attachments
```

```text
Arquivos a editar:
  src/server/gmail-auth-middleware.ts          (resolver owner por threadId)
  src/server/gmail.functions.ts                (gmailSend exige threadId/account)
  src/routes/api/public/google/oauth/callback.ts (rejeitar 2ª conta + conflito)
  src/components/GmailConnectCard.tsx          (esconder botão se já conectado)
  src/components/email/EmailPanel.tsx          (carregar conta única, banner)
  src/components/email/ThreadReader.tsx        (bloquear envio se não-dono)
  src/lib/gmail-audit.functions.ts             (novo: getMyGmailAccount)
  supabase/migrations/<timestamp>_gmail_one_per_user.sql
```

---

## 5. O que NÃO entra agora (fora de escopo)

- Caixas compartilhadas (vendas@, suporte@) — postergado.
- Seletor de conta ativa na UI — não necessário no modelo 1:1.
- Migração de tokens órfãos antigos — só roda a limpeza inicial.

---

## 6. Verificação após implementar

1. Tentar conectar 2 contas Gmail no mesmo usuário → callback rejeita.
2. Conectar mesma conta em 2 usuários → callback rejeita.
3. Lead com thread cuja `owner_email` é de outro usuário → o assigned_to vê a thread (RLS).
4. Botão "Responder" desabilitado para quem não é dono da caixa.
5. `gmailSend` sem `threadId` em fluxo de novo e-mail → usa a conta única do usuário.
6. Cron `/gmail-poll` continua processando todas as contas (sem regressão).
