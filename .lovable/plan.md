## Problema

A página `/settings/whatsapp` (e demais subpáginas de settings) quebra com:

> Invariant failed: Expected to find a match below the root match in SPA mode.

A causa é o arquivo `src/routes/settings.index.tsx` com `createFileRoute("/settings/")`. Na convenção plana do TanStack Router, o sufixo `.index` declara que existe um pai chamado `settings` com layout próprio. Como não existe `settings.tsx` renderizando `<Outlet />`, as rotas filhas (`settings.whatsapp`, `settings.templates`, `settings.sla`, `settings.permissions`) ficam órfãs sob um pai virtual sem ponto de montagem — daí o invariant.

Além disso, cada subpágina de settings já encapsula seu próprio `<AuthGate><AppShell>...</AppShell></AuthGate>`, então não há motivo para um layout compartilhado.

## Plano

Tornar todas as rotas de settings irmãs planas sob a raiz, sem pai compartilhado.

1. Renomear `src/routes/settings.index.tsx` → `src/routes/settings.tsx`.
2. Dentro dele, trocar `createFileRoute("/settings/")` por `createFileRoute("/settings")`.
3. Renomear os filhos para usar o sufixo `_` (opt-out de nesting):
   - `settings.whatsapp.tsx` → `settings_.whatsapp.tsx`
   - `settings.templates.tsx` → `settings_.templates.tsx`
   - `settings.sla.tsx` → `settings_.sla.tsx`
   - `settings.permissions.tsx` → `settings_.permissions.tsx`
4. Em cada arquivo renomeado, manter o `createFileRoute("/settings/whatsapp")` etc. (o caminho de URL não muda; só o filename muda para evitar o agrupamento sob `settings`).
5. Deixar o Vite plugin regenerar `src/routeTree.gen.ts` — nenhum link/import precisa mudar porque as URLs permanecem `/settings`, `/settings/whatsapp`, etc.

## Verificação

- Navegar para `/settings/whatsapp` — deve renderizar a tela de configuração sem invariant.
- Navegar para `/settings`, `/settings/templates`, `/settings/sla`, `/settings/permissions` — todas devem abrir normalmente.
- Confirmar no console que o erro `Expected to find a match below the root match` sumiu.
