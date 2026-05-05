import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

export type ProofPick =
  | { type: "email"; email_id: string; reference: string; text: string | null }
  | { type: "whatsapp"; phone: string; text: string; file?: File | null };

export function ProofAssociateDialog({
  open,
  onOpenChange,
  customerId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string | null;
  onPick: (p: ProofPick) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"email" | "whatsapp">("email");
  const [q, setQ] = useState("");
  const [emails, setEmails] = useState<Array<{ id: string; subject: string | null; from_name: string | null; from_email: string | null; snippet: string | null; received_at: string | null; body_text: string | null }>>([]);
  const [waPhone, setWaPhone] = useState("");
  const [waText, setWaText] = useState("");
  const [waFile, setWaFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open || tab !== "email") return;
    let cancelled = false;
    (async () => {
      let query = supabase.from("emails")
        .select("id,subject,from_name,from_email,snippet,received_at,body_text")
        .order("received_at", { ascending: false })
        .limit(50);
      if (customerId) query = query.or(`customer_id.eq.${customerId},customer_id.is.null`);
      const term = q.trim();
      if (term) {
        query = query.or(`subject.ilike.%${term}%,from_name.ilike.%${term}%,from_email.ilike.%${term}%,snippet.ilike.%${term}%`);
      }
      const { data } = await query;
      if (!cancelled) setEmails((data ?? []) as typeof emails);
    })();
    return () => { cancelled = true; };
  }, [open, tab, q, customerId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t("associateProof")}</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "email" | "whatsapp")}>
          <TabsList className="w-full">
            <TabsTrigger value="email">{t("associateEmailTab")}</TabsTrigger>
            <TabsTrigger value="whatsapp">{t("associateWhatsappTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="space-y-3">
            <Input placeholder={t("searchPlaceholderAssociate")} value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="space-y-2 max-h-96 overflow-auto">
              {emails.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">{t("noResults")}</p>
              ) : emails.map((m) => (
                <Card key={m.id} className="p-3 cursor-pointer hover:bg-accent" onClick={() => {
                  onPick({
                    type: "email",
                    email_id: m.id,
                    reference: `${m.subject ?? ""} — ${m.from_name ?? m.from_email ?? ""}`.trim(),
                    text: m.body_text ?? m.snippet,
                  });
                  onOpenChange(false);
                }}>
                  <div className="font-medium text-sm truncate">{m.subject || "(sem assunto)"}</div>
                  <div className="text-xs text-muted-foreground truncate">{m.from_name || m.from_email} · {m.received_at?.slice(0, 10)}</div>
                  {m.snippet && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.snippet}</div>}
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-3">
            <div>
              <Label>{t("whatsappPhone")}</Label>
              <Input value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="+55..." />
            </div>
            <div>
              <Label>{t("whatsappContent")}</Label>
              <Textarea rows={5} value={waText} onChange={(e) => setWaText(e.target.value)} />
            </div>
            <div>
              <Label>{t("attachProof")}</Label>
              <Input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setWaFile(e.target.files?.[0] ?? null)} />
            </div>
            <Button
              disabled={!waText.trim() && !waFile}
              onClick={() => {
                onPick({ type: "whatsapp", phone: waPhone, text: waText, file: waFile });
                onOpenChange(false);
                setWaPhone(""); setWaText(""); setWaFile(null);
              }}
            >{t("save")}</Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
