## Diagnóstico

A página `/billing` renderiza apenas "Carregando…" e nada mais aparece. Isso acontece porque o componente `BillingPage` em `src/routes/billing.tsx` faz:

```tsx
if (!tenant) {
  return <AppShell><div className="p-8">Carregando…</div></AppShell>;
}
```

Mas o `useTenant()` já terminou de carregar (`loading=false`) — só que `tenant` é `null`. Isso ocorre em dois cenários reais:

1. **Super-admin sem empresa associada** — o gate de redirecionamento para `/onboarding` ignora super-admins, então eles ficam com `tenants=[]` e `tenant=null`, e `/billing` trava no "Carregando…".
2. **Usuário com empresas, mas nenhuma ativa** — se o `localStorage` tem um slug inválido e `list[0]` também falhar (ex.: corrida de estado), `tenant` fica `null` momentaneamente.

A condição `!tenant` está acoplada ao loading, mas o estado real "sem tenant" nunca é tratado.

## Correção

Em `src/routes/billing.tsx`, separar os três estados:

1. **Carregando de fato** (`loading === true` no `useTenant`): manter "Carregando…".
2. **Sem tenant selecionado mas com empresas disponíveis**: mostrar card pedindo para selecionar uma empresa no seletor do cabeçalho.
3. **Sem nenhuma empresa** (super-admin novo): mostrar card com botão "Criar empresa" linkando para `/onboarding`.

Tudo dentro de `AppShell` para manter sidebar e o `TenantSwitcher` acessíveis.

### Detalhes técnicos

- Expor `loading` do `useTenant()` (já existe) e desestruturar no `BillingPage`.
- Substituir o `if (!tenant)` atual por:
  - `if (loading) → "Carregando…"`
  - `if (!tenant && tenants.length === 0) → CTA "Criar empresa"` com `<Link to="/onboarding">`
  - `if (!tenant) → CTA "Selecione uma empresa"` apontando o usuário ao `TenantSwitcher` do header
- Manter a checagem `isOwner` como está, agora só executada quando há tenant.

## Fora de escopo

- Mudanças na lógica de `useTenant` ou no gate de onboarding.
- Mudanças no `TenantSwitcher` ou no fluxo de planos.
