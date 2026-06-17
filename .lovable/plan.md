# Reativar IA no módulo Email

Reativar a IA do módulo `/email` com três funções, sempre executadas **sob demanda** (botão), usando Lovable AI (`google/gemini-3-flash-preview`) — mesmo padrão das outras funções do projeto (sem custo de chave para o usuário).

## O que será entregue

1. **Resumo automático do email aberto**
   - Botão "Analisar com IA" no visualizador de email (`EmailMailbox.tsx`).
   - A IA recebe assunto + corpo do email e retorna: resumo curto (2–4 linhas), idioma detectado, sentimento e prioridade sugerida (alta/normal/baixa).
   - Resumo é cacheado por `gmail_id` para não regerar a cada clique.

2. **Sugestão de Lead / Atividade**
   - Logo abaixo do resumo, a IA sugere uma ação: **Criar Lead** ou **Criar Atividade** (ou "nenhuma ação").
   - Preenche campos extraídos do email: nome do contato, telefone, email, destino, datas, nº pax, orçamento, observações.
   - Dois botões: "Criar Lead com estes dados" (abre `/workspace` pré-preenchido) e "Criar Atividade" (cria task vinculada ao lead correspondente, se o email já bater com um lead existente por endereço).
   - **Nada é gravado sem o operador confirmar** (mantém a regra histórica).

3. **Triagem em lote da caixa**
   - Botão "Triagem IA" no topo da lista de emails — processa os N emails visíveis (ex.: últimos 20 não lidos).
   - Para cada um: gera resumo + categoria (lead novo / cliente existente / fornecedor / suporte / spam) + prioridade.
   - Resultados aparecem como badges coloridas na lista; clicar abre o email com o resumo já pronto.
   - Barra de progresso e botão de cancelar; processa serialmente para não estourar rate-limit (429).

## Detalhes técnicos

- **Backend**: novo `src/lib/email-ai.functions.ts` com `createServerFn` protegido por `requireSupabaseAuth`:
  - `analyzeEmail({ gmailId, targetUserId })` — busca o email via `gmail-api.server`, chama Lovable AI Gateway, retorna `{ summary, language, sentiment, priority, suggestion: { kind: 'lead'|'activity'|'none', fields } }`.
  - `triageInbox({ targetUserId, gmailIds })` — itera serialmente chamando `analyzeEmail`, retorna array de resultados.
- **Cache**: nova tabela `email_ai_cache(message_id text PK, user_id uuid, payload jsonb, created_at)` com RLS por `user_id` + GRANT padrão (authenticated/service_role). Evita custo repetido.
- **Modelo**: `google/gemini-3-flash-preview` com `Output.object` (Zod) para garantir JSON estruturado.
- **Tratamento de erro**: 429 → toast "limite atingido, tente novamente"; 402 → toast "créditos esgotados, recarregue em Settings → Workspace → Usage".
- **Frontend**: alterações apenas em `src/components/email/EmailMailbox.tsx` (botões, painel lateral de IA, badges na lista, modal de progresso para triagem em lote).

## Fora de escopo

- Sem rascunho automático de resposta.
- Sem execução automática ao receber/abrir email — tudo sob clique.
- Sem alteração no `/workspace`, leads ou tasks além do pré-preenchimento via query params.

## Teste

Após implementar: abrir `/email`, abrir um email real → clicar "Analisar com IA" → verificar resumo + sugestão; clicar "Triagem IA" com 5 emails → verificar badges; recarregar e reabrir o mesmo email → resumo vem do cache (sem nova chamada).
