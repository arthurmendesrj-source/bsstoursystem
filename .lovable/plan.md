Vamos gravar a tela continuamente enquanto o navegador automatizado executa o roteiro real, usuário por usuário, em sequência encadeada. O foco aqui é detalhar o roteiro: cada cena, cada clique, cada uso de IA e o que precisa aparecer na tela.

## Estratégia de gravação

- Um único arquivo de vídeo por usuário (4 arquivos), depois concatenados em um vídeo único.
- A gravação acompanha o cursor, modais, toasts e respostas da IA acontecendo em tempo real.
- Antes de iniciar, o script lê na base os emails reais de cada usuário e escolhe os emails certos para o roteiro. Se faltar email obrigatório, ele para e avisa.
- Cada usuário "passa o bastão" para o próximo: o lead/atribuição criado por um vira o ponto de partida do outro.

## Roteiro encadeado por usuário

### Cena 1 — Diretora (Agrafena)

Objetivo: receber demandas por email, usar IA para triar e gerar trabalho para si mesma e para a Gerente.

1. Abre tela de login, digita email e senha da Diretora, entra.
2. Cai no Dashboard. Pausa de leitura mostrando indicadores e leads recentes.
3. Vai ao menu lateral e abre "Caixa de entrada" (/email).
4. Lista de emails carrega. Cursor passa sobre 2–3 assuntos.
5. Abre o primeiro email: comunicado interno administrativo.
6. Aciona "Triagem IA" no painel do email.
7. IA processa (estado de carregamento) e retorna: classifica como "tarefa interna" e sugere criar Atividade para a Diretora.
8. Diretora confirma criar Atividade. Modal abre já preenchido pela IA (título, descrição, prazo).
9. Salva. Toast de confirmação aparece.
10. Volta para a caixa de entrada.
11. Abre o segundo email: solicitação de cotação de viagem (cliente externo).
12. Aciona "Triagem IA". IA extrai: nome do cliente, destino, datas, número de passageiros, valor estimado.
13. IA recomenda criar Lead. Diretora confirma.
14. Modal de Lead abre preenchido pela IA. Diretora revisa rapidamente.
15. No campo "Atribuir a", seleciona a Gerente (Alexandra).
16. Salva. Toast confirma "Lead criado e atribuído a Alexandra". O ID do lead é guardado pelo script.
17. Diretora desloga (ou o navegador fecha o contexto).

### Cena 2 — Gerente (Alexandra)

Objetivo: receber lead da Diretora, montar proposta com IA, aprovar e ainda triar um email menor para encaminhar ao Operador.

1. Tela de login, entra como Alexandra.
2. Dashboard mostra notificação/contador de "novo lead atribuído".
3. Abre "Leads" e o lead recém-criado pela Diretora aparece no topo.
4. Abre o lead. Tela de detalhe carrega: briefing, cliente, datas.
5. Aciona "IA · Gerar orçamento". IA processa e preenche serviços, fornecedores sugeridos e valores.
6. Aciona "IA · Programa turístico". IA monta itinerário dia a dia.
7. Revisa proposta, ajusta um item simples (ex: data de check-in).
8. Clica em "Enviar proposta". Toast confirma envio.
9. Marca proposta como "Aprovada pelo cliente". Status do lead muda visivelmente.
10. Volta ao menu e abre "Caixa de entrada".
11. Abre um email de cotação de menor valor.
12. Aciona "Triagem IA". IA classifica como lead simples e extrai dados.
13. Confirma criar Lead. Modal preenchido pela IA.
14. No "Atribuir a", seleciona o Operador (Sergei).
15. Salva. Toast confirma. ID guardado pelo script.
16. Desloga.

### Cena 3 — Operador (Sergei)

Objetivo: pegar o lead simples encaminhado pela Gerente, montar proposta com IA e aprovar.

1. Login como Sergei.
2. Dashboard mostra novo lead atribuído.
3. Abre "Leads", abre o lead vindo da Gerente.
4. Aciona "IA · Gerar orçamento". IA preenche itens e fornecedores.
5. Aciona "IA · Programa turístico". IA monta roteiro curto.
6. Revisa, clica "Enviar proposta". Toast.
7. Marca como "Aprovada". Status muda na tela.
8. Desloga.

### Cena 4 — Coordenador (Mikhail)

Objetivo: executar a parte operacional dos dois leads aprovados (o da Gerente e o do Operador), usando IA em cada etapa.

1. Login como Mikhail.
2. Abre "Operações" (ou "Reservas/Bookings aprovados").
3. Lista mostra os dois leads aprovados nas cenas anteriores.
4. Abre a primeira operação (lead aprovado pela Gerente).
5. Aciona "IA · Gerar invoice". IA preenche invoice com itens e valores. Salva.
6. Confirma reservas com fornecedores (botão de geração de reserva). Status muda.
7. Aciona "Gerar voucher". Voucher aparece na tela.
8. Aciona "IA · Bíblia da viagem". IA monta documento consolidado de viagem.
9. Aciona "IA · Mensagem aos fornecedores". IA gera texto pronto para envio. Coordenador clica "Enviar".
10. Marca operação como concluída. Toast.
11. Volta à lista, abre a segunda operação (lead aprovado pelo Operador).
12. Repete: IA invoice → reserva → voucher → IA Bíblia → IA mensagem fornecedores → conclusão.
13. Tela final mostra ambas operações com status "Concluída".

## Pontos onde a IA precisa estar visivelmente em uso

- Triagem de email (Diretora e Gerente).
- Geração de orçamento (Gerente e Operador).
- Geração de programa turístico (Gerente e Operador).
- Geração de invoice (Coordenador).
- Geração de Bíblia da viagem (Coordenador).
- Geração de mensagem aos fornecedores (Coordenador).

Em cada um, a gravação precisa mostrar: clique no botão de IA, estado de processamento, e resultado preenchido na tela.

## Encadeamento dos dados

```text
Diretora cria Lead A (cena 1)
     -> Gerente abre Lead A (cena 2)
     -> Gerente aprova Lead A
        -> Coordenador opera Lead A (cena 4, primeira parte)

Gerente cria Lead B (cena 2)
     -> Operador abre Lead B (cena 3)
     -> Operador aprova Lead B
        -> Coordenador opera Lead B (cena 4, segunda parte)
```

O script guarda os IDs criados em cada cena e os usa para abrir os mesmos itens nas cenas seguintes — nada de abrir "qualquer lead".

## Entregas

### Fase A — gravação bruta (para sua conferência)
- 4 vídeos (um por usuário) e/ou um vídeo único concatenado.
- Sem edição, sem áudio, sem legenda.
- Você assiste, confirma se o roteiro foi cumprido e se a IA aparece de fato.

### Fase B — vídeo instrutivo (depois da sua aprovação)
- Legendas curtas por etapa.
- Realces/zoom nos botões de IA.
- Cortes em esperas longas.
- Áudio/narração se você pedir.
- Exportação final em MP4.

## Critério de aceite da Fase A
- Cada usuário loga sem ficar preso na tela de login.
- O lead criado por um aparece para o próximo, na ordem certa.
- Cada uso de IA aparece sendo executado e devolvendo resultado visível.
- Os emails abertos são os reais da base, escolhidos para o roteiro.
- Nenhuma cena depende de imagem estática ou repetição de frame.