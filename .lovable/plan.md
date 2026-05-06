# Hierarquia + criação cruzada + IA no e-mail

## Hierarquia por papel
Definir ranking dos papéis (admin=4, diretor=3, gerente=2, supervisor=1, operador=0) e função SQL `get_subordinates(_user_id)` SECURITY DEFINER que retorna todos os `user_id` cujo papel tem ranking estritamente menor que o do usuário (admin/diretor → todos não-admin; gerente → supervisores+operadores; supervisor → operadores; operador → vazio).

Espelho em TS em `src/lib/hierarchy.ts` com helper `useSubordinates()` que carrega `user_roles + profiles` e filtra pelo ranking do usuário atual. Retorna lista `{ user_id, full_name, role }` para usar nos seletores.

## RLS — leads, activities, bookings
Atualizar policies de **INSERT** e **SELECT/UPDATE** para permitir que gerente/diretor criem itens com `assigned_to` apontando para subordinado:

- `leads_insert`: `created_by = auth.uid()` E (admin OU `has_module_permission(...,'create')`) E (`assigned_to = auth.uid()` OU `assigned_to IN (SELECT public.get_subordinates(auth.uid()))` OU `assigned_to IS NULL`).
- `leads_select` / `leads_update`: ampliar para incluir `assigned_to IN get_subordinates(auth.uid())` (hoje operador só vê os seus; gerente passa a ver os dos subordinados).
- Mesma lógica em `operations_activities` (adicionar coluna `assigned_to uuid` se ainda não existir — confirmei que já existe) e em `bookings` (created_by pode ser delegado).

## UI

### `/users` — Hierarquia visível e ação em massa
- Coluna **"Subordinado de"** mostrando nada (operador é folha) ou hierarquia agregada.
- Botão **"Distribuir…"** (visível para gerente+) abre dialog: escolher tipo (Leads novos / Tarefas pendentes / Atividades), selecionar N itens próprios não-atribuídos, escolher subordinado destino → `update assigned_to`.

### Modal "Novo lead" (`src/routes/leads.tsx`) e "Nova atividade" (`src/routes/activities.tsx`)
Adicionar campo **"Atribuir a"** (Select) — visível só se `useSubordinates().length > 0`. Default = eu mesmo. Persiste em `assigned_to` e mantém `created_by = auth.uid()`.

### E-mail → "Criar lead com IA" (`src/components/email/EmailPanel.tsx`)
- Já existe botão de criar lead manual no painel; adicionar **"✨ Criar lead com IA"** ao lado.
- Chama nova server function `createLeadFromEmail` (`src/server/email-ai.functions.ts`) que usa Lovable AI Gateway (`google/gemini-2.5-flash`, sem API key) para extrair `{ name, email, phone, destination, expected_travel_date, estimated_value, currency, notes }` do `subject + body_text + from_*`.
- Retorna sugestão → abre o modal **"Novo lead"** já preenchido (não grava direto), permitindo revisar e escolher "Atribuir a".

## Auditoria
Trigger existente `log_activity` em leads/activities já registra `created_by/assigned_to`; nada a mudar.

## Fora de escopo
- Não criar tabela de "times" (decisão: hierarquia por papel).
- Não mexer em `customers`/`quotes` (não foi pedido).
- Sem reatribuição automática — só manual via "Distribuir…".

## Detalhes técnicos
- Nova função SQL: `public.get_subordinates(_user_id uuid) RETURNS SETOF uuid` (SECURITY DEFINER, search_path=public). Lê `user_roles` do alvo, calcula ranking via CASE, retorna `user_id` de outros `user_roles` com ranking menor.
- Index: já existe em `user_roles(user_id)`; adicionar `(role)` se ausente.
- Edge-gating na UI: o seletor "Atribuir a" só lista o que `get_subordinates` retorna (defesa em profundidade — RLS já bloqueia).
- IA: prompt em PT-BR, `response_format: json_object`, schema simples; tratar 429/402 com toast.
