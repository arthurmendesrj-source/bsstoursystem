## Corrigir "accounts.google.com está bloqueado" no fluxo Conectar Gmail

### Causa

O Google envia `Cross-Origin-Opener-Policy: same-origin` no `accounts.google.com`. Quando abrimos a URL de OAuth em **popup** (`window.open(url, "gmail-oauth", "width=520,height=680")`) a partir do iframe do preview do Lovable, o navegador recusa carregar a resposta e mostra `ERR_BLOCKED_BY_RESPONSE`.

Popups com tamanho/posição abertos de dentro de um iframe cross-origin são tratados de forma mais restrita; **novas abas (sem features de janela) não sofrem esse bloqueio**.

### Correção

Em `src/routes/email.tsx`, no `handleConnect`:

1. Trocar `window.open(r.authUrl, "gmail-oauth", "width=520,height=680")` por `window.open(r.authUrl, "_blank")` — sem features, o Chrome abre como aba normal e o Google permite o carregamento.
2. Remover a dependência de `postMessage` do popup (a aba nova não fica filha do iframe, então `window.opener.postMessage` é nulo). Em vez disso, após abrir a aba, **fazer polling** de `getMyAccount` a cada 2 s por até 2 min; assim que retornar `connected: true`, mostrar toast de sucesso e recarregar o estado.
3. Manter o listener de `message` como bônus (caso o navegador ainda permita), mas não depender dele.

Em `src/routes/api/public/google.callback.ts`:

- Manter a página de sucesso atual; o `window.close()` continua funcionando porque a aba foi aberta por `window.open`.
- Texto: "Gmail conectado. Você já pode voltar à aba do app e fechar esta."

### Por que não usar redirect no iframe

Redirecionar o iframe inteiro para o Google funcionaria, mas ao voltar o callback cairia dentro do iframe e o Lovable preview poderia bloquear (mesma família de problema). Abrir em aba nova é o caminho compatível com o ambiente de preview e também com o site publicado.