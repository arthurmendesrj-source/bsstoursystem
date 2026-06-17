## Problema

Ao clicar em **Accept Invitation** no e-mail, o usuário é levado para `${APP_URL}/` com um token de convite no hash da URL. Como o app não tem uma página dedicada para tratar esse fluxo, o redirecionamento padrão (auth gate) joga o convidado direto em `/login`, onde ele não tem como criar senha — então o convite trava.

A função `admin-users` envia hoje:
```
redirectTo = `${APP_URL}/`
```
e não existe uma rota que detecte `type=invite` no hash e ofereça o formulário de cadastro de senha.

## Solução

### 1. Nova rota pública `/accept-invite` (`src/routes/accept-invite.tsx`)
- Mesmo padrão da rota `/reset-password` existente.
- Em `useEffect`:
  - chama `supabase.auth.getSession()` — o link de convite já cria sessão automaticamente via hash;
  - escuta `onAuthStateChange` para `SIGNED_IN` / `USER_UPDATED`;
  - se houver sessão, mostra formulário com **Nome completo** + **Nova senha** + **Confirmar senha**.
- Ao submeter:
  - `supabase.auth.updateUser({ password, data: { full_name } })`;
  - toast de sucesso e `navigate({ to: "/dashboard" })` (já estará logado, com profile/role/tenant criados pela edge function no momento do convite).
- Se não houver sessão (link expirado / já usado), mostra mensagem orientando a solicitar novo convite ao gestor.
- Rota fora de `_authenticated/` (pública) para não disparar o gate de auth.

### 2. Atualizar `supabase/functions/admin-users/index.ts`
- Trocar nas duas chamadas de `inviteUserByEmail`:
  ```ts
  const redirectTo = `${APP_URL}/accept-invite`;
  ```
  (linhas 152 e 186).
- Sem outras mudanças na lógica de criação de profile/role/tenant.

### 3. Garantir que `/login` não engula o hash do convite
- Adicionar no início de `LoginPage` um efeito que, se `window.location.hash` contiver `type=invite`, redireciona para `/accept-invite` preservando o hash. Isso cobre convites antigos já enviados com `redirectTo = /`.

## Teste manual após implementação

1. Reenviar convite para `boscobssteste1@gmail.com` como **Operador**.
2. Abrir o e-mail → clicar em **Accept Invitation**.
3. Esperado: cair em `/accept-invite`, definir nome + senha, ser redirecionado para `/dashboard` como membro do tenant `Diretor1` com role `operator`.
