## Objetivo

1. **Manter o lead em foco**: ao navegar pela barra lateral com um lead aberto em `/workspace`, abrir o conteúdo dentro do próprio painel central — sem trocar de rota nem perder o lead.
2. **Planilha de Cotação**: na tela Proposta (dentro do atendimento), substituir o botão atual por um único botão "Planilha de Cotação" com duas ações: **Baixar** e **Upload** (substitui itens da proposta atual).

---

### 1. Barra lateral "lead-aware" no Workspace

`src/components/AppShell.tsx`
- Detectar se a rota atual é `/workspace` e se há `?lead=<id>` no search.
- Quando houver lead ativo, interceptar os cliques nos itens da barra (Reservas, Pacotes, Email, Clientes, Fornecedores, Itinerários, Funil, Atividades, Bíblia, Inbox-IA, etc.) e, em vez de `<Link to="...">`, disparar uma navegação para `/workspace` mantendo `?lead=<id>` e adicionando um novo parâmetro `tool=<chave>` (ex.: `bookings`, `packages`, `email`, `customers`, `suppliers`, `itineraries`, `funnel`, `biblia`, `inbox-ia`, `dashboard`).
- Itens de Configurações/Permissões/Usuários continuam navegando normalmente (não fazem sentido embutidos).
- O destaque de "ativo" passa a considerar `tool` em vez do `path` quando o lead está ativo.

`src/routes/workspace.tsx`
- Estender `WorkspaceSearch` para `{ lead?: string; tool?: string }`.
- Adicionar uma nova seção "Ferramenta" no painel central que, quando `tool` está setado, renderiza o componente embutido correspondente, escopado ao lead quando faz sentido:
  - `bookings` → lista de reservas filtrada por `lead_id`
  - `packages` → lista de pacotes (read-only, para consulta)
  - `email` → `<EmailPanel mode="lead" leadId={lead.id} customerId={lead.customer_id} inlineReader />` (já existe)
  - `customers` → ficha do cliente vinculado ao lead
  - `suppliers`, `itineraries`, `funnel`, `biblia`, `inbox-ia`, `dashboard` → versão embutida em iframe-less, reusando os componentes principais já existentes nessas rotas (refatorando para um componente exportável quando necessário).
- Header do painel mostra um botão "Voltar para atendimento" que limpa `tool` e volta para a aba padrão (Email/Atividades/Proposta etc.).
- Sem lead ativo, `tool` é ignorado.

**Fora de escopo desta etapa**: encapsular telas extremamente complexas (Gerencial, Permissões, Settings) — essas continuam navegando para fora.

---

### 2. Botão "Planilha de Cotação" (Proposta)

`src/components/proposal/ProposalEditor.tsx`
- Remover o botão atual de download de planilha (caso exista) ou substituí-lo.
- Adicionar um único botão **"Planilha de Cotação"** com ícone de planilha, abrindo um `DropdownMenu` com:
  - **Baixar** → gera e baixa `.xlsx` no cliente (sem edge function).
  - **Upload** → abre input `<input type="file" accept=".xlsx">`; ao selecionar, parseia e substitui itens da proposta atual.

`src/components/proposal/QuoteSpreadsheetButton.tsx` (novo)
- Encapsula UI (dropdown), geração e parse usando **`xlsx`** (SheetJS) — biblioteca já leve, client-side.
- Estrutura do arquivo:
  - Aba **"Lead"** (somente leitura, instruções no topo):
    - Cliente, Código do lead, Lead ID, Customer ID, Quote ID, Moeda, Markup padrão %, Datas (início/fim), Observações.
  - Aba **"Itens"** (editável) com colunas:
    - `kind` (`hotel`/`service`), `description`, `city`, `check_in`, `check_out`, `item_date`, `quantity`, `unit_cost`, `markup_pct`.
    - Linhas pré-preenchidas com os itens existentes da proposta.
  - Aba **"Instruções"** com regras: não renomear colunas, não alterar Quote ID na aba Lead, etc.
- Nome do arquivo: `cotacao_<lead_code>_<quote_id_curto>.xlsx`.

**Upload (substituir itens)**:
- Lê a aba "Itens", valida `kind` e numéricos.
- Confirma com diálogo: "Isso substituirá todos os itens da proposta. Continuar?".
- Em uma transação lógica:
  1. `delete from quote_items where quote_id = :id`
  2. `insert` em `quote_items` com os novos itens (recalculando `unit_price` e `total` via `lib/proposal-totals.ts`).
- Recarrega o editor (`onSaved` / `load()`).
- Validação cruzada: o `Quote ID` da aba Lead deve bater com o `quoteId` atual; se não bater, bloqueia.

**Sem mudanças de schema** — usa tabelas e RLS existentes (`quote_items`).

---

### Arquivos

- **Editar**: `src/components/AppShell.tsx`, `src/routes/workspace.tsx`, `src/components/proposal/ProposalEditor.tsx`
- **Criar**: `src/components/proposal/QuoteSpreadsheetButton.tsx`
- **Dependência**: adicionar `xlsx` (`bun add xlsx`)

### Fora de escopo

- Não mexer em invoice, vouchers, geração de PDF.
- Não embutir Gerencial / Permissões / Settings no Workspace.
- Sem migrações de banco.