## Problema confirmado

O vídeo atual não está instrutivo porque o script só navega para rotas e tira screenshot. Quando o roteiro tem várias etapas na mesma tela, por exemplo `/email` ou `/itineraries`, a imagem fica igual. Isso cria frames repetidos e não mostra o passo a passo real.

## Objetivo

Refazer a captura desde o início para que cada frame represente uma ação visual diferente e verificável:

- abrir email real da caixa de entrada;
- acionar triagem por IA;
- criar atividade ou lead a partir do email;
- avançar lead entre Diretor, Gerente, Operador e Coordenador;
- usar IA para orçamento, proposta, programa turístico, invoice, voucher/Bíblia e mensagens operacionais;
- tirar screenshot somente depois de a tela mudar ou a ação aparecer concluída.

## Plano de correção

### 1. Trocar captura por rota por captura por ação

Substituir o modelo atual:

```text
goto('/email') -> screenshot
goto('/email') -> screenshot
goto('/email') -> screenshot
```

por um modelo de ações reais:

```text
abrir /email
clicar no email correto
aguardar painel/detalhe abrir
screenshot
clicar em Triagem IA
aguardar resultado IA aparecer
screenshot
clicar em Criar Lead ou Criar Atividade
aguardar formulário/modal preenchido
screenshot
salvar/atribuir
aguardar confirmação
screenshot
```

### 2. Criar um executor de etapas com validação visual

Cada etapa do roteiro terá:

- usuário/role;
- ação real a executar;
- seletor ou texto esperado após a ação;
- legenda do frame;
- marcação se usou IA;
- validação contra duplicata visual.

Se uma etapa não mudar a tela, o script não deve aceitar a captura como válida. Ele deve tentar uma ação alternativa, como abrir detalhe, modal, aba, dropdown, scroll controlado ou destacar o elemento correto.

### 3. Ler emails reais antes da gravação

Antes de capturar, o script deve consultar os emails existentes por usuário e escolher os emails que vão dirigir o roteiro:

- Diretor: email administrativo interno para criar atividade própria;
- Diretor: email de solicitação de cotação para criar lead da Gerente;
- Gerente: lead criado pelo Diretor;
- Gerente: email de cotação menor para criar lead do Operador;
- Operador: lead criado pela Gerente;
- Coordenador: leads aprovados para executar parte operacional.

Se algum email obrigatório não existir, o script deve parar e informar o que falta, ou criar um email demo claramente marcado como `DEMO`, se isso for aprovado no fluxo de implementação.

### 4. Garantir isolamento e login por usuário

Manter a parte que funcionou:

- contexto de navegador separado para cada usuário;
- sessão isolada por Diretor, Gerente, Operador e Coordenador;
- validação de login antes da primeira captura;
- abortar o usuário se cair na tela de login.

### 5. Registrar o encadeamento real dos dados

O roteiro deve guardar IDs criados durante a execução:

```text
Diretor cria Lead A -> Gerente abre Lead A
Gerente aprova Lead A -> Coordenador opera Lead A
Gerente cria Lead B -> Operador abre Lead B
Operador aprova Lead B -> Coordenador opera Lead B
```

Isso evita um usuário abrir dados antigos ou errados.

### 6. Usar IA de forma visível

Para cada ponto de IA, a captura precisa mostrar algo concreto:

- botão/ação de IA acionado;
- estado de processamento;
- resultado preenchido;
- toast ou painel com resposta da IA.

Se a UI atual não tiver estado visual suficiente, adicionar pequenos elementos de demonstração na própria tela, como painel “Resultado da IA”, preenchimento progressivo ou confirmação visível. Sem isso, o screenshot continuará parecendo igual.

### 7. Controle de qualidade antes do vídeo

Antes de renderizar o MP4:

- gerar todas as capturas;
- calcular hash/percepção visual das imagens;
- listar frames duplicados;
- reprovar automaticamente se houver duplicatas consecutivas relevantes;
- gerar uma folha de conferência com miniaturas para você revisar;
- só depois renderizar o vídeo final com 3 segundos por frame.

## Roteiro instrutivo revisado

### Diretor

1. Entra no dashboard.
2. Abre caixa de entrada.
3. Abre email administrativo interno.
4. Usa IA para triagem do email.
5. IA cria/preenche atividade para o próprio Diretor.
6. Diretor salva/conclui a atividade.
7. Volta à caixa de entrada.
8. Abre email de solicitação de cotação.
9. Usa IA para triagem da cotação.
10. IA extrai dados e recomenda criação de lead.
11. Lead é criado/preenchido.
12. Lead é atribuído à Gerente.
13. Confirma encaminhamento.

### Gerente

14. Abre lead recebido do Diretor.
15. Analisa briefing.
16. Usa IA para gerar orçamento.
17. IA sugere serviços, fornecedores e valores.
18. IA monta programa turístico.
19. Gerente revisa proposta.
20. Proposta é enviada.
21. Proposta é marcada como aprovada.
22. Gerente abre inbox.
23. Abre email de cotação de menor valor.
24. Usa IA para triagem.
25. IA cria lead simplificado.
26. Gerente atribui lead ao Operador.
27. Confirma encaminhamento.

### Operador

28. Abre lead recebido da Gerente.
29. Analisa pedido.
30. Usa IA para orçamento automático.
31. IA completa itens e fornecedores.
32. IA monta programa turístico.
33. Operador revisa proposta.
34. Envia proposta.
35. Marca proposta como aprovada.

### Coordenador

36. Abre lista de operações/reservas aprovadas.
37. Abre operação do lead aprovado da Gerente.
38. Usa IA para gerar invoice.
39. Gera/organiza reserva.
40. Gera voucher.
41. Usa IA para Bíblia da viagem.
42. Usa IA para mensagem aos fornecedores.
43. Finaliza primeira operação.
44. Repete operação no lead aprovado pelo Operador.
45. Confirma operação concluída.

## Entregáveis da implementação

- Script de captura refeito por ações reais.
- Arquivo `frames.json` com as etapas e validações.
- Capturas novas sem repetição relevante.
- Folha de conferência com miniaturas para revisão antes do vídeo.
- Depois da sua aprovação visual, renderização do vídeo final com 3 segundos por frame.

## Critério de aceite

O vídeo só será considerado pronto se:

- cada usuário estiver logado corretamente;
- cada etapa mostrar uma mudança visual clara;
- as ações forem baseadas nos emails/leads reais;
- as etapas com IA mostrarem resultado visível da IA;
- não houver blocos de frames repetidos como no teste atual;
- você puder revisar as capturas antes do MP4 final.