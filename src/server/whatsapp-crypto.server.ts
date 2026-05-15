// AES-GCM encryption for WhatsApp tokens. Server-only.
import crypto from "crypto";

function getKey(): Buffer {
  const raw = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY not configured");
  // Accept hex (64 chars), base64, or arbitrary string -> sha256
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  try {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) return b;
  } catch {
    // ignore
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [v, ivB64, tagB64, encB64] = payload.split(":");
  if (v !== "v1") throw new Error("Unsupported ciphertext version");
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
