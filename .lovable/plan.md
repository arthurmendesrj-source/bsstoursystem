## Plano: Desvincular Google e limpar emails

### O que será feito

1. **Apagar emails reais do Google** da tabela `public.emails`
   - Manter apenas os 50 emails de teste (`gmail_id LIKE 'seed-2026-%'`)
   - Remover todos os outros registros (sincronizados via Gmail API)

2. **Desvincular contas Google dos usuários**
   - Limpar tokens/credenciais armazenados (tabelas tipo `gmail_accounts`, `google_tokens`, `user_integrations` ou similar — preciso confirmar o nome exato)
   - Remover qualquer referência de conexão Gmail nos perfis dos usuários

3. **Limpar dados relacionados** (se existirem)
   - Histórico de sincronização (`sync_state`, `gmail_sync`, etc.)
   - Labels/threads importados do Gmail real

### Antes de executar preciso confirmar

Como a busca de schema do Supabase falhou agora, ao implementar vou:
- Listar tabelas existentes (`information_schema.tables`)
- Identificar quais armazenam tokens/conexões Google
- Executar `DELETE` nas tabelas corretas

### Importante

- Os 50 emails seed (`seed-2026-1` até `seed-2026-50`) serão **preservados**
- A operação é **destrutiva e irreversível** — todos os emails sincronizados do Gmail real serão perdidos
- Após executar, os usuários precisarão reconectar o Google se quiserem sincronizar novamente

Confirma que posso prosseguir?
