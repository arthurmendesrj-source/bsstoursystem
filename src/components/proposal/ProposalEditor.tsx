import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Hotel, Wrench, Save, CheckCircle2, FileCheck, Mic, FileText, CalendarCheck, Plane, Pencil, Send, Receipt, AlertTriangle, ShieldCheck, Sparkles, RotateCcw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/lib/i18n";
import { Can, usePermissions } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  computeTotals,
  diffNights,
  lineSubtotal,
  lineUnitPrice,
  type ProposalItem,
  type ProposalItemKind,
} from "@/lib/proposal-totals";
import { DictateItemsPanel, type DictatedItem } from "./DictateItemsPanel";
import { GenerateDocumentDialog } from "./GenerateDocumentDialog";
import { AiProgramAssistantDialog } from "./AiProgramAssistantDialog";
import { ProposalDocumentsList } from "./ProposalDocumentsList";
import { FlightDialog, type FlightRow } from "./FlightDialog";
import { ServiceDialog, type ServiceInitial } from "./ServiceDialog";
import { HotelDialog, type HotelInitial } from "./HotelDialog";
import { priceItem, summarizePricing, type PricingCategory } from "@/lib/pricing-engine";

type Mode = "proposal" | "invoice";

type Props = {
  quoteId: string;
  leadId: string;
  leadCode?: string | null;
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

export function ProposalEditor({ quoteId, leadId, leadCode, customerId, mode, onSaved, onClose }: Props) {
  const { t } = useI18n();
  const { can, canField } = usePermissions();
  const canEdit = can("quotes", "edit");
  const canDelete = can("quotes", "delete");
  const canApprove = can("quotes", "approve");
  const canCreateBooking = can("bookings", "create");
  const editMarkupPct = canField("quotes", "markup_pct", "edit");
  const editDiscount = canField("quotes", "discount", "edit");
  const viewDiscount = canField("quotes", "discount", "view");
  const viewCostFields = canField("quotes", "unit_cost", "view");
  const viewMarkupTotals = canField("quotes", "markup_pct", "view");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quote, setQuote] = useState<QuoteRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [bankFee, setBankFee] = useState(0);
  const [dictating, setDictating] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [docsRefresh, setDocsRefresh] = useState(0);
  const [flights, setFlights] = useState<FlightRow[]>([]);
  const [flightDialogOpen, setFlightDialogOpen] = useState(false);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceInitial | null>(null);
  const [editingFlight, setEditingFlight] = useState<FlightRow | null>(null);
  const [hotelDialogOpen, setHotelDialogOpen] = useState(false);
  const [editingHotel, setEditingHotel] = useState<HotelInitial | null>(null);

  const openEditHotel = async (id: string) => {
    const { data, error } = await supabase
      .from("quote_items")
      .select("id,item_date,check_out,city,description,category,meal_plan,rooms,total,notes")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      toast.error(error?.message ?? "Erro ao carregar hotel");
      return;
    }
    setEditingHotel({
      id: data.id,
      item_date: data.item_date,
      check_out: data.check_out,
      city: data.city,
      description: data.description,
      category: data.category,
      meal_plan: data.meal_plan,
      rooms: data.rooms,
      total: data.total != null ? Number(data.total) : null,
      notes: data.notes,
    });
    setHotelDialogOpen(true);
  };

  const openEditService = async (id: string) => {
    const { data, error } = await supabase
      .from("quote_items")
      .select("id,item_date,city,description,guide_type,pax,total,notes")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      toast.error(error?.message ?? "Erro ao carregar serviço");
      return;
    }
    setEditingService({
      id: data.id,
      item_date: data.item_date,
      city: data.city,
      description: data.description,
      guide_type: data.guide_type,
      pax: data.pax,
      total: data.total != null ? Number(data.total) : null,
      notes: data.notes,
    });
    setServiceDialogOpen(true);
  };

  const loadFlights = async () => {
    const { data } = await supabase
      .from("quote_flights")
      .select("*")
      .eq("quote_id", quoteId)
      .order("flight_date", { ascending: true });
    setFlights((data ?? []) as FlightRow[]);
  };

  const removeFlight = async (id: string) => {
    if (!canEdit && !canDelete) { toast.error("Sem permissão"); return; }
    const { error } = await supabase.from("quote_flights").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    loadFlights();
  };

  useEffect(() => {
    loadFlights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

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

  const pricingSummary = useMemo(() => {
    const breakdowns = items.map((it) => {
      const cat: PricingCategory = it.kind === "hotel" ? "hotel" : "service";
      return priceItem({
        category: cat,
        unit_cost: Number(it.unit_cost) || 0,
        quantity: Number(it.quantity) || 0,
        markup_pct: Number(it.markup_pct) || 0,
      });
    });
    return summarizePricing(breakdowns);
  }, [items]);

  const enqueueAiAction = async (
    action_type: "propose_send_proposal" | "propose_create_invoice",
    payload: Record<string, unknown>,
  ) => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) { toast.error("Sessão expirada"); return; }
    // Reuse or create a "system" conversation for proposal actions
    const sysTitle = "Sistema — Propostas";
    let convId: string | null = null;
    const { data: existing } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("user_id", uid)
      .eq("title", sysTitle)
      .maybeSingle();
    if (existing?.id) {
      convId = existing.id;
    } else {
      const { data: created, error: cErr } = await supabase
        .from("ai_conversations")
        .insert({ user_id: uid, title: sysTitle })
        .select("id")
        .single();
      if (cErr || !created) { toast.error(cErr?.message ?? "Erro ao criar conversa"); return; }
      convId = created.id;
    }
    const { error } = await supabase.from("ai_pending_actions").insert([{
      user_id: uid,
      conversation_id: convId,
      action_type,
      payload: payload as never,
      status: "pending",
    }]);
    if (error) { toast.error(error.message); return; }
    toast.success("Ação enfileirada no Inbox IA");
  };

  const proposeSendProposal = async () => {
    if (!quote) return;
    if (pricingSummary.blocks.length > 0) {
      toast.error(`Bloqueado: ${pricingSummary.blocks[0]}`);
      return;
    }
    await save();
    await enqueueAiAction("propose_send_proposal", {
      quote_id: quote.id,
      lead_id: leadId,
      lead_code: leadCode,
      customer_id: customerId,
      currency: quote.currency,
      total: pricingSummary.total,
      margin_pct: +(Number(pricingSummary.margin) * 100).toFixed(2),
      items_count: items.length,
      valid_until: quote.valid_until,
      warnings: pricingSummary.warnings,
    });
  };

  const proposeCreateInvoice = async () => {
    if (!quote) return;
    if (pricingSummary.blocks.length > 0) {
      toast.error(`Bloqueado: ${pricingSummary.blocks[0]}`);
      return;
    }
    await enqueueAiAction("propose_create_invoice", {
      quote_id: quote.id,
      lead_id: leadId,
      customer_id: customerId,
      currency: quote.currency,
      subtotal: pricingSummary.cost + pricingSummary.markup,
      fees: pricingSummary.fees + bankFee,
      taxes: pricingSummary.taxes,
      total: pricingSummary.total + bankFee,
      items: items.map((it) => ({
        kind: it.kind,
        description: it.description,
        quantity: it.quantity,
        unit_price: lineUnitPrice(it.unit_cost, it.markup_pct),
        total: lineSubtotal(it.unit_cost, it.markup_pct, it.quantity),
        item_date: it.item_date,
        check_out: it.check_out ?? null,
      })),
    });
  };


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
      if (!canEdit && !canDelete) { toast.error("Sem permissão"); return; }
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
    if (!canEdit) { toast.error("Sem permissão para salvar"); return; }
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
    if (!canApprove) { toast.error("Sem permissão para aprovar"); return; }
    await save();
    const { error } = await supabase.from("quotes").update({ status: "aprovada" }).eq("id", quote.id);
    if (error) return toast.error(error.message);
    toast.success(t("proposalApproved"));
    onSaved?.();
    load();
  };

  const unapprove = async () => {
    if (!quote) return;
    if (!canApprove) { toast.error("Sem permissão"); return; }
    if (!confirm(t("reopenProposalConfirm"))) return;
    const { error } = await supabase.from("quotes").update({ status: "enviada" }).eq("id", quote.id);
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
    onSaved?.();
    load();
  };

  const convertToBooking = async () => {
    if (!quote) return;
    if (!canCreateBooking) { toast.error("Sem permissão para criar reserva"); return; }
    if (!confirm(t("convertQuoteConfirm"))) return;
    // Check if a booking already exists for this quote
    const { data: existing } = await supabase
      .from("bookings")
      .select("id")
      .eq("quote_id", quote.id)
      .maybeSingle();
    if (existing) {
      toast.info(t("alreadyConverted"));
      return;
    }
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return toast.error("auth");

    // Departure/return inferred from earliest item_date and latest check_out
    const dates = items
      .flatMap((it) => [it.item_date, it.check_out])
      .filter((d): d is string => Boolean(d))
      .sort();
    const departure = dates[0] ?? null;
    const ret = dates[dates.length - 1] ?? departure;

    const { error } = await supabase.from("bookings").insert({
      lead_id: leadId,
      customer_id: customerId,
      quote_id: quote.id,
      total_amount: quote.total_amount,
      currency: quote.currency,
      departure_date: departure,
      return_date: ret,
      status: "pre_reserva",
      created_by: uid,
    });
    if (error) return toast.error(error.message);
    toast.success(t("bookingCreated"));
    onSaved?.();
  };

  if (loading || !quote) {
    return <div className="p-6 text-sm text-muted-foreground">{t("loading")}</div>;
  }

  const isClosed = quote.status === "aprovada";
  const readOnly = !canEdit;
  const invoiceCode = leadCode ? `IN${leadCode}` : `IN${quote.id.slice(0, 8).toUpperCase()}`;

  const hotels = items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === "hotel");
  const services = items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === "service");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {mode === "invoice" ? (
            <Badge className="bg-primary text-primary-foreground">{t("invoice")}</Badge>
          ) : isClosed ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-transparent">
              {t("proposalClosed")}
            </Badge>
          ) : (
            <Badge variant="outline" className="capitalize">{quote.status}</Badge>
          )}
          {isClosed && (
            <Badge variant="outline" className="font-mono border-emerald-500/40 text-emerald-700">
              {invoiceCode}
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">#{quote.id.slice(0, 8)}</span>
          {!canEdit && (
            <Badge variant="outline" className="text-xs">somente leitura</Badge>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Can module="quotes" action="edit">
            <Button variant="outline" size="sm" onClick={() => setDictating((v) => !v)}>
              <Mic className="h-4 w-4 mr-1" /> {t("dictateItems")}
            </Button>
          </Can>
          <Button variant="default" size="sm" onClick={() => setAiAssistOpen(true)} className="bg-gradient-to-r from-primary to-primary/80">
            <Sparkles className="h-4 w-4 mr-1" /> Assistente IA
          </Button>
          <Button variant="outline" size="sm" onClick={() => setGenOpen(true)}>
            <FileText className="h-4 w-4 mr-1" /> Gerar Documento
          </Button>
          <Can module="quotes" action="edit">
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="h-4 w-4 mr-1" /> {saving ? t("loading") : t("save")}
            </Button>
          </Can>
          {mode === "proposal" && (
            <Button size="sm" variant="secondary" onClick={proposeSendProposal} disabled={pricingSummary.blocks.length > 0}>
              <Send className="h-4 w-4 mr-1" /> Propor envio
            </Button>
          )}
          {mode === "proposal" && isClosed && (
            <Button size="sm" variant="secondary" onClick={proposeCreateInvoice} disabled={pricingSummary.blocks.length > 0}>
              <Receipt className="h-4 w-4 mr-1" /> Propor invoice
            </Button>
          )}
          {mode === "proposal" && quote.status !== "aprovada" && canApprove && (
            <Button size="sm" variant="default" onClick={approve}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> {t("approveProposal")}
            </Button>
          )}
          {mode === "proposal" && isClosed && canApprove && (
            <Button size="sm" variant="outline" onClick={unapprove}>
              <RotateCcw className="h-4 w-4 mr-1" /> {t("reopenProposal")}
            </Button>
          )}
          {isClosed && canCreateBooking && (
            <Button size="sm" variant="default" onClick={convertToBooking}>
              <CalendarCheck className="h-4 w-4 mr-1" /> {t("convertToBooking")}
            </Button>
          )}
          {onClose && (
            <Button size="sm" variant="ghost" onClick={onClose}>{t("close")}</Button>
          )}
        </div>
      </div>

      {dictating && (
        <DictateItemsPanel
          defaultMarkupPct={Number(quote.default_markup_pct ?? 0)}
          onItems={appendDictated}
          onClose={() => setDictating(false)}
        />
      )}

      <GenerateDocumentDialog
        quoteId={quoteId}
        open={genOpen}
        onOpenChange={setGenOpen}
        onGenerated={() => setDocsRefresh((n) => n + 1)}
      />

      <AiProgramAssistantDialog
        leadId={leadId}
        quoteId={quoteId}
        open={aiAssistOpen}
        onOpenChange={setAiAssistOpen}
        onApplied={() => { void load(); onSaved?.(); }}
        onOpenDoc={() => { setAiAssistOpen(false); setGenOpen(true); }}
      />

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
              disabled={readOnly || !editMarkupPct}
              className="h-9"
            />
            {!readOnly && editMarkupPct && (
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
            disabled={readOnly || !editDiscount}
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
        onRemove={(idx) => {
          if (confirm("Tem certeza que deseja excluir este hotel?")) removeItem(idx);
        }}
        onEdit={(id) => openEditHotel(id)}
        onAdd={canEdit ? () => { setEditingHotel(null); setHotelDialogOpen(true); } : undefined}
        addLabel={t("addHotel")}
        icon={<Hotel className="h-4 w-4" />}
      />

      <ItemTable
        title={t("services")}
        kind="service"
        rows={services}
        ccy={ccy}
        readOnly={readOnly}
        onChange={updateItem}
        onRemove={(idx) => {
          if (confirm("Tem certeza que deseja excluir este serviço?")) removeItem(idx);
        }}
        onEdit={(id) => openEditService(id)}
        onAdd={canEdit ? () => { setEditingService(null); setServiceDialogOpen(true); } : undefined}
        addLabel={t("addService")}
        icon={<Wrench className="h-4 w-4" />}
      />

      <div className="rounded-md border">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <div className="text-sm font-medium flex items-center gap-2"><Plane className="h-4 w-4" /> Voos</div>
          <Button size="sm" variant="outline" onClick={() => { setEditingFlight(null); setFlightDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar voo
          </Button>
        </div>
        {flights.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">Nenhum voo cadastrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/20 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">Data</th>
                  <th className="text-left px-3 py-2">Voo</th>
                  <th className="text-left px-3 py-2">De → Para</th>
                  <th className="text-left px-3 py-2">Partida</th>
                  <th className="text-left px-3 py-2">Chegada</th>
                  <th className="text-right px-3 py-2">Pax</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {flights.map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="px-3 py-2">{fmtDate(f.flight_date)}</td>
                    <td className="px-3 py-2 font-mono">{f.flight_number}</td>
                    <td className="px-3 py-2">{f.from_code} → {f.to_code}</td>
                    <td className="px-3 py-2">{f.departure_time?.slice(0, 5)}</td>
                    <td className="px-3 py-2">{f.arrival_time?.slice(0, 5) ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{f.pax}</td>
                    <td className="px-3 py-2 text-right">{f.total != null ? fmt(Number(f.total), ccy) : "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => { setEditingFlight(f); setFlightDialogOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => f.id && removeFlight(f.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FlightDialog
        open={flightDialogOpen}
        onOpenChange={setFlightDialogOpen}
        quoteId={quoteId}
        initial={editingFlight}
        onSaved={loadFlights}
      />

      <ServiceDialog
        open={serviceDialogOpen}
        onOpenChange={(o) => { setServiceDialogOpen(o); if (!o) setEditingService(null); }}
        quoteId={quoteId}
        defaultMarkupPct={Number(quote?.default_markup_pct ?? 0)}
        initial={editingService}
        onSaved={load}
      />

      <HotelDialog
        open={hotelDialogOpen}
        onOpenChange={(o) => { setHotelDialogOpen(o); if (!o) setEditingHotel(null); }}
        quoteId={quoteId}
        defaultMarkupPct={Number(quote?.default_markup_pct ?? 0)}
        initial={editingHotel}
        onSaved={load}
      />


      {!readOnly && viewMarkupTotals && (pricingSummary.blocks.length > 0 || pricingSummary.warnings.length > 0) && (
        <div className={cn(
          "rounded-md border p-3 space-y-1.5 text-sm",
          pricingSummary.blocks.length > 0 ? "border-destructive/50 bg-destructive/5" : "border-amber-500/50 bg-amber-500/5"
        )}>
          <div className="flex items-center gap-2 font-medium">
            {pricingSummary.blocks.length > 0 ? (
              <><AlertTriangle className="h-4 w-4 text-destructive" /> Bloqueios de pricing</>
            ) : (
              <><ShieldCheck className="h-4 w-4 text-amber-600" /> Avisos de margem</>
            )}
            <Badge variant="outline" className="ml-auto">
              Margem {(pricingSummary.margin * 100).toFixed(1)}%
            </Badge>
          </div>
          <ul className="text-xs space-y-0.5 list-disc list-inside text-muted-foreground">
            {pricingSummary.blocks.map((b, i) => <li key={`b${i}`} className="text-destructive">{b}</li>)}
            {pricingSummary.warnings.map((w, i) => <li key={`w${i}`}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="rounded-md border p-4 space-y-1.5 bg-muted/20">
        {!readOnly && viewCostFields && (
          <>
            <Row label={t("costSubtotal")} value={fmt(totals.costSubtotal, ccy)} muted />
          </>
        )}
        {!readOnly && viewMarkupTotals && (
          <>
            <Row label={t("markupTotal")} value={fmt(totals.markupTotal, ccy)} muted />
            <Separator className="my-1" />
          </>
        )}
        <Row label={t("totalPrice")} value={fmt(totals.subtotal, ccy)} />
        {viewDiscount && <Row label={t("bankFee")} value={fmt(totals.bankFee, ccy)} muted />}
        <Separator className="my-1" />
        <Row label={t("totalToPay")} value={fmt(totals.total, ccy)} bold />
      </div>

      {mode === "proposal" && (
        <ProposalDocumentsList quoteId={quoteId} refreshKey={docsRefresh} />
      )}

      {mode === "invoice" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileCheck className="h-4 w-4" /> {t("invoiceEditable")}
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
  onEdit,
  onAdd,
  addLabel,
  icon,
}: {
  title: string;
  kind: ProposalItemKind;
  rows: { it: ItemRow; i: number }[];
  ccy: string;
  readOnly: boolean;
  onChange: (idx: number, patch: Partial<ItemRow>) => void;
  onRemove: (idx: number) => void;
  onEdit?: (id: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  icon?: React.ReactNode;
}) {
  const { t } = useI18n();
  const { canField } = usePermissions();
  const showCost = canField("quotes", "unit_cost", "view");
  const showMarkup = canField("quotes", "markup_pct", "view");
  const editCost = canField("quotes", "unit_cost", "edit");
  const editMarkup = canField("quotes", "markup_pct", "edit");
  const isHotel = kind === "hotel";
  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="text-sm font-medium flex items-center gap-2">{icon} {title}</div>
        {onAdd && !readOnly && (
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-1" /> {addLabel ?? "Adicionar"}
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground">{t("noData")}</div>
      ) : (
        <div className="overflow-x-auto">
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
              {!readOnly && showCost && <th className="text-right p-2 w-28">{t("unitCost")} ({ccy})</th>}
              {!readOnly && showMarkup && <th className="text-right p-2 w-20">{t("markup")} %</th>}
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
                  {!readOnly && showCost && (
                    <td className="p-2">
                      <Input
                        type="number" step="0.01"
                        value={it.unit_cost}
                        onChange={(e) => onChange(i, { unit_cost: Number(e.target.value) })}
                        disabled={!editCost}
                        className="h-8 text-right"
                      />
                    </td>
                  )}
                  {!readOnly && showMarkup && (
                    <td className="p-2">
                      <Input
                        type="number" step="0.1"
                        value={it.markup_pct}
                        onChange={(e) => onChange(i, { markup_pct: Number(e.target.value) })}
                        disabled={!editMarkup}
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
                    <td className="p-2 text-right whitespace-nowrap">
                      {onEdit && !it.id.startsWith("new-") && (
                        <Button size="icon" variant="ghost" onClick={() => onEdit(it.id)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
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
      )}
    </div>
  );
}
