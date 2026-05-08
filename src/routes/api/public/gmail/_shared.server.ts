// Shared helpers for Gmail Add-on public API.
// Auth: Bearer token validated against CRM_GMAIL_ADDON_TOKEN env secret.
export function checkAddonAuth(request: Request): boolean {
  const expected = process.env.CRM_GMAIL_ADDON_TOKEN;
  if (!expected) return false;
  const got = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return !!got && got === expected;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function unauthorized(): Response {
  return new Response("unauthorized", { status: 401 });
}
