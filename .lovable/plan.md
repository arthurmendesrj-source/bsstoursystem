## Diagnóstico

Verifiquei o banco da conta `Booking@adatours.com` (user `62d5a6e6…`):

- Gmail **conectado** via OAuth, com tokens válidos (`access_token` + `refresh_token`).
- Cache local tem **50 emails em Inbox** e **50 em Enviados**.
- Último sync: **hoje 13:05**, **sem erro** em `email_sync_state.last_error`.
- O scope OAuth inclui `gmail.readonly`, `gmail.modify`, `gmail.send` — está correto.

Ou seja, do lado servidor / banco **está tudo certo**. O problema é exibição.

A versão **publicada** (`bsstoursystem.lovable.app`) ainda não recebeu as mudanças recentes (cache-first em `public.emails`, hook global de sync de 30s, leitura via `readCachedList`). Por isso, ao abrir a caixa no site publicado, o código antigo tenta puxar tudo do Gmail no momento e renderiza vazio — enquanto o preview, que já tem o código novo, popula corretamente o cache (foi o preview que gerou os 50 emails às 13:05).

## Plano

1. **Republicar o app** para que a versão publicada passe a usar o cache-first e o background sync.
   - Sem mudanças de código nem migrations — é só publicar.
2. **Validar** após o deploy:
   - Logar como Booking no site publicado → abrir `/email` → confirmar que os 50 emails aparecem em Inbox e Enviados.
   - Esperar 30s e confirmar que o "Atualizado há Xs" atualiza sozinho.
3. **Se ainda vier vazio após republicar**, aí sim investigo um segundo cenário (ex.: navegador antigo segurando bundle em cache → pedir Ctrl+Shift+R; ou um eventual erro no `listMessagesFn` que só aparece no log do servidor publicado — nesse caso leio `server-function-logs` filtrando por `listMessages` para achar a mensagem real).

## Ação imediata para você

Clique em **Publish** para subir a versão atualizada. Depois recarregue a página da caixa de entrada (Ctrl+Shift+R).

<presentation-actions>
<presentation-open-publish>Publish your app</presentation-open-publish>
</presentation-actions>
