## Diagnóstico

O usuário `booking@adatours.com` (id `d3dc917b-...`) ainda existe em `auth.users` com:
- `last_sign_in_at` preenchido (login antigo de maio)
- **sem** `profiles`
- **sem** `email_accounts`
- 1 linha residual em `tenant_members`

A regra atual de órfão em `admin-users/index.ts` (linha 261) só limpa quando `!profile && !hasLogin`. Como esse e-mail tem `last_sign_in_at`, o convite cai no ramo 409 ("E-mail já cadastrado e ativo em outro acesso") em vez de fazer cascata e reconvidar.

`last_sign_in_at` é sinal não confiável depois de exclusões parciais — fica preenchido para sempre mesmo após o usuário ter sido apagado da aplicação.

## Mudanças

### 1. `supabase/functions/admin-users/index.ts` — refinar detecção de órfão
Substituir a regra por: **órfão = sem `profiles` E sem `tenant_members` ativo**. `last_sign_in_at` deixa de ser critério de bloqueio.

```ts
const isOrphan = !prof && !actMember;
if (isOrphan) {
  await cascadeCleanupUser(admin, dup.id);
  await admin.auth.admin.deleteUser(dup.id);
  // segue para inviteUserByEmail normalmente
} else {
  // só bloqueia se realmente houver vínculo ativo (profile OU membership ativo)
  return json({ error: "E-mail já cadastrado e ativo..." }, 409);
}
```

Resultado: qualquer e-mail sem profile e sem tenant ativo é tratado como reaproveitável.

### 2. Limpeza pontual de `booking@adatours.com`
Remover o `tenant_members` residual e excluir o usuário de `auth.users` via `admin-users action=delete` (cascata completa), para destravar o convite imediatamente sem depender do novo deploy.

### 3. Redeploy da função `admin-users`.

## Não inclui
- Sem mudanças no front. Sem alteração de schema. Apenas edge function + limpeza de dados.
