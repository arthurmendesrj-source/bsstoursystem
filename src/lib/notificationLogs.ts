import { supabase } from "@/integrations/supabase/client";

export type NotificationChannel = "push" | "in_app" | "email" | "whatsapp";
export type NotificationStatus = "success" | "error" | "skipped";

export interface NotificationLogInput {
  user_id: string;
  lead_id?: string | null;
  channel?: NotificationChannel;
  status: NotificationStatus;
  title: string;
  body?: string | null;
  error_detail?: string | null;
  metadata?: Record<string, unknown>;
}

/** Registra uma notificação no histórico. Falhas são silenciosas (não interrompem o fluxo principal). */
export async function logNotification(input: NotificationLogInput): Promise<void> {
  try {
    await (supabase.from("notification_logs" as any) as any).insert({
      user_id: input.user_id,
      lead_id: input.lead_id ?? null,
      channel: input.channel ?? "push",
      status: input.status,
      title: input.title,
      body: input.body ?? null,
      error_detail: input.error_detail ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (err) {
    console.error("[notification_logs] insert failed:", err);
  }
}
