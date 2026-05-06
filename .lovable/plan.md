## Diagnóstico

A query em `EmailPanel.loadList` (linha 123) traz `*` da tabela `emails` sem filtrar pelo destinatário, então qualquer usuário vê todos os 50 emails. Além disso, a distribuição atual no banco não segue a regra desejada.

## Plano

### 1. Redistribuir os 50 emails seed (UPDATE no banco via tool insert)

Reatribuir `to_emails` dos seeds 01–50 conforme a regra:

- **Alexandra Ermolaeva** (`alexandra.ermolaeva@sim.local`) → seeds 01,03,05,07,09,11,13,15,17,19,21,23,25,27,29,31,33,35,37,39 (20 emails)
- **Agrafena Svetlova** (`agrafena.svetlova@sim.local`) → seeds 02,04,06,08,10,12,14,16,18,20,41,42,43,44,45,46,47,48,49,50 (20 emails)
- **Mikhail Kutuzov** (`mikhail.kutuzov@sim.local`) → seeds 22,24,26,28,30,32,34,36,38,40 (10 emails)

### 2. Filtrar a inbox pelo email do usuário logado

Em `src/components/email/EmailPanel.tsx`:
- Buscar o email do usuário atual via `supabase.auth.getUser()` (uma vez, em `useEffect`, guardar em estado).
- Em `loadList`, quando `mode !== "lead"`, adicionar `query.contains("to_emails", [currentUserEmail])`.

Resultado: cada usuário vê apenas os emails da sua própria caixa (Alexandra 20, Agrafena 20, Mikhail 10).

### Não vou mexer
- Layout/visual da inbox.
- RLS, migrações, tabelas.
- Lógica de triagem com IA, sync Gmail, ações em emails seed (já corrigidas anteriormente).

Confirma que posso aplicar?