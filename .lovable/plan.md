Remover o botao "Criar Invoice" do ProposalEditor.

Mudancas:
- Remover o botao com texto "Criar Invoice" (linha 708-710) do grupo de acoes da proposta.
- Remover a funcao `createInvoiceOnly` (linha 603-644) que ficara sem uso.
- Manter o fluxo original: Aprovar Proposta → Converter para Reserva (que ja cria o invoice automaticamente).