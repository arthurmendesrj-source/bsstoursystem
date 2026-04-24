

# Campo de briefing para a IA operadora

Adicionar um campo de texto livre onde o usuário descreve o trabalho que a IA deve desenvolver (público-alvo, estilo da viagem, ocasião, restrições, pedidos especiais do cliente). Esse briefing entra no prompt da edge function e orienta a geração do documento.

## Mudanças

### 1. `src/components/proposal/GenerateDocDialog.tsx`
- Adicionar `<Textarea>` rotulado **"Briefing para a IA"** com placeholder explicativo (ex.: *"Casal em lua de mel, estilo luxo, evitar passeios muito longos, interesse em gastronomia local..."*).
- Estado local `briefing: string` (default `""`), enviado como `briefing` no body de `supabase.functions.invoke("generate-proposal-doc", …)`.
- Campo opcional — vazio = comportamento atual.
- Limite de 2000 caracteres com contador discreto.

### 2. `supabase/functions/generate-proposal-doc/index.ts`
- Aceitar `briefing?: string` no payload.
- Quando presente, anexar ao **user message** enviado ao Gemini, num bloco rotulado:
  > **Briefing do operador (siga rigorosamente):**
  > {briefing}
- Reforçar no system prompt que o briefing tem **prioridade sobre suposições genéricas** (estilo, ritmo, foco, restrições alimentares, mobilidade, etc.).
- Sanitização: `String(briefing).slice(0, 2000).trim()` antes de injetar.

### 3. `src/lib/i18n.tsx`
- Novas chaves PT/EN/ES: `aiBriefing`, `aiBriefingPlaceholder`, `aiBriefingHelp`.

## Fora de escopo

- Persistir o briefing por quote (hoje fica só no momento da geração). Pode virar coluna em `quote_documents` num próximo passo se o usuário pedir.
- Templates de briefing pré-prontos.
- Anexar arquivos/imagens como referência para a IA.

## Arquivos afetados

| Ação | Arquivo |
|---|---|
| Editar | `src/components/proposal/GenerateDocDialog.tsx` |
| Editar | `supabase/functions/generate-proposal-doc/index.ts` |
| Editar | `src/lib/i18n.tsx` |

