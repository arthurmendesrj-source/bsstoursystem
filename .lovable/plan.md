## Objetivo

Tornar **privado ao Admin criador** tudo que ele cria. Nenhum outro usuário (nem outros admins) verá esses registros.

## Tabelas afetadas

`leads`, `quotes`, `quote_items`, `quote_flights`, `bookings`, `booking_pax`, `booking_suppliers`, `booking_item_confirmations`, `customers`, `interactions`, `operations_activities`, `itineraries`, `emails`.

## Abordagem técnica

1. Criar função `is_admin_owned(_created_by uuid) returns boolean` (SECURITY DEFINER, STABLE) que retorna `true` quando `_created_by` possui role `admin`.

2. Adicionar a TODAS as policies de SELECT / UPDATE / DELETE das tabelas acima a cláusula:

   ```
   AND (NOT public.is_admin_owned(<col_dono>) OR auth.uid() = <col_dono>)
   ```

   - Coluna usada: `created_by` na maioria. Em `quote_items`, `quote_flights`, `booking_pax`, `booking_suppliers`, `booking_item_confirmations` o "dono" é resolvido via subselect no `quotes.created_by` / `bookings.created_by`.
   - Em `leads` o filtro também considera `assigned_to` (admin pode criar lead atribuído a outro: nesse caso permanece visível ao designado, pois `created_by` é o admin mas o admin pode reatribuir — abaixo).

3. **Emails**: como não possuem `created_by`, vamos restringir via heurística sugerida abaixo (precisa decisão do usuário se for relevante — emails normalmente são compartilhados). Por padrão **manter como está**, pois email é caixa coletiva. (Confirmar.)

4. **Triggers / hooks de notificação** continuam disparando normalmente.

## Comportamento resultante

- Admin cria um lead/cotação/booking/cliente/atividade → apenas ele vê e edita.
- Outros admins, diretores, gerentes, operadores: registros do admin ficam invisíveis.
- Registros criados por usuários não-admin permanecem com as regras atuais (hierarquia/permissões).
- Se um admin precisar compartilhar, basta mudar `created_by` (ou usar um usuário não-admin para criar).

## Migração (resumo SQL)

```sql
CREATE OR REPLACE FUNCTION public.is_admin_owned(_created_by uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT _created_by IS NOT NULL AND public.is_admin(_created_by);
$$;

-- Para cada tabela, DROP POLICY existente e recriar adicionando:
--   AND (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
-- nas policies SELECT/UPDATE/DELETE.
-- Para tabelas-filhas (quote_items etc), usar EXISTS no parent.
```

## Verificação

- Logar como Admin → criar lead/cotação/atividade → confirmar visível só para ele.
- Logar como Diretor/Gerente/Operador → confirmar que registros do Admin não aparecem em listas, dashboard, triagem, e-mail panel, bíblia.
- Registros pré-existentes criados pelo Admin tornam-se invisíveis para os demais (efeito retroativo desejado).

## Pendência de confirmação

- **Emails**: manter compartilhados (recomendado) ou também restringir por algum critério?
