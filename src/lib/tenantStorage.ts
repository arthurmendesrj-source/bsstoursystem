/**
 * Tenant-scoped storage helpers.
 *
 * Phase 5 of the multi-tenant rollout: every NEW upload to a tenant-aware
 * bucket must be filed under the tenant's UUID. Storage RLS enforces this
 * server-side (see `public.storage_path_allowed_for_user`). These helpers
 * keep the client convention consistent and translate low-level Storage
 * errors into friendly, localized messages for the UI.
 */

import { supabase } from "@/integrations/supabase/client";

export const TENANT_SCOPED_BUCKETS = [
  "proposal-docs",
  "booking-proofs",
  "itineraries",
  "supplier-docs",
  "ai-images",
  "email-attachments",
  "invoice-templates",
  "invoice-docs",
  "whatsapp-media",
] as const;

export type TenantScopedBucket = (typeof TENANT_SCOPED_BUCKETS)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

/**
 * Validate the user can upload to a tenant bucket right now.
 * Returns a friendly error message when invalid, or null when OK.
 */
export function validateTenantUpload(opts: {
  tenantId: string | null | undefined;
  file?: File | Blob | null;
  maxBytes?: number;
}): string | null {
  if (!opts.tenantId) {
    return "Nenhuma empresa selecionada. Escolha uma empresa no topo da página antes de enviar arquivos.";
  }
  if (!isUuid(opts.tenantId)) {
    return "Identificador de empresa inválido. Recarregue a página e tente novamente.";
  }
  if (opts.file && opts.maxBytes && opts.file.size > opts.maxBytes) {
    const mb = Math.round(opts.maxBytes / (1024 * 1024));
    return `Arquivo muito grande. O tamanho máximo é ${mb} MB.`;
  }
  if (opts.file && opts.file.size === 0) {
    return "O arquivo selecionado está vazio.";
  }
  return null;
}

/**
 * Build a storage path scoped to a tenant.
 *
 * Example:
 *   tenantPath("abc-123", "leads", "logo.png")
 *   // => "abc-123/leads/logo.png"
 */
export function tenantPath(tenantId: string, ...segments: string[]): string {
  if (!isUuid(tenantId)) {
    throw new Error(
      "tenantPath: tenantId precisa ser um UUID válido (empresa atual).",
    );
  }
  const parts = [tenantId, ...segments.filter(Boolean)]
    .map((p) => String(p).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return parts.join("/");
}

/**
 * Translate a raw Supabase Storage error into a friendly, user-facing
 * Portuguese message. Falls back to the original message when nothing
 * matches.
 */
export function friendlyStorageError(
  error: unknown,
  ctx?: { bucket?: string },
): string {
  if (!error) return "Falha desconhecida ao enviar o arquivo.";
  const raw =
    (error as { message?: string; error?: string; statusCode?: string | number })
      ?.message ??
    (typeof error === "string" ? error : "") ??
    "";
  const status = String(
    (error as { statusCode?: string | number; status?: number })?.statusCode ??
      (error as { status?: number })?.status ??
      "",
  );
  const msg = raw.toLowerCase();

  // RLS / permission failures (storage_path_allowed_for_user blocked the write)
  if (
    status === "403" ||
    msg.includes("row-level security") ||
    msg.includes("row level security") ||
    msg.includes("not authorized") ||
    msg.includes("unauthorized") ||
    msg.includes("permission denied")
  ) {
    return "Você não tem permissão para enviar arquivos para esta empresa. Verifique se selecionou a empresa correta ou peça acesso ao administrador.";
  }

  // Invalid path (missing tenant prefix, weird chars, etc.)
  if (
    msg.includes("invalid key") ||
    msg.includes("invalid path") ||
    msg.includes("invalid_request") ||
    msg.includes("invalid object key")
  ) {
    return "Caminho do arquivo inválido para a empresa atual. Recarregue a página e tente novamente.";
  }

  // Already exists
  if (
    status === "409" ||
    msg.includes("already exists") ||
    msg.includes("duplicate")
  ) {
    return "Já existe um arquivo com este nome. Renomeie o arquivo ou tente novamente.";
  }

  // Size / payload
  if (msg.includes("payload too large") || status === "413") {
    return "Arquivo muito grande para o servidor aceitar.";
  }

  // Bucket missing / misconfig
  if (msg.includes("bucket not found")) {
    return `Espaço de armazenamento "${ctx?.bucket ?? "?"}" indisponível. Avise o suporte.`;
  }

  // Network
  if (msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return "Falha de conexão durante o envio. Verifique sua internet e tente novamente.";
  }

  return raw || "Não foi possível enviar o arquivo.";
}

/**
 * Upload a file to a tenant-scoped bucket. The path is automatically
 * prefixed with the tenant id. Returns the Supabase upload result plus a
 * pre-computed friendly error message when something fails.
 */
export async function uploadTenantFile(opts: {
  bucket: TenantScopedBucket;
  tenantId: string;
  path: string; // path WITHIN the tenant folder, e.g. "leads/logo.png"
  file: File | Blob;
  upsert?: boolean;
  contentType?: string;
  maxBytes?: number;
}): Promise<
  | { ok: true; path: string }
  | { ok: false; error: string; raw?: unknown }
> {
  const validation = validateTenantUpload({
    tenantId: opts.tenantId,
    file: opts.file,
    maxBytes: opts.maxBytes,
  });
  if (validation) return { ok: false, error: validation };

  let fullPath: string;
  try {
    fullPath = tenantPath(opts.tenantId, opts.path);
  } catch (e) {
    return { ok: false, error: friendlyStorageError(e, { bucket: opts.bucket }), raw: e };
  }

  const { error } = await supabase.storage
    .from(opts.bucket)
    .upload(fullPath, opts.file, {
      upsert: opts.upsert ?? false,
      contentType: opts.contentType,
    });

  if (error) {
    return {
      ok: false,
      error: friendlyStorageError(error, { bucket: opts.bucket }),
      raw: error,
    };
  }
  return { ok: true, path: fullPath };
}
