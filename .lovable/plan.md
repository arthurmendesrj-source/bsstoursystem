## Diagnóstico

O problema principal não é o banco: o backend está saudável. O que está quebrando a sincronização é a arquitetura atual:

- O botão **Esvaziar tudo e ressincronizar** tenta apagar anexos, mensagens, labels e ainda reiniciar a importação dentro de uma única requisição do app. Isso pode passar do limite e gerar **upstream request timeout**.
- O agendador está chamando `/api/public/gmail-cron-tick`, mas no site publicado essa rota retorna **404**, então o full mirror novo não está sendo drenado em segundo plano.
- Ainda existe uma rota antiga `/api/public/gmail-poll` rodando, com lógica legada de sincronização por janela `newer_than`, que conflita com o modelo novo pasta por pasta/mês a mês.
- O estado atual está travado em `booking@adatours.com`, `INBOX`, mês `0`, com fila ativa, mas sem avanço confiável.

## Solução definitiva

Vou transformar limpeza e importação em tarefas pequenas, idempotentes e retomáveis, para nenhuma requisição precisar fazer tudo de uma vez.

### 1. Criar estado de limpeza por etapas

Adicionar campos em `email_sync_state` para controlar uma limpeza assíncrona:

- status da limpeza: `idle`, `wiping`, `failed`, `done`
- etapa atual: anexos, mensagens, threads, labels, reset
- contador removido
- erro, se houver
- data de início/fim

Assim o botão não espera a limpeza terminar; ele apenas inicia a operação e retorna rápido.

### 2. Trocar o botão destrutivo para “enfileirar limpeza”

O fluxo com confirmação digitando **ESVAZIAR** continua, mas a função chamada pelo botão vai:

- cancelar qualquer sync em andamento
- limpar a fila atual
- marcar `wipe_status = wiping`
- retornar imediatamente

Nada de apagar tudo dentro da mesma requisição da UI.

### 3. Fazer o cron processar limpeza em lotes pequenos

A rota pública do cron será ajustada para, a cada chamada:

1. se houver limpeza pendente, remover apenas um lote pequeno;
2. atualizar o progresso;
3. só quando a limpeza terminar, recriar labels e iniciar a nova fila do full mirror.

Lotes planejados:

- anexos no storage por pastas pequenas
- `email_attachments` em chunks
- `emails` em chunks
- `email_threads` em chunks
- `email_labels` no final
- reset total do estado

### 4. Unificar a rota de cron publicada

Manter `/api/public/gmail-poll` como compatibilidade, mas trocar sua lógica para chamar o mesmo motor novo de `gmail-cron-tick`.

Isso resolve dois problemas:

- se o agendador antigo ainda chamar `/gmail-poll`, ele passa a executar o fluxo correto;
- se o agendador novo chamar `/gmail-cron-tick`, ambos usam a mesma lógica.

### 5. Criar/ajustar agendamento no banco

Adicionar migração para garantir que exista um job chamando uma rota existente e publicada em intervalo curto.

Também vou remover/neutralizar conflito com a lógica antiga para evitar duas sincronizações diferentes brigando pelos mesmos dados.

### 6. Reduzir o peso de cada tick do Gmail

Ajustar `runFullSyncTick` para ser mais resiliente:

- diminuir `maxResults` por tick;
- baixar mensagens/anexos com concorrência menor;
- registrar erro de item individual sem derrubar a sincronização toda;
- avançar cursor apenas depois de persistir com sucesso;
- manter labels nativos do Gmail em `emails.labels`, sem mover email para pasta artificial.

A regra fica: **o app só mostra um email em uma pasta se o Gmail retornou esse label no próprio email**.

### 7. Melhorar o painel em `/email`

Mostrar claramente:

- se está limpando ou sincronizando;
- etapa da limpeza;
- total removido;
- pasta atual;
- mês atual;
- total sincronizado;
- erro recuperável, se houver;
- botões para cancelar e reiniciar sem travar a tela.

## Resultado esperado

Depois de aprovado e implementado:

- clicar em **Esvaziar tudo e ressincronizar** não deve mais gerar timeout;
- a limpeza roda em segundo plano até zerar tudo;
- a nova sincronização começa automaticamente depois da limpeza;
- a importação avança pasta por pasta e mês a mês;
- nenhum email será alocado em pasta diferente da indicada pelos labels reais do Gmail;
- se um tick falhar, o próximo retoma do último estado salvo.