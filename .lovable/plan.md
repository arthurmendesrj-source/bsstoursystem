
# Reestruturação: Bancos de Dados de Clientes e Fornecedores

Antes de continuar com Email/Leads/Bookings, vamos consolidar os cadastros mestres (Clientes e Fornecedores) que serão a base de todo o fluxo. Hoje temos `customers` básico e **não existe** tabela de fornecedores.

## 1. Expandir o cadastro de Clientes (`customers`)

A tabela atual tem só dados pessoais soltos. Vou ampliar para suportar PF/PJ, endereço completo, documentos e relacionamento com bookings/leads/emails.

**Novos campos em `customers`:**
- `type` (enum `customer_type`: `pf` | `pj`) — default `pf`
- `company_name`, `trade_name`, `tax_id` (CNPJ/EIN para PJ)
- `address_street`, `address_number`, `address_complement`, `address_district`, `address_city`, `address_state`, `address_country`, `address_zip`
- `whatsapp` (separado do `phone`)
- `secondary_email`
- `gender`, `marital_status`
- `emergency_contact_name`, `emergency_contact_phone`
- `tags` (text[]) — segmentação livre (VIP, recorrente, etc.)
- `status` (enum `customer_status`: `ativo` | `inativo` | `bloqueado`) — default `ativo`
- `origin` (text) — de onde veio (indicação, site, instagram, email…)

**Aba Clientes (`/customers`):** rebuild com:
- Tabela com filtros (tipo, status, tag, busca por nome/email/CNPJ).
- Drawer de detalhes mostrando: dados, histórico de **leads**, **bookings**, **emails** vinculados, **interações** e **tarefas** — tudo já cruzando as tabelas existentes.
- Botão **"Incluir manualmente"** abre formulário completo (PF/PJ condicional).
- Quando vier de Email/Lead, mesmo formulário pré-preenchido.

## 2. Criar cadastro de Fornecedores (`suppliers`) — novo

Fornecedores são quem entrega o serviço (hotéis, cias aéreas, receptivos, transfers, seguros, operadoras parceiras).

**Tabela `suppliers`:**
- `id`, `created_at`, `updated_at`, `created_by`
- `name`, `trade_name`, `tax_id`
- `category` (enum `supplier_category`: `hotel` | `aerea` | `receptivo` | `transfer` | `seguro` | `operadora` | `passeio` | `aluguel_carro` | `outro`)
- `status` (enum `supplier_status`: `ativo` | `inativo` | `homologacao`)
- `contact_name`, `email`, `phone`, `whatsapp`, `website`
- Endereço completo (mesmos campos de customers)
- `payment_terms` (text — ex: "30/60/90"), `default_currency` (currency_code)
- `commission_pct` (numeric) — comissão padrão recebida
- `iata_code` (para aéreas), `cadastur` (para operadoras BR)
- `notes`, `tags` (text[])
- `rating` (smallint 1–5)

**Tabela `supplier_contacts`** (vários contatos por fornecedor):
- `id`, `supplier_id`, `name`, `role`, `email`, `phone`, `whatsapp`, `is_primary`

**Aba Fornecedores (`/suppliers`):** nova rota
- Tabela com filtros (categoria, status, país/cidade, tag).
- Drawer de detalhes: dados, contatos, **bookings** que usaram esse fornecedor (futuro), histórico de e-mails trocados.
- Botão **"Incluir manualmente"** + futuro fluxo via Email.

## 3. Vínculos entre tabelas (preparando o fluxo integrado)

Para o "tudo interligado" funcionar bem:
- `bookings.supplier_id` (uuid, nullable) — fornecedor principal do booking.
- `booking_suppliers` (tabela N:N) — vários fornecedores por booking, cada um com `service_type`, `confirmation_code`, `cost`, `currency`, `status`.
- `emails.supplier_id` (uuid, nullable) — vincular email a fornecedor (já temos `lead_id` e `customer_id`).
- `interactions.supplier_id` (uuid, nullable) — registrar contatos com fornecedor.
- `tasks.supplier_id` (uuid, nullable) — tarefas vinculadas a fornecedor.

## 4. RLS

Mesmo padrão das tabelas existentes:
- **SELECT**: qualquer `authenticated`.
- **INSERT**: `auth.uid() = created_by`.
- **UPDATE**: dono ou `is_admin` ou `has_role('operacional')`.
- **DELETE**: apenas `is_admin`.

## 5. Navegação e i18n

- AppShell: novo item **Fornecedores** (ícone `Building2`).
- `i18n.tsx`: chaves PT/EN/ES para todos os novos campos, categorias e status.

## 6. Arquivos afetados

- **Migração SQL** (1 arquivo): novos enums, novas colunas em `customers`, tabelas `suppliers` + `supplier_contacts` + `booking_suppliers`, novas FKs/colunas em `bookings`/`emails`/`interactions`/`tasks`, RLS de tudo.
- `src/routes/customers.tsx` — rebuild com filtros, drawer 360°, formulário PF/PJ.
- `src/routes/suppliers.tsx` — **novo**.
- `src/components/AppShell.tsx` — item Fornecedores.
- `src/lib/i18n.tsx` — novas chaves.

## 7. Perguntas rápidas antes de executar
