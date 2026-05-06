## Objetivo

Popular a tabela `emails` com 30 mensagens (20 B2B + 10 internas), distribuídas entre as caixas de Alexandra Ermolaeva, Mikhail Kutuzov e Agrafena Svetlova.

## Decisões (assumidas como padrão pois você pulou as perguntas)

- **Faltam 20 emails** dos 50 mencionados. Vou seguir apenas com os 30 enviados nesta leva. Se quiser os outros 20, basta colar depois.
- **Usuários já existem** no sistema (confirmado: Alexandra, Mikhail e Agrafena estão em `profiles`).
- **"Caixa de entrada" por usuário**: como a tabela `emails` é compartilhada e não tem coluna de owner, vou marcar a propriedade colocando o **email do usuário no campo `to_emails`** (sem mudança de schema). Cada usuário verá seus emails filtrando por `to_emails @> ARRAY['<seu_email>']`.

## Distribuição

### B2B — 20 emails (clientes solicitando programas turísticos)
- **Alexandra Ermolaeva** (10): emails 1, 3, 5, 7, 9, 11, 13, 15, 17, 19
- **Agrafena Svetlova** (10): emails 2, 4, 6, 8, 10, 12, 14, 16, 18, 20

### Internos — 10 emails (21–30)
Classificação por natureza:
- **Diretoria → Agrafena Svetlova** (4): 24 (Finanças/aprovação), 25 (Qualidade/auditoria), 27 (RH/contratação), 30 (Compras/cotação)
- **Operacional → divididos 3/3 entre Alexandra e Mikhail**:
  - Alexandra (3): 21 (briefing guias), 26 (marketing/feira), 28 (TI/manutenção)
  - Mikhail (3): 22 (reservas hotéis), 23 (logística equipamentos), 29 (segurança/protocolo)

## Implementação

1. Buscar via edge function (admin-users existente, ação custom ou nova `seed_emails`) os emails reais de auth.users dos 3 usuários — necessário porque psql não acessa schema `auth`.
2. Alternativa mais simples: criar uma migration/função SECURITY DEFINER que retorna emails dos 3 user_ids, ou rodar um script único via edge function que faz INSERT direto.
3. Para cada um dos 30 emails, inserir em `public.emails` com:
   - `gmail_id`: identificador sintético único (ex: `seed-2026-{n}`)
   - `from_email`, `from_name`, `subject`, `body_text`, `snippet`, `received_at`
   - `to_emails`: array com o email do usuário-dono
   - `is_unread: true`, `labels: ['INBOX']`

## Detalhes técnicos

```text
emails table — sem owner_id, ownership inferida via to_emails[]
RLS atual permite SELECT a todos autenticados (filtro será no client/UI)
gmail_id é NOT NULL e único — usar prefixo "seed-" para identificar
```

## Próximo passo

Confirme e eu executo: (a) obtenho os 3 emails reais via função SECURITY DEFINER e (b) faço bulk insert dos 30 registros.
