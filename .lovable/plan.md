## Problema

`src/routes/billing.tsx` usa `useQuery` / `useMutation` / `useQueryClient` do `@tanstack/react-query`, mas o app **não tem `QueryClientProvider` em lugar nenhum**. Por isso aparece o erro "No QueryClient set, use QueryClientProvider to set one" toda vez que `/billing` renderiza.

Nenhum outro arquivo do projeto usa react-query — só billing.tsx — então basta plugar o provider uma vez na raiz.

## Mudanças

**1. `src/router.tsx`** — criar um `QueryClient` por request dentro de `getRouter` e passar via `context` (padrão SSR-safe do template TanStack Start + Query):

```ts
import { QueryClient } from "@tanstack/react-query";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultErrorComponent: DefaultErrorComponent,
  });
  return router;
};
```

**2. `src/routes/__root.tsx`** — trocar `createRootRoute` por `createRootRouteWithContext<{ queryClient: QueryClient }>()` e envolver o `<Outlet />` com `<QueryClientProvider client={queryClient}>` lendo do contexto da rota:

```tsx
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({ /* mesmas meta tags */ }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider> … <Outlet /> … </I18nProvider>
    </QueryClientProvider>
  );
}
```

Sem mudanças em `billing.tsx`, banco de dados ou outras rotas. Depois disso, recarregar `/billing` para confirmar que o erro some.
