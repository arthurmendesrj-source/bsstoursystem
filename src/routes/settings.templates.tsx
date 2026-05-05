import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_TEMPLATES,
  invalidateTemplatesCache,
  mergeWithDefaults,
  renderTemplate,
  type MessageTemplates,
} from "@/lib/messageTemplates";

export const Route = createFileRoute("/settings/templates")({
  component: () => (
    <AuthGate>
      <AppShell>
        <TemplatesPage />
      </AppShell>
    </AuthGate>
  ),
});

const SAMPLE = { nome: "Maria Silva", destino: "Lisboa", vendedor: "—" };

function TemplatesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [tpl, setTpl] = useState<MessageTemplates>(DEFAULT_TEMPLATES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendorName, setVendorName] = useState("—");

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("message_templates,full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      setTpl(mergeWithDefaults(data?.message_templates as Partial<MessageTemplates> | null));
      setVendorName(data?.full_name ?? "—");
      setLoading(false);
    })();
  }, [user?.id]);

  const sampleVars = useMemo(() => ({ ...SAMPLE, vendedor: vendorName }), [vendorName]);

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ message_templates: tpl as unknown as Record<string, unknown> })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    invalidateTemplatesCache();
    toast.success(t("templatesSaved"));
  };

  const resetField = (field: keyof MessageTemplates) => {
    setTpl((p) => ({ ...p, [field]: DEFAULT_TEMPLATES[field] }));
  };

  if (loading) return <div className="text-sm text-muted-foreground">…</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings"><ArrowLeft className="h-4 w-4 mr-1" />{t("settings")}</Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">{t("templatesTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("templatesSubtitle")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">{t("templatesWhatsapp")}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => resetField("whatsapp")}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />{t("templatesReset")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                rows={4}
                value={tpl.whatsapp}
                onChange={(e) => setTpl((p) => ({ ...p, whatsapp: e.target.value }))}
              />
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">{t("templatesPreview")}:</span>{" "}
                {renderTemplate(tpl.whatsapp, sampleVars)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">{t("templatesEmailSubject")}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => resetField("email_subject")}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />{t("templatesReset")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                value={tpl.email_subject}
                onChange={(e) => setTpl((p) => ({ ...p, email_subject: e.target.value }))}
              />
              <div className="text-xs text-muted-foreground">
                {renderTemplate(tpl.email_subject, sampleVars)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">{t("templatesEmailBody")}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => resetField("email_body")}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />{t("templatesReset")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                rows={8}
                value={tpl.email_body}
                onChange={(e) => setTpl((p) => ({ ...p, email_body: e.target.value }))}
              />
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans border rounded-md p-2 bg-muted/30">
                {renderTemplate(tpl.email_body, sampleVars)}
              </pre>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>
              <Save className="h-4 w-4 mr-1.5" />
              {t("templatesSave")}
            </Button>
          </div>
        </div>

        <Card className="h-fit sticky top-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t("templatesVariables")}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-xs">
            <Var name="{nome}" desc={t("templatesVarNome")} />
            <Var name="{primeiro_nome}" desc={t("templatesVarPrimeiroNome")} />
            <Var name="{destino}" desc={t("templatesVarDestino")} />
            <Var name="{vendedor}" desc={t("templatesVarVendedor")} />

            <div className="border-t pt-3 mt-3 space-y-1">
              <Label className="text-xs">{t("templatesPreviewLead")}</Label>
              <div className="text-muted-foreground text-[11px] leading-relaxed">
                nome: <code>Maria Silva</code><br />
                destino: <code>Lisboa</code><br />
                vendedor: <code>{vendorName}</code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Var({ name, desc }: { name: string; desc: string }) {
  return (
    <div>
      <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">{name}</code>
      <div className="text-muted-foreground text-[11px] mt-0.5">{desc}</div>
    </div>
  );
}
