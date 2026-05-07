## Diagnóstico do vídeo atual

Os PNGs foram analisados:
- **Diretor**: nunca chegou a logar — todos os shots dele estão na tela `/login`. Por isso nenhum lead foi criado por ele.
- **Gerente / Operador**: a sessão da Alexandra ficou "presa" — o re-login do Operador não trocou usuário (mesmo footer `alexandra.ermolaeva`).
- **Coordenador**: travou em "Carregando…".

Causa raiz: `capture.mjs` usa um único contexto de browser e não aguarda o login real concluir antes de seguir os shots. Além disso, o roteiro hoje **assume** dados que não existem (lead criado pelo diretor, lead aprovado pelo gerente etc.) — quando o passo anterior falha, o resto do roteiro vira lixo.

## Reformulação completa

### Princípios
1. **Cada papel = contexto de browser isolado** (`browser.createBrowserContext()`), descartado ao fim. Zera cookies/localStorage entre papéis.
2. **Login validado**: após submit, aguardar `location.pathname !== '/login'` **e** seletor estável da sidebar visível. Se falhar em 30s, **abortar tudo** com erro explícito (não seguir gerando frames-lixo).
3. **Roteiro guiado por dados reais**:
   - Antes de gravar, **ler de fato a inbox de cada usuário** via `supabase` (service role) com `WHERE recipient_user_id = ?`.
   - Selecionar emails reais para cada fluxo. Se faltar email adequado para algum papel, **semear** 1 email `DEMO —` específico para aquele papel (script de seed roda antes do capture).
4. **IDs encadeados**: o ID do lead criado pelo Diretor é capturado da URL (`/leads/$id`) e injetado no fluxo do Gerente. Mesmo para Gerente→Operador e leads aprovados→Coordenador.
5. **Cada ação executada de fato** (não só "navegar e printar"): clicar botões reais (Triagem IA, Gerar orçamento IA, Preencher com IA, Gerar programa, Gerar invoice, Gerar Bíblia, Sugerir mensagem). Screenshot **após** a ação completar (toast de sucesso ou novo estado visível).
6. **IA sempre que possível**: cada papel usa pelo menos 2 botões de IA reais. Onde o botão visual ainda não existe (Gerar invoice, Gerar Bíblia, Sugerir mensagem ao fornecedor, Gerar orçamento no header do lead, Gerar programa turístico no itinerário), adicionar **stubs visuais** que disparam ação real existente + toast "⚡ IA processou" — sem mudar regra de negócio.

---

## Roteiro definitivo (encadeado por dados)

### Pré-flight (antes do capture)
- `seed.mjs`:
  1. Lê inbox de cada user. Para cada papel, garante 1 email pendente:
     - **Diretor** (Agrafena): 1 email administrativo + 1 email de cotação grande (família, Portugal).
     - **Gerente** (Alexandra): 1 email de cotação simples (bate-volta) — só será usado se ela ainda não tiver um email de cotação.
  2. Verifica que existem fornecedores cadastrados (para a IA preencher proposta).
  3. Sanity check: faz `signInWithPassword` em **headless node** com os 4 emails+`Sim@12345` antes de abrir browser. Se algum falhar, aborta com mensagem clara.

### Diretor — Agrafena (azul `#6366f1`) — 13 shots
**Fluxo A — Email interno → atividade pessoal (6)**
1. `/login` → preencher → submit (não conta como shot)
2. `/email` inbox visível
3. abre email administrativo
4. clica **Triagem IA** → diálogo aberto com classificação "interna/atividade" ⚡
5. clica "Criar atividade" → form pré-preenchido pela IA ⚡
6. salva atividade → toast sucesso
7. `/activities` → atividade visível, marca como concluída

**Fluxo B — Email cotação → triagem → lead → atribui Gerente (7)**
8. volta `/email`, abre email de cotação grande
9. **Triagem IA** classifica como "cotação" ⚡
10. clica "Criar Lead" → form pré-preenchido pela IA (cliente, destino, pax, datas, valor) ⚡
11. seleciona Gerente Alexandra como assignee
12. salva → **captura `leadId` da URL** (`/leads/{id}`)
13. screenshot do lead recém-criado

