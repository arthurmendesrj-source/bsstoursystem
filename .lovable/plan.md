## Plano: Desconectar todas as contas Gmail do projeto

### O que será feito

1. **Desconectar TODAS as conexões Gmail vinculadas ao projeto**
   - `arthurmendesrj@gmail.com`
   - `booking@adatours.com`
   - Usar `standard_connectors--disconnect` para cada uma — remove os secrets `GOOGLE_MAIL_API_KEY` e `GOOGLE_MAIL_API_KEY_1` do projeto
   - As conexões continuam existindo no workspace, apenas deixam de estar vinculadas a este projeto

2. **Garantir que apenas os 50 emails de teste permaneçam**
   - Conferir `public.emails` e apagar qualquer registro que não seja `gmail_id LIKE 'seed-2026-%'`
   - Os 50 seeds (`seed-2026-1` a `seed-2026-50`) ficam preservados

3. **Efeito no app**
   - Botões/funções de sync, envio e análise via Gmail (`src/server/gmail.functions.ts`) vão falhar com "GOOGLE_MAIL_API_KEY is not configured" até alguém reconectar
   - A inbox renderizada lê da tabela `emails` — continuará mostrando só os 50 fakes
   - Nenhum código será removido (só desvinculação de credenciais); se quiser também esconder a UI de Gmail, me diga

Confirma que posso prosseguir com a desconexão das duas contas?
