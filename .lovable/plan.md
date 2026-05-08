# Plano: Google Workspace Add-on para Gmail integrado ao CRM

## Objetivo
Construir um add-on do Gmail (Apps Script + CardService) que mostra um painel lateral ao abrir um e-mail, consulta o CRM por endpoints HTTPS e permite criar/associar contato, lead, negócio, atividade e nota — **sem espelhar a caixa de e-mail no banco**. Em paralelo, expor no backend (TanStack Start) os endpoints `/api/gmail/*` que o add-on vai consumir.

## Arquitetura

```text
Gmail (usuário) ──onGmailMessageOpen──> Apps Script Add-on (CardService)
                                              │
                                              │ UrlFetchApp + Bearer token
                                              ▼
                                   {CRM_BASE_URL}/api/gmail/*
                                   (rotas públicas TanStack Start)
                                              │
                                              ▼
                                   Lovable Cloud (DB: leads, customers,
                                   email_message_links, activities)
```

O token do CRM fica em `PropertiesService.getUserProperties()` (configurado pelo usuário no primeiro uso, via card de settings) — nunca hardcoded.

## Entregáveis

### 1. Apps Script — `Code.gs`
Funções:
- `onHomepage(e)` — card inicial com status da conexão e botão "Configurar token"
- `onGmailMessageOpen(e)` — trigger contextual; lê `messageMetadata.messageId/threadId/accessToken`, chama `GmailApp.getMessageById`, monta payload (from/to/cc/subject/date/snippet) e chama `crmLookup`
- `buildMessageCard(meta, lookup)` — renderiza:
  - seção com remetente, destinatários, assunto, data, snippet
  - se `lookup.contact` existe → badge "Encontrado", botões "Abrir no CRM", "Associar ao Negócio", "Registrar atividade", "Adicionar nota"
  - se não existe → botão primário "Criar contato no CRM" + "Criar lead" + "Criar negócio"
- `crmFetch(path, method, payload)` — wrapper sobre `UrlFetchApp.fetch` com `muteHttpExceptions`, timeout, header `Authorization: Bearer <token>`, tratamento de 401/5xx
- Handlers (action callbacks): `handleCreateContact`, `handleCreateLead`, `handleCreateDeal`, `handleLogActivity`, `handleAddNote`, `handleSaveToken`, `handleAssociateDeal`
- `buildErrorCard(msg)` / `buildLoadingNotification()` / `notify(text)` para UX
- `getStoredToken()` / `getStoredBaseUrl()` via `PropertiesService.getUserProperties()`

Privacidade: enviado ao CRM apenas metadados + snippet (configurável via toggle no settings card). Corpo completo nunca sai do Gmail.

### 2. Apps Script — `appsscript.json` (manifest)
- `runtimeVersion: V8`, `timeZone: "America/Sao_Paulo"`
- `oauthScopes` mínimos:
  - `https://www.googleapis.com/auth/gmail.addons.execute`
  - `https://www.googleapis.com/auth/gmail.addons.current.message.metadata`
  - `https://www.googleapis.com/auth/gmail.addons.current.message.readonly` (para snippet)
  - `https://www.googleapis.com/auth/script.external_request` (UrlFetchApp)
  - `https://www.googleapis.com/auth/script.storage` (PropertiesService)
- `addOns.common` (name, logoUrl, openLinkUrlPrefixes, homepageTrigger)
- `addOns.gmail.contextualTriggers[{ unconditional: {}, onTriggerFunction: "onGmailMessageOpen" }]`
- `urlFetchWhitelist` com `{{CRM_BASE_URL}}`

### 3. Backend (TanStack Start) — novas rotas em `src/routes/api/gmail/`
Todas com auth via Bearer token (validação contra um secret `CRM_GMAIL_ADDON_TOKEN` armazenado em Lovable Cloud secrets):

- `lookup.ts` — `GET ?email=...` → `{ contact, lead, deals[] }` consultando `customers` e `leads`
- `contact.ts` — `POST { email, name, gmail_message_id, gmail_thread_id }` → cria em `customers`
- `lead.ts` — `POST { email, name, subject, snippet, gmail_message_id, gmail_thread_id }` → cria em `leads`
- `deal.ts` — `POST { contact_id, title, value? }` → cria/associa negócio
- `activity.ts` — `POST { contact_id?, lead_id?, deal_id?, gmail_message_id, gmail_thread_id, subject, snippet, occurred_at }` → grava em `activities` (ou tabela equivalente) + opcionalmente em `email_message_links` para o vínculo e-mail↔registro CRM (sem armazenar o corpo)

Migração: tabela `email_message_links (id, gmail_message_id, gmail_thread_id, lead_id?, customer_id?, deal_id?, snippet, subject, from_email, created_at)` com RLS apropriado.

### 4. Documentação (entregue no chat após approve)
- Passo a passo: criar projeto Apps Script, colar `Code.gs` e `appsscript.json`, deploy de teste (Deploy → Test deployments → Install), instalar no Gmail
- Como gerar o `CRM_API_TOKEN` no app e colar no card de settings do add-on
- Exemplos de request/response JSON para cada endpoint
- Como publicar no Workspace Marketplace (opcional, futuro)

## Fora de escopo
- Espelhamento da caixa de entrada (explicitamente rejeitado pelo usuário)
- Sincronização de labels Gmail
- OAuth próprio do CRM (usaremos Bearer token simples — suficiente e mais leve; podemos migrar para OAuth depois se necessário)

## Perguntas (se quiser ajustar antes de implementar)
1. Confirma Bearer token estático (1 token por instalação, configurado pelo usuário) em vez de OAuth do CRM? **Recomendado para v1.**
2. Snippet enviado ao CRM: limite de 500 caracteres OK?
3. Quer também um card "lista de mensagens" (selectionTrigger) ou só ao abrir mensagem?
