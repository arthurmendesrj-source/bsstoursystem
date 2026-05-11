import { useEffect, useState } from "react";
import { StickyNote, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

type Category = "operacional" | "financeiro" | "comercial";
type Kind = "item" | "flight";

type Note = {
  id: string;
  category: Category;
  note: string;
  author_id: string;
  created_at: string;
};

const CAT_LABEL: Record<Category, string> = {
  operacional: "Operacional",
  financeiro: "Financeiro",
  comercial: "Comercial",
};

const CAT_COLOR: Record<Category, string> = {
  operacional: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  financeiro: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  comercial: "bg-amber-500/10 text-amber-700 border-amber-500/30",
};

type Props = {
  quoteId: string;
  targetKind: Kind;
  targetId: string;
};

export function ItemNoteButton({ quoteId, targetKind, targetId }: Props) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<Category>("operacional");
  const [text, setText] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const [count, setCount] = useState<number>(0);

  const loadCount = async () => {
    const { count: c } = await supabase
      .from("quote_item_notes")
      .select("id", { count: "exact", head: true })
      .eq("target_kind", targetKind)
      .eq("target_id", targetId);
    setCount(c ?? 0);
  };

  useEffect(() => {
    void loadCount();
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, targetKind]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quote_item_notes")
      .select("id, category, note, author_id, created_at")
      .eq("target_kind", targetKind)
      .eq("target_id", targetId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNotes((data ?? []) as Note[]);
    setCount((data ?? []).length);
  };

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    if (!text.trim() || !me) return;
    setSaving(true);
    const { error } = await supabase.from("quote_item_notes").insert({
      quote_id: quoteId,
      target_kind: targetKind,
      target_id: targetId,
      category,
      note: text.trim(),
      author_id: me,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setText("");
    await load();
    toast.success("Anotação salva");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("quote_item_notes").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await load();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          title="Anotações"
          className="relative"
        >
          <StickyNote className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 px-1 font-semibold">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-3 space-y-3" align="end">
        <div className="text-sm font-semibold">Anotações</div>

        <div className="max-h-60 overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-2">
              Nenhuma anotação ainda.
            </div>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="rounded-md border p-2 space-y-1 bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className={CAT_COLOR[n.category]}>
                    {CAT_LABEL[n.category]}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {format(parseISO(n.created_at), "dd/MM HH:mm")}
                    </span>
                    {me === n.author_id && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => remove(n.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="text-xs whitespace-pre-wrap">{n.note}</div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2 border-t pt-3">
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="operacional">Operacional</SelectItem>
                <SelectItem value="financeiro">Financeiro</SelectItem>
                <SelectItem value="comercial">Comercial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            placeholder="Escreva a anotação…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="text-sm resize-none"
          />
          <Button size="sm" className="w-full" onClick={save} disabled={saving || !text.trim()}>
            {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Adicionar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
