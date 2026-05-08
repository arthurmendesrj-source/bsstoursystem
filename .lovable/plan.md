## Diagnóstico

Fiz duas verificações no banco e encontrei dois problemas distintos:

**1. Filtro da pasta "Enviados" mistura conteúdo (causa principal do "errado")**

A aba `Enviados` filtra `email_threads.labels contains "SENT"`. Mas em conversas com respostas, a thread agrega rótulos de *todas* as mensagens — então uma conversa cujo último email é recebido (INBOX) aparece em "Enviados" só porque ela contém uma resposta sua em algum momento. Hoje no banco: 95 threads com SENT, 81 dessas também têm INBOX → o usuário vê 81 conversas que parecem "recebidas" listadas em Enviados.

**2. Full sync ainda não chegou na pasta SENT**

`email_sync_state` mostra `full_sync_in_progress = true`, label atual ainda `INBOX`, total = 75. As 191 mensagens com label SENT no banco vieram do polling incremental (datas só dos últimos 8 dias). O sync sequencial não chegou na fase SENT ainda — vai chegar quando o "Sincronizar" rodar até o fim.

## Plano

### Mudança 1 — Listagem por mensagem nas pastas "saída" (frontend)

Em `src/components/email/EmailPanel.tsx`, alterar `loadThreads` para usar uma query dedicada quando `activeLabel ∈ {SENT, DRAFT, TRASH, SPAM}`:

- Em vez de `email_threads.contains(labels, [activeLabel])`, consultar `emails` filtrando `labels.cs.{ACTIVE_LABEL}`, ordenando por `internal_date desc`, limitando a 500.
- Agrupar no cliente por `thread_id`, mantendo apenas a mensagem mais recente por thread que possui aquele label.
- Montar `ThreadRow[]` sintéticos a partir desses emails, exibindo `from_name/from_email`, `to_emails`, `subject`, `snippet`, `internal_date`, `is_starred`, `has_attachments`.
- Para INBOX, IMPORTANT, STARRED e labels de usuário: manter o caminho atual (filtro em `email_threads`), pois nesses casos o agrupamento por thread faz sentido.
- Buscar a query de pesquisa (`search`) continua funcionando: aplicar o mesmo `or(...)` sobre a tabela `emails` no caminho novo.

Resultado: a pasta "Enviados" passa a mostrar apenas mensagens que VOCÊ enviou (uma linha por conversa, com o conteúdo do email enviado, não do recebido). DRAFT/TRASH/SPAM ganham comportamento equivalente.

### Mudança 2 — Garantir que o sync cubra SENT (sem mudança de código, apenas operação)

Após a mudança 1, basta clicar **Sincronizar** (já com seletor de 6 meses). O sync sequencial roda INBOX → SENT → DRAFT → SPAM → TRASH → IMPORTANT → STARRED, retomando do estado atual. Como o painel de progresso já mostra contagem por pasta, dá para acompanhar a fase SENT chegar ao 0 restante.

Sem mudança no servidor, no banco ou no algoritmo de sync. A janela continua sendo a escolhida pelo usuário (3/6/12/24 meses ou personalizado).

### Fora de escopo

- Mudar a estrutura de `email_threads` (separar SENT em outro agregado): impactaria muito mais o app por uma melhoria localizada.
- Filtrar SENT no servidor com `email_threads.is_sent`: exigiria nova coluna + migração + backfill — desnecessário se o frontend faz a leitura correta direto da tabela `emails`.
- Resetar o sync: o estado atual é válido e retomável; não precisa restart.
