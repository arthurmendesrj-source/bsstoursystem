import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MessageTemplates = {
  whatsapp: string;
  email_subject: string;
  email_body: string;
};

export const DEFAULT_TEMPLATES: MessageTemplates = {
  whatsapp:
    "Olá {primeiro_nome}, tudo bem? Passando para retomar nossa conversa. Posso te ajudar com alguma informação?",
  email_subject: "Retomando nossa conversa",
  email_body:
    "Olá {primeiro_nome},\n\nEspero que esteja bem. Quero retomar nosso atendimento e entender como posso te ajudar nos próximos passos.\n\nAbraços,\n{vendedor}",
};

export type TemplateVars = {
  nome?: string | null;
  destino?: string | null;
  vendedor?: string | null;
};

export function renderTemplate(text: string, vars: TemplateVars): string {
  const nome = (vars.nome ?? "").trim();
  const primeiroNome = nome.split(/\s+/)[0] || nome;
  const map: Record<string, string> = {
    nome,
    primeiro_nome: primeiroNome,
    destino: (vars.destino ?? "").trim(),
    vendedor: (vars.vendedor ?? "").trim(),
  };
  return text.replace(/\{(\w+)\}/g, (_, key) => map[key] ?? `{${key}}`);
}

export function mergeWithDefaults(t: Partial<MessageTemplates> | null | undefined): MessageTemplates {
  return {
    whatsapp: t?.whatsapp?.trim() ? t.whatsapp : DEFAULT_TEMPLATES.whatsapp,
    email_subject: t?.email_subject?.trim() ? t.email_subject : DEFAULT_TEMPLATES.email_subject,
    email_body: t?.email_body?.trim() ? t.email_body : DEFAULT_TEMPLATES.email_body,
  };
}

// Module-level cache so consumers can read templates immediately after first load.
let templatesCache: MessageTemplates | null = null;
let loadingPromise: Promise<MessageTemplates> | null = null;

export async function ensureUserTemplatesLoaded(userId: string | null | undefined): Promise<MessageTemplates> {
  if (templatesCache) return templatesCache;
  if (!userId) return DEFAULT_TEMPLATES;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("message_templates")
        .eq("user_id", userId)
        .maybeSingle();
      const merged = mergeWithDefaults(
        (data?.message_templates as Partial<MessageTemplates> | null) ?? null,
      );
      templatesCache = merged;
      return merged;
    } catch {
      templatesCache = DEFAULT_TEMPLATES;
      return DEFAULT_TEMPLATES;
    } finally {
      loadingPromise = null;
    }
  })();
  return loadingPromise;
}

export function invalidateTemplatesCache() {
  templatesCache = null;
}

export function useUserTemplates(userId: string | null | undefined) {
  const [templates, setTemplates] = useState<MessageTemplates>(DEFAULT_TEMPLATES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setTemplates(DEFAULT_TEMPLATES);
      setLoading(false);
      return;
    }
    let cancelled = false;
    ensureUserTemplatesLoaded(userId).then((t) => {
      if (!cancelled) {
        setTemplates(t);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [userId]);

  return { templates, loading };
}
