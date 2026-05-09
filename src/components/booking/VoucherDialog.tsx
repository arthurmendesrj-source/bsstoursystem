import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Pencil, Save, Printer, Mail, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { sendVoucherEmail } from "@/lib/voucher.functions";

type Voucher = {
  id: string;
  code: string;
  booking_id: string;
  quote_item_id: string | null;
  itinerary: string | null;
  emergency_contact: string | null;
  notes: string | null;
  meeting_point: string | null;
  meeting_time: string | null;
  service_date: string | null;
  customer_instructions: string | null;
  issued_at: string;
};

type SendLog = {
  id: string;
  sent_to: string;
  sent_cc: string | null;
  subject: string | null;
  status: string;
  error_message: string | null;
  sent_by: string | null;
  created_at: string;
};

type Props = {
  voucherId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function VoucherDialog({ voucherId, open, onOpenChange }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const sendFn = useServerFn(sendVoucherEmail);
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [itemDescription, setItemDescription] = useState("");
  const [itemDetails, setItemDetails] = useState<{
    kind?: string | null; city?: string | null; category?: string | null;
    item_date?: string | null; check_out?: string | null; nights?: number | null;
    rooms?: number | null; meal_plan?: string | null; pax?: number | null;
    ways?: number | null; guide_type?: string | null; notes?: string | null;
  } | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [editing, setEditing] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);

  // editable form
  const [serviceDate, setServiceDate] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [customerInstructions, setCustomerInstructions] = useState("");
  const [notes, setNotes] = useState("");

  // send form
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");

  const load = async () => {
    if (!voucherId) return;
    const { data: v } = await supabase
      .from("vouchers")
      .select("*")
      .eq("id", voucherId)
      .maybeSingle();
    if (!v) return;
    setVoucher(v as Voucher);
    setServiceDate(v.service_date ?? "");
    setMeetingPoint(v.meeting_point ?? "");
    setMeetingTime(v.meeting_time ?? "");
    setEmergencyContact(v.emergency_contact ?? "");
    setCustomerInstructions(v.customer_instructions ?? "");
    setNotes(v.notes ?? "");

    if (v.quote_item_id) {
      const { data: qi } = await supabase
        .from("quote_items")
        .select("description,kind,city,category,item_date,check_out,nights,rooms,meal_plan,pax,ways,guide_type,notes")
        .eq("id", v.quote_item_id)
        .maybeSingle();
      setItemDescription(qi?.description ?? "");
      setItemDetails(qi ?? null);
    } else {
      setItemDetails(null);
    }
    const { data: b } = await supabase
      .from("bookings")
      .select("customer_id")
      .eq("id", v.booking_id)
      .maybeSingle();
    if (b?.customer_id) {
      const { data: c } = await supabase
        .from("customers")
        .select("full_name, email")
        .eq("id", b.customer_id)
        .maybeSingle();
      setCustomerName(c?.full_name ?? "");
      setCustomerEmail(c?.email ?? "");
    }
    const { data: lg } = await supabase
      .from("voucher_send_log")
      .select("*")
      .eq("voucher_id", voucherId)
      .order("created_at", { ascending: false });
    setLogs((lg ?? []) as SendLog[]);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, voucherId]);

  const save = async () => {
    if (!voucher) return;
    const { error } = await supabase
      .from("vouchers")
      .update({
        service_date: serviceDate || null,
        meeting_point: meetingPoint || null,
        meeting_time: meetingTime || null,
        emergency_contact: emergencyContact || null,
        customer_instructions: customerInstructions || null,
        notes: notes || null,
        updated_by: user?.id ?? null,
      } as never)
      .eq("id", voucher.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("saved"));
    setEditing(false);
    load();
  };

  const openSend = () => {
    setTo(customerEmail);
    setCc("");
    setSubject(`${t("sendVoucherEmailSubject")} ${voucher?.code ?? ""} - ${itemDescription}`.trim());
    setBodyText(t("sendVoucherEmailBody"));
    setSendOpen(true);
  };

  const doSend = async () => {
    if (!voucher) return;
    if (!to.trim()) {
      toast.error(t("recipientEmail"));
      return;
    }
    setSending(true);
    let ok = false;
    let errorMessage: string | null = null;
    let gmailMessageId: string | null = null;
    try {
      const res = await sendFn({
        data: {
          voucherId: voucher.id,
          to: to.trim(),
          cc: cc.trim() || undefined,
          subject,
          bodyText,
        },
      });
      ok = res.ok;
      if (res.ok) gmailMessageId = res.gmailMessageId;
      else errorMessage = res.error;
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
    }
    await supabase.from("voucher_send_log").insert({
      voucher_id: voucher.id,
      sent_to: to.trim(),
      sent_cc: cc.trim() || null,
      subject,
      body_text: bodyText,
      status: ok ? "enviado" : "falhou",
      error_message: errorMessage,
      gmail_message_id: gmailMessageId,
      sent_by: user?.id ?? null,
    } as never);
    setSending(false);
    if (ok) {
      toast.success(t("voucherSent"));
      setSendOpen(false);
    } else {
      toast.error(errorMessage ?? t("voucherSendFailed"));
    }
    load();
  };

  if (!voucher) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("openItemVoucher")}</DialogTitle>
          </DialogHeader>
          <div className="p-6 text-muted-foreground text-sm">{t("loading")}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto print:max-w-full print:shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center gap-2">
            {t("voucherForItem")}
            <Badge variant="outline" className="font-mono">{voucher.code}</Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="voucher">
          <TabsList className="print:hidden">
            <TabsTrigger value="voucher">{t("voucherTab")}</TabsTrigger>
            <TabsTrigger value="history">{t("voucherSendHistory")} ({logs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="voucher">
            <div id="voucher-printable" className="space-y-4 p-2 print:p-0">
              {!editing ? (
                <div className="rounded border bg-card p-6 space-y-3 text-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">{t("voucherCode")}</div>
                      <div className="text-2xl font-mono font-bold">{voucher.code}</div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>{t("voucherIssuedAt")}</div>
                      <div>{new Date(voucher.issued_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <Field label={t("voucherCustomer")} value={customerName} />
                  <Field label={t("voucherItem")} value={itemDescription} />
                  <Field label={t("voucherServiceDate")} value={voucher.service_date} />
                  <Field label={t("voucherMeetingTime")} value={voucher.meeting_time} />
                  <Field label={t("voucherMeetingPoint")} value={voucher.meeting_point} />
                  <Field label={t("voucherEmergencyContact")} value={voucher.emergency_contact} />
                  <Field label={t("voucherCustomerInstructions")} value={voucher.customer_instructions} multiline />
                  <Field label={t("voucherNotes")} value={voucher.notes} multiline />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-2">
                  <div>
                    <Label>{t("voucherServiceDate")}</Label>
                    <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>{t("voucherMeetingTime")}</Label>
                    <Input value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} placeholder="08:00" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>{t("voucherMeetingPoint")}</Label>
                    <Input value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>{t("voucherEmergencyContact")}</Label>
                    <Input value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>{t("voucherCustomerInstructions")}</Label>
                    <Textarea rows={3} value={customerInstructions} onChange={(e) => setCustomerInstructions(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>{t("voucherNotes")}</Label>
                    <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-3 print:hidden">
              {!editing ? (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="mr-1 h-4 w-4" />{t("editVoucher")}
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={save}><Save className="mr-1 h-4 w-4" />{t("saveVoucher")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(false); load(); }}>
                    <X className="mr-1 h-4 w-4" />{t("cancel")}
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="mr-1 h-4 w-4" />{t("printVoucher")}
              </Button>
              <Button size="sm" onClick={openSend}>
                <Mail className="mr-1 h-4 w-4" />{t("sendVoucherByEmail")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="history">
            {logs.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">{t("voucherSendHistoryEmpty")}</div>
            ) : (
              <div className="space-y-2">
                {logs.map((l) => (
                  <div key={l.id} className="rounded border p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-medium">{l.sent_to}{l.sent_cc ? ` · cc: ${l.sent_cc}` : ""}</div>
                      <Badge variant="outline" className={l.status === "enviado" ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-700"}>
                        {l.status}
                      </Badge>
                    </div>
                    {l.subject && <div className="text-muted-foreground">{l.subject}</div>}
                    {l.error_message && <div className="text-xs text-red-600">{l.error_message}</div>}
                    <div className="text-xs text-muted-foreground">
                      {t("sentAt")}: {new Date(l.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Send sub-dialog */}
        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("sendVoucherByEmail")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t("recipientEmail")}</Label>
                <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="cliente@email.com" />
              </div>
              <div>
                <Label>{t("ccEmail")}</Label>
                <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@email.com" />
              </div>
              <div>
                <Label>{t("emailSubject")}</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <Label>{t("emailBody")}</Label>
                <Textarea rows={5} value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setSendOpen(false)} disabled={sending}>{t("cancel")}</Button>
                <Button onClick={doSend} disabled={sending}>
                  <Mail className="mr-1 h-4 w-4" />{sending ? t("sending") : t("sendVoucher")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #voucher-printable, #voucher-printable * { visibility: visible !important; }
          #voucher-printable { position: absolute; left: 0; top: 0; width: 100%; padding: 24px !important; }
        }
      `}</style>
    </Dialog>
  );
}

function Field({ label, value, multiline }: { label: string; value: string | null | undefined; multiline?: boolean }) {
  if (!value) return null;
  return (
    <div className={multiline ? "" : "flex gap-2"}>
      <div className="text-muted-foreground text-xs uppercase tracking-wide min-w-[160px]">{label}</div>
      <div className={multiline ? "whitespace-pre-wrap" : ""}>{value}</div>
    </div>
  );
}
