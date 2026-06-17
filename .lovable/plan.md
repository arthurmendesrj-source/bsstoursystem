## Problema encontrado

A página **Usuários → Log de auditoria** está mostrando ações de outras contas dentro do apartamento da `diretorturismos@gmail.com`.

Causa: a tabela `user_audit_log` (que registra ações administrativas sobre usuários — convite, exclusão, mudança de papel etc.) **não tem coluna `tenant_id`** e a função `admin-users` (ação `list_audit`) consulta com a chave de serviço (que ignora as regras de isolamento), retornando registros de **todos os tenants**.

Hoje existem 15 registros: 12 da conta do arthur (BSS Tour) e 3 do diretorturismos. Por isso ele vê histórico que não é dele.

> Importante: o `activity_log` (ações de negócio: leads, cotações, reservas) **já está isolado corretamente** por `tenant_id`. O problema é apenas no `user_audit_log`.

## Plano de correção

### 1. Banco de dados (migração)
- Adicionar coluna `tenant_id uuid` em `public.user_audit_log`.
- **Backfill** dos 15 registros existentes:
  - Resolver o `tenant_id` a partir do `actor_id` (via `tenant_members`).
  - Os 12 registros do arthur → tenant BSS Tour.
  - Os 3 registros do diretorturismos → tenant Diretor1.
- Criar índice em `(tenant_id, created_at desc)`.
- Atualizar/criar políticas RLS para que cada usuário só veja registros do próprio tenant (super_admin continua vendo tudo).

### 2. Edge function `admin-users`
- No helper `audit(...)` (linha ~69): resolver o tenant do `actor_id` e gravar `tenant_id` em cada novo registro.
- Na ação `list_audit` (linha ~106): filtrar `.eq('tenant_id', callerTenantId)`, exceto quando o chamador for super_admin (Desenvolvedor — você), que continua vendo tudo.

### 3. Verificação
- Logar com `diretorturismos@gmail.com` → o log deve aparecer **vazio** (ou só com ações feitas dentro da conta dele).
- Logar com arthur (BSS Tour) → vê só as 12 ações dele.
- Logar como super_admin → vê tudo (visão de desenvolvedor).

## O que NÃO muda
- Nenhum dado de negócio é apagado.
- Os 233 clientes e 638 fornecedores continuam exclusivos do BSS Tour.
- A conta `diretorturismos@gmail.com` continua zerada de dados operacionais.
- Novos cadastros pelo site continuam criando apartamento próprio e isolado.
