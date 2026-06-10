## Plano para corrigir o Google OAuth bloqueado

O erro da imagem (`accounts.google.com está bloqueado / ERR_BLOCKED_BY_RESPONSE`) indica que o Google está sendo aberto dentro de um contexto bloqueado pelo navegador/iframe. A correção é garantir que o fluxo sempre abra o Google em uma janela real e que o diagnóstico capture essa falha claramente.

### 1. Ajustar o início do OAuth Gmail
- Manter o clique do usuário abrindo uma janela popup imediatamente.
- Em vez de apontar o popup diretamente para `/api/public/google/oauth/start?token=...`, abrir primeiro uma página intermediária local do app.
- Essa página intermediária roda fora do iframe do app, chama o endpoint `/start` e só então redireciona a janela popup para `accounts.google.com`.
- Isso evita que o Google seja carregado dentro do preview/iframe onde ele bloqueia com `ERR_BLOCKED_BY_RESPONSE`.

### 2. Criar rota intermediária de popup
- Criar uma rota como `/google-oauth-popup`.
- Ela receberá o token temporário na URL.
- Mostrará estado simples: “Abrindo Google…”, erro de sessão, erro do endpoint `/start`, ou timeout.
- Se o `/start` devolver redirect válido, a própria popup navegará para o Google.

### 3. Melhorar o endpoint `/api/public/google/oauth/start`
- Adicionar suporte a modo JSON/diagnóstico, por exemplo `?mode=json`, para retornar a URL de autorização do Google sem lançar redirect.
- Preservar o comportamento atual de redirect para não quebrar links existentes.
- Retornar mensagens mais estruturadas quando faltar token, Client ID ou segredo de state.

### 4. Atualizar o botão “Conectar Gmail”
- Alterar `GmailConnectCard` para abrir a nova rota intermediária no popup.
- Continuar ouvindo `postMessage` do callback (`type: 'gmail-oauth'`) para mostrar sucesso/falha e recarregar tokens.

### 5. Atualizar a página de Diagnóstico
- Adicionar um teste explícito “Popup bridge” para diferenciar:
  - falha no start;
  - redirect gerado corretamente;
  - Google bloqueado no iframe/popup;
  - callback retornou erro.
- Ajustar o botão “Executar OAuth em popup” para usar a mesma rota intermediária real.

### 6. Validar
- Verificar que os arquivos alterados não introduzem imports inválidos.
- Confirmar que o fluxo preserva o callback atual e o salvamento de tokens.
- Depois da implementação, você testa pelo botão “Conectar Gmail” e pela página `/settings/google-diagnostico`.