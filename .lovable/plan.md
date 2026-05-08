## Objetivo

Simplificar o `EmailPanel` mantendo apenas a sidebar colapsável (com ícones) e removendo os painéis redimensionáveis e as abas de categorias do Gmail (Principal / Social / Promoções / Atualizações).

## Mudanças

### 1. Remover painéis redimensionáveis
- Remover o uso de `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle` em `src/components/email/EmailPanel.tsx`.
- Remover o import de `@/components/ui/resizable`.
- Remover o estado `panelSizes`, a constante `LS_SIZES`, o `useMemo` de `initialSizes` e o `onLayout` que persistia em `localStorage`.
- Voltar para um layout fixo com flex:
  - Sidebar (`w-60` quando expandida, `w-14` quando colapsada).
  - Lista de threads com largura fixa (`w-80` / `w-96`).
  - Leitor ocupando o restante (`flex-1`).

### 2. Remover categorias do Gmail
- Remover a constante `CATEGORIES` (Principal / Social / Promoções / Atualizações).
- Remover o estado `activeCategory` e `setActiveCategory`.
- Remover o `<Tabs>` de categorias renderizado acima da lista de threads.
- Remover qualquer uso de `activeCategory` na query de threads (filtro por label de categoria), passando a listar threads apenas pelo `activeLabel` (INBOX, STARRED, etc.).
- Remover o import de `Tabs, TabsList, TabsTrigger` se não houver mais uso no arquivo.

### 3. Manter o que já funciona
- Sidebar colapsável continua igual: toggle persiste em `localStorage` (`email.sidebar.collapsed`); colapsada mostra apenas ícones com `Tooltip`; expandida mostra nomes + contadores.
- Duplo clique abre popup independente (`Dialog` com `ThreadReader`) — sem alteração.
- `ThreadReader` (com botões Triagem IA e Associar) — sem alteração.
- Backend de sync e realtime — sem alteração.

## Arquivos afetados

- `src/components/email/EmailPanel.tsx` — remover ResizablePanelGroup, categorias e estados associados; voltar a layout flex fixo.

## Fora do escopo

- Não alterar `ThreadReader.tsx`, `AiTriageDialog.tsx`, `AssociateDialog.tsx`, `resizable.tsx` nem o backend.
