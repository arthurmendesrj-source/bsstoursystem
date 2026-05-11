## Objetivo

Fazer com que todas as janelas flutuantes abertas via duplo-clique (e-mail, atividades, propostas, fatura, reservas, tarefas, etc.) **nunca sumam sozinhas** ao usar a barra de ferramentas (sidebar) do Workspace. Elas devem ser **minimizadas automaticamente** para o rodapé e permanecerem lá até o usuário clicar manualmente no `X`.

## Comportamento atual

- O `WorkspaceWindowsProvider` já vive no `__root.tsx`, então as janelas tecnicamente sobrevivem à navegação.
- Porém, ao clicar em um item da sidebar com um lead ativo, o Workspace renderiza um `iframe` da ferramenta (Reservas, Pacotes, etc.) que cobre visualmente as janelas abertas, dando a sensação de que “sumiram”.
- Não existe hoje uma forma do usuário recuperar essas janelas a não ser fechando o iframe.

## Mudanças propostas

### 1. `FloatingWindowManager.tsx`
- Expor uma nova ação `minimizeAll()` no `FloatingWindowManagerHandle`.
- `minimizeAll()` percorre todas as janelas em estado `normal` ou `max` e altera para `min`, preservando posição/tamanho. Janelas já minimizadas permanecem como estão.
- Garantir que a barra de minimizadas no rodapé (`fixed bottom-2 right-2 z-50`) **sempre** fique acima de qualquer iframe/painel — manter z-50 e adicionar `pointer-events-auto` no container.

### 2. `WorkspaceWindowsProvider.tsx`
- Adicionar `minimizeAllWindows()` ao contexto, chamando `ref.current?.minimizeAll()`.
- Fallback no-op para componentes fora do provider.

### 3. `AppShell.tsx` (sidebar)
- No handler de clique dos itens da sidebar (incluindo o caminho que monta `wrappedSearch` para “Manter dentro do Workspace”), antes de `navigate(...)`, chamar `minimizeAllWindows()`.
- Aplicar também aos itens que **trocam de rota** (Gerencial, Configurações, Permissões, etc.) — assim o usuário recupera as janelas ao voltar.
- Não chamar `closeWindow` em lugar nenhum por causa de navegação.

### 4. Workspace `ToolPanel` (`workspace.tsx`)
- Ao trocar `tool` ou ao clicar “Voltar para atendimento”, **não** fechar janelas; apenas minimizar (`minimizeAllWindows()`) por consistência visual.
- Ajustar o container do iframe para `relative z-0` para garantir que nunca cubra a barra de minimizadas (z-50) nem janelas restauradas (z-40+).

### 5. Garantia de persistência
- Revisar `workspace.tsx` para confirmar que nenhum `useEffect` de mudança de `lead` ou `tool` chama `win.closeWindow(...)` automaticamente. Se houver, remover.
- Janelas continuam a ser fechadas **apenas** pelo botão `X` no título ou na pílula minimizada.

## Fora de escopo

- Não mudar o conteúdo das janelas, nem o `xlsx`/Planilha de Cotação.
- Não alterar o comportamento de duplo-clique em si — só o que acontece com janelas já abertas durante a navegação.
- Sem mudanças de schema/banco.

## Arquivos afetados

- `src/components/FloatingWindowManager.tsx` (editar)
- `src/components/workspace/WorkspaceWindowsProvider.tsx` (editar)
- `src/components/AppShell.tsx` (editar)
- `src/routes/workspace.tsx` (editar — `ToolPanel` + verificação de closes acidentais)
