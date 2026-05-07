## Roteiro do vídeo demo — versão ampliada

### Regras de tempo
- **Cada frame/screenshot = 3 segundos** (90 frames a 30fps)
- **Cards de transição entre papéis** = 2s (60 frames)
- IA destacada com chip animado **"⚡ IA"** + legenda em negrito iniciada com `IA:`
- Todos os fluxos partem de **emails já existentes** na caixa de entrada (sem criar emails novos)

### Cálculo total de duração

| Bloco | Frames (shots) | Segundos |
|---|---|---|
| Card Diretor | — | 2 |
| Diretor — Fluxo A (Atividade pessoal) | 6 | 18 |
| Diretor — Fluxo B (Triagem → Lead p/ Gerente) | 7 | 21 |
| Card Gerente | — | 2 |
| Gerente — Fluxo A (continuar lead do Diretor → proposta aprovada) | 9 | 27 |
| Gerente — Fluxo B (Triagem email pequeno → Lead p/ Operador) | 6 | 18 |
| Card Operador | — | 2 |
| Operador — Continuar lead do Gerente → proposta aprovada | 8 | 24 |
| Card Coordenador | — | 2 |
| Coordenador — Operação pós-aprovação (invoice, reserva, voucher, bíblia) | 9 | 27 |
| **Total** | **45 shots + 4 cards** | **≈ 2 min 43 s** |

---

## 1. DIRETOR — Agrafena Svetlova (azul `#6366f1`)

### Fluxo A — Atividade pessoal (6 shots / 18s)
Email já existente: tipo administrativo / interno (ex.: "Reunião de fechamento mensal").

| # | Tela | Ação | IA | Legenda |
|---|---|---|---|---|
| 1 | `/email` | Abre inbox | — | "Diretor abre a caixa de entrada" |
| 2 | EmailPanel | Abre email administrativo | — | "Email interno selecionado" |
| 3 | dialog Triagem | Aciona **Triagem IA** | ✅ | "**IA:** assunto interno, sugere criar atividade" |
| 4 | form Atividade | Confirma — atividade auto-preenchida, atribuída a si mesmo | ✅ | "**IA:** atividade pré-preenchida" |
| 5 | `/activities` | Executa a atividade (marca subitens) | — | "Diretor executa a atividade" |
| 6 | activity card | Marca como **Concluída** | — | "Atividade finalizada" |

### Fluxo B — Triagem de cotação → Lead para Gerente (7 shots / 21s)
Email já existente: pedido de cotação (ex.: "Família Volkov — Portugal 6 dias").

| # | Tela | Ação | IA | Legenda |
|---|---|---|---|---|
| 1 | `/email` | Volta à inbox | — | "Novo email de cliente" |
| 2 | EmailPanel | Abre email de cotação | — | "Solicitação de cotação aberta" |
| 3 | dialog Triagem | Aciona **Triagem IA** | ✅ | "**IA:** classifica como cotação" |
| 4 | resultado IA | IA recomenda **Criar Lead** | ✅ | "**IA recomenda:** gerar Lead" |
| 5 | form Lead | Lead pré-preenchido (cliente, destino, pax, datas, valor estimado) | ✅ | "**IA:** lead pré-preenchido" |
| 6 | select assignee | Atribui ao **Gerente Alexandra** | — | "Atribuído à Gerente Alexandra" |
| 7 | `/leads` | Lead criado e visível na fila | — | "Lead encaminhado" |

---

## 2. GERENTE — Alexandra Ermolaeva (verde `#10b981`)

### Fluxo A — Dar continuidade ao Lead do Diretor → Proposta aprovada (9 shots / 27s)

| # | Tela | Ação | IA | Legenda |
|---|---|---|---|---|
| 1 | `/leads` | Abre lista, vê lead recebido | — | "Gerente recebe novo lead" |
| 2 | `/leads/$id` | Abre o lead | — | "Analisa briefing do cliente" |
| 3 | header do lead | Clica **Gerar orçamento com IA** | ✅ | "**IA:** monta orçamento base" |
| 4 | ProposalEditor | Itens sugeridos pela IA (hotel, transfer, tours) | ✅ | "**IA:** itens sugeridos" |
| 5 | DictateItemsPanel | Clica **Preencher proposta com IA** | ✅ | "**IA:** preenche fornecedores e valores" |
| 6 | aba Itinerário | Clica **Gerar programa turístico com IA** | ✅ | "**IA:** programa dia-a-dia (6 dias)" |
| 7 | GenerateDocDialog | Pré-visualiza PDF da proposta | ✅ | "Proposta finalizada" |
| 8 | botão Enviar | Envia proposta ao cliente | — | "Proposta enviada" |
| 9 | status | Marca como **Aprovada** (cliente aceitou) | — | "Cliente aprovou a proposta" |

### Fluxo B — Triagem email pequeno → Lead para Operador (6 shots / 18s)
Email já existente: cotação simples / valor menor (ex.: "Bate-volta São Paulo–Campos do Jordão, casal").

| # | Tela | Ação | IA | Legenda |
|---|---|---|---|---|
| 1 | `/email` | Abre inbox | — | "Gerente abre inbox" |
| 2 | EmailPanel | Abre email de cotação simples | — | "Pedido de baixo valor" |
| 3 | dialog Triagem | **Triagem IA** | ✅ | "**IA:** cotação de baixo valor" |
| 4 | form Lead | Lead pré-preenchido + valor estimado baixo | ✅ | "**IA:** lead simplificado" |
| 5 | select assignee | Atribui ao **Operador Sergei** | — | "Encaminha ao Operador" |
| 6 | `/leads` | Lead atribuído | — | "Lead direcionado ao Operador" |

