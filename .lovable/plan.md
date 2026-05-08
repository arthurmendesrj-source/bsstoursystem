## Problema

Na triagem de IA do email, ao gerar Lead (ou Atividade), o seletor **"Atribuir a"** só aparece quando `subordinates.length > 0`. Como gerente, se o hook ainda está carregando, falhou silenciosamente, ou nenhum subordinado foi resolvido (ex.: ranks/roles não cadastrados), o campo desaparece — sem opção de atribuir mesmo a si mesmo.

## Solução

Em `src/components/email/AiTriageDialog.tsx`:

1. Importar `useAuth` para obter `roles` (já temos `user`).
2. Calcular `canAssign = roles.some(r => ["admin","diretor","gerente","supervisor"].includes(r))`.
3. Trocar a condição `subordinates.length > 0` por `canAssign` nos dois formulários (Lead e Atividade). Assim o seletor aparece sempre para gestores, mesmo que a lista de subordinados venha vazia.
4. Dentro do `Select`, manter `Eu` como primeira opção. Se `subordinates.length === 0 && !loading`, mostrar item desabilitado "Nenhum subordinado disponível". Se `loading`, mostrar item desabilitado "Carregando…".
5. Expor `loading` do `useSubordinates()` (já é retornado) e usá-lo na UI.

Nenhuma mudança de banco/RLS — a política `leads_insert` já aceita `assigned_to = auth.uid()` ou subordinado.

## Arquivos afetados

- `src/components/email/AiTriageDialog.tsx`
