## Estado atual

- `record2.mjs` já tem: cursor visível, mouse real, seletor robusto de "Salvar" (prioriza modal, fallback `form.requestSubmit`), checkpoint por cena com 3 retries, e `expect()` antes de cada clique crítico.
- `/tmp/demo-record/full.webm` existe da execução anterior (sem checkpoint salvo, então não dá para retomar — vamos do zero).
- Último MP4 entregue: `/mnt/documents/demo-instrutivo.mp4` de 03:05 (versão antiga, com cortes).

## O que vou fazer

1. Limpar `/tmp/demo-record` (`RESET=1`) para começar do zero com checkpoint limpo.
2. Rodar `node /tmp/demo-runner/record2.mjs` apontando para o preview do projeto (`PREVIEW_URL`).
3. O script grava contínuo as 4 cenas (Diretora → Gerente → Operador → Coordenador). Cada cena salva checkpoint ao concluir.
4. Se alguma cena falhar mesmo após 3 retries: o script para a gravação, **não exporta MP4** e sai com código 2. Eu rodo de novo e ele retoma a partir da cena pendente.
5. Quando todas as 4 cenas passarem, ele converte o WebM para `/mnt/documents/demo-instrutivo.mp4` (1440x900, 30 fps, H.264).
6. QA: extraio frames a cada 10 s do MP4 e inspeciono para garantir cursor visível, legendas e que não há tela estática.
7. Entrego o `<lov-artifact>` do MP4 final.

## Critério de pronto

- Vídeo único, sem cortes dentro de ações.
- Cursor vermelho visível em movimento.
- Cada usuário aparece logando, executando ações reais (Triagem IA, criar lead/atividade, propostas, aprovação, invoice/reserva/bíblia) e fazendo logout.
- Lead criado pela Diretora é aberto pela Gerente; lead da Gerente é aberto pelo Operador (validado via `id` no banco).
- Se algo falhar: eu reporto exatamente qual cena/etapa não passou e em qual checkpoint paramos, antes de tentar de novo.
