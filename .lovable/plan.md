

# Código de Invoice + Proposta aprovada permanece visível

Dois ajustes no fluxo de propostas:

## 1. Código do Invoice = `IN` + código do Lead

Quando uma proposta é aprovada e vira invoice/booking, o código exibido deve ser:
- `IN` + código do lead (ex.: lead `AM020426` → invoice **`INAM020426`**)
- Mostrado na lista de propostas e no detalhe do booking gerado.

**Onde aplicar:**
- No momento que a proposta é marcada como aprovada e/ou no render do booking gerado, derivar `invoice_code = "IN" + lead.code` (já existe `leads.code` populado pelo trigger `set_lead_code`).
- Não precisa coluna nova: derivamos sempre via JOIN `bookings.lead_id → leads.code`. (Se o usuário preferir persistir, viraria coluna `bookings.invoice_code` — fora do escopo agora.)
- Se o lead não tiver código (caso raro/legado), fallback para os 8 primeiros chars do `booking.id` em maiúsculas.

## 2. Proposta aprovada continua visível, em verde, com status "Proposta fechada"

Hoje propostas aprovadas saem da listagem (filtro provavelmente esconde status `aprovada`/`fechada`). Mudar para:
- **Não filtrar** propostas aprovadas — elas permanecem na página.
- Renderizar com **badge verde** e label localizado:
  - PT: *Proposta fechada*
  - EN: *Proposal closed*
  - ES: *Propuesta cerrada*
  - RU: *Предложение закрыто*
- Mostrar também o código do invoice gerado (`INxxxxx`) ao lado do badge, com link para o booking correspondente quando existir.
- Ações de edição ficam desabilitadas (somente leitura) para propostas fechadas — manter "Ver documento" e "Baixar" ativos.

## Arquivos afetados

| Ação | Arquivo |
|---|---|
| Editar | `src/routes/workspace.tsx` (ou componente de listagem de propostas dentro do lead — confirmar na implementação) |
| Editar | `src/components/proposal/ProposalEditor.tsx` (modo somente-leitura quando fechada + exibir invoice code) |
| Editar | `src/components/proposal/ProposalDocumentsList.tsx` (mostrar `INxxxxx` no header se aplicável) |
| Editar | `src/lib/i18n.tsx` (chaves `proposalClosed`, `invoiceCode`) |

## Fora de escopo

- Persistir `invoice_code` como coluna em `bookings` (hoje fica derivado em runtime).
- Numeração sequencial de invoices independente do lead.
- Workflow de re-abrir proposta fechada.

