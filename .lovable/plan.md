## Plano

Vou corrigir a tela de conexão do Gmail para que ela não fique presa em “Conectar” quando a validação demora ou falha no domínio publicado.

### Mudanças propostas

1. **Adicionar timeout na validação do Gmail**
   - Limitar o tempo das tentativas SMTP/IMAP para evitar que o servidor fique esperando indefinidamente.
   - Se passar do limite, retornar uma mensagem clara para tentar novamente ou verificar a senha de app/IMAP.

2. **Melhorar tratamento de erro no botão Conectar**
   - Garantir que qualquer erro do servidor libere o botão e mostre um aviso amigável.
   - Evitar que o estado `submitting` fique preso.

3. **Separar mensagens comuns de erro**
   - Senha de app inválida.
   - IMAP desativado no Gmail.
   - Timeout/rede no servidor.
   - Configuração de criptografia ausente.

4. **Validar depois da alteração**
   - Conferir que o botão volta ao normal quando a conexão falha.
   - Conferir que, quando a conta já estiver conectada, a página sai do formulário e entra na caixa de emails.

### Arquivos prováveis

- `src/lib/email.server.ts`
- `src/lib/email.functions.ts`
- `src/routes/email.tsx`