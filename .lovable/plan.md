# Sidebar: botão sempre visível + caixas redimensionáveis no Atendimento

## 1. Botão de recolher sempre visível na sidebar
Em `src/components/AppShell.tsx`:
- Tornar o `<aside>` `relative` e mover o botão para fora do header, posicionado em `absolute -right-3 top-5 z-20` como um pequeno círculo flutuante na borda direita da sidebar.
- O botão fica visível tanto com a sidebar **expandida** (mostra `ChevronLeft`) quanto **recolhida** (mostra `ChevronRight`).
- Mantém persistência em `localStorage`.

## 2. Caixas redimensionáveis no Workspace (Atendimento)
Em `src/routes/workspace.tsx`:
- Substituir o grid fixo `grid-cols-[360px_1fr]` por `ResizablePanelGroup` (do shadcn `@/components/ui/resizable`, já instalado) com dois painéis horizontais:
  - **Painel esquerdo** (sidebar de cards do lead): `defaultSize={28}`, `minSize={18}`, `maxSize={45}`.
  - **Painel direito** (caixa principal com tabs): `defaultSize={72}`, `minSize={55}`.
  - `<ResizableHandle withHandle />` entre eles (alça arrastável).
- Tamanhos persistidos em `localStorage` (`workspace:layout`) via `onLayout` do PanelGroup.
- Layout responsivo: mantém grid simples em mobile (`< md`); painéis redimensionáveis só em `md+`.

Sem mudanças em rotas, dados ou outros componentes.
