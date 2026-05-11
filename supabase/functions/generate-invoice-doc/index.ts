// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";
import ExcelJS from "npm:exceljs@4.4.0";
import { jsPDF } from "npm:jspdf@2.5.2";
import autoTable from "npm:jspdf-autotable@3.8.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Item = {
  id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
  kind: string | null;
  city: string | null;
  category: string | null;
  item_date: string | null;
  check_out: string | null;
  nights: number | null;
  rooms: number | null;
  meal_plan: string | null;
  pax: number | null;
  ways: number | null;
};

function fmtDate(d?: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const yy = dt.getUTCFullYear();
  return `${dd}.${mm}.${yy}`;
}

function fmtPeriod(a?: string | null, b?: string | null): string {
  if (!a) return "";
  if (!b) return fmtDate(a);
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return fmtDate(a);
  const sameMonth =
    da.getUTCMonth() === db.getUTCMonth() && da.getUTCFullYear() === db.getUTCFullYear();
  if (sameMonth) {
    const dd1 = String(da.getUTCDate()).padStart(2, "0");
    const dd2 = String(db.getUTCDate()).padStart(2, "0");
    const mm = String(da.getUTCMonth() + 1).padStart(2, "0");
    const yy = da.getUTCFullYear();
    return `${dd1}-${dd2}.${mm}.${yy}`;
  }
  return `${fmtDate(a)} - ${fmtDate(b)}`;
}

async function buildXlsx(opts: {
  templateBuf: ArrayBuffer;
  invoiceNumber: string;
  customerName: string;
  hotels: Item[];
  services: Item[];
  bankInfo: string;
  beneficiary: string;
  total: number;
}): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(opts.templateBuf);
  const ws = wb.getWorksheet("INVOICE");
  if (!ws) throw new Error("INVOICE sheet not found in template");

  ws.getCell("G1").value = opts.invoiceNumber || "";
  ws.getCell("B3").value = opts.customerName || "";

  // Hotels start row 9. Template has 1 row. Insert additional rows if needed.
  const hotelStart = 9;
  const extraHotels = Math.max(0, opts.hotels.length - 1);
  if (extraHotels > 0) {
    for (let i = 0; i < extraHotels; i++) {
      ws.duplicateRow(hotelStart, 1, true);
    }
  }
  opts.hotels.forEach((h, i) => {
    const r = hotelStart + i;
    ws.getCell(`A${r}`).value = `Check In: ${fmtDate(h.item_date)}  \nCheck Out: ${fmtDate(
      h.check_out,
    )}`;
    ws.getCell(`B${r}`).value = h.description || "";
    ws.getCell(`C${r}`).value = h.category || "";
    ws.getCell(`D${r}`).value = h.meal_plan || "";
    ws.getCell(`E${r}`).value = h.city || "";
    ws.getCell(`F${r}`).value = h.unit_price && h.unit_price > 0 ? h.unit_price : "Incl.";
    ws.getCell(`G${r}`).value = h.rooms ?? "";
    ws.getCell(`H${r}`).value = h.nights ?? "";
    ws.getCell(`I${r}`).value = h.total && h.total > 0 ? h.total : "Incl.";
  });
  if (opts.hotels.length === 0) {
    // clear template row
    ["A", "B", "C", "D", "E", "F", "G", "H", "I"].forEach((c) => {
      ws.getCell(`${c}${hotelStart}`).value = null;
    });
  }

  // Services start row 25 (after duplicated hotel rows shift by extraHotels).
  const servicesStart = 25 + extraHotels;
  const extraServices = Math.max(0, opts.services.length - 1);
  if (extraServices > 0) {
    for (let i = 0; i < extraServices; i++) {
      ws.duplicateRow(servicesStart, 1, true);
    }
  }
  opts.services.forEach((s, i) => {
    const r = servicesStart + i;
    ws.getCell(`A${r}`).value = fmtPeriod(s.item_date, s.check_out);
    ws.getCell(`B${r}`).value = s.description || "";
    ws.getCell(`E${r}`).value = s.city || "";
    ws.getCell(`F${r}`).value = s.unit_price && s.unit_price > 0 ? s.unit_price : "Incl.";
    ws.getCell(`G${r}`).value = s.pax ?? "";
    ws.getCell(`H${r}`).value = s.ways ?? "";
    ws.getCell(`I${r}`).value = s.total && s.total > 0 ? s.total : "Incl.";
  });
  if (opts.services.length === 0) {
    ["A", "B", "E", "F", "G", "H", "I"].forEach((c) => {
      ws.getCell(`${c}${servicesStart}`).value = null;
    });
  }

  // Totals: row right after services
  const totalRow = servicesStart + Math.max(opts.services.length, 1);
  const paidRow = totalRow + 1;
  ws.getCell(`A${totalRow}`).value = "Total price ";
  ws.getCell(`I${totalRow}`).value = opts.total;
  ws.getCell(`A${paidRow}`).value = "Total to be Paid";
  ws.getCell(`I${paidRow}`).value = opts.total;

  // Bank info (A29) shifts by extraHotels + extraServices
  const bankRow = 29 + extraHotels + extraServices;
  ws.getCell(`A${bankRow}`).value = opts.bankInfo;
  ws.getCell(`F${bankRow}`).value = opts.beneficiary;

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

