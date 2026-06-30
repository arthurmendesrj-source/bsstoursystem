import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Mail } from "lucide-react";

type EmailRow = {
  id: string;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails: string[] | null;
  date: string | null;
  body_text: string | null;
  body_html: string | null;
};

function formatDate(d: string | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

export function LeadEmailsTab({ leadId }: { leadId: string }) {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("emails")
        .select(
          "id,subject,from_email,from_name,to_emails,date,body_text,body_html",
        )
        .eq("lead_id", leadId)
        .order("date", { ascending: false });
      if (cancelled) return;
      setEmails((data ?? []) as EmailRow[]);
      setLoading(false);
    };

    void load();
    const id = window.setInterval(() => {
      void load();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [leadId]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Carregando emails...</div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Nenhum email vinculado a este lead ainda. Crie um Lead ou Atividade a
        partir de um email na caixa de entrada para vinculá-lo aqui.
      </div>
    );
  }

  return (
    <div className="p-2">
      <Accordion type="multiple" className="w-full">
        {emails.map((e) => (
          <AccordionItem key={e.id} value={e.id}>
            <AccordionTrigger className="text-left">
              <div className="flex flex-1 items-start gap-2 pr-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {e.subject || "(sem assunto)"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {e.from_name || e.from_email || "—"} ·{" "}
                    {formatDate(e.date)}
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 px-2 pb-2">
                <div className="text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">De:</span>{" "}
                    {e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email}
                  </div>
                  {e.to_emails && e.to_emails.length > 0 && (
                    <div>
                      <span className="font-medium text-foreground">Para:</span>{" "}
                      {e.to_emails.join(", ")}
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-foreground">Data:</span>{" "}
                    {formatDate(e.date)}
                  </div>
                </div>
                {e.body_html ? (
                  <iframe
                    title={`email-${e.id}`}
                    sandbox=""
                    srcDoc={e.body_html}
                    className="h-[480px] w-full rounded border bg-background"
                  />
                ) : (
                  <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded border bg-muted/30 p-3 text-sm">
                    {e.body_text || "(sem conteúdo)"}
                  </pre>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
