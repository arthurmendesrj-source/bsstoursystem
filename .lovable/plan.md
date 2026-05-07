Consolidando os dois problemas (gravação estática/sem cursor + cortes/seletores chutados) em um único plano de execução.

## Problemas identificados

1. Cliques eram disparados via JavaScript (`element.click()`), então o cursor não aparecia e a tela parecia estática.
2. Gravação foi feita em 4 arquivos separados e concatenada — cortes no meio das ações.
3. Seletores buscavam textos que não existem no app (“Gerar orçamento IA”, “Programa turístico IA”).
4. Navegação de lead estava errada — leads abrem em `/workspace?lead=ID`, não em `/leads/:id`.
5. O script seguia em frente mesmo quando a ação falhava, então o vídeo mostrava telas, não ações.

## Como vou corrigir

### 1. Gravação contínua única
Uma única gravação do início ao fim. Troca de usuário acontece dentro do mesmo vídeo:

```text
iniciar gravação
Agrafena: login -> ações reais -> logout
Alexandra: login -> ações reais -> logout
Sergei: login -> ações reais -> logout
Mikhail: login -> ações reais -> conclusão
encerrar gravação
```

Sem concatenação. Sem cortes dentro da ação.

### 2. Cursor visível e movimento humano
- Injetar cursor visual (seta/círculo) na página, já que headless não captura o cursor do sistema.
- Mover o cursor em vários passos até cada elemento (não teletransportar).
- Pequena pausa antes do clique, efeito visual no clique, pausa depois.
- Digitação caractere a caractere com pequeno delay.
- 30 fps, rolagem suave.
- Nunca usar `element.click()` por JS — sempre mouse real do navegador.

### 3. Roteiro usando só ações reais do app

#### Agrafena — Diretora
- Login.
- Abre Email.
- Seleciona um email real da caixa.
- Clica em **Triagem IA** e espera o modal de triagem.
- Conforme a recomendação: clica em **Criar lead** ou **Criar tarefa**.
- Modal abre preenchido. Atribui para Alexandra (se a opção aparecer). Salva.
- Verifica criação no banco. Logout.

#### Alexandra — Gerente
- Login.
- Abre Leads, clica no lead da Diretora (que abre em `/workspace?lead=ID`).
- Seção **Propostas** → **Nova proposta**.
- Editor abre: adiciona hotel/serviço/voo, salva.
- Aprova proposta. Converte em reserva se o botão aparecer.
- Volta ao Email, faz nova **Triagem IA** em outro email, cria lead atribuído ao Sergei.
- Logout.

#### Sergei — Operador
- Login.
- Abre o lead criado pela Gerente em `/workspace?lead=ID`.
- Seção **Propostas**, cria/edita proposta.
- Adiciona itens, salva. Aprova/conclui conforme permissão real.
- Logout.

#### Mikhail — Coordenador
- Login.
- Abre os leads aprovados / reservas.
- Seção **Invoice** mostra a invoice/proposta aprovada.
- Seção **Reserva** mostra a reserva criada.
- Abre **Bíblia da viagem** se houver dado suficiente.
- Finaliza no estado operacional.

### 4. Validação obrigatória entre ações
O script só segue se a ação aconteceu de verdade:

```text
Triagem IA -> modal apareceu
Salvar lead -> lead consultado no banco e ID guardado
Nova proposta -> editor de proposta abriu
Aprovar -> status mudou para aprovada
Converter em reserva -> reserva existe no banco
```

Se falhar: gravação para e eu reporto exatamente qual etapa não apareceu.

### 5. Seletores robustos
- Botões por nome acessível.
- Inputs por label.
- URLs reais.
- IDs criados no banco durante a própria gravação.
- Verificação visual do modal/painel antes de continuar.
- Nada de buscar por texto que não existe no app.

### 6. IA com honestidade visual
A IA visível e confirmada no app é:
- **Triagem IA** no Email;
- **Ditado de itens** na proposta;
- **Gerar documento** da proposta;
- Assistente global.

O vídeo mostra só essas. Não vou inventar “Gerar orçamento IA” / “Programa turístico IA” — esses botões não existem hoje. Se você quiser que existam, precisamos primeiro criar no app.

### 7. Entrega em duas fases
- **Fase A — vídeo bruto**: contínuo, sem legenda e sem narração, com cursor visível e ações validadas. Para você conferir.
- **Fase B — vídeo instrutivo**: só depois da sua aprovação. Adiciona legendas, zoom/callouts, cortes apenas em esperas longas, possível narração.

## Critério de aceitação
O vídeo só está correto se mostrar:
- cursor visível em movimento;
- login de cada usuário;
- email sendo aberto;
- Triagem IA clicada e devolvendo resultado;
- lead/tarefa sendo criado de verdade;
- lead criado por um usuário sendo aberto pelo próximo;
- proposta criada, editada, salva;
- aprovação/conversão quando a permissão permitir;
- coordenador vendo invoice, reserva, operação;
- sem cortes no meio das ações;
- nada simulado — só o que existe no app.