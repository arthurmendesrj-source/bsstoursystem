## Etapa: Adicionar segredos do Google OAuth

Vou reabrir o formulário seguro para você colar os dois valores que copiou do Google Cloud Console:

- **GOOGLE_OAUTH_CLIENT_ID** — algo como `123456789-xxxxxxxx.apps.googleusercontent.com`
- **GOOGLE_OAUTH_CLIENT_SECRET** — algo como `GOCSPX-xxxxxxxxxxxx`

Esses valores ficam guardados apenas no backend (nunca aparecem no código nem no navegador) e serão usados para gerar o link de "Conectar Gmail" individual de cada usuário.

### O que acontece quando você aprovar este plano

1. Abro a janela "Adicionar segredos" com esses dois campos.
2. Você cola os valores e confirma.
3. Eu sigo com a próxima etapa: implementar o fluxo OAuth por usuário (botão "Conectar Gmail" na tela `/email` → callback → salvar tokens em `email_accounts` com `user_id` do usuário logado).

### Se você ainda não criou as credenciais

Me diga "**ainda não criei**" e eu reenvio o tutorial passo a passo do Google Cloud Console antes de abrir o formulário.