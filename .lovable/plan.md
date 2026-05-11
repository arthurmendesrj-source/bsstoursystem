
## Objetivo
Em `/bookings/:bookingId` adicionar uma ação **Gerar Invoice** que:
1. Preenche a planilha-modelo enviada (aba `INVOICE`) com os dados da reserva.
2. Exporta em **XLSX** (planilha preenchida) e/ou **PDF** (mesma diagramação).
3. Permite editar antes de gerar dois blocos de texto que vão para as células A29 e F29 (dados bancários e beneficiário), com defaults fixos iguais ao modelo.

A aba `INVOICE` é a única preenchida — abas de vouchers ficam como estão no template.

## Onde aparece
- `src/routes/bookings_.$bookingId.tsx`: novo botão "Gerar Invoice" no cabeçalho (ao lado do badge de invoice). Abre `GenerateInvoiceDialog`.

## Novo componente — `src/components/booking/GenerateInvoiceDialog.tsx`
Campos do diálogo:
- Formato: radio `XLSX` / `PDF` / `Ambos`.
- Idioma: somente `EN` (modelo é em inglês) — sem seletor agora.
- **Bank info (cell A29)** — `Textarea`, default:
  ```
  The money can be transfered to:
  Beneficiary Bank : BANK OF AMERICA
  Bank address: 801 E. HALLANDALE BEACH BLVD. FLORIDA , 3309.
  SWIFT: BOFAUS3N
  BANK ACCOUNT : 898092533700
  ABA : 026009593
  ```
- **Beneficiary (cell F29)** — `Textarea`, default:
  ```
  Beneficiary: VIPDELUXETRAVEL LLC
  Beneficiary Address : 200 S. PARK RD. SUITE 301. HOLLYWOOD. FL 33021
  ```
- Botão "Gerar" → chama edge function, recebe `signed_url` (xlsx) e/ou `pdf_signed_url`, dispara download.

Defaults ficam hard-coded no componente (constantes). Edição é só "por geração" — nada salvo em banco.

## Edge function nova — `supabase/functions/generate-invoice-doc/index.ts`
Stack: Deno + `npm:exceljs@4` para XLSX, `npm:pdfkit@0.15` (puro JS, roda em Deno) para PDF.

Input (JSON):
```ts
{
  booking_id: string;
  formats: ("xlsx" | "pdf")[];
  bank_info: string;       // vai para A29
  beneficiary: string;     // vai para F29
}
```

Fluxo:
1. Auth via JWT do usuário (mesma RLS dos demais).
2. Carrega:
   - `bookings` (id, departure_date, return_date, customer_id, quote_id)
   - `customers` (full_name, email)
   - `quote_items` (todos os campos já lidos no detalhe; ordenados por `kind` então `item_date`)
   - `invoices.number` (booking_id ou quote_id) → vai para G1 (`<num>`); se não existir, gera placeholder vazio.
   - Dados do operador (Lovable) podem ficar fixos em E2/G2 (`booking@adatours.com`) por ora — mesmo do modelo.
3. Baixa template XLSX da Storage bucket `invoice-templates` (chave fixa `template.xlsx`).
   - Bucket privado, criado por migração; arquivo enviado uma vez via storage_upload no setup desta task.
4. Abre com ExcelJS, mantém todas as abas, edita só `INVOICE`:
   - **G1**: nº invoice.
   - **B3**: nome do cliente (REF).
   - **C5**: data limite (departure_date − N dias, ou departure_date) — usar `departure_date` formatado `dd.MM.yyyy`.
   - **Linha de hotéis** (a partir da linha 9): para cada `quote_items.kind = 'hotel'`:
     - A: `Check In: <item_date>  \nCheck Out: <check_out>`
     - B: description, C: category, D: meal_plan, E: city, F: unit_price (ou "Incl." se 0), G: rooms, H: nights, I: total (ou "Incl.").
     - Inserir linhas extras quando houver mais de 1 hotel (preserva formatação da linha 9 via `worksheet.duplicateRow`).
   - **Linha de serviços** (a partir da linha 25): para cada `kind = 'service'`/voo:
     - A: período `dd-dd.MM.yyyy`, B: description, E: city, F: unit_price ou "Incl.", G: pax, H: ways, I: subtotal (`=F*G*H` ou valor).
   - **Total price / Total to be Paid**: somatório dos subtotais (recalcula como número).
   - **A29**: texto do campo banco (bank_info do input).
   - **F29**: texto do beneficiário (beneficiary do input).
5. Salva buffer XLSX, faz upload em `invoice-docs/{booking_id}/{timestamp}.xlsx`, gera signed URL (1h).
6. Se formato inclui PDF: gera com PDFKit reproduzindo a mesma diagramação (cabeçalho, tabela de hotéis, tabela de serviços, totals, bloco de bank info / beneficiário). Sobre upload em `invoice-docs/.../{ts}.pdf` + signed URL.

Resposta:
```json
{ "xlsx_signed_url": "...", "pdf_signed_url": "...", "file_name": "INAE1352_..." }
```

## Migração de banco
- Criar bucket `invoice-templates` (private) e `invoice-docs` (private) via SQL `insert into storage.buckets`.
- Policies: leitura/escrita restrita a `authenticated` na bucket `invoice-docs`; `invoice-templates` apenas admin (read pelo service role da função).

## Setup do template
- Subir o arquivo enviado pelo usuário como `invoice-templates/template.xlsx` via `storage_upload` (uma vez, durante a implementação).

## Fora do escopo
- Não preencher abas `VOUCHERS HTLS` / `VOUCHER SERVICES` (ficam como no template).
- Sem persistir os textos de banco/beneficiário (defaults sempre carregam os valores acima; edição só vale para a geração atual).
- Sem suporte multi-idioma agora.
- Sem alterar o gerador atual de proposta (`GenerateDocumentDialog` continua existindo em ProposalEditor).
