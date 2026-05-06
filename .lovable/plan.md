## Objetivo

Mover o item **Email** para logo abaixo do módulo **CRM** na barra lateral.

## Mudança

Em `src/components/AppShell.tsx`, no array `items`, reposicionar `{ to: "/email", ... }` para ser o **primeiro** item da lista (a lista é renderizada imediatamente após o grupo CRM, então Email aparecerá logo abaixo dos filhos do CRM).

Ordem final dos itens fora do CRM:
1. Email
2. Atividades
3. Alertas
4. Clientes
5. Fornecedores
6. Reservas
7. Bíblia
8. Roteiros (IA)

Sem outras alterações.

## Critério de aceite

- "Email" aparece imediatamente abaixo do grupo CRM (acima de Atividades).
- Demais itens permanecem na ordem atual.