---

## 3. OPERADOR — Sergei Koroliov (laranja `#f59e0b`)

### Fluxo único — Continuar lead do Gerente → Proposta aprovada (8 shots / 24s)

| # | Tela | Ação | IA | Legenda |
|---|---|---|---|---|
| 1 | `/leads` | Abre lista, vê lead recebido | — | "Operador recebe lead simples" |
| 2 | `/leads/$id` | Abre lead | — | "Analisa pedido" |
| 3 | header | Clica **Gerar orçamento com IA** | ✅ | "**IA:** orçamento gerado" |
| 4 | DictateItemsPanel | **Preencher proposta com IA** | ✅ | "**IA:** itens completos" |
| 5 | aba Itinerário | **Gerar programa turístico com IA** | ✅ | "**IA:** programa montado" |
| 6 | GenerateDocDialog | Preview PDF | ✅ | "Proposta pronta" |
| 7 | Enviar | Envia ao cliente | — | "Proposta enviada" |
| 8 | status | Marca **Aprovada** | — | "Aprovada pelo cliente" |

---

## 4. COORDENADOR — Mikhail Kutuzov (vermelho `#ef4444`)

### Fluxo único — Operação pós-aprovação dos 2 leads (9 shots / 27s)
Atua sobre os **dois leads aprovados** (Gerente e Operador) — mostra o ciclo completo.

| # | Tela | Ação | IA | Legenda |
|---|---|---|---|---|
| 1 | `/bookings` | Abre fila de aprovados | — | "Coordenador abre reservas aprovadas" |
| 2 | booking #1 (Volkov) | Abre reserva | — | "Reserva da família Volkov" |
| 3 | aba Invoice | Clica **Gerar invoice com IA** | ✅ | "**IA:** invoice gerado" |
| 4 | aba Reserva fornecedor | **Sugerir mensagem ao fornecedor com IA** + envia | ✅ | "**IA:** redige pedido aos fornecedores" |
| 5 | aba Vouchers | Anexa vouchers confirmados | — | "Vouchers anexados" |
| 6 | aba Bíblia | Clica **Gerar Bíblia da viagem com IA** (programa + contatos + horários) | ✅ | "**IA:** Bíblia da viagem montada" |
| 7 | botão Fechar reserva | Fecha booking #1 | — | "Reserva #1 finalizada" |
| 8 | booking #2 (Campos do Jordão) | Repete invoice + voucher + bíblia (acelerado, 1 shot) | ✅ | "**IA:** segunda reserva concluída" |
| 9 | `/bookings` (lista) | Ambas reservas com status "Pronta para viagem" | — | "Operação concluída — clientes prontos" |

---

## Destaques de IA no vídeo (chip "⚡ IA")
1. Triagem de email (Diretor x2, Gerente x1)
2. Atividade auto-preenchida (Diretor)
3. Lead pré-preenchido (Diretor, Gerente)
4. Orçamento base (Gerente, Operador)
5. Preenchimento de proposta com fornecedores (Gerente, Operador)
6. Programa turístico dia-a-dia (Gerente, Operador)
7. Invoice (Coordenador)
8. Mensagem ao fornecedor (Coordenador)
9. Bíblia da viagem (Coordenador)

→ **9 momentos de IA** ao longo do vídeo, cobrindo todo o ciclo comercial + operacional.

---

## Pré-condições (já existem na base ou precisam ser semeadas)
- ✅ 4 emails existentes na inbox do Diretor (administrativo + cotação Volkov) e Gerente (cotação simples). **Confirmar com você** se já há emails adequados — caso contrário, semeio 3 emails fictícios prefixados `DEMO —` antes da gravação.
- Botões com IA já existentes: Triagem (`EmailPanel`), Gerar doc (`GenerateDocDialog`), Ditar itens (`DictateItemsPanel`).
- Botões com IA que **podem precisar de stub visual** (apenas para a demo, sem alterar lógica): "Gerar orçamento com IA" no header do lead, "Gerar programa turístico com IA" na aba itinerário, "Gerar invoice com IA", "Gerar Bíblia com IA", "Sugerir mensagem ao fornecedor com IA". Posso adicionar esses botões como stubs que disparam ação real existente + um toast "IA processou" — sem mudar regra de negócio.

## Pipeline de produção (após aprovação deste roteiro)
1. `flows.mjs` — declara os 45 shots literais acima (selectors, captions, aiBadge).
2. `capture.mjs` (puppeteer-core + `/bin/chromium`) — loga cada papel com `Sim@12345`, percorre os shots, salva PNGs em `/tmp/demo/`.
3. `MainVideo.tsx` (Remotion) — lê `frames.json`, renderiza cada shot por **90 frames** com Ken Burns, legenda e chip IA quando `aiBadge:true`; cards de transição de **60 frames** entre papéis.
4. Render → `/mnt/documents/demo-fluxo.mp4` (1920×1080, 30fps, ~2:43).
5. Cleanup SQL opcional para registros `DEMO —`.

---

**Confirmações antes de codar**:
1. Ok adicionar os botões-stub de IA listados acima (Gerar orçamento, programa, invoice, bíblia, mensagem fornecedor)?
2. Ok semear emails `DEMO —` se não houver emails adequados na inbox?
3. Mantém duração de **~2:43** (45 shots × 3s + cards) ou prefere mais curto/comprimido?
