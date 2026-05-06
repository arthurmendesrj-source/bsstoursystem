# Finalizar Assistente IA

O núcleo do Assistente IA já foi construído (banco, prompt, ferramentas, endpoint de streaming, página `/assistant`, componente de chat e FAB). Falta apenas **plugar tudo no shell da aplicação** para ficar acessível.

## O que falta

### 1. `src/components/AppShell.tsx`
- Adicionar item **"Assistente IA"** na sidebar logo abaixo de **Email** (ícone `Sparkles`, rota `/assistant`).
- Adicionar **"Assistente IA"** também como subitem dentro do grupo CRM (após Pacotes).
- Renderizar `<AssistantFab />` globalmente dentro do shell autenticado, escondendo-o quando a rota atual já for `/assistant` (para não duplicar o chat).

### 2. Verificações finais
- Confirmar que a rota `/assistant` aparece em `routeTree.gen.ts` (gerado automaticamente pelo plugin do TanStack).
- Conferir que o build passa sem erros de TypeScript (o import do `toast` já foi corrigido para `sonner`).
- Smoke test rápido: abrir `/assistant`, criar uma conversa, enviar uma mensagem e ver o streaming responder.

## Detalhes técnicos

- O FAB usa um `Sheet` lateral; para evitar conflito visual na própria página do assistente, usar `useLocation()` do `@tanstack/react-router` e condicionalmente não renderizar quando `pathname === "/assistant"`.
- O item de sidebar segue o mesmo padrão dos demais (`NavLink` com `activeProps`).
- Nenhuma alteração de schema, backend ou lógica é necessária — apenas UI/montagem.

Após esses ajustes o Assistente IA estará 100% funcional e acessível pelos três pontos acordados (sidebar dedicada, subitem do CRM e FAB global).
