import { useEffect, useState } from "react";
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

type Doc = {
  id: string;
  created_at: string;
  language: string;
  price_mode: string;
  tone: string;
  storage_path: string;
  title: string | null;
};

export function ProposalDocumentsList({ quoteId, refreshKey }: { quoteId: string; refreshKey?: number }) {
  const { t } = useI18n();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("quote_documents")
        .select("id,created_at,language,price_mode,tone,storage_path,title")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: false });
      if (alive) {
        setDocs((data ?? []) as Doc[]);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [quoteId, refreshKey]);

  const download = async (d: Doc) => {
    const { data, error } = await supabase.storage
      .from("proposal-docs")
      .createSignedUrl(d.storage_path, 3600);
    if (error || !data?.signedUrl) return;
    const a = document.createElement("a");
    a.href = data.signedUrl;
    const fname = d.storage_path.split("/").pop() ?? "proposal.docx";
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (loading) return null;
  if (docs.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{t("previousDocuments")}</h3>
      <div className="rounded-md border divide-y">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center justify-between p-2 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-sm truncate">{d.title ?? "Proposal"}</div>
                <div className="text-xs text-muted-foreground">
                  {format(parseISO(d.created_at), "dd/MM/yyyy HH:mm")} · {d.language.toUpperCase()} · {d.price_mode}
                </div>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => download(d)}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
