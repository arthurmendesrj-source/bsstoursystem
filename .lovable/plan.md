## Assistente IA de Turismo

Criar um assistente de IA especializado em turismo, design e marketing digital, integrado ao CRM/ERP, com leitura de dados, ações com aprovação manual, busca web, geração de imagens, streaming e histórico persistente.

### 1. Acesso (3 pontos de entrada)

- **Item próprio na sidebar**: novo item "Assistente IA" (ícone Sparkles) abaixo de Email, com rota `/assistant`.
- **Subitem em CRM**: também listado dentro do grupo CRM colapsável (atalho conveniente).
- **Botão flutuante global**: ícone fixo no canto inferior direito (FAB) presente em todas as páginas autenticadas, abre um drawer/sheet lateral com o mesmo chat. Estado da conversa compartilhado com a página `/assistant`.

### 2. Banco de dados (nova migração)

Tabelas para histórico persistente por usuário:

- `ai_conversations` — id, user_id, title (auto-gerado a partir da 1ª mensagem), created_at, updated_at, last_message_at.
- `ai_messages` — id, conversation_id, role (`user` | `assistant` | `system` | `tool`), content (text), tool_calls (jsonb), tool_results (jsonb), created_at.
- `ai_pending_actions` — id, conversation_id, message_id, user_id, action_type (ex: `create_lead`, `update_lead_status`, `create_activity`, `create_quote_item`), payload (jsonb), status (`pending` | `approved` | `rejected` | `executed` | `failed`), result (jsonb), created_at, decided_at.
- `ai_generated_images` — id, conversation_id, user_id, prompt, storage_path, created_at.
- Bucket de storage `ai-images` (público para leitura interna autenticada).

RLS: cada usuário vê/edita apenas suas próprias conversas, mensagens, ações e imagens. Admin vê tudo.

### 3. Backend (server functions + 1 endpoint streaming)

Em `src/server/assistant.functions.ts`:
- `listConversations`, `getConversation(id)`, `createConversation`, `renameConversation`, `deleteConversation`.
- `listPendingActions(conversationId)`, `approveAction(id)` — executa o payload no banco respeitando RLS do usuário, `rejectAction(id)`.
- `generateImage({ prompt, conversationId })` — chama Lovable AI (`google/gemini-2.5-flash-image`), salva no bucket, registra em `ai_generated_images`.

Endpoint de streaming em `src/routes/api/assistant/chat.ts` (rota autenticada via bearer):
- Recebe `{ conversationId, message }`.
- Carrega histórico completo da conversa (todas as mensagens anteriores).
- Monta payload para Lovable AI Gateway com:
  - System prompt completo do usuário (armazenado em `src/server/assistant.prompt.ts`).
  - Modelo padrão: `google/gemini-2.5-flash`.
  - `stream: true`.
  - `tools` (function calling): conjunto de ferramentas de leitura e ações (lista abaixo).
- Retorna SSE direto para o cliente. Persiste a mensagem do usuário antes de chamar e a resposta do assistente após o stream terminar.
- Tratamento dos erros 429 (rate limit) e 402 (créditos) com mensagens claras.

### 4. Tools (function calling) disponíveis para a IA

**Leitura (executadas direto, respeitando RLS do usuário logado):**
- `search_leads({ query?, status?, assigned_to_me?, limit })`
- `get_lead({ id })` — inclui interações recentes.
- `search_customers({ query?, limit })` / `get_customer({ id })`
- `search_suppliers({ query?, city?, service?, limit })`
- `search_packages({ destination?, active?, limit })` / `get_package({ id })`
- `list_bookings({ status?, customer_id?, limit })` / `get_booking({ id })`
- `list_my_activities({ from?, to?, status? })`
- `get_dashboard_metrics({ period })` — leads novos, conversões, receita.
- `web_search({ query })` — usa Lovable AI gateway com `google/gemini-2.5-flash` + `google_search` grounding (sem precisar de Perplexity).

**Ações (NUNCA executam direto — sempre criam registro em `ai_pending_actions`):**
- `propose_create_lead({ name, email?, phone?, destination?, estimated_value?, notes? })`
- `propose_update_lead({ id, fields })`
- `propose_create_interaction({ lead_id|customer_id, type, subject, content })`
- `propose_create_activity({ booking_id?, kind, description, activity_date?, notes? })`
- `propose_create_quote_item({ quote_id, description, unit_price, quantity, ... })`
- `propose_send_message({ lead_id, channel, body })` — apenas registra; envio real fica na fila.
- `generate_image({ prompt, format })` — gera e anexa à conversa.

