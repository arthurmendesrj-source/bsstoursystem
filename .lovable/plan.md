O erro atual é: o app está tentando ler a caixa do Gmail por IMAP, mas a função publicada não consegue manter essa conexão com `imap.gmail.com:993`, então a lista cai em `Timeout (IMAP connect) após 20000ms`.

Do I know what the issue is? Sim: não é mais só timeout de tela; é a abordagem IMAP/SMTP direta que está falhando no ambiente publicado. A correção mais estável é parar de usar IMAP para listar/abrir emails e usar a API HTTPS do Gmail.

Plano de correção:

1. Trocar leitura da caixa para Gmail API
   - Reimplementar listagem de recebidos/enviados usando endpoints HTTPS do Gmail.
   - Buscar mensagens por `INBOX` e `SENT` em vez de abrir conexão IMAP.
   - Manter a busca por assunto/remetente usando a query do Gmail.

2. Trocar abertura de mensagem
   - Ao clicar em um email, carregar o conteúdo pela API do Gmail.
   - Converter headers, remetente, destinatário, assunto, data, texto/html para o formato que a tela já usa.

3. Trocar marcação como lido
   - Substituir `messageFlagsAdd` do IMAP por modificação de labels do Gmail, removendo `UNREAD` quando aplicável.

4. Envio de email
   - Manter envio via Gmail API quando possível, já existe um padrão no projeto para enviar pelo Gmail por HTTPS.
   - Se a tela de “Novo”/“Responder” ainda estiver usando SMTP direto, substituir por envio via Gmail API também.

5. Ajustar conexão da conta
   - Remover a validação IMAP obrigatória da tela “Conectar Gmail”, porque ela é a parte que falha.
   - Em vez disso, validar a conexão pela API do Gmail e exibir um aviso claro se a conta conectada no app não for a mesma caixa esperada.

6. Melhorar mensagem na interface
   - Se ainda faltar autorização ou a conta Gmail correta não estiver conectada, mostrar um estado claro na tela de Email com ação para reconectar, em vez de erro técnico de IMAP.

Detalhes técnicos:
- Arquivos principais: `src/lib/email.functions.ts`, `src/lib/email.server.ts`, `src/components/email/EmailMailbox.tsx`, `src/routes/email.tsx`.
- A correção deve remover o caminho crítico baseado em `imapflow`/`nodemailer` para leitura da caixa.
- A conta Gmail correta precisa estar autorizada com permissões de leitura, envio e modificação de mensagens.

Depois da implementação, será necessário publicar novamente para testar no endereço `bsstoursystem.lovable.app`.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>