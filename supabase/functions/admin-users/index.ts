// Edge function: admin-users
// Actions: invite, block, delete, list
// Allowed callers: admin (full) or diretor (cannot affect admin/diretor)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AppRole = "admin" | "diretor" | "gerente" | "coordenador" | "supervisor" | "operador";
const ALLOWED_ROLES: AppRole[] = ["admin", "diretor", "gerente", "coordenador", "supervisor", "operador"];
const PROTECTED_ROLES: AppRole[] = ["admin", "diretor"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    // Identify caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    // Caller roles
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const callerRoleSet = new Set((callerRoles ?? []).map((r) => r.role as AppRole));
    const isAdmin = callerRoleSet.has("admin");
    const isDirector = callerRoleSet.has("diretor");
    if (!isAdmin && !isDirector) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action: string = body.action;
    const actorEmail = userData.user.email ?? null;

    const audit = async (entry: {
      action: string;
      target_user_id?: string | null;
      target_email?: string | null;
      details?: Record<string, unknown>;
      success?: boolean;
      error_message?: string | null;
    }) => {
      try {
        await admin.from("user_audit_log").insert({
          action: entry.action,
          actor_id: callerId,
          actor_email: actorEmail,
          target_user_id: entry.target_user_id ?? null,
          target_email: entry.target_email ?? null,
          details: entry.details ?? {},
          success: entry.success ?? true,
          error_message: entry.error_message ?? null,
        });
      } catch (e) {
        console.warn("audit log failed", e);
      }
    };

    // Helper: get target roles
    const getRolesOf = async (uid: string): Promise<Set<AppRole>> => {
      const { data } = await admin.from("user_roles").select("role").eq("user_id", uid);
      return new Set((data ?? []).map((r) => r.role as AppRole));
    };

    if (action === "list") {
      const { data: users, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (error) return json({ error: error.message }, 500);
      const out = users.users.map((u) => ({
        user_id: u.id,
        email: u.email,
        banned_until: (u as unknown as { banned_until?: string }).banned_until ?? null,
        last_sign_in_at: u.last_sign_in_at,
        invited_at: (u as unknown as { invited_at?: string }).invited_at ?? null,
        confirmed_at: u.confirmed_at ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        created_at: u.created_at ?? null,
      }));
      return json({ users: out });
    }

    if (action === "list_audit") {
      const limit = Math.min(Number(body.limit ?? 100), 500);
      const { data, error } = await admin
        .from("user_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return json({ error: error.message }, 500);
      return json({ entries: data ?? [] });
    }

    if (action === "resend_invite") {
      const targetId = String(body.user_id ?? "");
      if (!targetId) return json({ error: "user_id obrigatório" }, 400);
      const { data: u, error: gErr } = await admin.auth.admin.getUserById(targetId);
      if (gErr || !u.user?.email) return json({ error: gErr?.message ?? "Usuário sem e-mail" }, 400);
      if (!isAdmin) {
        const targetRoles = await getRolesOf(targetId);
        if ([...targetRoles].some((r) => PROTECTED_ROLES.includes(r))) {
          return json({ error: "Sem permissão" }, 403);
        }
      }
      const redirectTo = `${APP_URL}/`;
      const { error } = await admin.auth.admin.inviteUserByEmail(u.user.email, { redirectTo });
      if (error) return json({ error: error.message }, 400);
      await audit({ action: "resend_invite", target_user_id: targetId, target_email: u.user.email });
      return json({ ok: true });
    }

    if (action === "invite") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const fullName = body.full_name ? String(body.full_name).trim().slice(0, 100) : null;
      const requestedRoles: AppRole[] = Array.isArray(body.roles)
        ? body.roles.filter((r: string) => ALLOWED_ROLES.includes(r as AppRole))
        : [];
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return json({ error: "E-mail inválido" }, 400);
      }
      if (!isAdmin && requestedRoles.some((r) => PROTECTED_ROLES.includes(r))) {
        return json({ error: "Diretor não pode atribuir admin/diretor" }, 403);
      }

      const redirectTo = `${APP_URL}/`;
      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: fullName ? { full_name: fullName } : undefined,
        redirectTo,
      });
      if (invErr || !invited.user) return json({ error: invErr?.message ?? "Falha no convite" }, 400);

      // Garante que o convidado já entre autorizado (e-mail confirmado)
      try {
        await admin.auth.admin.updateUserById(invited.user.id, {
          email_confirm: true,
        } as unknown as Record<string, unknown>);
      } catch (e) {
        console.warn("email_confirm update failed", e);
      }

      // Atribui papéis solicitados, ou 'operador' como padrão
      const rolesToInsert: AppRole[] = requestedRoles.length > 0 ? requestedRoles : ["operador"];
      const rows = rolesToInsert.map((role) => ({ user_id: invited.user!.id, role }));
      await admin.from("user_roles").insert(rows);
      // Garante que o e-mail do convite vire a caixa primária do usuário
      await admin
        .from("user_email_accounts")
        .upsert(
          { user_id: invited.user.id, email_address: email.toLowerCase(), is_primary: true },
          { onConflict: "user_id,email_address" }
        );
      await audit({
        action: "invite",
        target_user_id: invited.user.id,
        target_email: email,
        details: { roles: requestedRoles, full_name: fullName },
      });
      return json({ ok: true, user_id: invited.user.id });
    }

    if (action === "block" || action === "unblock") {
      const targetId = String(body.user_id ?? "");
      if (!targetId) return json({ error: "user_id obrigatório" }, 400);
      if (targetId === callerId) return json({ error: "Não é possível agir sobre si mesmo" }, 400);
      if (!isAdmin) {
        const targetRoles = await getRolesOf(targetId);
        if ([...targetRoles].some((r) => PROTECTED_ROLES.includes(r))) {
          return json({ error: "Diretor não pode bloquear admin/diretor" }, 403);
        }
      }
      const ban_duration = action === "block" ? "876000h" : "none";
      const { data: tgtUser } = await admin.auth.admin.getUserById(targetId);
      const { error } = await admin.auth.admin.updateUserById(targetId, {
        ban_duration,
      } as unknown as Record<string, unknown>);
      if (error) return json({ error: error.message }, 500);
      await audit({
        action,
        target_user_id: targetId,
        target_email: tgtUser?.user?.email ?? null,
      });
      return json({ ok: true });
    }

    if (action === "delete") {
      const targetId = String(body.user_id ?? "");
      const reassignTo = body.reassign_to ? String(body.reassign_to) : null;
      if (!targetId) return json({ error: "user_id obrigatório" }, 400);
      if (targetId === callerId) return json({ error: "Não é possível excluir a si mesmo" }, 400);
      if (reassignTo && reassignTo === targetId) {
        return json({ error: "Reatribuição inválida: mesmo usuário" }, 400);
      }
      if (!isAdmin) {
        const targetRoles = await getRolesOf(targetId);
        if ([...targetRoles].some((r) => PROTECTED_ROLES.includes(r))) {
          return json({ error: "Diretor não pode excluir admin/diretor" }, 403);
        }
      }

      // Capture target email/info before deletion
      const { data: tgtBefore } = await admin.auth.admin.getUserById(targetId);
      const targetEmail = tgtBefore?.user?.email ?? null;

      // Validate reassign target exists
      let reassignEmail: string | null = null;
      if (reassignTo) {
        const { data: tgt, error: tgtErr } = await admin.auth.admin.getUserById(reassignTo);
        if (tgtErr || !tgt.user) return json({ error: "Usuário de reatribuição não encontrado" }, 400);
        reassignEmail = tgt.user.email ?? null;
      }

      if (reassignTo) {
        // Reassign ownership of leads, customers, quotes, bookings to another user
        await admin.from("quotes").update({ created_by: reassignTo }).eq("created_by", targetId);
        await admin.from("bookings").update({ created_by: reassignTo }).eq("created_by", targetId);
        await admin.from("leads").update({ created_by: reassignTo }).eq("created_by", targetId);
        await admin.from("leads").update({ assigned_to: reassignTo }).eq("assigned_to", targetId);
        await admin.from("customers").update({ created_by: reassignTo }).eq("created_by", targetId);
        await admin.from("interactions").update({ created_by: reassignTo }).eq("created_by", targetId);
        await admin.from("tasks").update({ assigned_to: reassignTo }).eq("assigned_to", targetId);
        await admin.from("tasks").update({ created_by: reassignTo }).eq("created_by", targetId);
      } else {
        // Cleanup user-owned data (cascade delete)
        const { data: quotes } = await admin.from("quotes").select("id").eq("created_by", targetId);
        const quoteIds = (quotes ?? []).map((q) => q.id);
        if (quoteIds.length > 0) {
          await admin.from("quote_items").delete().in("quote_id", quoteIds);
          await admin.from("quote_flights").delete().in("quote_id", quoteIds);
          await admin.from("quote_documents").delete().in("quote_id", quoteIds);
        }
        await admin.from("quotes").delete().eq("created_by", targetId);
        await admin.from("bookings").delete().eq("created_by", targetId);
        await admin.from("leads").delete().eq("created_by", targetId);
        await admin.from("leads").delete().eq("assigned_to", targetId);
        await admin.from("customers").delete().eq("created_by", targetId);
        await admin.from("interactions").delete().eq("created_by", targetId);
        await admin.from("tasks").delete().eq("assigned_to", targetId);
        await admin.from("tasks").delete().eq("created_by", targetId);
      }

      // 3) user-scoped auxiliary
      await admin.from("notification_logs").delete().eq("user_id", targetId);
      await admin.from("notification_preferences").delete().eq("user_id", targetId);
      await admin.from("push_subscriptions").delete().eq("user_id", targetId);
      await admin.from("lead_alert_snoozes").delete().eq("user_id", targetId);

      // 4) ai conversations + messages (cascade msgs first)
      const { data: convs } = await admin.from("ai_conversations").select("id").eq("user_id", targetId);
      const convIds = (convs ?? []).map((c) => c.id);
      if (convIds.length > 0) {
        await admin.from("ai_messages").delete().in("conversation_id", convIds);
        await admin.from("ai_pending_actions").delete().in("conversation_id", convIds);
        await admin.from("ai_generated_images").delete().in("conversation_id", convIds);
      }
      await admin.from("ai_conversations").delete().eq("user_id", targetId);

      // 5) permissions + role
      await admin.from("user_module_permissions").delete().eq("user_id", targetId);
      await admin.from("user_field_permissions").delete().eq("user_id", targetId);
      await admin.from("user_roles").delete().eq("user_id", targetId);

      // 6) profile
      await admin.from("profiles").delete().eq("user_id", targetId);

      // 7) auth user
      const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
      if (delErr) return json({ error: delErr.message }, 500);

      await audit({
        action: "delete",
        target_user_id: targetId,
        target_email: targetEmail,
        details: {
          reassigned_to: reassignTo,
          reassigned_to_email: reassignEmail,
          mode: reassignTo ? "reassign" : "cascade_delete",
        },
      });

      return json({ ok: true });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
