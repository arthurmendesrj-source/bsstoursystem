// Low-level helpers to call Meta WhatsApp Cloud Graph API. Server-only.
const GRAPH = "https://graph.facebook.com/v21.0";

export async function metaFetch(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GRAPH}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export async function metaJson<T = unknown>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await metaFetch(path, token, init);
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      `Meta API ${res.status}`;
    throw new Error(`${msg} (${res.status})`);
  }
  return data as T;
}

export interface SendTextArgs {
  phoneNumberId: string;
  token: string;
  to: string;
  body: string;
}

export async function sendText({ phoneNumberId, token, to, body }: SendTextArgs) {
  return metaJson<{ messages: Array<{ id: string }> }>(
    `/${phoneNumberId}/messages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body },
      }),
    },
  );
}

export interface SendMediaArgs {
  phoneNumberId: string;
  token: string;
  to: string;
  mediaType: "image" | "document" | "audio" | "video";
  link: string;
  caption?: string;
  filename?: string;
}

export async function sendMedia({
  phoneNumberId,
  token,
  to,
  mediaType,
  link,
  caption,
  filename,
}: SendMediaArgs) {
  const payload: Record<string, unknown> = { link };
  if (caption && (mediaType === "image" || mediaType === "video" || mediaType === "document")) {
    payload.caption = caption;
  }
  if (filename && mediaType === "document") payload.filename = filename;
  return metaJson<{ messages: Array<{ id: string }> }>(
    `/${phoneNumberId}/messages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: mediaType,
        [mediaType]: payload,
      }),
    },
  );
}

export interface SendTemplateArgs {
  phoneNumberId: string;
  token: string;
  to: string;
  templateName: string;
  language: string;
  variables?: string[];
}

export async function sendTemplate({
  phoneNumberId,
  token,
  to,
  templateName,
  language,
  variables = [],
}: SendTemplateArgs) {
  const components =
    variables.length > 0
      ? [
          {
            type: "body",
            parameters: variables.map((v) => ({ type: "text", text: v })),
          },
        ]
      : undefined;
  return metaJson<{ messages: Array<{ id: string }> }>(
    `/${phoneNumberId}/messages`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          ...(components ? { components } : {}),
        },
      }),
    },
  );
}

export async function fetchMediaUrl(mediaId: string, token: string) {
  return metaJson<{ url: string; mime_type: string }>(`/${mediaId}`, token);
}

export async function downloadMedia(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Download media failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return { buf, mime: res.headers.get("content-type") ?? "application/octet-stream" };
}
