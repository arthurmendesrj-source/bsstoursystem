## Problema
Na tela `/billing` quando não há tenant selecionado, o botão dos cards de plano mostra "Selecione uma empresa" e fica desabilitado. Quero que ele diga "Selecionar plano" e funcione.

## Diagnóstico
- `PlansSection` recebe `tenantId={null}` no branch sem tenant (linha 84 de `src/routes/billing.tsx`) → botão desabilitado com texto "Selecione uma empresa".
- A criação automática de empresa já existe em `TenantProvider.load()` (mexido na sessão anterior). Falta uma forma imperativa de garantir o tenant **no momento do clique** quando, por qualquer motivo, ainda não há um.

## Mudanças

### 1. `src/lib/tenant.tsx`
- Extrair a lógica de auto-criação de tenant numa função interna `createDefaultTenant(userId, email)` (mesma regra: nome do profile/email, slug + sufixo do user.id, retry com sufixo aleatório, insert em `tenants` + `tenant_members`).
- Reutilizar essa função em `load()` (refactor sem mudar comportamento).
- Expor no contexto um novo método `ensureTenant(): Promise<Tenant | null>` que:
  1. Se já existe `tenant`, retorna ele.
  2. Caso contrário, chama `createDefaultTenant`, depois `load()`, e retorna o tenant ativo resultante.

### 2. `src/routes/billing.tsx` — `PlansSection`
- Passar a usar `useTenant()` para pegar `ensureTenant`.
- Botão: o `disabled` deixa de depender de `!tenantId`; passa a depender só de `isCurrent || mut.isPending`.
- Label do botão:
  - `isCurrent` → "Plano atual"
  - `mut.isPending` → "Aplicando…"
  - sem tenant ainda → "Selecionar plano" (em vez de "Selecione uma empresa")
  - caso normal → "Assinar este plano"
- Remover o `title` "Selecione uma empresa para assinar".
- `mutationFn` recebe `plan_code` e resolve o tenant via `ensureTenant()` antes de chamar `changeFn`:
  ```ts
  mutationFn: async (plan_code: string) => {
    const t = tenantId ? { id: tenantId } : await ensureTenant();
    if (!t) throw new Error("Não foi possível preparar sua empresa. Tente novamente.");
    return changeFn({ data: { tenant_id: t.id, plan_code } });
  }
  ```
- Após sucesso, além de invalidar `billing-overview`, chamar `reload()` do tenant context para refletir a nova empresa/assinatura.

### 3. Texto do branch sem tenant (linha 79-82)
Trocar a frase secundária para algo neutro (já que a empresa será criada automaticamente ao escolher um plano):
> "Você ainda não tem um pacote assinado. Escolha um plano abaixo para começar."

## Fora de escopo
- Nada muda no schema, nas server functions de billing, nem no fluxo de troca de plano para usuários que já têm tenant.
- O gate de assinatura bloqueada (`/billing` redirect) continua igual.
