## Problema identificado

A tela mostrada não é o login do sistema: é o formulário de conexão do Gmail. Pelos requests, a conexão retorna sucesso, mas logo depois a página continua tratando a caixa como “não conectada”.

O ponto mais provável no código é o salvamento da senha criptografada: `email_accounts.password_encrypted` é um campo binário no banco, mas o código está inserindo um `Buffer` diretamente. Isso pode salvar em formato incompatível; em seguida, a validação tenta descriptografar, falha, apaga o registro e a tela volta ao formulário.

## Plano de correção

1. Ajustar a criptografia da senha de app para gravar o valor em formato compatível com o banco (`bytea` como string hexadecimal `\x...`), em vez de inserir `Buffer` diretamente.
2. Manter a leitura/descriptografia compatível com registros válidos já existentes.
3. Melhorar o retorno de `getMyAccount` para não parecer “login” quando a conta foi removida por credencial criptografada inválida; a UI deve mostrar uma mensagem clara pedindo para reconectar.
4. Após conectar com a senha de app, forçar a tela `/email` a trocar imediatamente para a caixa de entrada quando `getMyAccount` retornar conectado.
5. Validar pelo sinal certo: depois do clique em “Conectar”, o request de conta deve voltar como conectado e o componente `EmailMailbox` deve ser renderizado.

## Arquivos envolvidos

- `src/lib/email.server.ts`
- `src/lib/email.functions.ts`
- `src/routes/email.tsx`

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>