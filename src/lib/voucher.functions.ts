import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function authHeaders() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_MAIL_API_KEY =
    process.env.GOOGLE_MAIL_API_KEY_1 ?? process.env.GOOGLE_MAIL_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!GOOGLE_MAIL_API_KEY) throw new Error("GOOGLE_MAIL_API_KEY is not configured");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
    "Content-Type": "application/json",
  };
}

function toBase64Url(input: string) {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function row(label: string, value: string | null | undefined) {
  if (!value) return "";
  return `<tr><td style="padding:6px 12px;color:#666;font-size:13px;border-bottom:1px solid #eee;">${escapeHtml(label)}</td><td style="padding:6px 12px;font-size:14px;border-bottom:1px solid #eee;">${escapeHtml(value)}</td></tr>`;
}

function buildVoucherHtml(v: {
  code: string;
  itemDescription: string;
  customerName: string;
  serviceDate?: string | null;
  meetingPoint?: string | null;
  meetingTime?: string | null;
  emergencyContact?: string | null;
  customerInstructions?: string | null;
  notes?: string | null;
  itineraryText?: string | null;
  bodyText: string;
}) {
  return `<!doctype html><html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <div style="background:#0f172a;color:#fff;padding:20px 24px;">
    <div style="font-size:12px;opacity:.7;letter-spacing:.5px;text-transform:uppercase;">Voucher</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px;font-family:monospace;">${escapeHtml(v.code)}</div>
  </div>
  <div style="padding:16px 24px;color:#333;font-size:14px;line-height:1.5;">
    ${escapeHtml(v.bodyText)}
  </div>
  <table style="width:100%;border-collapse:collapse;margin-top:8px;">
    ${row("Cliente", v.customerName)}
    ${row("Item", v.itemDescription)}
    ${row("Data do serviço", v.serviceDate ?? null)}
    ${row("Horário", v.meetingTime ?? null)}
    ${row("Ponto de encontro", v.meetingPoint ?? null)}
    ${row("Contato de emergência", v.emergencyContact ?? null)}
    ${row("Instruções", v.customerInstructions ?? null)}
    ${row("Observações", v.notes ?? null)}
    ${row("Roteiro", v.itineraryText ?? null)}
  </table>
  <div style="padding:16px 24px;color:#999;font-size:12px;text-align:center;border-top:1px solid #eee;margin-top:8px;">
    Apresente este voucher no embarque / check-in.
  </div>
</div></body></html>`;
}

function buildMime(opts: {
  to: string;
  cc?: string;
  subject: string;
  text: string;
  html: string;
}) {
  const boundary = `=_voucher_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `To: ${opts.to}`,
    opts.cc ? `Cc: ${opts.cc}` : "",
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.html,
    "",
    `--${boundary}--`,
    "",
  ].filter((l) => l !== "");
  return lines.join("\r\n");
}

export const sendVoucherEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      voucherId: string;
      to: string;
      cc?: string;
      subject: string;
      bodyText: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: v, error: vErr } = await supabase
      .from("vouchers")
      .select(
        "id, code, booking_id, quote_item_id, itinerary, emergency_contact, notes, meeting_point, meeting_time, service_date, customer_instructions",
      )
      .eq("id", data.voucherId)
      .maybeSingle();
    if (vErr || !v) throw new Error(vErr?.message ?? "Voucher not found");

    const { data: b } = await supabase
      .from("bookings")
      .select("id, customer_id")
      .eq("id", v.booking_id)
      .maybeSingle();

    const { data: customer } = b?.customer_id
      ? await supabase
          .from("customers")
          .select("full_name")
          .eq("id", b.customer_id)
          .maybeSingle()
      : { data: null };

    let itemDescription = "";
    if (v.quote_item_id) {
      const { data: qi } = await supabase
        .from("quote_items")
        .select("description")
        .eq("id", v.quote_item_id)
        .maybeSingle();
      itemDescription = qi?.description ?? "";
    }

    const html = buildVoucherHtml({
      code: v.code,
      itemDescription,
      customerName: customer?.full_name ?? "",
      serviceDate: v.service_date,
      meetingPoint: v.meeting_point,
      meetingTime: v.meeting_time,
      emergencyContact: v.emergency_contact,
      customerInstructions: v.customer_instructions,
      notes: v.notes,
      itineraryText: v.itinerary,
      bodyText: data.bodyText,
    });

    const mime = buildMime({
      to: data.to,
      cc: data.cc,
      subject: data.subject,
      text: data.bodyText,
      html,
    });

    const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ raw: toBase64Url(mime) }),
    });
    const text = await res.text();
    let json: { id?: string } | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      return { ok: false as const, error: `Gmail ${res.status}: ${text}` };
    }
    return { ok: true as const, gmailMessageId: json?.id ?? null };
  });
