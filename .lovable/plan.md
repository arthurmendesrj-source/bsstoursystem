## Avaliação geral do CRM

Stack: TanStack Start + Supabase (Lovable Cloud) + Lovable AI Gateway. Módulos ativos: Leads, Clientes, Fornecedores, Funil, Cotações/Propostas, Reservas, Pacotes, Workspace, Email (Gmail), Atividades, Configurações, Usuários.

### Pontos fortes
- Schema bem normalizado (leads, customers, suppliers, quotes/items, bookings, tasks, emails, interactions).
- RLS consistente em todas as tabelas + roles via `has_role` (admin / vendedor / operacional).
- Auto-código de entidades (`generate_entity_code`) por usuário/mês.
- IA já integrada (Lovable AI) para análise de email, proposta, ditado.
- i18n PT/EN/ES centralizado.
- Triagem manual de email (recém-implementada) respeita o princípio "operador decide".

### Lacunas e riscos
1. **Sem orquestração entre módulos.** Lead → Cotação → Reserva → Voucher exige cliques manuais e duplicação de digitação. Não há ação "converter lead em cotação" nem "cotação aprovada → criar reserva".
2. **Atividades soltas.** `tasks` não é gerada por mudanças de estágio do funil (ex: lead "novo" sem follow-up em 48h não vira atividade). Sem SLA/lembretes.
3. **Pipeline sem gatilhos.** Mudança de `lead.status` não registra histórico nem dispara ação. `quote.status='aprovada'` não gera nada.
4. **Email ↔ entidades fraco.** Vinculação de email ao lead/cliente é manual; não há matching automático por `from_email` para sugerir vínculo (sem criar nada).
5. **Notificações inexistentes.** Sem feed de "para você", sem badge de pendências, sem email/push para o operador.
6. **Dashboard pobre.** Não mostra KPIs operacionais (conversão funil, ticket médio, leads sem ação, cotações vencendo, reservas próximas).
7. **Fornecedores desconectados de Reservas.** `booking_suppliers` existe mas sem fluxo "solicitar confirmação por email" / "registrar OK".
8. **Vouchers/documentos sem automação.** Reserva confirmada não gera voucher draft.
9. **Linter Supabase**: 14 funções `SECURITY DEFINER` sem `REVOKE EXECUTE FROM public/authenticated` — alerta a tratar.
10. **Logs de auditoria ausentes.** Não há tabela `audit_log` para rastrear quem mudou status/valor de cotação, lead etc.
11. **Atividades manuais sem fluxo.** Botão "Iniciar/Pausar" existe, mas sem timer visível na barra superior; difícil ter consciência do tempo gasto.

---

## Proposta — fases incrementais

> Princípio em todas as fases: **a IA sugere, o operador confirma**. Nenhuma escrita em entidade-chave (lead, cotação, reserva, email enviado) ocorre sem clique explícito.

### Fase 1 — Conexões entre módulos (alta prioridade)

**1.1. Conversões assistidas com 1 clique**
- Botão **"Gerar cotação"** na ficha do lead → abre editor de cotação já com `lead_id`, `customer_id`, moeda, destino, datas e valor estimado pré-preenchidos. Operador revisa e salva.
- Botão **"Converter em reserva"** na cotação aprovada → abre formulário de reserva com itens copiados de `quote_items`, totais, cliente e fornecedores sugeridos.
- Botão **"Gerar voucher"** na reserva confirmada → abre draft de voucher (código, itinerário a partir dos itens, contato de emergência do cliente).

**1.2. Sugestão de vínculo de email**
- Ao receber email novo (sem ação automática), painel de email mostra chip **"Possível lead: João Silva (cód L0125)"** quando `from_email` casa com `customers.email` ou `leads.email`. Botão **"Vincular"** confirma manualmente.

**1.3. Atividades com origem rastreada**
- Já existe `source` (manual/email/lead). Adicionar `source='quote'`, `source='booking'`, `source='supplier'` para tarefas geradas por outros fluxos quando o operador confirma.

### Fase 2 — Histórico, SLA e notificações

