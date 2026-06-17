Vou ajustar o fluxo de e-mail para que uma conexão bem-sucedida realmente carregue os recebidos e mostre o motivo quando não carregar.

Plano:
1. Atualizar a listagem de mensagens para retornar um status claro quando a conta está conectada, mas o Gmail/IMAP não devolve mensagens ou falha.
2. Melhorar a tela da caixa para diferenciar:
   - conta não conectada;
   - conta conectada sem mensagens;
   - erro ao acessar Gmail/IMAP;
   - mensagens carregadas normalmente.
3. Corrigir o estado da tela após “Caixa conectada!” para não voltar ao formulário quando a listagem falhar silenciosamente.
4. Adicionar mensagens amigáveis em português orientando a reconectar ou verificar IMAP/senha de app quando necessário.
5. Validar o resultado usando os sinais da própria tela/servidor, sem alterar banco de dados nem credenciais existentes.

Detalhe técnico:
- As regras de acesso da tabela `email_accounts` parecem corretas para o próprio usuário.
- O ponto provável é que `listMessagesFn` retorna lista vazia ou erro não tratado de IMAP, e o componente hoje exibe apenas “Sem mensagens”, sem informar o motivo.