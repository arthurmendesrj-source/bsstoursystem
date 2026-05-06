# Botão único do Assistente IA no header

Consolidar o acesso ao Assistente IA em **um único botão** posicionado no header, à esquerda do sino de notificações.

## Alterações

### `src/components/AppShell.tsx`
- **Remover** o item "Assistente IA" da lista `items` (sidebar principal).
- **Remover** o item "Assistente IA" de `crmChildren` (subitem do CRM).
- **Remover** `/assistant` de `crmRoutes`.
- **Remover** a renderização do `<AssistantFab />` no final do shell.
- **Adicionar**, no header (linha do `NotificationBell`), um botão ícone (`Sparkles`) imediatamente **antes** do `<NotificationBell />`. Esse botão abre o mesmo `Sheet` lateral do assistente.

### `src/components/assistant/AssistantFab.tsx`
- Refatorar para exportar também um componente `AssistantHeaderButton` (ou renomear o FAB para um botão genérico de header) que renderiza apenas o botão + `Sheet` com o `AssistantChat` dentro, sem o posicionamento `fixed bottom-right`.
- Manter a lógica de abrir/fechar e o conteúdo do chat.

### Rota `/assistant`
- A rota dedicada continua existindo e acessível via URL direta (não some), apenas deixa de aparecer na sidebar. Útil para sessões longas em tela cheia.

## Resultado
- Sidebar: sem qualquer entrada de Assistente IA.
- Header: ícone `Sparkles` à esquerda do sino, abrindo o chat em um sheet lateral em qualquer página autenticada.
- Sem FAB flutuante.
