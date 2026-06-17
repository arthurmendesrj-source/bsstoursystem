Vou ajustar o fluxo de convite para ficar exatamente assim:

1. **Link do convite sempre cai em uma tela própria**
   - Manter `/accept-invite` como rota pública dedicada.
   - Ela será a única tela para o convidado concluir o cadastro, sem passar pelo login.
   - A tela mostrará e-mail, nome completo, senha e confirmação de senha.

2. **Processar corretamente o token do convite**
   - Ao abrir o link `Accept Invitation`, a página `/accept-invite` vai detectar o token recebido no link.
   - Se necessário, a página chamará o método correto do auth para trocar o token por sessão antes de mostrar o formulário.
   - Isso evita o erro atual em que o usuário cai no login porque a sessão ainda não foi reconhecida.

3. **Cadastrar senha do novo usuário**
   - Ao enviar o formulário, chamar atualização do usuário para definir a nova senha e salvar o nome.
   - Depois disso, redirecionar para o dashboard já logado.

4. **Preservar vínculo com quem convidou**
   - O convite continuará gravando o `tenant_id` do convidador nos metadados e já criando o vínculo em `tenant_members`.
   - Vou conferir/ajustar para o convidado não criar uma empresa própria ao primeiro login; ele deve entrar na conta/empresa do convidador.

5. **Corrigir convites antigos que ainda caiam em `/login`**
   - Se um link antigo chegar no login com token de convite, redirecionar imediatamente para `/accept-invite` preservando o token.

6. **Validação esperada**
   - Admin/diretor envia convite.
   - Convidado clica em `Accept Invitation`.
   - Abre `/accept-invite`, não `/login`.
   - Convidado cria senha.
   - Entra no app vinculado à mesma conta/empresa de quem convidou.