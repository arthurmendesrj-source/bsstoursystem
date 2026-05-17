import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/tenants")({
  component: AdminTenantsPage,
});

type Row = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "trialing" | "past_due" | "suspended" | "canceled";
  created_at: string;
};

function AdminTenantsPage() {
  const { isSuperAdmin, loading } = useTenant();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!loading && !isSuperAdmin) navigate({ to: "/dashboard" });
  }, [loading, isSuperAdmin, navigate]);

  const load = () =>
    supabase
      .from("tenants")
      .select("id, slug, name, status, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as Row[]));

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  const setStatus = async (id: string, status: Row["status"]) => {
    const { error } = await supabase.from("tenants").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Status atualizado");
      load();
    }
  };

  if (!isSuperAdmin) return null;

  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold">Admin · Empresas</h1>
          <p className="text-muted-foreground">Todas as empresas do SaaS.</p>
        </div>
        <Card>
          <CardHeader><CardTitle>{rows.length} empresa(s)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criada</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground">/{t.slug}</TableCell>
                    <TableCell><Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status}</Badge></TableCell>
                    <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="space-x-2">
                      {t.status !== "suspended" ? (
                        <Button size="sm" variant="outline" onClick={() => setStatus(t.id, "suspended")}>Suspender</Button>
                      ) : (
                        <Button size="sm" onClick={() => setStatus(t.id, "active")}>Reativar</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
