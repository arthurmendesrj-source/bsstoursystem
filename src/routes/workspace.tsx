import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Briefcase, ArrowRight } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/workspace")({
  component: () => (
    <AuthGate>
      <AppShell>
        <WorkspaceHome />
      </AppShell>
    </AuthGate>
  ),
});

type LeadRow = { id: string; name: string; code: string | null; status: string; destination: string | null };

function WorkspaceHome() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [destination, setDestination] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("leads")
        .select("id,name,code,status,destination")
        .order("created_at", { ascending: false })
        .limit(20);
      setLeads(data || []);
      setLoading(false);
    })();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t("name") + " *");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .from("leads")
      .insert({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        destination: destination.trim() || null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error(t("errorOccurred"));
      return;
    }
    toast.success(t("leadCreated"));
    navigate({ to: "/leads/$leadId", params: { leadId: data.id } });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Briefcase className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{t("workspace")}</h1>
          <p className="text-sm text-muted-foreground">{t("workspaceIntro")}</p>
        </div>
      </div>

      <Tabs defaultValue="select" className="w-full">
        <TabsList>
          <TabsTrigger value="select">{t("selectLead")}</TabsTrigger>
          <TabsTrigger value="create">
            <Plus className="mr-1 h-4 w-4" />
            {t("createNewLead")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="select" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("recentLeads")}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">{t("loading")}</p>
              ) : leads.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="text-sm text-muted-foreground">{t("workspaceEmpty")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("workspaceEmptyHint")}</p>
                </div>
              ) : (
                <ScrollArea className="h-[420px]">
                  <div className="space-y-2 pr-2">
                    {leads.map((l) => (
                      <Link
                        key={l.id}
                        to="/leads/$leadId"
                        params={{ leadId: l.id }}
                        className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 transition-colors hover:bg-accent"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{l.name}</span>
                            {l.code && (
                              <Badge variant="outline" className="text-[10px]">
                                {l.code}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {l.destination || "—"} · {l.status}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("createNewLead")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("name")} *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("email")}</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
                </div>
                <div className="space-y-2">
                  <Label>{t("phone")}</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("destination")}</Label>
                  <Input value={destination} onChange={(e) => setDestination(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? t("loading") : t("createNewLead")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
