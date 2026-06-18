## Restaurar criação completa de Lead / Atividade no painel "Analisar com IA"

Hoje o botão "Analisar com IA" só mostra resumo e um botão único "Copiar e criar Lead" que copia dados e redireciona ao `/workspace`. Vou reativar o fluxo completo: criar Lead OU Atividade direto do painel, com seleção de responsável respeitando a hierarquia.

### Mudanças

**1. `src/components/email/EmailMailbox.tsx` — painel de resultado da IA**

Substituir o botão único atual por dois blocos de ação, exibidos conforme a sugestão da IA (e ambos sempre disponíveis manualmente):

- **Criar Lead** — formulário compacto inline:
  - Nome, e-mail, telefone, destino, datas, pax, orçamento, observações (pré-preenchidos da extração).
  - Select **"Responsável"**: usuário atual + lista de subordinados (via `useSubordinates()`); operador comum só vê a si mesmo.
  - Botão "Criar Lead" → `supabase.from("leads").insert({...})` com `created_by = user.id`, `assigned_to = selecionado`. Toast + link "Abrir lead" que navega para `/leads/$id`.

- **Criar Atividade** — formulário compacto inline:
  - Título (default = `suggestion.title`), descrição (= resumo + extras), data/hora, prioridade (alta/média/baixa derivada de `priority`), categoria (default `suporte`).
  - Select **"Responsável"** igual ao acima.
  - Opcional: associar a um Lead existente (busca rápida por nome — reusa pattern de `activities.tsx`).
  - Botão "Criar Atividade" → `supabase.from("tasks").insert({...})`. Se `assigned_to` ≠ usuário atual, dispara `notifyTaskAssigned` (mesmo pattern de `activities.tsx`). Toast de confirmação.

Manter os badges de prioridade/categoria e o botão "Reanalisar" (`force: true`) já existentes.

**2. Hook de hierarquia**

Reutilizar `useSubordinates()` de `src/lib/hierarchy.ts` (já existe e funciona). O select de responsável mostra: o próprio usuário no topo + cada subordinado com `(role)` ao lado do nome. Admin/Diretor vê todos.

**3. Sem mudanças de backend / schema**

- Sem migrations.
- `email-ai.functions.ts`, `email_ai_cache`, `analyzeEmailFn`, `triageInboxFn`: ficam como estão (já retornam `suggestion.kind` + `fields`).
- Inserts vão pela RLS normal de `leads` / `tasks` (mesmo caminho de `/leads` e `/activities`).

### Fora de escopo

- Não recriar tabela `emails` nem auto-vincular mensagens a lead/task no banco (esse vínculo foi removido no rebuild do módulo de e-mail e não foi pedido agora).
- Não mexer em `/workspace`, `/leads`, `/activities`.
- Sem rascunho automático de resposta nem execução automática ao abrir/sincronizar (já decidimos: só sob demanda).
