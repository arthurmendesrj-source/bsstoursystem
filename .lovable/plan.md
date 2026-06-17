## Problema

As políticas permissivas do bucket `proposal-docs` em `storage.objects` ainda checam **`auth.uid() = primeira pasta`**, padrão antigo onde o caminho começava pelo user UUID. Hoje os uploads salvam como `tenant_id/user_id/quote_id/arquivo.docx` (ver `generate-proposal-doc/index.ts` e `tenantStorage.ts`), então:

- a política restritiva nova (`tenant_scope_proposal-docs_*` → `storage_path_allowed_for_user`) já bloqueia cruzamento entre tenants, mas
- as permissivas comparam user UUID com `tenant_id` e **nunca casam** — qualquer não-admin é barrado dos próprios arquivos.
- Falta também alinhamento conceitual com os outros buckets: tenant primeiro, isolamento via `is_tenant_member`.

## Solução (migração SQL)

Substituir as 4 políticas permissivas de `proposal-docs` por versões tenant-aware. Padrão: primeira pasta = `tenant_id` UUID e o usuário precisa ser membro ativo desse tenant (ou super_admin / admin global).

Migração:

1. `DROP POLICY` em `storage.objects`:
   - `Owners or admins read proposal-docs`
   - `Authenticated users can upload proposal docs`
   - `Owners or admins can update proposal docs`
   - `Owners or admins can delete proposal docs`

2. `CREATE POLICY` (permissive, TO authenticated) com `bucket_id = 'proposal-docs'` AND `public.storage_path_allowed_for_user(name)` para SELECT / INSERT / UPDATE.

3. DELETE mais estrito: tenant member **AND** (`auth.uid()::text = (storage.foldername(name))[2]` — i.e. é o criador do arquivo) **OR** `has_role(auth.uid(),'admin')`. Mantém a regra original "dono ou admin pode apagar", mas dentro do escopo do tenant.

A política restritiva existente continua intacta como segunda camada.

## Dados antigos

Se houver objetos legados com user UUID na primeira pasta (anteriores a `tenantStorage.ts`), eles passam a ficar inacessíveis (já estavam barrados pela restritiva). **Fora do escopo desta correção** — posso fazer uma varredura + migração de caminhos depois, se você quiser.

## Sem alterações no código

`generate-proposal-doc/index.ts` e `ProposalDocumentsList.tsx` já usam `tenant_id/...`, então nenhuma mudança em TypeScript é necessária.
