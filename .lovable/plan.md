## Objetivo

No popup "Adicionar/Editar serviço", garantir que o que o usuário digita no campo **Serviço** seja sempre usado (mesmo sobrepondo sugestões de autocomplete) e, se esse serviço ainda não existir em `ref_services`, cadastrá-lo automaticamente ao salvar.

## Mudanças

### 1. `src/components/proposal/ServiceDialog.tsx`

- Manter `ComboboxAutocomplete` com `allowCustom` (já está), garantindo que o valor digitado livre seja aceito como `service`.
- Ajustar a função `save()` para, antes do insert/update do `quote_items`:
  1. Se `service` está preenchido (trim ≠ ""), comparar (case-insensitive, sem acentos) contra `serviceOpts`.
  2. Se não existir, inserir em `ref_services`:
     - `name`: texto digitado (trim)
     - `slug`: gerado a partir do nome (lowercase, sem acentos, espaços → `-`)
     - `category_id`: null (sem categoria)
  3. Usar `.upsert(..., { onConflict: "slug", ignoreDuplicates: true })` para evitar erro caso slug já exista por concorrência.
  4. Falha ao inserir em `ref_services` não deve bloquear o salvamento do serviço na proposta — apenas logar/avisar via toast suave; o `quote_items` continua sendo gravado normalmente.
- Aplicar a mesma lógica para o campo **Cidade** seguindo o mesmo padrão (inserir em `ref_cities` com `name` e `slug` se a cidade digitada não existir). *Confirmar com usuário se quer também — abaixo só serviço foi pedido; manter apenas serviço por padrão.*

### Detalhes técnicos

- Função utilitária local `slugify(s)`:
  ```ts
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  ```
- RLS: `ref_services` permite INSERT apenas para admin/operacional. Se o usuário não tiver esse papel, o insert falha — nesse caso o serviço da proposta ainda é gravado, e mostramos toast informativo ("Serviço salvo, mas não foi possível cadastrar na lista de referência"). O fluxo principal não quebra.

## Arquivos afetados

- `src/components/proposal/ServiceDialog.tsx` (editado)

Sem migrações de banco de dados.
