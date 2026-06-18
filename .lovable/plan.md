# Auto-refresh do e-mail a cada 1 minuto

## Hoje
- Não há atualização automática. O sync acontece só ao abrir a página, trocar de pasta ou clicar em "Atualizar".

## O que vou fazer

1. **Polling no `EmailMailbox`** (`src/components/email/EmailMailbox.tsx`)
   - Adicionar um `useEffect` com `setInterval` de 60s que chama `syncFolderFn` para a pasta atual e depois `listMessagesFn` para recarregar a lista do cache.
   - Só roda enquanto o componente está montado (limpa no unmount).
   - Pausa quando a aba do navegador está em segundo plano (`document.visibilityState !== "visible"`) e retoma quando volta — evita gastar quota do Gmail à toa.
   - Pula o ciclo se já houver um refresh/sync em andamento (usa o `refreshIdRef` que já existe).
   - Não mexe no estado de "loading" da tela inteira: o refresh em background é silencioso; só atualiza a lista quando termina.

2. **Indicador discreto** (opcional, leve)
   - Mostrar um pequeno "Atualizado há Xs" ao lado do botão Atualizar, baseado no timestamp do último sync bem-sucedido.

## O que NÃO muda
- Banco, RLS, server functions, tabela `emails` e `email_sync_state`: tudo intacto.
- Comportamento manual (botão Atualizar, troca de pasta, envio) continua igual.
- Sem cron no servidor — atualiza só para quem está com a tela aberta.

## Validação
- Abrir `/email`, esperar ~1 min: novos e-mails aparecem sozinhos sem clicar em nada.
- Trocar para outra aba do navegador por 2 min e voltar: dispara um refresh imediato.
- Sem flicker da lista, sem tela em branco durante o sync.
