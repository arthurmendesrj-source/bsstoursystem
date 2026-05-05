# Sidebar recolhível na Caixa de Ferramentas

Adicionar um botão de seta (ChevronLeft/ChevronRight) no topo da barra lateral em `src/components/AppShell.tsx` para recolher/expandir o menu, ampliando a área útil da tela.

## Comportamento
- **Expandido** (padrão): largura `w-64`, mostra ícone + label dos itens.
- **Recolhido**: largura `w-16`, mostra apenas os ícones (com `title` no link para tooltip nativa).
- O botão de seta fica no canto superior direito do header da sidebar, ao lado do logo:
  - Recolhido → ícone `ChevronRight` (clica para expandir)
  - Expandido → ícone `ChevronLeft` (clica para recolher)
- Estado persistido em `localStorage` (`sidebar:collapsed`) para manter entre sessões.
- Header e conteúdo principal continuam ocupando o restante via `flex-1` — automaticamente expandem.

## Mudanças
- **`src/components/AppShell.tsx`**:
  - Importar `ChevronLeft`, `ChevronRight`, `useState`, `useEffect`.
  - Estado `collapsed` lido/salvo em `localStorage`.
  - `<aside>` muda classe entre `w-64` e `w-16`.
  - Esconder textos (label do app, labels dos itens, e-mail do usuário, label do botão "Sair") quando `collapsed`.
  - Esconder título "Admin" quando recolhido.
  - Adicionar botão circular com seta no header da sidebar.

Sem alterações em rotas, dados ou outros componentes.
