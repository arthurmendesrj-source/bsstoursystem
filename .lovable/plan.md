

# Tornar a página de Invoice totalmente editável

Hoje a aba **Invoice** abre o `ProposalEditor` em modo somente-leitura (porque `mode === "invoice"` ou porque a proposta tem status `aprovada`). O usuário precisa editar tudo: valores, adicionar/remover itens hotel e service, markup, validade, moeda, taxa bancária.

## Mudanças

### `src/components/proposal/ProposalEditor.tsx`
- Remover o bloqueio `readOnly` para o modo `invoice`. A nova regra fica:
  ```ts
  const readOnly = false; // invoice e proposta aprovada agora são editáveis
  ```
  (mantém `isClosed` apenas para exibir o badge verde "Proposta fechada" + código `INxxxxx`, **sem** desabilitar campos.)
- Mostrar todos os botões de ação no modo invoice:
  - **Adicionar item** (Hotel / Service)
  - **Salvar** alterações
  - **Ditar itens por voz** (libera o `DictateItemsPanel` também no invoice)
  - **Gerar documento** (`GenerateDocDialog` disponível em ambos os modos)
- Esconder o botão **"Aprovar proposta"** no modo `invoice` (já está aprovada — não faz sentido re-aprovar). Em vez disso, o salvar atualiza diretamente os itens/total.
- Manter o **badge verde + código do invoice** no header como indicador visual de que a proposta foi fechada, mas sem implicar leitura-apenas.

### `src/lib/i18n.tsx`
- Remover/ocultar a chave `invoiceReadOnly` do uso (mantém a string, só não é mais renderizada).
- Adicionar chave opcional `invoiceEditable` (PT/EN/ES/RU): *"Invoice editável — alterações refletem no booking."* exibida discretamente como hint no header do invoice.

### Persistência
- O `save()` existente já faz `upsert` em `quote_items` e `update` em `quotes`. Funciona para ambos os modos sem alteração — só precisamos liberar a UI.
- O `total_amount` do `quote` é recalculado no save → o booking gerado vai ler esse total via JOIN quando renderizado.

## Fora de escopo

- Sincronizar automaticamente alterações do invoice no `bookings.total_amount` (booking puxa total da quote sob demanda — se houver uma coluna espelhada, viraria trigger num próximo passo).
- Histórico de versões/auditoria de edições pós-aprovação.
- Bloquear edição quando booking já tiver pagamento confirmado (não há esse estado modelado hoje).

## Arquivos afetados

| Ação | Arquivo |
|---|---|
| Editar | `src/components/proposal/ProposalEditor.tsx` |
| Editar | `src/lib/i18n.tsx` |

