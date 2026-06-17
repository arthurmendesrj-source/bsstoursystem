## Causa raiz do "otp_expired"

A URL retorna `error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`. Não é tempo — é que a edge function `admin-users`, logo após `inviteUserByEmail`, chama `admin.auth.admin.updateUserById(..., { email_confirm: true })`. Marcar o e-mail como confirmado **invalida o token do convite imediatamente**. Quando o usuário clica no link, o Supabase responde "expirado".

(Causa secundária possível: pré-fetch de antivírus do Gmail consumindo o link uma vez antes do usuário.)

## Correções

1. **Remover `email_confirm: true` da ação `invite`** em `supabase/functions/admin-users/index.ts`. O e-mail é confirmado naturalmente quando o usuário aceita o convite.
2. **Reimplantar** a edge function `admin-users`.
3. **Melhorar a tela `/accept-invite`** para detectar erro no hash (`error_code=otp_expired`) e mostrar mensagem clara + botão "Reenviar convite" (na verdade, instrução para pedir reenvio ao admin).
4. **Teste automatizado pós-deploy**: chamar a edge function `admin-users` action `invite` com um e-mail descartável e verificar o retorno (sem `email_confirm`); inspecionar logs.
5. **Teste manual real** (necessário você): após o deploy, reenviar convite a `boscobssteste1@gmail.com` e clicar no link novo. Esperado: abrir `/accept-invite` com formulário de senha (sem `otp_expired`).

## Observação importante sobre teste end-to-end

Não consigo clicar no link do e-mail real (não tenho acesso à caixa do Gmail do convidado). O que posso testar automaticamente:
- Build e deploy ok da edge function.
- Chamada à edge function `invite` retorna `{ok:true}` sem chamar `email_confirm`.
- Tela `/accept-invite` renderiza corretamente os 3 estados (verificando, válido, inválido).

O clique no link de convite real precisa ser feito por você — eu deixarei tudo pronto e validado até onde é possível sem acesso ao seu Gmail.