function buildPdf(opts: {
  invoiceNumber: string;
  customerName: string;
  hotels: Item[];
  services: Item[];
  bankInfo: string;
  beneficiary: string;
  total: number;
}): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", 40, 50);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(opts.invoiceNumber || "—", pageW - 40, 50, { align: "right" });

  doc.setFontSize(10);
  doc.text(`REF: ${opts.customerName || ""}`, 40, 75);

  let y = 100;

  if (opts.hotels.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.text("Hotels", 40, y);
    y += 6;
    autoTable(doc, {
      startY: y + 4,
      head: [["Date", "Hotel", "Category", "Meal Plan", "City", "USD", "Rooms", "Nights", "Subtotal"]],
      body: opts.hotels.map((h) => [
        `${fmtDate(h.item_date)}\n${fmtDate(h.check_out)}`,
        h.description || "",
        h.category || "",
        h.meal_plan || "",
        h.city || "",
        h.unit_price && h.unit_price > 0 ? h.unit_price.toFixed(2) : "Incl.",
        h.rooms ?? "",
        h.nights ?? "",
        h.total && h.total > 0 ? h.total.toFixed(2) : "Incl.",
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [40, 40, 60] },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  if (opts.services.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.text("Services", 40, y);
    y += 6;
    autoTable(doc, {
      startY: y + 4,
      head: [["Date", "Service", "City", "USD", "Pax", "Ways", "Subtotal"]],
      body: opts.services.map((s) => [
        fmtPeriod(s.item_date, s.check_out),
        s.description || "",
        s.city || "",
        s.unit_price && s.unit_price > 0 ? s.unit_price.toFixed(2) : "Incl.",
        s.pax ?? "",
        s.ways ?? "",
        s.total && s.total > 0 ? s.total.toFixed(2) : "Incl.",
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [40, 40, 60] },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Total to be Paid: USD ${opts.total.toFixed(2)}`, pageW - 40, y, { align: "right" });
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const colW = (pageW - 80 - 20) / 2;
  doc.text(opts.bankInfo, 40, y, { maxWidth: colW });
  doc.text(opts.beneficiary, 40 + colW + 20, y, { maxWidth: colW });

  const ab = doc.output("arraybuffer");
  return new Uint8Array(ab);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const bookingId: string = body.booking_id;
    const formats: string[] = Array.isArray(body.formats) && body.formats.length > 0
      ? body.formats
      : ["xlsx"];
    const bankInfo: string = body.bank_info ?? "";
    const beneficiary: string = body.beneficiary ?? "";
    const version: "client" | "admin" = body.version === "admin" ? "admin" : "client";

    if (!bookingId) {
      return new Response(JSON.stringify({ error: "booking_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Booking
    const { data: booking, error: bErr } = await userClient
      .from("bookings")
      .select("id, customer_id, quote_id, total_amount, currency, departure_date")
      .eq("id", bookingId)
      .maybeSingle();
    if (bErr || !booking) {
      return new Response(JSON.stringify({ error: bErr?.message ?? "booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let customerName = "";
    if (booking.customer_id) {
      const { data: c } = await userClient
        .from("customers")
        .select("full_name")
        .eq("id", booking.customer_id)
        .maybeSingle();
      customerName = c?.full_name ?? "";
    }

    let items: Item[] = [];
    if (booking.quote_id) {
      const { data: qi } = await userClient
        .from("quote_items")
        .select(
          "id,description,quantity,unit_price,total,kind,city,category,item_date,check_out,nights,rooms,meal_plan,pax,ways",
        )
        .eq("quote_id", booking.quote_id)
        .order("kind", { ascending: true })
        .order("item_date", { ascending: true });
      items = (qi ?? []) as Item[];
    }

    const hotels = items.filter((i) => i.kind === "hotel");
    const services = items.filter((i) => i.kind !== "hotel");
    const total = items.reduce((sum, i) => sum + (Number(i.total) || 0), 0);

    let invoiceNumber = "";
    const { data: invByBooking } = await userClient
      .from("invoices")
      .select("number")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (invByBooking?.number) invoiceNumber = invByBooking.number;
    else if (booking.quote_id) {
      const { data: invByQuote } = await userClient
        .from("invoices")
        .select("number")
        .eq("quote_id", booking.quote_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (invByQuote?.number) invoiceNumber = invByQuote.number;
    }

    // Load template via service role
    const { data: tplBlob, error: tplErr } = await admin.storage
      .from("invoice-templates")
      .download("template.xlsx");
    if (tplErr || !tplBlob) {
      return new Response(JSON.stringify({ error: `template missing: ${tplErr?.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const tplBuf = await tplBlob.arrayBuffer();

    const ts = Date.now();
    const baseName = (invoiceNumber || `invoice-${bookingId.slice(0, 8)}`).replace(/[^A-Za-z0-9_-]/g, "_");
    const result: Record<string, string> = { file_name: baseName };

    if (formats.includes("xlsx")) {
      const xlsxBytes = await buildXlsx({
        templateBuf: tplBuf,
        invoiceNumber,
        customerName,
        hotels,
        services,
        bankInfo,
        beneficiary,
        total,
      });
      const path = `${bookingId}/${ts}-${baseName}.xlsx`;
      const { error: upErr } = await admin.storage
        .from("invoice-docs")
        .upload(path, xlsxBytes, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        });
      if (upErr) throw upErr;
      const { data: signed } = await admin.storage.from("invoice-docs").createSignedUrl(path, 3600);
      result.xlsx_signed_url = signed?.signedUrl ?? "";
    }

    if (formats.includes("pdf")) {
      const pdfBytes = buildPdf({
        invoiceNumber,
        customerName,
        hotels,
        services,
        bankInfo,
        beneficiary,
        total,
      });
      const path = `${bookingId}/${ts}-${baseName}.pdf`;
      const { error: upErr } = await admin.storage
        .from("invoice-docs")
        .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await admin.storage.from("invoice-docs").createSignedUrl(path, 3600);
      result.pdf_signed_url = signed?.signedUrl ?? "";
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-invoice-doc error", e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
