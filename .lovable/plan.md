## Objetivo

No diálogo **Associar** (usado dentro da Triagem IA), incluir duas novas abas de busca:
- **Todos** — busca unificada por termo único, retornando matches mistos de Lead, Cliente, Fornecedor, Reserva e Atividade.
- **Atividades** — busca em `operations_activities` (descrição, cidade, hotel, fornecedor, guia, motorista, código de fatura, pax, data).

Ao escolher uma atividade, o e-mail é vinculado à atividade (e, automaticamente, à reserva/lead/cliente vinculados a ela).

## Mudanças

### 1. Migração de banco
Adicionar suporte a vínculo de e-mail ↔ atividade.

```sql
alter table public.email_message_links
  add column if not exists activity_id uuid
  references public.operations_activities(id) on delete set null;

create index if not exists idx_eml_activity
  on public.email_message_links(activity_id);
```

A RPC `link_email_thread` continua atendendo lead/customer/supplier; para atividade fazemos INSERT direto (mesmo padrão já usado para `booking_id`).

### 2. `src/components/AssociateDialog.tsx`
- Estender o union `AssociateEntity` com:
  ```ts
  | { kind: "activity"; id: string; activity_id: string;
      booking_id: string | null; lead_id: string | null; customer_id: string | null;
      label: string; sub?: string }
  ```
- Adicionar `"all"` e `"activity"` ao tipo `Tab` e ao default `tabs`.
- Renderizar TabsTriggers extras: **Todos** (primeira) e **Atividades**.
- **Aba Atividades**: query em `operations_activities` (`select id, description, city, activity_date, activity_time, kind, status, booking_id, hotel, supplier, guide, driver, pax_name, invoice_code, bookings(lead_id, customer_id)`), filtro `or` em `description/city/hotel/supplier/guide/driver/pax_name/invoice_code` + match exato em `activity_date` quando o termo parecer data. Label: `kind · description (city)`; sub: `activity_date activity_time · booking #...`.
- **Aba Todos**: quando o termo está vazio, lista os 5 registros mais recentes de cada tipo (lead/customer/supplier/booking/atividade). Quando há termo, executa as 5 buscas em paralelo (`Promise.all`), limita a 5 por tipo, agrupa por seção com um pequeno header (`Leads`, `Clientes`, `Fornecedores`, `Reservas`, `Atividades`) e renderiza usando o mesmo Card.
- Internacionalização: usar `t("linkAll")` e `t("linkActivity")`; adicionar fallbacks `"Todos"` / `"Atividades"` em `src/lib/i18n.tsx`.

### 3. `src/components/email/AiTriageDialog.tsx`
- No `onAssociate`, tratar `e.kind === "activity"`:
  - Buscar mensagens do thread (`emails`) e inserir uma linha em `email_message_links` por mensagem com `activity_id`, `booking_id` (se houver), `lead_id` e `customer_id` derivados da atividade.
  - Se `booking_id` / `lead_id` / `customer_id` existirem na atividade, também chamar `linkEmailThread` para esses campos suportados pela RPC, mantendo `emails.lead_id/customer_id` consistentes.
  - `setLinkedTo({ kind: "activity", label: e.label })` e `toast.success("Vinculado · N mensagem(ns)")` — diálogo permanece aberto.

### 4. `src/lib/linkEmailToEntity.ts`
- Adicionar helper `linkEmailThreadToActivity(threadId, { activity_id, booking_id?, lead_id?, customer_id? })` que encapsula o INSERT direto (espelhando o padrão atual de booking) para reuso futuro.

## Fora de escopo
- Não tocar na lógica do botão Associar na lista (`TriageEmailPanel`).
- Sem alterações em `link_email_thread` RPC (não há `activity_id` em `emails`).
- Sem edição/remoção de vínculos já criados.

## Detalhes técnicos

- O JOIN `bookings(lead_id, customer_id)` em `operations_activities` é direto pela FK existente `booking_id → bookings.id`.
- RLS: `email_message_links` já permite INSERT a authenticated; nova coluna `activity_id` herda a mesma policy.
- Performance: aba Todos faz 5 queries `limit(5)` em paralelo — custo equivalente a ~uma query única.
