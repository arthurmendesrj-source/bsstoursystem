# Mostrar subordinados para Diretor e Gerente no painel de E-mail

## Diagnóstico

No `/email`, ao impersonar um Diretor (Agrafena) ou Gerente (Alexandra), os campos
**"Atribuir a"** (em Criar Lead) e **"Responsável"** (em Criar Atividade), além do uso na **Triagem IA**, não aparecem.

Causa: o hook `useSubordinates` (`src/lib/hierarchy.ts`) lista subordinados via:

```ts
supabase.from("user_roles").select("user_id,role")
```

Mas a RLS de `user_roles` só permite leitura completa para admin:

```
Admins view all roles  → is_admin(auth.uid())
Users view own roles   → auth.uid() = user_id
```

Resultado: para Diretor/Gerente, a query devolve só a própria linha, `myRank` ainda é
calculado, mas o map `byUser` só contém o próprio usuário e a lista final fica vazia →
o gate `subordinates.length > 0` esconde os campos. Para o Admin funciona porque ele lê tudo.

(Os botões "Criar Lead", "Criar Atividade" e "Triagem IA" em si já aparecem — o gate é só `mode === "full"`. O que some é a seção de atribuição a subordinado.)

## Correção

Trocar a leitura direta de `user_roles` pela função `public.get_subordinates(_user_id)` que já existe no banco como SECURITY DEFINER e respeita a hierarquia (admin/diretor → todos abaixo; gerente → supervisor + operador; etc).

### Mudanças

**1. `src/lib/hierarchy.ts`** — refatorar `useSubordinates`:

- Chamar `supabase.rpc("get_subordinates", { _user_id: user.id })` para obter os IDs dos subordinados.
- Em paralelo, buscar `profiles(user_id, full_name)` e `user_roles(user_id, role)` filtrando `IN (subordinate_ids)`.
- Manter o shape de retorno (`{ user_id, full_name, role }[]`) para não quebrar consumidores.
- Manter o cálculo do "maior papel por usuário" no client (caso um sub tenha múltiplos roles).

**2. RLS em `user_roles`** — adicionar policy SELECT para deixar qualquer usuário autenticado ler os papéis dos próprios subordinados, via `is_subordinate_of(user_id, auth.uid())`. Isso garante que o `IN (...)` da etapa 1 retorne os roles esperados sem expor a tabela inteira.

```sql
CREATE POLICY "Users view subordinate roles"
  ON public.user_roles FOR SELECT
  USING (public.is_subordinate_of(user_id, auth.uid()));
```

(Também adiciona uma policy análoga em `profiles` se necessário — verificar antes; a tabela já é mais aberta.)

### Não muda

- Botões "Criar Lead / Criar Atividade / Triagem IA" continuam gated apenas por `mode === "full"`.
- Nenhuma alteração visual ou de fluxo.
- Admin continua vendo tudo via `is_admin`.

## Verificação

1. Logar como Admin → dropdown de subordinados continua mostrando todos abaixo.
2. Impersonar Agrafena (diretor) → ver Alexandra, Mikhail, Sergei.
3. Impersonar Alexandra (gerente) → ver Mikhail, Sergei.
4. Impersonar Mikhail (supervisor) → ver Sergei.
5. Operador (Sergei) → dropdown segue oculto (sem subordinados).
