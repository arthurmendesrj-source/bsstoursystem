/**
 * Tenant-scoped storage helpers.
 *
 * Phase 5 of the multi-tenant rollout: every NEW upload to a tenant-aware
 * bucket must be filed under the tenant's UUID. Storage RLS enforces this
 * server-side (see `public.storage_path_allowed_for_user`). These helpers
 * keep the client convention consistent.
 *
 * Legacy paths (those whose first segment is not a UUID) remain readable
 * for backwards compatibility — only new writes need to follow the
 * tenant-prefix convention.
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

/**
 * Build a storage path scoped to a tenant.
 *
 * Example:
 *   tenantPath("abc-123", "leads", "logo.png")
 *   // => "abc-123/leads/logo.png"
 */
export function tenantPath(tenantId: string, ...segments: string[]): string {
  if (!tenantId) {
    throw new Error("tenantPath: tenantId is required");
  }
  const parts = [tenantId, ...segments.filter(Boolean)]
    .map((p) => String(p).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return parts.join("/");
}

/**
 * Upload a file to a tenant-scoped bucket. The path is automatically
 * prefixed with the tenant id.
 */
export async function uploadTenantFile(opts: {
  bucket: TenantScopedBucket;
  tenantId: string;
  path: string; // path WITHIN the tenant folder, e.g. "leads/logo.png"
  file: File | Blob;
  upsert?: boolean;
  contentType?: string;
}) {
  const fullPath = tenantPath(opts.tenantId, opts.path);
  return supabase.storage.from(opts.bucket).upload(fullPath, opts.file, {
    upsert: opts.upsert ?? false,
    contentType: opts.contentType,
  });
}
