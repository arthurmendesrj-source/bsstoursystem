## Abrir email da aba Atendimento → Email em janela flutuante

Hoje, na aba **Email** do `/workspace`, o `EmailPanel` em `mode="lead"` renderiza `LeadEmailMini`, que apenas lista os emails vinculados ao lead em `divs` estáticos — sem clique, sem leitor. Vamos transformar cada linha em um item clicável que abre o email completo numa janela flutuante (mesmo padrão do `/email`), permitindo ler, responder, encaminhar, arquivar, lixeira, etc.

### Arquivo único: `src/components/email/EmailPanel.tsx` — refatorar `LeadEmailMini`

1. **Buscar `thread_id`** além dos campos atuais ao consultar `emails` (necessário para abrir o thread completo). Carregar até 50 mais recentes do lead, de-duplicando por `thread_id` (último email de cada thread).

2. **Linhas clicáveis** (1 clique abre): cada item vira um `<button>` (estilo igual ao atual, com hover) que dispara `openOrFocus` no `ThreadWindowManager`.

3. **Montar `ThreadWindowManager` dentro do `LeadEmailMini`**, reutilizando os mesmos server functions já existentes no arquivo (`gmailGetThread`, `gmailGetAttachment`, `gmailSend`) via `useServerFn`. Handlers passados ao manager:
   - `fetchMessages(threadId)` → chama `gmailGetThread`.
   - `onMarkRead(threadId)` → `update emails/email_threads is_unread=false` (igual `markThreadRead`).
   - `onStar(thread)` → toggle `is_starred` em `email_threads` + `emails`.
   - `onArchive(threadId)` → remove `INBOX` de `labels` em `email_threads`.
   - `onTrash(threadId)` → adiciona `TRASH` / remove `INBOX`.
   - `onReply` / `onForward` → abrem um `Dialog` de composição local (mesmo formato do `composeOpen` do `EmailPanel`: To/Subject/Body + botão Enviar via `gmailSend`).
   - `onDownloadAttachment` → mesma lógica de `downloadAttachment` (base64 → Blob → download).

4. **Estado vazio** mantém "Nenhum e-mail vinculado.".

5. **Sem mudanças no `ThreadWindowManager`, `ThreadReader`, ou rotas.** O comportamento da janela (mover, minimizar, maximizar, fechar) já existe.

### Validação

1. Em `/workspace?lead=...` → aba **Email** mostra a lista de emails vinculados ao lead.
2. Clique em uma linha → abre janela flutuante com o thread completo (ThreadReader), com cabeçalho, mensagens, anexos.
3. Botões Responder e Encaminhar abrem dialog de composição e enviam pelo Gmail.
4. Estrelar/arquivar/lixeira atualizam o banco e a UI.
5. Anexos podem ser baixados.
6. Aba `/email` continua funcionando exatamente como antes (não tocamos no fluxo principal).
