## Problema

Hoje a tela de email mostra no máximo as 200 conversas mais recentes de cada pasta porque:

1. `loadThreads()` consulta o cache local com `.limit(200)` (e `.limit(500)` em mensagens) ordenando do mais novo para o mais velho. Conversas mais antigas que esse corte simplesmente nunca aparecem.
2. O botão **“Carregar mais antigos”** existe, mas só aparece quando a primeira chamada ao Gmail retorna um `nextPageToken`. Em pastas com cache cheio (já há 200 conversas locais) a página seguinte é importada para o banco mas o `loadThreads()` continua devolvendo as mesmas 200 mais novas — então visualmente nada muda.
3. O comportamento é idêntico em Caixa de entrada e Enviados, então em ambos o usuário “bate no teto” do cache.

## Solução

Tornar a lista verdadeiramente paginada, idêntica em todas as pastas (incluindo Caixa de entrada e Enviados):

### 1. Paginação por “janela” no cache local
- Em `EmailPanel.tsx`, manter um estado `pageSize` (começa em 50) por pasta.
- `loadThreads()` passa a usar `.limit(pageSize)` em vez de 200/500 fixo.
- Ao clicar **“Carregar mais antigos”**, incrementar `pageSize` em +50 antes de chamar o Gmail e o `loadThreads()`. Isso garante que cada clique realmente revela conversas mais antigas já no cache.

### 2. Botão sempre disponível enquanto o Gmail tiver mais
- Hoje o botão depende só de `nextPageToken`. Vamos exibí-lo também quando `threads.length >= pageSize` (ainda há itens no cache local não exibidos), além de quando `nextPageToken` existir.
- Se nem o Gmail nem o cache têm mais nada, mostrar texto “Fim da pasta”.

### 3. Aplicar igual para Caixa de entrada
- A lógica acima vale para todas as labels, mas precisamos garantir que para `INBOX` o `gmailListLive` seja chamado quando o usuário pedir mais antigos (hoje só chama quando troca de pasta). Vamos fazer **“Carregar mais antigos”** sempre chamar `gmailListLive({ labelId: activeLabel, pageToken })`, inclusive em INBOX, e usar o `nextPageToken` retornado.

### 4. Ordenação correta em Enviados
Manter o filtro atual que separa SENT/DRAFT por `from_email` do dono da caixa. Só trocar o `.limit(500)` por `.limit(pageSize)` na consulta de `emails` para Enviados/Rascunhos/Spam/Lixeira.

### 5. Reset ao trocar de pasta ou buscar
Sempre que `activeLabel` ou `search` mudar, resetar `pageSize` para 50 e `nextPageToken` para `null` (já existe esse efeito — só adicionar o reset do `pageSize`).

## Validação

Após o ajuste, vou testar manualmente abrindo Caixa de entrada e Enviados e clicando em “Carregar mais antigos” várias vezes, conferindo que:
- A lista cresce a cada clique (50, 100, 150, …).
- Conversas com data progressivamente mais antiga aparecem no fim da lista.
- O botão some quando não há mais nada no Gmail nem no cache.

## Arquivos envolvidos

- `src/components/email/EmailPanel.tsx` (única mudança).

Não mexo em servidor, banco ou no `gmail-mirror.functions.ts` — `gmailListLive` já aceita `pageToken` e devolve `nextPageToken`, é só passar a usá-lo de forma consistente.
