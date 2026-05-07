# Plano: Automação IA do Fluxo Comercial (CRM+ERP Turismo)

Baseado no estado atual do projeto (Lovable Cloud, Lovable AI Gateway já configurado, tabelas `leads`, `quotes`, `quote_items`, `bookings`, `suppliers`, `supplier_rates`, `interactions`, `tasks`, `ai_pending_actions` já existentes) e nas suas respostas: cotação mista (tabela + e-mail), proposta/invoice no sistema sem template padronizado, e nenhuma integração externa ainda.

---

## A) MAPA DO FUNIL COMERCIAL

```text
[1 Novo] → [2 Em Atendimento] → [3 Qualificado] → [4 Proposta]
   ↓             ↓                    ↓                ↓
[Operador]   [Operador+IA]      [Operador+IA]    [IA rascunho + Operador aprova]
                                                       ↓
[7 Faturado] ← [6 Aceito/Booking] ← [5 Negociação]
   ↑                ↑                    ↑
[IA invoice +   [IA cria booking    [IA follow-up
 aprovação]      + cotação final]    + simulações]
```

| Estágio | Critério passagem | Dono | Automação IA |
|---|---|---|---|
| 1. Novo | Lead criado (form/import/manual) | Operador | Enriquecimento, dedupe, score, distribuição |
| 2. Em Atendimento | 1ª interação registrada | Operador | Sugestão de mensagem, qualificação SPIN |
| 3. Qualificado | Destino+datas+pax+budget OK | Operador | Checklist de dados, sugestão de pacote |
| 4. Proposta | Quote gerado e enviado | IA→Operador | Rascunho proposta, cotação fornecedores, precificação |
| 5. Negociação | Cliente respondeu/contraproposta | IA→Operador | Simulação alternativa, follow-up, recálculo |
| 6. Aceito | `quote.status=accepted` | Operador | Cria booking, invoice rascunho |
| 7. Faturado | Invoice emitida | Operador | Cobrança, lembretes, handoff operações |

---

## B) TOP 15 FRICÇÕES & OPORTUNIDADES

| # | Onde | Sintoma | Causa | Solução IA |
|---|---|---|---|---|
| 1 | Lead novo | Demora 1h+ pra responder | Sem alerta/distribuição | Auto-assign por carga + push em 5min |
| 2 | Qualificação | Falta destino/datas/pax | Coleta manual ad-hoc | Checklist obrigatório + IA pede via WhatsApp |
| 3 | Cotação fornecedor | E-mails dispersos sem rastreio | Fora do sistema | E-mail estruturado + parser de resposta IA |
| 4 | Cotação | Tabela interna desatualizada | Sem validade | Validade por rate + alerta vencimento |
| 5 | Precificação | Margem negativa não detectada | Cálculo manual | Validador de margem mínima por categoria |
| 6 | Câmbio | Cotação travada em USD desatualizada | `exchange_rates` manual | Job diário de atualização |
| 7 | Proposta | Cada operador faz no seu jeito | Sem template | Template versionado + IA preenche |
| 8 | Proposta | Demora 2-4h para montar | Tudo manual | IA gera rascunho em <30s |
| 9 | Envio | Sem tracking de abertura | E-mail simples | Pixel + log em `interactions` |
| 10 | Follow-up | Esquecido após 3 dias | Sem SLA | `sla_settings` já existe → ativar IA pra criar tasks |
| 11 | Negociação | Recálculo manual a cada ajuste | Sem simulador | Simulador de cenários (-10%, +1 pax, etc.) |
| 12 | Aceite | Booking criado manualmente | Sem trigger | Auto-criar booking + tasks operacionais |
| 13 | Invoice | Sem padrão (PDF caseiro) | Sem gerador | Gerador de invoice (PDF) + parcelas |
| 14 | Cobrança | Sem lembrete vencimento | Manual | Job diário + WhatsApp/e-mail automático |
| 15 | Auditoria | "Quem mudou o quê?" | `activity_log` subutilizado | Painel de trilha + IA explica mudanças |

---

## C) CATÁLOGO DE AUTOMAÇÕES (eventos)

Cada automação grava em `ai_pending_actions` quando exige aprovação. Caso contrário, ação direta com log em `activity_log`.

### C1. `lead.created` → Triagem
- **Condições:** lead sem `assigned_to`
- **Ações:** dedupe (telefone/email vs `customers`+`leads`), score (0-100 baseado em destino/budget/canal), distribuir por carga ao operador menos ocupado, criar task "Primeiro contato em 30min"
- **Auto-executa:** sim (reversível)

