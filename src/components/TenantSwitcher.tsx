import { Building2, Check, ChevronsUpDown, Plus, Shield } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
// Nova empresa / Cobrança movidos para a sidebar (item "Licença").
import { useTenant } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TenantSwitcher() {
  const { tenant, tenants, switchTenant, loading, isSuperAdmin } = useTenant();
  const navigate = useNavigate();

  if (loading) return null;
  if (!tenant && tenants.length === 0) {
    return (
      <Button size="sm" variant="outline" onClick={() => navigate({ to: "/onboarding" })}>
        <Plus className="mr-2 h-4 w-4" /> Criar empresa
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-[220px]">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate">{tenant?.name ?? "Selecionar empresa"}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Suas empresas</DropdownMenuLabel>
        {tenants.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => switchTenant(t.slug)}>
            <div className="flex flex-1 items-center justify-between gap-2">
              <div className="flex flex-col min-w-0">
                <span className="truncate text-sm">{t.name}</span>
                <span className="truncate text-xs text-muted-foreground">/{t.slug} · {t.role_in_tenant}</span>
              </div>
              {tenant?.id === t.id && <Check className="h-4 w-4" />}
            </div>
          </DropdownMenuItem>
        ))}
        {isSuperAdmin && (
          <>
            <DropdownMenuSeparator>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Admin do SaaS</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => navigate({ to: "/admin/tenants" })}>
              <Shield className="mr-2 h-4 w-4" /> Empresas (todas)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate({ to: "/admin/plans" })}>
              <Shield className="mr-2 h-4 w-4" /> Planos
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
