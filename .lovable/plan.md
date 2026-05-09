# Tooltips globais em botões

## Objetivo
Quando o usuário parar o cursor sobre qualquer botão do sistema, abrir um balão (tooltip) descrevendo a ação que aquele botão executa.

## Abordagem
Criar um componente wrapper único e aplicá-lo de forma global, sem precisar editar centenas de botões um a um.

### 1. Provider global de tooltips
- Em `src/routes/__root.tsx`, envolver `<Outlet />` com `<TooltipProvider delayDuration={400}>` (do `@/components/ui/tooltip`, já existente no projeto via Radix).
- Isso habilita tooltips em qualquer parte da árvore.

### 2. Novo componente `ActionButton` (wrapper inteligente)
Arquivo novo: `src/components/ui/action-button.tsx`.
- Re-exporta a API do `Button` existente, mas adiciona prop `tooltip?: string`.
- Se `tooltip` for fornecido OU se o botão for `size="icon"` (botões só com ícone) e tiver `aria-label`, envolve automaticamente em `<Tooltip><TooltipTrigger asChild>...</TooltipTrigger><TooltipContent>{texto}</TooltipContent></Tooltip>`.
- Para botões com texto visível, o tooltip é opcional (só aparece se passado explicitamente, evitando redundância "Salvar" → "Salvar").

### 3. Auto-tooltip nos botões existentes (sem refator massivo)
Duas camadas:

**a) Botões só com ícone (prioridade alta)** — são os que mais precisam de tooltip pois não têm texto.
- Varrer o projeto buscando `size="icon"` e adicionar `aria-label` + envolver em `<Tooltip>` quando ainda não estiver. Cobrir os arquivos principais:
  - `src/components/proposal/ProposalEditor.tsx` (botões Adicionar Voo/Hotel/Serviço, Reabrir, Lixeira, Editar, etc.)
  - `src/routes/bookings_.$bookingId.tsx` (Reabrir reserva, Reverter para pendente, ações de itens)
  - `src/components/email/EmailPanel.tsx` e `ThreadReader.tsx` (responder, encaminhar, arquivar, estrela, lixeira, anexos)
  - `src/components/AppShell.tsx` (sino de notificações, busca, menu)
  - `src/components/NotificationBell.tsx`, `GlobalSearch.tsx`, `EnableNotificationsButton.tsx`
  - `src/components/FloatingWindowManager.tsx` e `workspace/windows/*` (minimizar, maximizar, fechar)
  - `src/components/assistant/AssistantFab.tsx`

**b) Botões com texto que se beneficiam de descrição extra** — adicionar prop `tooltip` apenas onde a ação não é óbvia (ex.: "Aprovar", "Reabrir proposta", "Gerar documento", "Triagem IA"), com um texto curto explicando o efeito.

### 4. Internacionalização
- Adicionar chaves em `src/lib/i18n.tsx` para os textos de tooltip novos (pt/en/es), mantendo o padrão do projeto. Ex.: `tipAddFlight`, `tipReopenProposal`, `tipArchiveEmail`, etc.

### 5. Acessibilidade
- Sempre incluir `aria-label` junto com o tooltip nos botões só com ícone (para leitores de tela).
- `delayDuration={400}` evita tooltips agressivos no hover rápido.

## Validação
- Passar o mouse em qualquer botão de ícone (sino, lixeira, reabrir, anexar, etc.) mostra um balão após ~400ms.
- Botões com texto visível só mostram tooltip quando há informação adicional útil.
- Funciona em todas as telas (proposta, reserva, e-mail, workspace, configurações).

## Detalhes técnicos
- Usa o `Tooltip` do Radix já presente em `src/components/ui/tooltip.tsx`.
- Nenhuma dependência nova.
- Nenhuma mudança em lógica de negócio — apenas UI/apresentação.
