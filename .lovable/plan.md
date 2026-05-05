## Simulação do fluxo (Lead → Booking → Voucher)

O sistema **não possui módulo de invoices** — o fluxo termina em `vouchers`. Vou simular ponta-a-ponta o que existe hoje, gerando dados reais no banco com o seu usuário (`Arthur Mendes`, admin) e te dar um roteiro para validar cada etapa na UI.

### Parte 1 — Seed automático (SQL via insert tool)

Tudo atribuído ao seu user_id `6f3cba4e-6ad0-40d2-b34a-a521fcd85769`:

1. **Customer** "Cliente Simulação" (PF, e-mail/telefone fake).
2. **Supplier** "Fornecedor Simulação" (categoria `outro`).
3. **Package** "Pacote Simulação - Paris 7 dias" (BRL 8.000, ativo).
4. **Lead** "Lead Simulação" → `assigned_to` = você → status `novo`
   - dispara trigger `on_lead_event` → push `lead_assigned` (Fase 6).
5. **Update do lead** → status `qualificado` → push `lead_status_changed`.
6. **Quote** vinculado ao lead/cliente, com 2 `quote_items`:
   - hotel: 1 quarto × 6 noites, custo 500, markup 30%
   - serviço: 2 pax × 2 trechos (transfer), custo 80, markup 25%
   - totais calculados conforme `proposal-totals.ts`.
7. **Booking** com status `pre_reserva` → update para `confirmada`.
8. **booking_pax** (cliente como primary) + **booking_supplier** (com custo).
9. **Voucher** gerado (código `VYYMMDD…`).
10. **Task** com `due_date` em ~30min e outra já vencida → ao bater o cron `task-due` dispara `task_due_soon` / `task_overdue`.

Cada passo retorno os IDs gerados.

### Parte 2 — Validação na UI (roteiro guiado)

Após o seed, conferir nesta ordem:

1. `/leads` → ver "Lead Simulação" no status qualificado, código gerado (ex.: `AM01XXYY`).
2. `/leads/{id}` → timeline com `created` e `status_changed`.
3. `/alerts/history` → 2 logs de push (`lead_assigned`, `lead_status_changed`).
4. `/alerts` → contadores atualizados; SLA do lead começando a contar.
5. `/funnel` → lead aparece na coluna "qualificado".
6. `/customers` → "Cliente Simulação" listado.
7. `/packages` → pacote ativo.
8. `/suppliers` → fornecedor listado.
9. **Quotes** (via `/leads/{id}` → aba propostas) → quote rascunho com 2 itens e total correto.
10. `/bookings` → booking confirmado com voucher visível (badge com código).
11. `/alerts/preferences` → confirmar que toggles existem para os 4 eventos.
12. `/alerts/debug` (admin) → opcional: disparar manualmente `task_due_soon` para o seu user.

### Parte 3 — Limpeza (opcional)

Ao final, posso gerar um script de DELETE encadeado (voucher → booking_* → booking → quote_items → quote → lead → customer → supplier → package → tasks) caso queira remover tudo depois.

### Observações

- Não vou criar tabela de invoices/payments (escopo escolhido foi "só simular o fluxo existente"). Se depois quiser o módulo financeiro, peço em uma próxima rodada.
- Push notifications reais só chegam se você estiver com a inscrição ativada no navegador; mesmo sem isso, os logs em `notification_logs` são gravados e visíveis em `/alerts/history`.
- Os triggers de lead já estão ativos; o seed vai produzir os webhooks automaticamente.
