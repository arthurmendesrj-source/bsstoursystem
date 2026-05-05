// VAPID public key — seguro expor no cliente (é a chave pública).
// A privada fica nos secrets do servidor (VAPID_PRIVATE_KEY).
export const VAPID_PUBLIC_KEY =
  "BPAyUPkG7062-9eDlt2WuussefVuXVveeKAyqOkTwci4TMnWEBZrjVfGIQsxIcnGQ-A7kDkJE-L8EMEZVBeGxrw";

/** Converte base64url para Uint8Array (formato exigido pelo PushManager). */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
