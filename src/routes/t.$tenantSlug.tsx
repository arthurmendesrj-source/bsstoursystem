import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTenant } from "@/lib/tenant";
import { toast } from "sonner";

export const Route = createFileRoute("/t/$tenantSlug")({
  component: TenantSwitchAlias,
});

function TenantSwitchAlias() {
  const { tenantSlug } = useParams({ from: "/t/$tenantSlug" });
  const { tenants, switchTenant, loading } = useTenant();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    const found = tenants.find((t) => t.slug === tenantSlug);
    if (!found) {
      toast.error(`Você não tem acesso à empresa "${tenantSlug}".`);
      navigate({ to: "/dashboard" });
      return;
    }
    void switchTenant(tenantSlug).then(() => navigate({ to: "/dashboard" }));
  }, [tenantSlug, tenants, loading, switchTenant, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Trocando para {tenantSlug}…</p>
    </div>
  );
}
