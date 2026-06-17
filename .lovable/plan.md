## Ativar acesso total para `diretorturismos@gmail.com` como Proprietário

### Diagnóstico

A conta (perfil "Diretor1", `user_id 28f020a6-7d22-4c02-b82e-cf5f7d55bf16`) hoje tem **apenas** o papel `diretor`, que não vê o módulo **Usuários** e não tem `delete` em **SLA** — por isso parte da sidebar fica bloqueada.

### Regra

**Todo Proprietário recebe automaticamente o papel `admin`.** O Proprietário é o dono da conta no tenant; `admin` é o papel técnico que dá bypass total nas funções `has_role` / `has_module_permission` e nas RLS — ou seja, acesso completo a todos os módulos da barra lateral.

### Ação (migration única)

1. **Trocar o papel da conta**: em `public.user_roles`, remover `diretor` do `user_id 28f020a6-7d22-4c02-b82e-cf5f7d55bf16` e inserir `admin`.
2. **Atualizar o perfil**: setar `full_name = 'Proprietário'` (era "Diretor1") para refletir o nível real.
3. **Garantir membership de owner no tenant**: em `public.tenant_members`, marcar a linha desse usuário com `role_in_tenant = 'owner'` e `is_active = true` (insere se não existir).

Sem alteração de código no frontend — a sidebar usa `has_module_permission`, que passa a retornar `true` em tudo.

### Observação

Essa é a correção pontual agora. A reformulação geral que discutimos no plano anterior (papel `owner` formal no enum `app_role`, árvore `reports_to`, painel `/dev`, regra "só Proprietário convida") continua pendente das suas 3 respostas. Quando você confirmar, eu formalizo `owner` no schema e ele passa a implicar `admin` por trigger, sem precisar gerenciar os dois papéis manualmente.
