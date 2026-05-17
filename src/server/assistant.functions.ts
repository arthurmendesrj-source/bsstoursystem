import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveUserTenantId } from "@/server/tenant.server";
import { tenantPath } from "@/lib/tenantStorage";

// ===== Conversations =====
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("ai_conversations")
      .select("id, title, model, created_at, updated_at, last_message_at")
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return { conversations: data ?? [] };
  });

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: conv }, { data: msgs }, { data: actions }] = await Promise.all([
      supabase.from("ai_conversations").select("*").eq("id", data.id).maybeSingle(),
      supabase.from("ai_messages").select("*").eq("conversation_id", data.id).order("created_at"),
      supabase.from("ai_pending_actions").select("*").eq("conversation_id", data.id).order("created_at"),
    ]);
    return { conversation: conv, messages: msgs ?? [], actions: actions ?? [] };
  });

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title?: string; model?: string }) =>
    z.object({ title: z.string().max(200).optional(), model: z.string().max(100).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ai_conversations")
      .insert({ user_id: userId, title: data.title || "Nova conversa", model: data.model || "google/gemini-2.5-flash" })
      .select()
      .single();
    if (error) throw error;
    return { conversation: row };
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; title: string }) =>
    z.object({ id: z.string().uuid(), title: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("ai_conversations").update({ title: data.title }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("ai_conversations").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ===== Pending Actions =====
async function executeAction(actionType: string, payload: any, supabase: any, userId: string) {
  switch (actionType) {
    case "propose_create_lead": {
      const { data, error } = await supabase
        .from("leads")
        .insert({
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          destination: payload.destination,
          estimated_value: payload.estimated_value,
          source: payload.source ?? "ia_assistente",
          notes: payload.notes,
          created_by: userId,
          assigned_to: userId,
        })
        .select()
        .single();
      if (error) throw error;
      return { lead: data };
    }
    case "propose_update_lead": {
      const { data, error } = await supabase
        .from("leads")
        .update(payload.fields)
        .eq("id", payload.id)
        .select()
        .single();
      if (error) throw error;
      return { lead: data };
    }
    case "propose_create_interaction": {
      const { data, error } = await supabase
        .from("interactions")
        .insert({
          lead_id: payload.lead_id,
          customer_id: payload.customer_id,
          type: payload.type,
          subject: payload.subject,
          content: payload.content,
          created_by: userId,
        })
        .select()
        .single();
      if (error) throw error;
      return { interaction: data };
    }
    case "propose_create_activity": {
      const { data, error } = await supabase
        .from("operations_activities")
        .insert({
          booking_id: payload.booking_id,
          kind: payload.kind,
          description: payload.description,
          activity_date: payload.activity_date,
          activity_time: payload.activity_time,
          city: payload.city,
          notes: payload.notes,
          created_by: userId,
          source: "ia_assistente",
        })
        .select()
        .single();
      if (error) throw error;
      return { activity: data };
    }
    default:
      throw new Error(`Ação desconhecida: ${actionType}`);
  }
}

export const approveAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: action, error: e1 } = await supabase
      .from("ai_pending_actions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw e1;
    if (!action) throw new Error("Ação não encontrada");
    if (action.status !== "pending") throw new Error("Ação já decidida");

    try {
      const result = await executeAction(action.action_type, action.payload, supabase, userId);
      await supabase
        .from("ai_pending_actions")
        .update({ status: "executed", result, decided_at: new Date().toISOString() })
        .eq("id", action.id);
      return { ok: true, result };
    } catch (err: any) {
      await supabase
        .from("ai_pending_actions")
        .update({ status: "failed", error: String(err?.message ?? err), decided_at: new Date().toISOString() })
        .eq("id", action.id);
      throw err;
    }
  });

export const rejectAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("ai_pending_actions")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ===== Image generation =====
export const generateAssistantImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { prompt: string; conversation_id?: string }) =>
    z.object({ prompt: z.string().min(1).max(2000), conversation_id: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: data.prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Falha na geração: ${resp.status} ${text}`);
    }
    const json: any = await resp.json();
    const dataUrl: string | undefined = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) throw new Error("Resposta sem imagem");

    const base64 = dataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const path = `${userId}/${Date.now()}.png`;
    const { error: upErr } = await supabaseAdmin.storage.from("ai-images").upload(path, bytes, {
      contentType: "image/png",
      upsert: false,
    });
    if (upErr) throw upErr;

    await supabaseAdmin.from("ai_generated_images").insert({
      user_id: userId,
      conversation_id: data.conversation_id ?? null,
      prompt: data.prompt,
      storage_path: path,
    });

    const { data: signed } = await supabaseAdmin.storage.from("ai-images").createSignedUrl(path, 60 * 60 * 24 * 7);
    return { url: signed?.signedUrl, storage_path: path };
  });
