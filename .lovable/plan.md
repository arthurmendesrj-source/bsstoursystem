## Causa

A tabela `vouchers` tem apenas uma policy de escrita que exige `is_admin(auth.uid())` OU `has_role(auth.uid(), 'operacional')`. O role `operacional` nem existe no sistema (os roles são `admin`, `diretor`, `gerente`, `supervisor`, `operador`). Resultado: qualquer usuário não-admin recebe "new row violates row-level security policy" ao gerar voucher.

## Correção (migração)

Substituir as policies da tabela `vouchers` para usar o sistema de permissões por módulo já existente (`has_module_permission`), alinhado com o resto do app:

```sql
DROP POLICY "Admin/op manage vouchers" ON public.vouchers;
DROP POLICY "Authenticated read vouchers" ON public.vouchers;

-- Leitura: quem pode ver bookings
CREATE POLICY "View vouchers" ON public.vouchers
FOR SELECT TO authenticated
USING (public.has_module_permission(auth.uid(), 'bookings', 'view'));

-- Inserção: quem pode editar bookings; created_by deve ser o próprio usuário
CREATE POLICY "Insert vouchers" ON public.vouchers
FOR INSERT TO authenticated
WITH CHECK (
  public.has_module_permission(auth.uid(), 'bookings', 'edit')
  AND created_by = auth.uid()
);

-- Atualização: quem pode editar bookings
CREATE POLICY "Update vouchers" ON public.vouchers
FOR UPDATE TO authenticated
USING (public.has_module_permission(auth.uid(), 'bookings', 'edit'))
WITH CHECK (public.has_module_permission(auth.uid(), 'bookings', 'edit'));

-- Exclusão: somente admin
CREATE POLICY "Delete vouchers" ON public.vouchers
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));
```

Também aplicar o mesmo padrão a `voucher_send_log` (criada na última migração) caso esteja com policy semelhante restrita a `operacional`.

## Validação

- Logar como `gerente`/`diretor`/`supervisor`/`operador` com permissão `bookings.edit` → botão "Gerar voucher" funciona sem erro de RLS.
- Admin continua funcionando.
- Usuário sem permissão de bookings não consegue criar/ler vouchers.

## Fora de escopo

- Mudanças no fluxo de UI ou nas colunas da tabela.