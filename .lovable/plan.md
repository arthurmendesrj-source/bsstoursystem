## Diagnóstico

O problema não é falta de capacidade de buscar o Gmail; é o modelo atual da lista.

Hoje existem duas fontes misturadas:

1. **Tabela `email_threads` agrega labels da conversa inteira**
   - Uma mesma conversa pode ter mensagens recebidas (`INBOX`) e mensagens enviadas (`SENT`).
   - Por isso a thread agregada aparece com labels como `INBOX` e `SENT` ao mesmo tempo.
   - Se a UI usar essa tabela para “Enviados”, aparecem conversas que também são da Caixa de entrada.

2. **A busca ao vivo até consulta `SENT`, mas depois a tela recarrega do cache local**
   - A função `gmailListLive` busca mensagens com `labelIds=SENT` corretamente.
   - Porém a lista final ainda é reconstruída com o cache local, e o cache pode representar a thread completa, não somente a mensagem enviada.

## O que está confirmado

- O banco tem emails enviados reais (`labels` contendo `SENT`).
- O banco também tem threads agregadas com `INBOX` e `SENT` juntas.
- Isso explica exatamente o que você viu: “Enviados” exibindo assuntos/conversas que parecem de entrada.

## Solução proposta

Trocar a renderização de pastas por uma regra simples e robusta:

### 1. Pastas de mensagem usam mensagens, não threads agregadas
Para estas pastas:

- `SENT` / Enviados
- `DRAFT` / Rascunhos
- `SPAM`
- `TRASH`

A lista deve vir da tabela `emails`, filtrando mensagens que têm exatamente aquele label, e só depois agrupar por `thread_id` para exibir uma linha por conversa.

### 2. “Enviados” deve mostrar a última mensagem enviada da conversa
Na aba Enviados:

- O remetente precisa ser a conta conectada.
- Os participantes exibidos devem ser os destinatários.
- A data deve ser a data da mensagem enviada, não a data da última resposta recebida.
- O snippet deve ser o snippet da mensagem enviada, não da última mensagem da thread.

### 3. Abertura da conversa continua mostrando a thread completa
Ao clicar em uma linha de Enviados, a conversa pode continuar abrindo completa, como no Gmail.

A diferença é: a linha da lista representa a mensagem enviada, não uma mensagem recebida.

### 4. Corrigir atualização ao vivo
Depois de clicar em “Atualizar caixa” ou mudar para “Enviados”, a tela deve usar imediatamente o resultado filtrado da pasta atual, sem voltar para uma thread agregada indevida.

### 5. Remover resquícios antigos da sincronização completa na UI
O componente ainda tem estados e textos antigos de sincronização completa que podem causar comportamento confuso. Vou limpar apenas o que estiver impactando a tela de emails.

## Validação

Depois da correção, vou verificar:

- “Caixa de entrada” mostra mensagens/conversas recebidas.
- “Enviados” mostra apenas mensagens com label `SENT`.
- As primeiras linhas de “Enviados” exibem destinatários, não remetentes externos.
- A busca e o botão “Atualizar caixa” preservam a pasta selecionada.

## Arquivos envolvidos

- `src/components/email/EmailPanel.tsx`
- `src/server/gmail-mirror.functions.ts`, se for necessário retornar as mensagens filtradas diretamente da busca ao vivo.

Não vou tentar voltar ao espelhamento completo do Gmail. A correção será focada em fazer cada pasta consultar a fonte correta e parar de usar a thread agregada como verdade para “Enviados”.