**2.1. Tabela `activity_log`** (auditoria leve, escrita por triggers em mudanças de status):
- `entity_type` (lead/quote/booking/supplier), `entity_id`, `field`, `from_value`, `to_value`, `actor_id`, `at`.
- Linha do tempo na ficha de cada entidade.

**2.2. SLA de leads**
- Coluna `last_action_at` no lead (atualizada por trigger quando se cria interaction/task/quote vinculada).
- Painel **"Sem ação há X dias"** no dashboard. Ao abrir, botão **"Criar follow-up"** abre o diálogo de atividade pré-preenchido — não cria sozinho.

**2.3. Centro de notificações in-app**
- Tabela `notifications` (user_id, kind, payload, read_at).
- Realtime via supabase channel; sino na AppShell mostra contador.
- Eventos: cotação prestes a vencer, atividade vencendo hoje, novo email vinculado a lead atribuído a você, mudança de status feita por outro usuário em entidade sua.

### Fase 3 — Dashboard operacional

- KPIs: leads novos (semana/mês), taxa de conversão por estágio, ticket médio, cotações abertas/vencidas, reservas próximas (7/30 dias), tempo médio em "negócio" vs "suporte" (vem de `tasks.time_spent_minutes`).
- Lista "Para hoje" agregando: tarefas vencendo, leads sem follow-up, cotações expirando.
- Filtro por usuário (admin) e por período.

### Fase 4 — Workflow de fornecedores na reserva

- Em `booking_suppliers`, botão **"Solicitar confirmação"** → abre composer de email com template (datas, pax, serviço); ao enviar, registra `status='aguardando'` e cria atividade ao operador.
- Resposta do fornecedor (email vinculado) → IA detecta confirmação/recusa e sugere atualização → operador clica para mudar `confirmation_code`/`status`.

### Fase 5 — Cotação inteligente

- Ao adicionar item, IA sugere markup baseado em histórico (média do `markup_pct` dos últimos itens da mesma `category`/cidade). Sugere — não aplica.
- Ao mudar `quote.status='aprovada'` → modal "Deseja criar reserva agora?" (Fase 1.1).
- Validade da cotação → atividade automática 2 dias antes (sugerida no painel, não criada silenciosamente).

### Fase 6 — Higiene e segurança

- Migration: `REVOKE EXECUTE ON FUNCTION ... FROM public, anon;` para todas as funções `SECURITY DEFINER` que não devem ser chamadas pelo cliente diretamente.
- Adicionar índices: `tasks(assigned_to, completed)`, `tasks(due_date)`, `leads(status, assigned_to)`, `emails(from_email)`, `quotes(status, valid_until)`.
- Política de retenção: `emails` antigos arquivados após 12 meses (movidos para tabela fria) — opcional.

### Fase 7 — Qualidade de vida

- Timer global de atividade ativa fixo na AppShell (mostra título + cronômetro), permitindo Pausar/Concluir sem sair da tela atual.
- Busca global (cmd+K) por código (L0125, C0125…), nome, email, telefone — abre direto a ficha.
- Atalhos de teclado em listas (j/k navegação, enter abrir).

---

## Arquitetura sugerida (resumo visual)

```text
                  ┌──────────────┐
   Email (Gmail)  │  EmailPanel  │  IA: resume + sugere
                  └──────┬───────┘
                         │ operador escolhe
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           Lead       Tarefa     Ignorar
             │
             │ "Gerar cotação"
             ▼
          Cotação ──"aprovar"──► Reserva ──confirmar──► Voucher
             │                      │
             │                      └─► booking_suppliers (solicitar OK)
             ▼
        activity_log + notifications + tasks (sempre via confirmação)
```

---

## O que entregar primeiro (recomendação)

Sugiro começar pela **Fase 1.1 + 1.2** (conversões 1-clique e sugestão de vínculo de email) e **Fase 2.3** (notificações in-app). É o conjunto que mais reduz cliques no dia-a-dia sem mudar o modelo mental do operador. As demais fases entram em ordem conforme uso.

Diga qual fase (ou item específico) implementar primeiro.