### Gerente — Alexandra (verde `#10b981`) — 15 shots
**Fluxo A — Continuar lead do Diretor (`leadId` capturado) (9)**
14. login Alexandra → `/leads`
15. abre lead criado pelo Diretor
16. clica **Gerar orçamento com IA** ⚡ (stub: cria proposta vazia + toast)
17. ProposalEditor aberto
18. **Preencher com IA (DictateItemsPanel)** ⚡ — gera itens reais (hotel/transfer/tour)
19. aba Itinerário → **Gerar programa turístico com IA** ⚡ (stub: chama edge `process-itinerary`)
20. **GenerateDocDialog** → preview do PDF
21. clica Enviar → status muda para "Enviada"
22. marca lead como **Aprovada/Ganha**

**Fluxo B — Triagem email simples → lead p/ Operador (6)**
23. `/email` inbox
24. abre email de cotação simples
25. **Triagem IA** ⚡
26. "Criar Lead" pré-preenchido (valor menor) ⚡
27. atribui ao Operador Sergei → salva → captura novo `leadId`
28. `/leads` confirmação

### Operador — Sergei (laranja `#f59e0b`) — 8 shots
29. login Sergei → `/leads`
30. abre lead criado pelo Gerente (id capturado)
31. **Gerar orçamento com IA** ⚡
32. **Preencher com IA** ⚡
33. **Gerar programa turístico com IA** ⚡
34. GenerateDocDialog preview ⚡
35. Enviar ao cliente
36. marca como Aprovada

### Coordenador — Mikhail (vermelho `#ef4444`) — 9 shots
Atua sobre os 2 leads aprovados (Volkov + bate-volta).
37. login Mikhail → `/bookings`
38. abre booking #1 (Volkov)
39. **Gerar invoice com IA** ⚡ (stub que abre dialog de invoice + toast)
40. **Sugerir mensagem ao fornecedor com IA** ⚡ (stub via assistant)
41. anexa vouchers (mock confirmado)
42. **Gerar Bíblia da viagem com IA** ⚡ (chama `BibliaActivityDialog` real)
43. fecha booking #1
44. abre booking #2 → repete invoice+bíblia rápido ⚡
45. lista `/bookings` com ambas "Pronta para viagem"

**Total: 45 shots × 3s + 4 cards × 2s ≈ 2:23** (ajustável)

---

## Implementação técnica

### Arquivos a (re)escrever
1. `/tmp/demo-runner/seed.mjs` — sanity de credenciais + seed de emails se necessário (usa `service_role`).
2. `/tmp/demo-runner/flows.mjs` — roteiro com **placeholders** para IDs encadeados (`<DIRECTOR_LEAD_ID>`, `<MANAGER_LEAD_ID>`).
3. `/tmp/demo-runner/capture.mjs` — reescrita completa:
   - função `loginAs(email)` com waitForFunction de pathname e seletor sidebar
   - contexto isolado por papel
   - executa cliques reais e aguarda toast/seletor pós-ação
   - extrai `leadId` da URL e injeta nos fluxos seguintes
   - se qualquer login falhar → `process.exit(1)` (não gera vídeo lixo)
4. `src/components/leads/AiBudgetButton.tsx`, `src/components/proposal/AiItineraryButton.tsx`, `src/components/booking/AiInvoiceButton.tsx`, `src/components/booking/AiBibliaButton.tsx`, `src/components/booking/AiSupplierMessageButton.tsx` — stubs visuais com chip "⚡ IA" que disparam ação real existente.
5. `/tmp/remotion/src/MainVideo.tsx` — mantém estrutura atual; só recebe novo `frames.json`.

### Pipeline
```
seed.mjs  →  capture.mjs (45 PNGs + frames.json)  →  remotion render  →  /mnt/documents/demo-fluxo.mp4
```

### Salvaguardas
- Verificação visual automática: comparar hash do PNG do `/login` com cada shot capturado; se algum shot `≥ shot 2` for igual ao login → abortar.
- Rodar `seed.mjs` standalone primeiro para validar credenciais antes de gastar tempo no capture.

---

## Confirmações antes de executar

1. Ok eu **adicionar os 5 botões-stub** de IA (Gerar orçamento, Programa, Invoice, Bíblia, Mensagem ao fornecedor) — sem alterar lógica de negócio?
2. Ok **semear emails `DEMO —`** se a inbox real de algum usuário não tiver email adequado para o fluxo?
3. Manter ~2:23 de duração ou prefere comprimir (ex.: 2s por shot = ~1:40)?
