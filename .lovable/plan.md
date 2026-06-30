Liberar todas as permissões do módulo `activities` para todos os papéis da hierarquia (supervisor, coordenador, operador, além dos já liberados admin/diretor/gerente).

## Mudança

Atualizar `role_module_permissions` no módulo `activities`:
- `can_view = true`
- `can_create = true`
- `can_edit = true`
- `can_delete = true`
- `can_approve = true`
- `can_export = true`

Para todos os papéis da hierarquia.

## Resultado

Qualquer usuário, independente do nível, poderá visualizar, criar, editar, excluir, aprovar e exportar atividades na janela de Atividades.
