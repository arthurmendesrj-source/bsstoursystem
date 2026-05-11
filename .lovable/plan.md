Plano para corrigir o erro `labels upsert: new row violates row-level security policy for table "email_labels"`:

1. Ajustar a estrutura de `email_labels`
   - O problema provável é que `email_labels.id` hoje é chave única global.
   - Etiquetas padrão do Gmail como `INBOX`, `SENT`, `TRASH` se repetem para todos os usuários/contas.
   - Quando um novo usuário sincroniza, o sistema tenta atualizar uma etiqueta que pertence a outra conta, e a regra de segurança bloqueia.
   - Vou alterar a chave para ser por conta: `owner_email + id`.

2. Ajustar a sincronização das etiquetas
   - Atualizar o `upsert` de etiquetas para usar conflito por `owner_email,id`, não apenas `id`.
   - Assim cada usuário/conta terá suas próprias etiquetas, mesmo quando o nome/id da etiqueta for igual.

3. Garantir vínculo da conta sincronizada
   - Antes de salvar etiquetas, confirmar que o e-mail retornado pela conta Gmail sincronizada está vinculado ao usuário logado em `user_email_accounts`.
   - Se estiver faltando, vincular automaticamente somente depois que o Gmail confirmar o endereço da conta.

4. Preservar segurança dos e-mails
   - Manter as regras atuais que impedem um usuário de ver ou gravar dados de e-mail de outra conta.
   - Não tornar tabelas de e-mail públicas.

Arquivos/tabelas envolvidos:
- Banco: `email_labels`
- Código: `src/server/gmail-mirror.server.ts`

Resultado esperado:
- Novos usuários conseguirão sincronizar seus e-mails sem erro de RLS.
- Etiquetas iguais entre usuários não vão mais conflitar.
- Cada usuário continuará acessando apenas as contas de e-mail vinculadas a ele.