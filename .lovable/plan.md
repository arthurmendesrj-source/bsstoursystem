## Plano

1. **Ajustar a lógica de salvamento do Gmail**
   - Quando o Google retornar o e-mail autorizado, o app vai primeiro procurar uma conta já existente do mesmo usuário com esse mesmo e-mail.
   - Se existir uma conta antiga/manual com esse e-mail, ela será convertida para conexão Gmail OAuth em vez de tentar criar outra linha duplicada.
   - Se já existir uma conexão OAuth antiga para outro e-mail do mesmo usuário, ela será substituída pela nova autorização.

2. **Criar uma operação transacional no banco**
   - Adicionar uma função segura no backend para salvar a conta Gmail em uma única operação, evitando conflito entre as regras únicas `user_id + email` e `user_id + provider`.
   - A função vai manter apenas uma conexão Gmail OAuth ativa por usuário.

3. **Atualizar o callback do Google**
   - Trocar o `.upsert()` atual por chamada à nova operação transacional.
   - Manter a tela de sucesso/erro como está.

4. **Validar o fluxo**
   - Conferir que a constraint existe e que o callback deixa de gerar `duplicate key value violates unique constraint "email_accounts_user_id_email_key"`.
   - Depois você poderá fechar a aba de erro e tentar conectar o Gmail novamente.

## Detalhe técnico

O erro atual não é mais a constraint anterior de `user_id + provider`. Agora ele vem da constraint `user_id + email`: já existe uma conta com o mesmo Gmail para esse usuário, e o callback está tentando inserir outra linha com o mesmo e-mail. A correção é reaproveitar/atualizar a linha existente em vez de inserir uma nova.