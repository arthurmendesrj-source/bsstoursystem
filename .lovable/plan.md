## Objetivo

Garantir isolamento total entre empresas:
- Toda conta criada via signup público → conta master (diretor), com tenant próprio.
- Nenhum usuário enxerga dados de outro tenant.
- Apenas `super_admin` (desenvolvedor) atravessa tenants.
- Usuários convidados herdam o tenant de quem convidou (já feito).

## Diagnóstico

O signup → master e o convite → membro já estão corretos (correção anterior). O problema restante são as **políticas RLS legadas** que ainda existem em paralelo às `tenant_isolation_*`. Políticas permissivas se combinam com OR, então o filtro de tenant é ignorado.

Exemplo: Diretor1 (admin do tenant Diretor1) hoje enxergaria os 638 fornecedores e 233 clientes da BSS Tour porque `suppliers_select` libera para qualquer `is_admin(auth.uid())` sem checar `tenant_id`.

## Plano

### 1. Migration: tornar isolamento de tenant obrigatório

Para cada tabela `public.*` que tem coluna `tenant_id` (customers, leads, suppliers, supplier_contacts, supplier_rates, supplier_documents, bookings, booking_pax, booking_suppliers, booking_item_confirmations, quotes, quote_items, quote_flights, quote_documents, quote_item_notes, tasks, invoices, vouchers, voucher_send_log, interactions, itineraries, itinerary_chunks, packages, package_dates, activity_log, ai_conversations, ai_messages, ai_pending_actions, ai_generated_images, emails, email_threads, email_attachments, email_labels, email_message_links, email_sync_state, exchange_rates, lead_alert_snoozes, notification_logs, notification_preferences, operations_activities, push_subscriptions, sla_escalations, sla_settings, storage_access_log, user_email_accounts, user_field_permissions, user_gmail_tokens, user_module_permissions, whatsapp_accounts, whatsapp_conversations, whatsapp_messages, whatsapp_templates, tenant_domains):

- `DROP POLICY tenant_isolation_<tabela>` (permissiva atual).
- Recriar como **RESTRICTIVE** para `ALL`:
  ```
  is_super_admin(auth.uid())
  OR tenant_id = current_tenant_id()
  OR (current_tenant_id() IS NULL AND is_tenant_member(tenant_id, auth.uid()))
  ```
- Adicionar política RESTRICTIVE de `INSERT` exigindo
  `tenant_id = current_tenant_id() OR is_super_admin(auth.uid())`.

Resultado: a regra antiga de papel (admin/operador/módulo) continua valendo, mas **sempre** combinada com AND ao filtro de tenant.

### 2. Trigger `set_tenant_id_default`

`BEFORE INSERT` em cada tabela: se `NEW.tenant_id IS NULL`, preenche com `current_tenant_id()`. Evita quebrar inserts existentes do app que ainda não passam `tenant_id` explicitamente.

### 3. Validação após aplicar

- Logar como Diretor1 → `customers`, `leads`, `suppliers` devem vir **vazios**.
- Logar como usuário BSS Tour → continua vendo os 233 clientes / 638 fornecedores / 9 leads normalmente.
- Criar registro como Diretor1 → fica visível só dentro do tenant Diretor1.

## Fora de escopo

- Lógica de papéis (admin, diretor, operador) e de módulos permanece intacta.
- Dados existentes já estão corretamente marcados com `tenant_id` — sem backfill necessário.
- Fluxo de signup/convite já corrigido na rodada anterior.
