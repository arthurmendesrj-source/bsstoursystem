/**
 * InfinitePay REST wrapper (server-only).
 *
 * Endpoints kept generic — adjust paths/payloads to the exact contract of
 * the InfinitePay API your account uses (Checkout / Recurring / Cards).
 * Env vars are read inside each function so they only resolve on the server.
 */

type FetchInit = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown>;
  query?: Record<string, string | number | undefined>;
};

function baseUrl() {
  const env = (process.env.INFINITEPAY_ENV || "sandbox").toLowerCase();
  return env === "production"
    ? "https://api.infinitepay.io"
    : "https://api.sandbox.infinitepay.io";
}

async function ipFetch<T = any>(path: string, init: FetchInit = {}): Promise<T> {
  const apiKey = process.env.INFINITEPAY_API_KEY;
  if (!apiKey) throw new Error("INFINITEPAY_API_KEY missing");

  const url = new URL(baseUrl() + path);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error || data.error_description)) ||
      `InfinitePay ${res.status}`;
    throw new Error(`[infinitepay] ${msg}`);
  }
  return data as T;
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ─────────────────────────── Customers ───────────────────────────
export async function createCustomer(input: {
  legal_name: string;
  doc_type: "cpf" | "cnpj";
  doc_number: string;
  email: string;
  phone?: string;
  address?: Record<string, unknown>;
}) {
  return ipFetch<{ id: string }>("/v1/customers", { method: "POST", body: input });
}

// ─────────────────────────── Cards (tokenization) ───────────────────────────
export async function tokenizeCard(input: {
  customer_id: string;
  number: string;
  holder_name: string;
  exp_month: number;
  exp_year: number;
  cvv: string;
}) {
  return ipFetch<{
    token: string;
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  }>("/v1/cards", { method: "POST", body: input });
}

// ─────────────────────────── Charges ───────────────────────────
export type ChargeResponse = {
  id: string;
  status: "pending" | "paid" | "failed" | "refunded" | string;
  amount_cents: number;
  payment_method: "card" | "pix" | "boleto";
  pix?: { qr_code?: string; copia_cola?: string };
  boleto?: { url?: string; barcode?: string };
};

export async function chargeCard(input: {
  customer_id: string;
  card_token: string;
  amount_cents: number;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  return ipFetch<ChargeResponse>("/v1/charges", {
    method: "POST",
    body: { ...input, payment_method: "card" },
  });
}

export async function createPixCharge(input: {
  customer_id: string;
  amount_cents: number;
  description?: string;
  expires_in_minutes?: number;
  metadata?: Record<string, unknown>;
}) {
  return ipFetch<ChargeResponse>("/v1/charges", {
    method: "POST",
    body: { ...input, payment_method: "pix" },
  });
}

export async function createBoletoCharge(input: {
  customer_id: string;
  amount_cents: number;
  description?: string;
  due_date?: string; // YYYY-MM-DD
  metadata?: Record<string, unknown>;
}) {
  return ipFetch<ChargeResponse>("/v1/charges", {
    method: "POST",
    body: { ...input, payment_method: "boleto" },
  });
}
