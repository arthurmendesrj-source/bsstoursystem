## Mudanças (revisão do plano)

Mantém tudo do plano anterior e adiciona suporte a notas no documento gerado, com duas versões.

### 1. Remover "Gerar Invoice" da tela de Reservas
- `src/routes/bookings_.$bookingId.tsx`: remover botão **Gerar Invoice**, estado `invoiceDialogOpen`, render de `<GenerateInvoiceDialog/>` e o import.

### 2. Mover "Gerar Invoice" para a Invoice em Atendimento
- `src/components/proposal/ProposalEditor.tsx`:
  - Em `mode === "invoice"`: esconder o botão **Gerar Documento**.
  - Em `mode === "invoice"`: novo botão **Gerar Invoice** abrindo `GenerateInvoiceDialog`.
  - Resolver `bookingId` a partir de `bookings.quote_id = quoteId` (mais recente). Sem booking ⇒ botão desabilitado com tooltip "sem reserva vinculada".

### 3. Anotação por item (Operacional / Financeiro / Comercial)
- Migração — nova tabela `quote_item_notes`:
  - `quote_id` (FK quotes), `target_kind` enum (`item`|`flight`), `target_id` uuid, `category` enum `note_category` (`operacional`|`financeiro`|`comercial`), `note` text, `author_id` uuid, timestamps.
  - RLS: SELECT/INSERT para autenticado; UPDATE/DELETE só do `author_id` (ou admin via has_role).
- Novo `src/components/booking/ItemNoteButton.tsx`: ícone `StickyNote` (com badge de contagem), Popover com lista de notas existentes + form (Select de categoria + Textarea + Salvar).
- `ProposalEditor.tsx`: renderizar `ItemNoteButton` ao lado dos botões de lápis/lixeira nas tabelas de itens (linha ~1106) e de voos (linha ~844), quando `mode === "invoice"` e o item já existe (não `new-…`).

### 4. **NOVO**: Versão financeira do documento (com/sem notas)
- `GenerateInvoiceDialog.tsx`:
  - Adicionar **seletor "Versão"**: 
    - **Cliente** (sem notas) — default.
    - **Setor Administrativo** (com notas) — inclui um bloco/coluna de notas no doc.
  - Enviar `version: "client" | "admin"` para a edge function.
- `supabase/functions/generate-invoice-doc/index.ts`:
  - Aceitar `version` no body. Se `version === "admin"`:
    - Carregar `quote_item_notes` do `quote_id` agrupadas por `target_id`.
    - **XLSX**: para cada linha de item/voo, anexar nas células livres da direita (coluna J em diante) a lista de notas no formato `[Categoria] texto · autor`. Adicionar também ao final da planilha (após totals, antes do bloco bancário) uma seção **"Internal Notes"** listando todas as notas com referência ao item.
    - **PDF**: adicionar coluna "Notes" nas tabelas de hotéis e serviços com as notas concatenadas; ao final, antes do bloco bancário, seção **"Internal Notes"** com lista completa.
  - Se `version === "client"`: comportamento atual (sem notas).
  - Naming do arquivo: sufixo `_admin` ou `_client` no `file_name` para diferenciar downloads.

### Arquivos
- editar: `src/routes/bookings_.$bookingId.tsx`, `src/components/proposal/ProposalEditor.tsx`, `src/components/booking/GenerateInvoiceDialog.tsx`, `supabase/functions/generate-invoice-doc/index.ts`
- criar: `src/components/booking/ItemNoteButton.tsx`
- migração: tabela `quote_item_notes` + enums + RLS

### Fora do escopo
- Sem mudar o gerador de proposta (`GenerateDocumentDialog`).
- Notas não são editáveis em massa — só pelo botão por item.
