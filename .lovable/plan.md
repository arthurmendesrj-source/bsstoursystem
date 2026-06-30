## Liberar "Aprovar proposta" para toda a hierarquia

### Diagnóstico

Hoje, em `role_module_permissions` para o módulo **`quotes`**:

```text
admin       → approve ✓
diretor     → approve ✓
gerente     → approve ✓
supervisor  → approve ✗
coordenador → approve ✗   ← booking@adatours.com cai aqui
operador    → approve ✗
```

Por isso o botão "Aprovar proposta" não aparece para Coordenação, Supervisão e Operação — mesmo sendo justamente quem opera a venda.

### Mudança (uma linha de SQL)

Atualizar `role_module_permissions` para que **todos os papéis da hierarquia** tenham `can_approve = true` no módulo `quotes`:

```sql
UPDATE public.role_module_permissions
   SET can_approve = true
 WHERE module_key = 'quotes'
   AND role IN ('supervisor','coordenador','operador');
```

Resultado esperado após aplicar:

| Papel | view | edit | approve |
|---|---|---|---|
| admin | ✓ | ✓ | ✓ |
| diretor | ✓ | ✓ | ✓ |
| gerente | ✓ | ✓ | ✓ |
| supervisor | ✓ | ✓ | **✓** |
| coordenador | ✓ | ✓ | **✓** |
| operador | ✓ | ✗ | **✓** |

Obs.: `operador` continua sem `can_edit`, então só vê o botão se também tiver edição liberada (o componente exige `canEdit` para o `approve()` rodar). Se quiser que Operação também aprove, posso liberar `can_edit` no mesmo update — me avise.

### Não muda

- Código da UI (`ProposalEditor.tsx`).
- Permissões dos outros módulos (leads, bookings, financial etc.).
- Permissões individuais por usuário (`user_module_permissions`) — overrides continuam valendo se existirem.

### Efeito prático

Imediato após aplicar: refresh da página → todo usuário da hierarquia passa a ver "Aprovar proposta" / "Reabrir proposta" na barra do editor de propostas.
