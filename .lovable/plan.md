# Plano: regravar `demo-instrutivo.mp4` com as 4 contas reais

## Contexto

Agora temos credenciais válidas e papéis atribuídos no banco:

| E-mail | Senha | Papel (DB) | Cena |
|---|---|---|---|
| `agrafena.svetlova@sim.local` | `Sim@12345` | `diretor` | Cena 1 — Diretora |
| `alexandra.ermolaeva@sim.local` | `Sim@12345` | `gerente` | Cena 2 — Gerente |
| `mikhail.kutuzov@sim.local` | `Sim@12345` | `supervisor` | Cena 3 — Coordenador |
| `sergei.koroliov@sim.local` | `Sim@12345` | `operador` | Cena 4 — Operador |

Observação: o usuário pediu "coordenador" para Mikhail, mas o enum `app_role` no banco usa `supervisor`. Vou tratar a cena 3 como "Coordenador (supervisor)" nas legendas, já que é o papel real que dá as permissões.

## O que vou fazer

1. **Reinstalar dependências de gravação no sandbox** (`puppeteer`, `chromium` headful via xvfb, `ffmpeg` já presente).
2. **Recriar `record2.mjs`** em `/tmp/demo-runner/` com:
   - cursor vermelho visível e movimento real do mouse;
   - login direto com as 4 contas acima (sem signup);
   - checkpoint por cena em `/tmp/demo-record/checkpoint.json` para retomar se o sandbox cair;
   - 3 retries por etapa crítica + `expect()` antes de cliques.
3. **Roteiro de cada cena** (ações reais, não scroll vazio):
   - **Diretora**: dashboard gerencial → Triagem IA → criar lead novo → atribuir à Gerente → logout.
   - **Gerente**: abrir o lead recebido da Diretora → criar atividade/proposta → enviar para Operador → logout.
   - **Coordenador (Mikhail)**: revisar funil dos subordinados → aprovar proposta → logout.
   - **Operador**: abrir lead recebido → gerar invoice/reserva → registrar na Bíblia → logout.
4. **Encadear as cenas em uma única gravação WebM** (`/tmp/demo-record/full.webm`).
5. **Converter para MP4** 1440x900 30fps H.264 → `/mnt/documents/demo-instrutivo.mp4` (sobrescreve o anterior; salvo o atual como `demo-instrutivo_v1.mp4` para comparação).
6. **QA obrigatório**: extrair frames a cada 15s e inspecionar — cursor visível, legenda da cena, login real, ação executada, sem tela estática.
7. Entregar via `<lov-artifact>`.

## Critério de pronto

- Vídeo único, sem cortes dentro de uma ação.
- Cada uma das 4 contas aparece logando com e-mail visível, executando ≥1 ação que altera o banco, e fazendo logout.
- Lead criado pela Diretora aparece na tela da Gerente (validado por `id` no banco entre cenas).
- QA confirma cursor + legendas + ausência de telas em branco.

## Riscos conhecidos

- `/tmp` é limpo entre execuções do sandbox; por isso o checkpoint é essencial. Se faltar tempo numa execução, retomamos da próxima cena.
- Sandbox tem timeout de 10min por comando; cada cena dura ~30-45s, então as 4 cabem em uma execução só, mas mantenho o checkpoint como rede de segurança.
- Se alguma cena falhar 3x seguidas, paro, reporto exatamente qual etapa quebrou (ex.: "Cena 2, clicar em 'Salvar' do modal de proposta") e peço orientação antes de tentar de novo.

## Detalhes técnicos

- Browser: Chromium headful via `xvfb-run -a` para capturar cursor real.
- Gravação: `ffmpeg -f x11grab` no display do xvfb, single-pass.
- Login: `page.goto('/login')` + preencher inputs + `requestSubmit()` no form (mesmo seletor que já funcionou antes).
- Detecção de papel: após login, esperar `/dashboard` carregar e validar via DOM se o item de menu esperado para o papel está presente.
- Conversão final: `ffmpeg -i full.webm -vf scale=1440:900 -r 30 -c:v libx264 -preset medium -crf 23 demo-instrutivo.mp4`.
