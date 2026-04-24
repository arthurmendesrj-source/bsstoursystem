import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Hotel, Wrench, Save, CheckCircle2, FileCheck, Mic, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  computeTotals,
  diffNights,
  lineSubtotal,
  lineUnitPrice,
  type ProposalItem,
  type ProposalItemKind,
} from "@/lib/proposal-totals";
import { DictateItemsPanel, type DictatedItem } from "./DictateItemsPanel";
import { GenerateDocDialog } from "./GenerateDocDialog";
import { ProposalDocumentsList } from "./ProposalDocumentsList";

type Mode = "proposal" | "invoice";

type Props = {
  quoteId: string;
  leadId: string;
  customerId: string | null;
  mode: Mode;
  onSaved?: () => void;
  onClose?: () => void;
};

type QuoteRow = {
  id: string;
  status: string;
  currency: "BRL" | "USD" | "EUR";
  notes: string | null;
  valid_until: string | null;
  discount: number | null;
  total_amount: number;
  default_markup_pct: number;
};

type ItemRow = ProposalItem & {
  id: string;
  quote_id: string;
  item_date?: string | null;
  check_out?: string | null;
};

const CURRENCIES = ["USD", "BRL", "EUR"] as const;

function fmt(n: number, ccy: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${ccy} ${n.toFixed(2)}`;
  }
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try {
    return format(parseISO(d), "dd/MM/yyyy");
  } catch {
    return d;
  }
}

export function ProposalEditor({ quoteId, mode, onSaved, onClose }: Props) {
  const { t } = useI18n();
  const readOnly = mode === "invoice";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quote, setQuote] = useState<QuoteRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [bankFee, setBankFee] = useState(0);
  const [dictating, setDictating] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [docsRefresh, setDocsRefresh] = useState(0);

  const load = async () => {
    setLoading(true);
    const [qRes, iRes] = await Promise.all([
      supabase.from("quotes").select("id,status,currency,notes,valid_until,discount,total_amount,default_markup_pct").eq("id", quoteId).maybeSingle(),
      supabase.from("quote_items").select("*").eq("quote_id", quoteId).order("created_at", { ascending: true }),
    ]);
    const q = qRes.data as QuoteRow | null;
    setQuote(q);
    setBankFee(Number(q?.discount ?? 0));
    const rows = (iRes.data ?? []) as Array<{
      id: string;
      quote_id: string;
      description: string;
      quantity: number;
      unit_price: number;
      unit_cost: number;
      markup_pct: number;
      kind?: string | null;
      item_date?: string | null;
      check_out?: string | null;
    }>;
    setItems(
      rows.map((r) => {
        const inferredKind: ProposalItemKind =
          (r.kind === "hotel" || r.kind === "service")
            ? r.kind
            : (r.description.startsWith("[HOTEL]") ? "hotel" : "service");
        return {
          id: r.id,
          quote_id: r.quote_id,
          kind: inferredKind,
          description: r.description.replace(/^\[(HOTEL|SERVICE)\]\s*/, ""),
          quantity: r.quantity,
          unit_cost: Number(r.unit_cost),
          markup_pct: Number(r.markup_pct),
          unit_price: Number(r.unit_price),
          item_date: r.item_date ?? null,
          check_out: r.check_out ?? null,
        };
      }),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [quoteId]);

  const totals = useMemo(() => computeTotals(items, bankFee), [items, bankFee]);
  const ccy = quote?.currency ?? "USD";

  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems((arr) =>
      arr.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        // Auto compute nights for hotel rows when both dates present.
        // We use `quantity` as nights × rooms? In current model `quantity` IS the multiplier.
        // For hotels we treat quantity = nights (rooms can be added later via separate field).
        if (next.kind === "hotel") {
          const datesTouched = "item_date" in patch || "check_out" in patch;
          if (datesTouched) {
            const n = diffNights(next.item_date, next.check_out);
            if (n > 0) next.quantity = n;
          }
        }
        return next;
      }),
    );
  };

  const addItem = (kind: ProposalItemKind) => {
    const tempId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setItems((arr) => [
      ...arr,
      {
        id: tempId,
        quote_id: quoteId,
        kind,
        description: "",
        quantity: 1,
        unit_cost: 0,
        markup_pct: Number(quote?.default_markup_pct ?? 0),
        item_date: null,
        check_out: null,
      },
    ]);
  };

  const appendDictated = (dictated: DictatedItem[]) => {
    const dm = Number(quote?.default_markup_pct ?? 0);
    setItems((arr) => [
      ...arr,
      ...dictated.map((d) => {
        const tempId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const isHotel = d.kind === "hotel";
        const item_date = isHotel ? d.check_in ?? null : d.item_date ?? null;
        const check_out = isHotel ? d.check_out ?? null : null;
        let qty = Number(d.quantity) > 0 ? Number(d.quantity) : 1;
        if (isHotel && item_date && check_out) {
          const n = diffNights(item_date, check_out);
          if (n > 0) qty = n;
        }
        return {
          id: tempId,
          quote_id: quoteId,
          kind: d.kind,
          description: [d.description, d.city ? `(${d.city})` : ""].filter(Boolean).join(" "),
          quantity: qty,
          unit_cost: Number(d.unit_cost) || 0,
          markup_pct: d.markup_pct != null ? Number(d.markup_pct) : dm,
          item_date,
          check_out,
        } as ItemRow;
      }),
    ]);
  };

  const removeItem = async (idx: number) => {
    const it = items[idx];
    if (it.id && !it.id.startsWith("new-")) {
      await supabase.from("quote_items").delete().eq("id", it.id);
    }
    setItems((arr) => arr.filter((_, i) => i !== idx));
  };

  const applyDefaultMarkup = () => {
    if (!quote) return;
    const m = Number(quote.default_markup_pct) || 0;
    setItems((arr) => arr.map((it) => ({ ...it, markup_pct: m })));
  };

  const save = async () => {
    if (!quote) return;
    setSaving(true);
    const totalsNow = computeTotals(items, bankFee);

    const { error: qErr } = await supabase
      .from("quotes")
      .update({
        currency: quote.currency,
        notes: quote.notes,
        valid_until: quote.valid_until,
        discount: bankFee,
        default_markup_pct: quote.default_markup_pct,
        total_amount: totalsNow.total,
      })
      .eq("id", quote.id);
    if (qErr) {
      toast.error(qErr.message);
      setSaving(false);
      return;
    }

    for (const it of items) {
      const payload = {
        quote_id: quote.id,
        description: `[${it.kind === "hotel" ? "HOTEL" : "SERVICE"}] ${it.description}`,
        quantity: Math.max(1, Number(it.quantity) || 1),
        unit_cost: Number(it.unit_cost) || 0,
        markup_pct: Number(it.markup_pct) || 0,
        unit_price: lineUnitPrice(it.unit_cost, it.markup_pct),
        total: lineSubtotal(it.unit_cost, it.markup_pct, it.quantity),
        kind: it.kind,
        item_date: it.item_date || null,
        check_out: it.kind === "hotel" ? (it.check_out || null) : null,
      };
      if (it.id.startsWith("new-")) {
        const { data, error } = await supabase.from("quote_items").insert(payload).select("id").single();
        if (!error && data) it.id = data.id;
      } else {
        await supabase.from("quote_items").update(payload).eq("id", it.id);
      }
    }

    setSaving(false);
    toast.success(t("saved"));
    onSaved?.();
    load();
  };

  const approve = async () => {
    if (!quote) return;
    await save();
    const { error } = await supabase.from("quotes").update({ status: "aprovada" }).eq("id", quote.id);
    if (error) return toast.error(error.message);
    toast.success(t("proposalApproved"));
    onSaved?.();
    load();
  };

  if (loading || !quote) {
    return <div className="p-6 text-sm text-muted-foreground">{t("loading")}</div>;
  }

  const hotels = items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === "hotel");
  const services = items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === "service");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {mode === "invoice" ? (
            <Badge className="bg-primary text-primary-foreground">{t("invoice")}</Badge>
          ) : (
            <Badge variant="outline" className="capitalize">{quote.status}</Badge>
          )}
          <span className="text-sm text-muted-foreground">#{quote.id.slice(0, 8)}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!readOnly && mode === "proposal" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setDictating((v) => !v)}>
                <Mic className="h-4 w-4 mr-1" /> {t("dictateItems")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setGenOpen(true)}>
                <FileText className="h-4 w-4 mr-1" /> {t("generateDocument")}
              </Button>
            </>
          )}
          {!readOnly && (
            <>
              <Button variant="outline" size="sm" onClick={() => addItem("hotel")}>
                <Hotel className="h-4 w-4 mr-1" /> {t("addHotel")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => addItem("service")}>
                <Wrench className="h-4 w-4 mr-1" /> {t("addService")}
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> {saving ? t("loading") : t("save")}
              </Button>
              {quote.status !== "aprovada" && (
                <Button size="sm" variant="default" onClick={approve}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> {t("approveProposal")}
                </Button>
              )}
            </>
          )}
          {onClose && (
            <Button size="sm" variant="ghost" onClick={onClose}>{t("close")}</Button>
          )}
        </div>
      </div>

      {dictating && !readOnly && mode === "proposal" && (
        <DictateItemsPanel
          defaultMarkupPct={Number(quote.default_markup_pct ?? 0)}
          onItems={appendDictated}
          onClose={() => setDictating(false)}
        />
      )}

      {mode === "proposal" && (
        <GenerateDocDialog
          quoteId={quoteId}
          open={genOpen}
          onOpenChange={setGenOpen}
          onGenerated={() => setDocsRefresh((n) => n + 1)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 rounded-md border bg-muted/30">
        <div>
          <Label className="text-xs">{t("currency")}</Label>
          <Select
            value={quote.currency}
            onValueChange={(v) => setQuote({ ...quote, currency: v as QuoteRow["currency"] })}
            disabled={readOnly}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("validUntil")}</Label>
          <Input
            type="date"
            value={quote.valid_until ?? ""}
            onChange={(e) => setQuote({ ...quote, valid_until: e.target.value || null })}
            disabled={readOnly}
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs">{t("defaultMarkup")} (%)</Label>
          <div className="flex gap-1">
            <Input
              type="number"
              step="0.1"
              value={quote.default_markup_pct}
              onChange={(e) => setQuote({ ...quote, default_markup_pct: Number(e.target.value) })}
              disabled={readOnly}
              className="h-9"
            />
            {!readOnly && (
              <Button type="button" size="sm" variant="outline" onClick={applyDefaultMarkup} title={t("applyDefaultMarkup")}>
                ↻
              </Button>
            )}
          </div>
        </div>
        <div>
          <Label className="text-xs">{t("bankFee")} ({ccy})</Label>
          <Input
            type="number"
            step="0.01"
            value={bankFee}
            onChange={(e) => setBankFee(Number(e.target.value))}
            disabled={readOnly}
            className="h-9"
          />
        </div>
      </div>

      <ItemTable
        title={t("hotels")}
        kind="hotel"
        rows={hotels}
        ccy={ccy}
        readOnly={readOnly}
        onChange={updateItem}
        onRemove={removeItem}
      />

      <ItemTable
        title={t("services")}
        kind="service"
        rows={services}
        ccy={ccy}
        readOnly={readOnly}
        onChange={updateItem}
        onRemove={removeItem}
      />

      <div className="rounded-md border p-4 space-y-1.5 bg-muted/20">
        {!readOnly && (
          <>
            <Row label={t("costSubtotal")} value={fmt(totals.costSubtotal, ccy)} muted />
            <Row label={t("markupTotal")} value={fmt(totals.markupTotal, ccy)} muted />
            <Separator className="my-1" />
          </>
        )}
        <Row label={t("totalPrice")} value={fmt(totals.subtotal, ccy)} />
        <Row label={t("bankFee")} value={fmt(totals.bankFee, ccy)} muted />
        <Separator className="my-1" />
        <Row label={t("totalToPay")} value={fmt(totals.total, ccy)} bold />
      </div>

      {mode === "proposal" && (
        <ProposalDocumentsList quoteId={quoteId} refreshKey={docsRefresh} />
      )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileCheck className="h-4 w-4" /> {t("invoiceReadOnly")}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "text-base font-semibold" : "text-sm"} ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ItemTable({
  title,
  kind,
  rows,
  ccy,
  readOnly,
  onChange,
  onRemove,
}: {
  title: string;
  kind: ProposalItemKind;
  rows: { it: ItemRow; i: number }[];
  ccy: string;
  readOnly: boolean;
  onChange: (idx: number, patch: Partial<ItemRow>) => void;
  onRemove: (idx: number) => void;
}) {
  const { t } = useI18n();
  const isHotel = kind === "hotel";
  if (rows.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">{t("noData")}</div>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              {isHotel ? (
                <>
                  <th className="text-left p-2 w-32">{t("checkIn")}</th>
                  <th className="text-left p-2 w-32">{t("checkOut")}</th>
                </>
              ) : (
                <th className="text-left p-2 w-32">{t("serviceDate")}</th>
              )}
              <th className="text-left p-2 min-w-[280px]">{t("name")}</th>
              {!readOnly && <th className="text-right p-2 w-28">{t("unitCost")} ({ccy})</th>}
              {!readOnly && <th className="text-right p-2 w-20">{t("markup")} %</th>}
              <th className="text-right p-2 w-28">{t("price")} ({ccy})</th>
              <th className="text-right p-2 w-20">{isHotel ? t("nights") : t("quantity")}</th>
              <th className="text-right p-2 w-32">{t("subtotal")} ({ccy})</th>
              {!readOnly && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ it, i }) => {
              const unitPrice = lineUnitPrice(it.unit_cost, it.markup_pct);
              const sub = lineSubtotal(it.unit_cost, it.markup_pct, it.quantity);
              return (
                <tr key={it.id} className="border-t">
                  {isHotel ? (
                    <>
                      <td className="p-2">
                        {readOnly ? (
                          <span className="tabular-nums">{fmtDate(it.item_date)}</span>
                        ) : (
                          <Input
                            type="date"
                            value={it.item_date ?? ""}
                            onChange={(e) => onChange(i, { item_date: e.target.value || null })}
                            className="h-8"
                          />
                        )}
                      </td>
                      <td className="p-2">
                        {readOnly ? (
                          <span className="tabular-nums">{fmtDate(it.check_out)}</span>
                        ) : (
                          <Input
                            type="date"
                            value={it.check_out ?? ""}
                            onChange={(e) => onChange(i, { check_out: e.target.value || null })}
                            className="h-8"
                          />
                        )}
                      </td>
                    </>
                  ) : (
                    <td className="p-2">
                      {readOnly ? (
                        <span className="tabular-nums">{fmtDate(it.item_date)}</span>
                      ) : (
                        <Input
                          type="date"
                          value={it.item_date ?? ""}
                          onChange={(e) => onChange(i, { item_date: e.target.value || null })}
                          className="h-8"
                        />
                      )}
                    </td>
                  )}
                  <td className="p-2 min-w-[280px]">
                    <Input
                      value={it.description}
                      onChange={(e) => onChange(i, { description: e.target.value })}
                      disabled={readOnly}
                      placeholder={isHotel ? "Hotel / City / Meal" : "Service / City / Way"}
                      className="h-8 w-full min-w-[260px]"
                    />
                  </td>
                  {!readOnly && (
                    <td className="p-2">
                      <Input
                        type="number" step="0.01"
                        value={it.unit_cost}
                        onChange={(e) => onChange(i, { unit_cost: Number(e.target.value) })}
                        className="h-8 text-right"
                      />
                    </td>
                  )}
                  {!readOnly && (
                    <td className="p-2">
                      <Input
                        type="number" step="0.1"
                        value={it.markup_pct}
                        onChange={(e) => onChange(i, { markup_pct: Number(e.target.value) })}
                        className="h-8 text-right"
                      />
                    </td>
                  )}
                  <td className="p-2 text-right tabular-nums">{unitPrice.toFixed(2)}</td>
                  <td className="p-2">
                    <Input
                      type="number" min={1}
                      value={it.quantity}
                      onChange={(e) => onChange(i, { quantity: Number(e.target.value) })}
                      disabled={readOnly}
                      className="h-8 text-right"
                    />
                  </td>
                  <td className="p-2 text-right font-medium tabular-nums">{sub.toFixed(2)}</td>
                  {!readOnly && (
                    <td className="p-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => onRemove(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