Quando a IA chama uma ferramenta `propose_*`, o backend insere a ação em `ai_pending_actions` com status `pending` e devolve para a IA o id + resumo. A IA então responde mostrando ao usuário um resumo do que pretende fazer e pede aprovação.

### 5. Frontend

**Página `/assistant`** (`src/routes/assistant.tsx`):
- Layout split: sidebar de conversas (lista, nova, renomear, deletar) + área de chat.
- Chat com:
  - Renderização markdown (`react-markdown` + `remark-gfm`) para respostas formatadas.
  - Streaming token-a-token (parser SSE robusto, conforme instruções).
  - Bolhas distintas para usuário, assistente, e cards especiais para `tool_call` e `pending_action`.
  - Card de **Ação Pendente**: mostra tipo + payload formatado em forma legível, com botões **Aprovar** e **Rejeitar**. Após decisão, atualiza inline mostrando o resultado.
  - Imagens geradas exibidas inline com botão de download.
  - Input com textarea (auto-grow), botão enviar, indicador de "pensando…", botão "parar geração" (AbortController).
  - Sugestões iniciais de prompts em conversa nova ("Crie um pacote para Bariloche", "Liste meus leads quentes", "Gere um post para Instagram sobre Fernando de Noronha").

**Botão flutuante global** (`src/components/AssistantFab.tsx` montado em `AppShell`):
- Ícone Sparkles fixo `bottom-6 right-6`.
- Clique abre `<Sheet>` lateral (largura ~480px) com o mesmo componente de chat reutilizável (`<AssistantChat conversationId={...} />`).
- Botão "Abrir em tela cheia" → navega para `/assistant?c={id}`.
- Esconde o FAB quando já estiver em `/assistant`.

**Sidebar (`AppShell.tsx`)**:
- Adicionar `{ to: "/assistant", label: "Assistente IA", icon: Sparkles }` em `crmChildren` (subitem do CRM).
- Adicionar também no array `items` principal logo abaixo de Email para acesso rápido fora do grupo CRM.

### 6. System prompt

Guardado em `src/server/assistant.prompt.ts` exatamente como o texto fornecido pelo usuário, com adição de instruções operacionais:
- "Para ler dados, use as ferramentas de busca disponíveis antes de responder."
- "Para qualquer ação que altere dados, SEMPRE use as ferramentas `propose_*` — nunca afirme que executou algo sem aprovação do operador."
- "Sempre cite IDs e códigos quando referenciar registros."
- "Responda em português do Brasil por padrão."

### 7. Configuração

- Verificar/garantir `LOVABLE_API_KEY` (Lovable AI já habilitado no projeto).
- Sem novas chaves do usuário (busca web via Gemini grounding, imagens via Lovable AI).
- Modelo trocável via dropdown no header do chat (Flash padrão / Pro / GPT-5) — persistido por conversa.

### 8. Detalhes técnicos importantes

- **Streaming**: parser SSE linha-a-linha com buffer (conforme guia AI gateway), atualizando a última mensagem assistant in-place.
- **Tool-calling em stream**: acumular `tool_calls` deltas; ao receber `finish_reason: "tool_calls"`, executar as tools no servidor, append do resultado como mensagem `role: "tool"`, e fazer nova chamada ao gateway na mesma request HTTP (loop de até 5 rounds para evitar loops infinitos).
- **Persistência**: salvar `user message` antes do stream; salvar `assistant message` (incluindo tool_calls/results) ao final; em caso de erro de stream, salvar parcial com flag.
- **Title automático**: após primeira resposta, gerar título curto (chamada extra rápida ao Flash-Lite).
- **Segurança**: ações `propose_*` validam payload com Zod antes de inserir em `ai_pending_actions`. `approveAction` valida novamente, executa via cliente Supabase autenticado do usuário (RLS aplica), registra em `activity_log`.

### Critérios de aceitação

1. Item "Assistente IA" aparece no menu lateral (subitem CRM + atalho), e botão flutuante visível em todas as páginas exceto `/assistant`.
2. Conversas persistem entre sessões; cada usuário vê apenas as suas.
3. Streaming de tokens funciona em tempo real, com markdown renderizado.
4. IA consegue listar leads/clientes/pacotes reais via tools.
5. Quando a IA propõe uma ação (ex: criar lead), aparece um card com botões Aprovar/Rejeitar; nada é gravado no banco até aprovação.
6. Geração de imagem funciona e exibe inline com download.
7. Busca web retorna resultados atualizados com citações.
8. Erros 429/402 do gateway exibem toast amigável.