### C2. `lead.qualified` (status muda) → Sugestão de Pacote
- **Condições:** `destination`, `pax`, `travel_dates`, `estimated_value` preenchidos
- **Ações IA:** busca semântica em `itineraries` (já há embeddings + `match_itineraries`), retorna top 3 pacotes; cria proposta de quote rascunho
- **Aprovação:** operador escolhe qual pacote

### C3. `quote.draft_requested` → Cotação Fornecedores
- **Trigger:** botão "Cotar fornecedores" ou IA proativa
- **Ações:** para cada item do quote, busca em `supplier_rates` (válido na data); se não houver, gera e-mail estruturado pros fornecedores cadastrados em `supplier_contacts`; salva pendências em `ai_pending_actions`
- **Aprovação:** envio de e-mail (1-clique aprovar lote)

### C4. `supplier.email_replied` → Parser
- **Trigger:** webhook Gmail / forward para inbox
- **Ações IA:** Lovable AI extrai preço/disponibilidade/condições do e-mail, popula `supplier_rates` rascunho
- **Aprovação:** operador valida valores

### C5. `quote.priced` → Validador de Margem
- **Condições:** margem < piso por categoria
- **Ações:** alerta + sugestão de ajuste; bloqueia envio se margem negativa
- **Aprovação:** se desconto > política, exige aprovação gerente (`has_role`)

### C6. `quote.ready_to_send` → Gerador de Proposta
- **Ações IA:** monta DOCX/PDF via template versionado + Lovable AI para textos personalizados (perfil cliente: lua-de-mel/família/luxo/corporate); salva em `quote_documents` (bucket `proposal-docs`)
- **Aprovação:** preview + 1-clique enviar

### C7. `proposal.sent` → Follow-up Inteligente
- **Cron:** D+2, D+5, D+10 sem resposta
- **Ações IA:** redige mensagem personalizada (WhatsApp/e-mail) com contexto da conversa; cria task
- **Aprovação:** operador revisa antes do envio

### C8. `quote.accepted` → Booking + Invoice Rascunho
- **Ações:** cria `bookings` + `booking_suppliers` + tasks operacionais (voucher, transfer, hotel); gera `invoice` rascunho
- **Aprovação:** operador confirma booking; emissão de invoice exige aprovação separada

### C9. `invoice.due_in_3d` → Cobrança
- **Cron diário**
- **Ações IA:** mensagem cordial de lembrete via canal preferido; escalona após vencimento
- **Aprovação:** lote único pelo financeiro

### C10. `cancellation.requested` → Análise de Política
- **Ações IA:** calcula penalidade (regras de fornecedor + política), gera resumo; **NUNCA executa cancelamento**
- **Aprovação:** sempre humana

---

## D) MOTOR DE COTAÇÃO

```text
Quote Item → Resolver(item) → 
  1. Cache: supplier_rates WHERE válido na data + categoria + cidade
  2. Match: rank por (preço, rating fornecedor, SLA, margem resultante)
  3. Se vazio: gerar pedido de cotação (e-mail estruturado a top N fornecedores)
  4. Inbox parser (IA): captura resposta → supplier_rates rascunho
  5. Operador aprova → vira cotação oficial
  6. Validade: rate.valid_until; alerta D-3
```

**Tratamento de incerteza:** quote item carrega flag `quote_status` (cached/pending/confirmed). Proposta pode ser gerada com `pending` mas marcada "sujeito a confirmação".

---

## E) MOTOR DE PRECIFICAÇÃO

```text
preço_venda = (custo × câmbio) × (1 + markup%) + taxas + fee_cartão
margem = (preço_venda − custo_total) / preço_venda
```

- **Markup default:** por `ref_service_categories.kind` (hotel 25%, transfer 30%, tour 35%, pacote 20%)
- **Validações:** margem mínima por categoria; desconto > 10% exige `gerente`; > 20% exige `diretor`
- **Câmbio:** tabela `exchange_rates` + job diário (Lovable Cloud cron)
- **Saída auditável:** JSON com breakdown anexado ao `quote.metadata` ("Explicação do cálculo")

---

## F) GERADOR DE PROPOSTA

**Estrutura padrão (template versionado):**
1. Capa (cliente, destino, datas, código quote)
2. Resumo executivo (texto IA personalizado por perfil)
3. Roteiro dia-a-dia (de `quote_items` ordenados)
4. Inclusos / Não inclusos
5. Condições comerciais (validade, pagamento, câmbio, cancelamento)
6. FAQ por tipo de viagem
7. Anexos (vouchers exemplo, mapa)

