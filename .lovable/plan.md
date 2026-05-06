## Distribuição final dos 50 emails

Confirmado os 3 usuários existem com emails:
- Alexandra Ermolaeva → `alexandra.ermolaeva@sim.local`
- Mikhail Kutuzov → `mikhail.kutuzov@sim.local`
- Agrafena Svetlova → `agrafena.svetlova@sim.local`

### Categoria 1 — B2B clientes (20) → metade Alexandra / metade Agrafena
- **Alexandra (10)**: 1, 3, 5, 7, 9, 11, 13, 15, 17, 19
- **Agrafena (10)**: 2, 4, 6, 8, 10, 12, 14, 16, 18, 20

### Categoria 2 — Operacionais internos (20: emails 21-40) → metade Alexandra / metade Mikhail
- **Alexandra (10)**: 21, 23, 25, 27, 29, 31, 33, 35, 37, 39
- **Mikhail (10)**: 22, 24, 26, 28, 30, 32, 34, 36, 38, 40

### Categoria 3 — Diretoria (10: emails 41-50) → todos Agrafena
- **Agrafena (10)**: 41, 42, 43, 44, 45, 46, 47, 48, 49, 50

### Totais por caixa
- Alexandra: 20 emails (10 B2B + 10 operacionais)
- Mikhail: 10 emails (10 operacionais)
- Agrafena: 20 emails (10 B2B + 10 diretoria)

## Implementação

"Caixa de entrada" será marcada via `to_emails` (array contendo o email do usuário-dono). Sem mudança de schema.

Insert único com 50 linhas em `public.emails`:
- `gmail_id`: `seed-2026-{n}` (único)
- `from_email`, `from_name` extraídos do remetente
- `subject`, `body_text`, `snippet` (primeiros ~140 chars)
- `to_emails`: `ARRAY['<email_dono>']`
- `received_at`: datas escalonadas em fev/mar 2026
- `is_unread: true`, `labels: ['INBOX']`

Após o insert, cada usuário verá apenas seus emails filtrando `to_emails @> ARRAY[<seu_email>]` na UI (a tabela já tem RLS que permite SELECT a autenticados; o filtro é feito no client).

## Próximo passo

Aprove e eu executo o INSERT em massa dos 50 registros.
