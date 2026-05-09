
# Janelas flutuantes no Atendimento

Reaproveitar o padrão da janela de leitura de e-mail (`ThreadWindowManager` com `react-rnd`) para que, na página `/workspace`, o usuário possa abrir em janela flutuante:

- Cada **seção** (Email, Atividades, Propostas, Invoice, Reserva) — duplo-clique no cabeçalho do accordion.
- Cada **item** dentro das seções — duplo-clique no card/linha (uma tarefa, uma proposta, uma invoice, uma reserva, uma thread de e-mail).

Comportamento idêntico ao e-mail: arrastar, redimensionar, minimizar (vai para a barra inferior), maximizar e restaurar; lembra último tamanho/posição; cascata para múltiplas janelas.

## Arquitetura

1. **Novo componente genérico** `src/components/FloatingWindowManager.tsx`
   - Generaliza o `ThreadWindowManager` atual: recebe um `id`, `title`, `icon`, `defaultSize` e `children` (ou `render` function).
   - Mesma lógica de `Rnd`, `WState` (normal/min/max), z-index, cascata, persistência em `localStorage`.
   - Expõe handle `openOrFocus({ id, title, render, defaultSize? })` e `close(id)`.
   - O `ThreadWindowManager` passa a ser apenas um wrapper fino que chama o genérico com o `ThreadReader` como conteúdo (sem regredir o e-mail).

2. **Provider global em `/workspace`**
   - Um único `<FloatingWindowManager ref={winRef} />` montado uma vez no `WorkspacePage`.
   - Context `WorkspaceWindowsContext` para que componentes filhos chamem `openWindow(...)` sem prop drilling.

3. **Visualizadores leves novos** (read-only com ações), em `src/components/workspace/windows/`:
   - `ActivityWindow.tsx` — exibe título, due date, descrição, status, lead/cliente vinculado, anexos; ações: marcar como concluída, abrir edição completa (BibliaActivityDialog), excluir.
   - `ProposalWindow.tsx` — código, status, total, itens resumidos, datas; ações: abrir editor completo, gerar documento, duplicar.
   - `InvoiceWindow.tsx` — variação do ProposalWindow focada em invoice (código de invoice, status de pagamento, ações de gerar PDF).
   - `BookingWindow.tsx` — datas de embarque/retorno, status, valor, fornecedor; ações: abrir página de reserva.
   - `SectionWindow.tsx` — wrapper que recebe o conteúdo do accordion (Email/Atividades/Propostas/Invoice/Reserva) e renderiza dentro da janela com header próprio.

   Todos seguem layout consistente: header com ícone + título, corpo scrollável, rodapé de ações.

4. **Triggers de duplo-clique no `workspace.tsx`**
   - Cabeçalho de cada `AccordionTrigger` recebe `onDoubleClick` (com `stopPropagation` para não togglar o accordion) que abre `SectionWindow` com o conteúdo daquela seção.
   - `ActivitiesTab`: cada item da lista recebe `onDoubleClick` → abre `ActivityWindow`.
   - `ProposalsTab` (modo proposal e invoice): cada linha de quote recebe `onDoubleClick` → abre `ProposalWindow`/`InvoiceWindow`.
   - Lista de `bookings`: cada card recebe `onDoubleClick` → abre `BookingWindow`.
   - `EmailPanel` (modo lead): a thread já abre em janela hoje via `ThreadWindowManager`; integrar para usar o mesmo gerenciador global (uma janela só, mesmo z-stack/barra de minimizadas que o resto).

5. **Acessibilidade / UX**
   - `cursor-pointer` + tooltip "Duplo-clique para abrir em janela" nos itens.
   - `select-none` no header dos accordions para não selecionar texto no duplo-clique.
   - Em telas pequenas (<768px) o duplo-clique abre em modal full-screen ao invés de Rnd (fallback).

## Detalhes técnicos

```text
src/components/
  FloatingWindowManager.tsx         (novo - genérico)
  email/ThreadWindowManager.tsx     (refatorado: usa o genérico)
  workspace/
    WorkspaceWindowsProvider.tsx    (novo - context + manager)
    windows/
      ActivityWindow.tsx
      ProposalWindow.tsx
      InvoiceWindow.tsx
      BookingWindow.tsx
      SectionWindow.tsx
src/routes/workspace.tsx            (envolve com provider, adiciona onDoubleClick)
```

Tamanhos padrão por tipo (lembrados via `localStorage` por chave `window.last.<type>`):
- Section: 1100x720
- Activity: 720x520
- Proposal/Invoice: 1000x680
- Booking: 720x500

## Validação

1. `/workspace?lead=...` carrega normalmente, accordions intactos.
2. Duplo-clique no header "Atividades" → abre janela com lista de atividades; minimiza/maximiza/restaura/fecha.
3. Duplo-clique numa tarefa → abre `ActivityWindow`; botão "Editar" abre BibliaActivityDialog por cima sem fechar a janela.
4. Abrir 3 janelas simultâneas → cascata, cada uma com seu z-index, minimizadas aparecem na barra inferior.
5. Fechar e reabrir → tamanho/posição preservados.
6. E-mail continua funcionando idêntico (regression).
