import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: () => (
    <AuthGate>
      <AppShell>
        <SettingsPage />
      </AppShell>
    </AuthGate>
  ),
});

function SettingsPage() {
  const { t } = useI18n();
  const { user, roles } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name,phone").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) { setName(data.full_name ?? ""); setPhone(data.phone ?? ""); }
    });
  }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ full_name: name, phone }).eq("user_id", user.id);
    if (error) toast.error(error.message); else toast.success(t("saved"));
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("settings")}</h1>
        <p className="text-muted-foreground">{t("profile")}</p>
      </div>
      <Card className="p-6">
        <form onSubmit={save} className="space-y-4">
          <div><Label>{t("email")}</Label><Input value={user?.email ?? ""} disabled /></div>
          <div><Label>{t("fullName")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>{t("phone")}</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div>
            <Label>{t("role")}</Label>
            <div className="mt-1 text-sm text-muted-foreground">
              {roles.length ? roles.map((r) => t(r)).join(", ") : "—"}
            </div>
          </div>
          <Button type="submit">{t("save")}</Button>
        </form>
      </Card>
    </div>
  );
}
