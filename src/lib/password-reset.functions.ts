import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM_SENDER = "diretorturismos@gmail.com";
const TTL_MIN = 15;
const MAX_ATTEMPTS = 5;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function findUserIdByEmail(admin: any, email: string): Promise<string | null> {
  const { data } = await admin.from("profiles").select("id, email").ilike("email", email).maybeSingle();
  if (data?.id) return data.id as string;
  for (let page = 1; page <= 20; page++) {
    const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const u = list?.users?.find((x: any) => x.email?.toLowerCase() === email);
    if (u) return u.id;
    if (!list?.users || list.users.length < 200) break;
  }
  return null;
}

export const requestPasswordResetCode = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const email = data.email;

    // Rate limit: 1 code per minute per e-mail
    const { data: last } = await admin
      .from("password_reset_codes")
      .select("created_at")
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && Date.now() - new Date(last.created_at).getTime() < 60_000) {
      return { ok: true }; // silent
    }

    const userId = await findUserIdByEmail(admin, email);
    if (!userId) return { ok: true }; // don't reveal existence

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await admin.from("password_reset_codes").update({ used_at: new Date().toISOString() }).ilike("email", email).is("used_at", null);
    await admin.from("password_reset_codes").insert({
      email,
      user_id: userId,
      code_hash: await sha256(`${email}:${code}`),
      expires_at: new Date(Date.now() + TTL_MIN * 60_000).toISOString(),
    });

    const { data: sender } = await admin
      .from("email_accounts")
      .select("user_id")
      .eq("provider", "gmail_oauth")
      .ilike("email", SYSTEM_SENDER)
      .limit(1)
      .maybeSingle();
    if (!sender?.user_id) {
      console.error("[password-reset] conta de envio do sistema não conectada");
      throw new Error("Envio de e-mail indisponível no momento. Contate o administrador.");
    }
    const { sendMail } = await import("./gmail-api.server");
    try {
      await sendMail(sender.user_id, {
        from: SYSTEM_SENDER,
        to: email,
        subject: `Seu código de recuperação: ${code}`,
        text: `Seu código para redefinir a senha é: ${code}\n\nEle vale por ${TTL_MIN} minutos. Se não foi você, ignore este e-mail.`,
        html: `<div style="font-family:Arial,sans-serif"><p>Seu código para redefinir a senha é:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>Ele vale por ${TTL_MIN} minutos. Se não foi você, ignore este e-mail.</p></div>`,
      });
    } catch (e) {
      console.error("[password-reset] falha no envio", e);
      throw new Error("Não foi possível enviar o e-mail. Tente novamente em instantes.");
    }
    return { ok: true };
  });

export const confirmPasswordResetCode = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(255),
        code: z.string().regex(/^\d{6}$/),
        password: z.string().min(8).max(72),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: row } = await admin
      .from("password_reset_codes")
      .select("*")
      .ilike("email", data.email)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const invalid = { ok: false as const, error: "Código inválido ou expirado." };
    if (!row) return invalid;
    if (new Date(row.expires_at).getTime() < Date.now() || row.attempts >= MAX_ATTEMPTS) {
      await admin.from("password_reset_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
      return invalid;
    }
    if ((await sha256(`${data.email}:${data.code}`)) !== row.code_hash) {
      await admin.from("password_reset_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return invalid;
    }
    const { error } = await admin.auth.admin.updateUserById(row.user_id, { password: data.password });
    if (error) return { ok: false as const, error: "Não foi possível atualizar a senha." };
    await admin.from("password_reset_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: true as const };
  });
