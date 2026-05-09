import { supabase } from "@/integrations/supabase/client";

export type LinkTargets = {
  lead_id?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
};

/**
 * Associate every email of a Gmail thread with the given lead/customer/supplier.
 * Uses the SECURITY DEFINER RPC `link_email_thread`, which also mirrors entries
 * into `email_message_links` for traceability.
 * Returns the number of `emails` rows affected.
 */
export async function linkEmailThread(
  threadId: string | null | undefined,
  targets: LinkTargets,
): Promise<number> {
  if (!threadId) return 0;
  const { lead_id, customer_id, supplier_id } = targets;
  if (!lead_id && !customer_id && !supplier_id) return 0;
  const { data, error } = await (supabase.rpc as any)("link_email_thread", {
    _thread_id: threadId,
    _lead_id: lead_id ?? null,
    _customer_id: customer_id ?? null,
    _supplier_id: supplier_id ?? null,
  });
  if (error) {
    console.error("[linkEmailThread]", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

/**
 * Find every distinct gmail thread that involves a given email address
 * (in `from_email` or `to_emails`) and link each thread to the targets.
 * Returns the number of distinct threads linked.
 */
export async function linkThreadsByEmail(
  email: string | null | undefined,
  targets: LinkTargets,
): Promise<number> {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return 0;
  const { lead_id, customer_id, supplier_id } = targets;
  if (!lead_id && !customer_id && !supplier_id) return 0;

  const { data, error } = await supabase
    .from("emails")
    .select("thread_id")
    .or(`from_email.ilike.${e},to_emails.cs.{${e}}`)
    .not("thread_id", "is", null)
    .limit(500);
  if (error) {
    console.error("[linkThreadsByEmail] lookup", error.message);
    return 0;
  }
  const threads = Array.from(
    new Set(((data ?? []) as { thread_id: string | null }[])
      .map((r) => r.thread_id)
      .filter((t): t is string => !!t)),
  );
  let n = 0;
  for (const t of threads) {
    const updated = await linkEmailThread(t, targets);
    if (updated > 0) n++;
  }
  return n;
}
