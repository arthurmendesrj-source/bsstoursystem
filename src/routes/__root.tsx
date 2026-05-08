import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { ViewAsProvider } from "@/lib/viewAs";
import { PermissionsProvider } from "@/lib/permissions";
import { I18nProvider } from "@/lib/i18n";
import { CurrencyProvider } from "@/lib/currency";
import { Toaster } from "@/components/ui/sonner";
import { PermissionFieldHighlighter } from "@/components/PermissionFieldHighlighter";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TurismoCRM — CRM + ERP para Operadoras de Turismo" },
      { name: "description", content: "Gestão completa de leads, clientes, pacotes e reservas para operadoras de turismo." },
      { property: "og:title", content: "TurismoCRM — CRM + ERP para Operadoras de Turismo" },
      { name: "twitter:title", content: "TurismoCRM — CRM + ERP para Operadoras de Turismo" },
      { property: "og:description", content: "Gestão completa de leads, clientes, pacotes e reservas para operadoras de turismo." },
      { name: "twitter:description", content: "Gestão completa de leads, clientes, pacotes e reservas para operadoras de turismo." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5530cdf1-5e99-459f-a7bf-44c957a3c3c0/id-preview-430f8f00--e04e61e2-142f-4f0a-97f1-8cfe086322f3.lovable.app-1778246549495.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5530cdf1-5e99-459f-a7bf-44c957a3c3c0/id-preview-430f8f00--e04e61e2-142f-4f0a-97f1-8cfe086322f3.lovable.app-1778246549495.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <I18nProvider>
      <CurrencyProvider>
        <AuthProvider>
          <ViewAsProvider>
            <PermissionsProvider>
              <Outlet />
              <PermissionFieldHighlighter />
              <Toaster />
            </PermissionsProvider>
          </ViewAsProvider>
        </AuthProvider>
      </CurrencyProvider>
    </I18nProvider>
  );
}
