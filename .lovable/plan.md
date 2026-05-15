# Integração WhatsApp — Meta Cloud API (multi-número por vendedor)

## Visão geral

Cada vendedor conecta seu próprio número WhatsApp Business à plataforma. As credenciais (Phone Number ID, WABA ID, access token de longa duração) ficam armazenadas por usuário. O CRM envia e recebe mensagens via API oficial da Meta, com inbox bidirecional integrado ao módulo de leads/clientes.

> **Importante:** A Meta Cloud API exige que cada vendedor:
> 1. Tenha (ou crie) um **WhatsApp Business Account (WABA)** dentro do Meta Business Manager
> 2. Cadastre o número de telefone no WABA (não pode estar ativo no app WhatsApp comum)
> 3. Crie um **App** no Meta for Developers e gere um **System User Token** (longa duração)
> 4. Aprove **templates HSM** para mensagens iniciadas pela empresa (fora da janela de 24h)
>
> Esse onboarding é manual — vamos guiar o vendedor com instruções dentro da tela de configuração.

## Arquitetura

```text
┌─────────────────┐    envio     ┌──────────────────────┐
│  CRM (lead/inbox)├─────────────►│  serverFn /whatsapp  │
└─────────────────┘              │  send-message        │
        ▲                         └──────────┬───────────┘
        │ realtime                            │ POST graph.facebook.com
        │                                     ▼
┌─────────────────┐ webhook  ┌─────────────────────────┐
│ tabela messages ◄──────────┤ /api/public/whatsapp/   │
│ tabela accounts │          │ webhook (Meta callback) │
└─────────────────┘          └─────────────────────────┘
```

## Banco de dados (migrações)

**`whatsapp_accounts`** — uma linha por número conectado
- user_id, phone_number_id, waba_id, display_phone, access_token (criptografado), webhook_verify_token, status, connected_at
- RLS: cada vendedor vê só os seus; admin vê todos

**`whatsapp_conversations`** — agrupamento por contato
- account_id, contact_phone, contact_name, lead_id (nullable), customer_id (nullable), last_message_at, unread_count, window_expires_at (janela 24h)

**`whatsapp_messages`** — todas as mensagens enviadas/recebidas
- conversation_id, direction (in/out), wa_message_id, type (text/image/document/audio/template), body, media_url, media_storage_path, status (sent/delivered/read/failed), error_code, sent_at
- Realtime habilitado para inbox ao vivo

**`whatsapp_templates`** — cache de templates aprovados pela Meta por WABA
- account_id, name, language, category, status, components (jsonb)

**Storage bucket `whatsapp-media`** (privado) — anexos enviados/recebidos

## Backend (TanStack server functions + rota pública)

1. **`/api/public/whatsapp/webhook`** (rota pública, sem auth):
   - GET → verificação de webhook da Meta (hub.challenge)
   - POST → recebe mensagens, status updates, valida assinatura `X-Hub-Signature-256` com app secret
   - Identifica conta pelo `phone_number_id`, faz upsert de conversation + message, tenta vincular a lead/cliente por telefone, baixa mídia para o storage
   - Dispara realtime para o frontend

2. **`whatsapp.functions.ts`** (server functions autenticados):
   - `sendTextMessage({ accountId, to, body })`
   - `sendMediaMessage({ accountId, to, mediaType, fileOrUrl, caption })`
   - `sendTemplate({ accountId, to, templateName, language, variables })` — usado quando janela 24h expirou
   - `listTemplates({ accountId })` — sincroniza com `/message_templates` da Meta
   - `markAsRead({ messageId })`

3. **`whatsapp-onboarding.functions.ts`**:
   - `connectAccount({ phoneNumberId, wabaId, accessToken, appSecret })` — valida o token chamando `/{phone_number_id}` e salva
   - `disconnectAccount({ accountId })`

## Frontend

1. **Tela `/settings/whatsapp`** — tutorial passo-a-passo + formulário para colar Phone Number ID, WABA ID, token e App Secret. Mostra a URL de webhook + verify token para o vendedor copiar no painel da Meta.

2. **Módulo `/whatsapp`** (inbox geral):
   - Sidebar de conversas (filtra pela conta selecionada do vendedor logado)
   - Painel de mensagens com upload de anexo, seletor de template (se janela > 24h)
   - Realtime via Supabase channel
   - Reaproveita padrão multi-account do `EmailPanel`

3. **`LeadWhatsAppMini`** dentro da página do lead — mostra histórico de WhatsApp daquele contato (similar ao `LeadEmailMini`).

4. **Integração com notificações automáticas** — adicionar `whatsapp` como canal nos hooks existentes (`lead-events`, `task-due`, `sla-escalations`) usando o template HSM aprovado.

## Secrets necessários

- `META_APP_SECRET` — para validar assinatura do webhook (um por app Meta; se cada vendedor tiver app próprio, guardar por conta)
- `WHATSAPP_TOKEN_ENCRYPTION_KEY` — chave para criptografar tokens dos vendedores no DB

Vou pedir esses secrets no momento da implementação.

## Custos e limites

- Meta cobra por **conversa de 24h** (não por mensagem): grátis até 1.000/mês por WABA, depois ~US$ 0.005–0.08 dependendo do país e categoria (utility/marketing/auth/service)
- Templates HSM precisam de aprovação (~minutos a horas)
- Mídia: até 16MB para imagens/áudio, 100MB para documentos

## Detalhes técnicos

- **Janela de 24h**: após 24h sem resposta do cliente, só pode enviar template aprovado. Calculamos `window_expires_at = last_inbound_at + 24h` e bloqueamos UI de texto livre quando expirado.
- **Webhook URL**: `https://bsstoursystem.lovable.app/api/public/whatsapp/webhook` (URL pública estável)
- **Vinculação lead/cliente**: ao receber mensagem, normaliza telefone (E.164) e procura em `leads.phone` / `customers.phone` para auto-vincular conversation
- **Token longo prazo**: System User Token não expira; armazenamos criptografado com AES-GCM usando `WHATSAPP_TOKEN_ENCRYPTION_KEY`
- **Rate limits Meta**: 80 msg/s por número por padrão, escala automaticamente conforme qualidade

## Etapas de implementação

1. Migração DB (4 tabelas + bucket + RLS + realtime)
2. Pedir secrets `META_APP_SECRET` e `WHATSAPP_TOKEN_ENCRYPTION_KEY`
3. Webhook público + validação de assinatura
4. Server functions de envio (texto, mídia, template)
5. Tela de onboarding em `/settings/whatsapp`
6. Inbox `/whatsapp` com realtime
7. Mini-painel no lead + integração com notificações automáticas
