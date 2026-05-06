## Problema

Ao criar um lead em modo espelho (Admin/Diretor/Gerente agindo como subordinado), o código é gerado com as iniciais do gestor logado (ex.: `AB030526`) em vez das iniciais do subordinado dono da operação (ex.: `SK030526`).

## Causa

A trigger `set_lead_code` chama `generate_entity_code('lead', COALESCE(NEW.created_by, auth.uid()))`. Como o RLS de `leads` exige `auth.uid() = created_by`, o `created_by` sempre carrega o id do gestor — então as iniciais vêm do `profiles.full_name` do gestor.

## Solução

Usar o **destinatário/responsável** (`assigned_to`) como base para as iniciais e a sequência mensal, caindo de volta para `created_by` quando não houver `assigned_to`.

### 1. Migration — atualizar geração do código

- `set_lead_code`: usar `COALESCE(NEW.assigned_to, NEW.created_by, auth.uid())` como `_user_id`.
- `generate_entity_code('lead', ...)`: contar a sequência mensal por `assigned_to` (e não `created_by`) quando entidade = `lead`, para que o número (`01`, `02`, …) também siga a carteira do operador. Customers/suppliers ficam inalterados.

### 2. Tarefas (`tasks`)

A tabela `tasks` não possui coluna `code`, então não há código a corrigir. A criação já grava `assigned_to = effectiveId` no modo espelho — comportamento mantido. Nenhuma alteração necessária.

### 3. Sem mudanças de RLS

`created_by` continua sendo o gestor real (exigido pelo RLS atual), mas o código passa a refletir o subordinado. O banner de "Sessão espelhada" e a auditoria por `created_by` permanecem intactos.

## Critério de aceite

- Gestor "AB" cria lead em modo espelho do subordinado "SK" → código gerado começa com `SK` e usa a sequência mensal de leads do `SK`.
- Lead criado normalmente (sem espelho, sem `assigned_to`) → código com iniciais do criador (comportamento atual preservado).
- Lead criado com `assigned_to` apontando para outro operador (mesmo sem espelho) → código segue o `assigned_to`.