**Variantes de tom:** formal, inspiracional (já existem em `GenerateDocDialog`).
**Componentes dinâmicos:** lua-de-mel (jantares românticos), família (atividades kids), luxo (transferes privativos), corporate (faturas detalhadas).
**Validações pré-envio:** datas coerentes, sem placeholders `{{...}}`, moeda única, validade futura, nome cliente OK.
**Tecnologia:** já há `generate-proposal-doc` edge function — estender para usar template + IA + checklist.

---

## G) GERADOR DE INVOICE

**Nova tabela:** `invoices` (number, booking_id, customer_id, status, items, parcels, total, currency, issued_at, due_at).

**Estados:** `draft → pending_approval → issued → paid → overdue → cancelled` (cada transição loga em `activity_log`).

**Quando criar rascunho:** trigger `quote.accepted` ou após sinal recebido.

**Itens/parcelas:** entrada % + saldo (configurável), vencimento, instruções de pagamento.

**Pagamento (futuro):** começar com instruções manuais (PIX/dados bancários); depois plugar Stripe/Asaas.

**Reversão:** apenas cancelamento de invoice issued exige aprovação `diretor`.

---

## H) FILA DE AÇÕES DA IA (UX)

Nova rota `/inbox-ia` (e card no dashboard) lendo `ai_pending_actions`:

```text
┌──────────────────────────────────────────────┐
│ 🟡 Alta · Lead AB030526 · há 3min            │
│ Sugestão: Enviar proposta (Buenos Aires 4n)  │
│ [Preview] · usou: itinerário X, fornecedor Y │
│ Risco: margem 18% (mín 15%) ✓                │
│ [Aprovar] [Editar] [Rejeitar] [Mais dados]   │
└──────────────────────────────────────────────┘
```

- **Score:** urgência (SLA) + impacto (valor estimado) + reversibilidade
- **Modo lote:** marcar várias propostas/follow-ups e aprovar com 1 clique (apenas ações low-risk)
- **Trilha:** quem aprovou, mudanças, snapshot do payload

---

## I) BACKLOG PRIORIZADO

### P0 — Fundação (2 sprints)
| Item | Esforço | KPI | Dep. |
|---|---|---|---|
| Tabela `invoices` + estados + RLS | M | — | — |
| Engine de precificação (lib + validador) | M | % propostas margem ≥ mín | — |
| Template proposta versionado + checklist | M | tempo médio envio < 15min | — |
| Fila `/inbox-ia` (UI + score) | L | % ações aprovadas em <2min | `ai_pending_actions` |
| Auto-distribuição lead + score | S | tempo 1ª resposta < 10min | — |

### P1 — Cotação & IA (2 sprints)
| Item | Esforço | KPI |
|---|---|---|
| E-mail estruturado a fornecedor + parser IA | L | % cotações automatizadas |
| Sugestão de pacote (semântica) no quote | M | conversão qualificado→proposta |
| Follow-up automático D+2/5/10 | M | taxa resposta após follow-up |
| Job câmbio diário | S | % quotes com câmbio < 24h |
| Validador desconto + escalonamento por role | S | % desconto fora política |

### P2 — Pagamento & Crescimento
| Item | Esforço | KPI |
|---|---|---|
| Integração Stripe/Asaas (PIX/cartão) | L | % invoices pagas no app |
| WhatsApp Business API | L | tempo médio resposta cliente |
| Gmail OAuth + parser inbox fornecedor | L | cotações capturadas via e-mail |
| Painel KPIs comerciais (conversão por estágio, margem média, SLA) | M | — |
| Assinatura digital (Clicksign) na proposta | M | tempo aceite |

**Rollout:** piloto com 1 operador (2 semanas) → 50% time → geral, com kill-switch por automação em `settings`.

**Riscos & mitigação:**
- IA aluciar preço → validador determinístico + bloqueio
- Spam de follow-up → throttle por lead + opt-out
- LGPD em e-mails de cotação → mascarar dados pessoais do cliente
- Custo Lovable AI → cache de respostas + modelos lite (`gemini-2.5-flash-lite`) para tarefas simples

---

## Próximo passo sugerido

Confirme se quer que eu inicie pelo **P0** (Fundação). Posso começar criando:
1. Migração da tabela `invoices` + RLS
2. Lib de precificação `src/lib/pricing-engine.ts`  
3. Rota `/inbox-ia` consumindo `ai_pending_actions`

Ou prefere outra ordem (ex.: começar pelo gerador de proposta com template, já que `generate-proposal-doc` existe)?
