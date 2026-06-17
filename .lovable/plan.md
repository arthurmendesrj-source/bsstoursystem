## Diagnóstico

Os dados no banco já estão corretos:
- 12 registros pertencem ao tenant **BSS Tour** (arthur)
- 3 registros pertencem ao tenant **Diretor1** (diretorturismos)

A função `admin-users` foi atualizada para filtrar por tenant, mas o painel ainda mostra "15" no contador. Duas causas prováveis:

1. **A nova versão da edge function ainda não respondeu** no navegador (ela faz deploy automático mas pode levar alguns segundos; a tela pode estar com o resultado da chamada antiga em cache).
2. **O navegador serviu o JSON antigo** (não há Cache-Control explícito).

## Plano

### Passo 1 — Confirmar deploy e forçar atualização
- Clicar no ícone de **atualizar (↻)** ao lado do contador "Log de auditoria" e/ou dar um **Ctrl+Shift+R** na página `/users`.
- Resultado esperado para `diretorturismos@gmail.com`: contador cai para **3** (somente as ações executadas pela própria conta dele).

### Passo 2 — Se ainda mostrar 15, reforçar do lado do servidor
Caso o filtro do edge function não esteja sendo aplicado, adicionar uma proteção redundante:

- Criar uma função SQL `public.list_user_audit_for_caller(_limit int)` `SECURITY DEFINER` que:
  - Identifica o tenant do `auth.uid()` chamador.
  - Retorna apenas registros desse tenant (super_admin vê todos).
- Alterar o front-end (`src/routes/users.tsx`, `callAdminUsers("list_audit", ...)`) para chamar essa RPC via `supabase.rpc(...)` em vez da edge function.

Isso elimina qualquer dependência de cache/deploy da edge function.

### Passo 3 — Verificação final
- Logar com `diretorturismos@gmail.com` → contador = 3.
- Logar com `arthurmendesrj@hotmail.com` (BSS Tour) → contador = 12.
- Logar como Desenvolvedor (super_admin = arthur) → vê todos = 15.

Quero começar pelo **Passo 1** (só recarregar). Se ainda aparecer 15, eu já parto direto para o Passo 2.
