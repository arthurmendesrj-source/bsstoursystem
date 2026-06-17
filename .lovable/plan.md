## Diagnóstico

O erro `Unsupported state or unable to authenticate data` vem do `decipher.final()` em `decryptPassword` (AES-256-GCM). Isso significa que a senha guardada em `email_accounts.password_encrypted` foi cifrada **antes** da `EMAIL_ENCRYPTION_KEY` atual existir (ou com uma chave diferente). Como GCM autentica a integridade, qualquer mudança de chave invalida todos os registros antigos — por isso o IMAP nunca chega a abrir e a caixa fica vazia.

Não é bug de IMAP nem de RLS; é credencial órfã.

## O que vou fazer

1. **`src/lib/email.functions.ts` — `loadAccount`**
   - Envolver `decryptPassword(...)` em `try/catch`.
   - Em falha, retornar `{ needsReconnect: true }` em vez de propagar o erro 500.

2. **`listMessagesFn` / `fetchMessageFn` / `sendEmailFn` / `markReadFn`**
   - Quando `loadAccount` indica `needsReconnect`, responder com `{ connected: false, needsReconnect: true, messages: [] }` (ou erro amigável nas operações de envio/leitura unitária).

3. **`getMyAccount`**
   - Tentar descriptografar; se falhar, marcar `connected: false, needsReconnect: true` para a UI já pedir nova senha.

4. **`src/routes/email.tsx` e `src/components/email/EmailMailbox.tsx`**
   - Quando `needsReconnect` for `true`, mostrar aviso ("Sua senha de app precisa ser informada novamente") e abrir o formulário de senha automaticamente, em vez de uma lista vazia silenciosa.
   - No mirror gerencial (`/gerencial/$userId`), mostrar a mesma mensagem em vez de caixa vazia.

5. **Limpeza do registro inválido**
   - No `connectGmail` já existe `delete` antes de inserir, então basta o usuário (ou o gestor avisar o usuário) reenviar a senha de app no `/email` que o problema se resolve definitivamente.

## Detalhes técnicos

- `EMAIL_ENCRYPTION_KEY` agora está configurada, mas o registro atual em `email_accounts` foi cifrado com chave/IV anteriores → GCM tag não bate → exceção.
- Não há como recuperar a senha antiga; a única ação válida é reconectar.
- Nenhuma alteração de schema é necessária.

## Resultado esperado

Ao abrir `/email`, em vez de erro 500 ou caixa vazia, o usuário verá a mensagem para reinformar a senha de app. Depois de salvar, o inbox e os enviados aparecem normalmente, e o espelho do gestor passa a funcionar.
