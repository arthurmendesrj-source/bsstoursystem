# Plano — Exibir aba "Licença" para todos

## Problema
Em `src/components/AppShell.tsx` o link **Licença** só é renderizado quando:
- `isAdmin === true`, ou
- `tenant?.role_in_tenant === "owner"`

Usuários comuns (e contas novas em trial sem tenant carregado) não veem o item, então não conseguem chegar em `/billing` pelo menu.

## Mudança

Arquivo: `src/components/AppShell.tsx`

1. **Remover** o bloco do link "Licença" que está dentro do `if (isAdmin)` (junto com Usuários / Auditoria).
2. **Remover** o bloco duplicado `!isAdmin && tenant?.role_in_tenant === "owner"`.
3. **Adicionar** um único link "Licença" sempre visível, posicionado **logo antes de `/settings`** (no final da nav, junto com Configurações), usando o mesmo `itemClass` e o ícone `Receipt` já importado.

```tsx
<Link
  to="/billing"
  onClick={() => minimizeAllWindows()}
  className={itemClass(path.startsWith("/billing"))}
  title={collapsed ? "Licença" : undefined}
>
  <Receipt className="h-4 w-4 shrink-0" />
  {!collapsed && <span className="truncate">Licença</span>}
</Link>
```

## Não muda
- Página `/billing` em si — as ações de assinar/gerenciar plano continuam protegidas server-side (RLS + checagens no `billing.functions.ts`), então expor o menu não dá privilégio extra.
- `BillingAccessGate`, rotas, banners de trial.
- Nenhuma mudança em backend / migrations.

## Verificação
- Abrir preview como usuário não-admin: o item "Licença" aparece no final do menu lateral, acima de "Configurações".
- Clicar leva para `/billing` normalmente.
