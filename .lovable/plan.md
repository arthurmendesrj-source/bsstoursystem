## Objetivo
Substituir os toasts repetidos durante o "Sincronizar agora" por um painel de progresso persistente com barra por pasta (INBOX, SENT, DRAFT, SPAM, TRASH, IMPORTANT, STARRED) e contagem de mensagens sincronizadas em cada uma.

## Escopo
Apenas frontend, em `src/components/email/EmailPanel.tsx`. Nenhuma mudança no banco, nas server functions, no endpoint de polling ou na lógica do sync — o servidor já retorna `label`, `nextLabel`, `syncedThisRun`, `threads`, `done` em cada chamada, que é tudo que precisamos para alimentar o painel.

## Como vai funcionar

1. Novo estado `syncProgress` no `EmailPanel`:
   - `active: boolean`
   - `currentLabel: SyncLabel | null`
   - `perLabel`: `Record<SyncLabel, { count: number; threads: number; status: "pending" | "active" | "done" }>` inicializado com todos os 7 rótulos em `pending`.
   - `totalSynced: number`

2. Em `doFullSync`, dentro do loop:
   - Antes da primeira chamada, marca `INBOX` como `active`.
   - Após cada resposta `r`: incrementa `perLabel[r.label].count += r.syncedThisRun` e `.threads += r.threads`.
   - Quando `r.nextLabel !== r.label`: marca `r.label` como `done` e `r.nextLabel` (se existir) como `active`.
   - Atualiza `totalSynced` e `currentLabel`.
   - Remove os `toast.message(...)` de cada iteração (ficam só o `toast.success` final e o `toast.error` em caso de falha).

3. Novo subcomponente `SyncProgressPanel` renderizado no topo da coluna esquerda do `EmailPanel` quando `syncProgress.active`:
   - Cabeçalho com "Sincronizando últimos 6 meses — N mensagens" e label da pasta atual.
   - Barra de progresso geral por contagem de pastas concluídas (ex.: 3 de 7).
   - Lista das 7 pastas com:
     - Nome em PT (mapeamento já existente em `labelNames`).
     - Status: ícone de check (done), spinner (active) ou círculo vazio (pending).
     - Contagem `{count} mensagens · {threads} conversas`.
     - Para a pasta `active`, uma barra `<Progress />` indeterminada (animação pulse) já que o total exato em 180 dias não é conhecido a priori.
   - Botão discreto "Ocultar" que só esconde o painel (não cancela o sync; o sync continua até `done`).

4. Ao finalizar (`r.done`): marca a última pasta como `done`, mantém o painel visível por ~3s mostrando todos com check, depois fecha automaticamente.

## Detalhes técnicos
- Usa `Progress` do shadcn já presente no projeto (`@/components/ui/progress`) para a barra geral; para a barra indeterminada da pasta ativa, usa um `<div>` com classes Tailwind animadas (`animate-pulse` + gradiente do design system).
- Ícones via `lucide-react` já importado no arquivo (`Check`, `Loader2`, `Circle`).
- Tokens semânticos do `src/styles.css` (sem cores hardcoded).
- O `loadFolders()` e `loadThreads()` continuam sendo chamados a cada lote para refletir os novos emails na UI em tempo real.

## Fora de escopo
- Estimar o total real de mensagens em 180 dias por pasta (exigiria varrer `messages.list` adicional só para contar). Mantemos barra indeterminada na pasta ativa.
- Cancelar o sync no meio (não há suporte no servidor hoje).
- Mudanças no `gmail-poll.ts` (ele roda no cron, sem UI).
