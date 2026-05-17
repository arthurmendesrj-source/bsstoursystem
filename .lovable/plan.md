# Corrigir acesso a /settings/whatsapp (e demais subpáginas de settings)

## Causa
Em TanStack Router (roteamento flat), `src/routes/settings.tsx` vira **layout pai** de todos os arquivos `settings.*.tsx`. Para o filho aparecer, o pai precisa renderizar `<Outlet />`. Hoje `settings.tsx` renderiza diretamente o formulário de perfil, sem Outlet — então `/settings/whatsapp` (e `/settings/sla`, `/settings/templates`, `/settings/permissions`) mostram a tela de perfil em vez do conteúdo da subpágina.

Sintoma confirmado no replay: ao abrir `/settings/whatsapp` aparecem campos email/nome/telefone e botão "Salvar" — exatamente o `SettingsPage`.

## Solução
Renomear `src/routes/settings.tsx` para `src/routes/settings.index.tsx`.

Com isso, no roteamento flat:
- não existe mais um layout pai `/settings` capturando os filhos;
- `/settings` continua funcionando (servido por `settings.index.tsx`);
- `/settings/whatsapp`, `/settings/sla`, `/settings/templates`, `/settings/permissions` passam a renderizar suas próprias páginas normalmente.

## Passos
1. Renomear arquivo: `src/routes/settings.tsx` → `src/routes/settings.index.tsx`.
2. Ajustar o `createFileRoute("/settings")` para `createFileRoute("/settings/")` dentro do arquivo renomeado (convenção do TanStack para index routes).
3. Deixar o plugin do TanStack regenerar `routeTree.gen.ts` automaticamente (não editar manualmente).
4. Verificar no preview que `/settings`, `/settings/whatsapp`, `/settings/sla`, `/settings/templates` e `/settings/permissions` abrem corretamente.

## Fora de escopo
Nenhuma mudança em lógica de WhatsApp, autenticação ou backend — só a estrutura de rotas.
