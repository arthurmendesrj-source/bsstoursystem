// Server-only helper for Anthropic Claude via the AI gateway (native /v1/messages, streamed).
export const CLAUDE_MODEL = "anthropic/claude-sonnet-5";
const URL_MESSAGES = "https://ai.gateway.lovable.dev/v1/messages";

export type ClaudeBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: any }
  | { type: "tool_result"; tool_use_id: string; content: string };
export type ClaudeMsg = { role: "user" | "assistant"; content: string | ClaudeBlock[] };
export type ClaudeTool = { name: string; description: string; input_schema: any };

export class ClaudeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function friendlyClaudeError(status: number, body: string): string {
  if (status === 429) return "Limite de uso da IA atingido. Tente novamente em instantes.";
  if (status === 402) return "Créditos de IA esgotados. Adicione créditos em Settings → Plans & credits.";
  if (status === 403) return `Acesso à IA negado: ${body.slice(0, 200)}`;
  return `Falha na IA: ${status} ${body.slice(0, 200)}`;
}

const safeId = (id: string | undefined, i: number) =>
  (id ?? "").replace(/[^a-zA-Z0-9_-]/g, "_") || `toolu_${i}`;

/** Convert OpenAI-style chat history (incl. tool calls) into Claude messages. */
export function openAiToClaude(msgs: Array<{ role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string }>): {
  system: string;
  messages: ClaudeMsg[];
} {
  let system = "";
  const out: ClaudeMsg[] = [];
  const push = (role: "user" | "assistant", blocks: ClaudeBlock[]) => {
    if (!blocks.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role && Array.isArray(last.content)) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };
  msgs.forEach((m, i) => {
    if (m.role === "system") system += (system ? "\n\n" : "") + (m.content ?? "");
    else if (m.role === "user") push("user", m.content ? [{ type: "text", text: m.content }] : []);
    else if (m.role === "assistant") {
      const blocks: ClaudeBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      (m.tool_calls ?? []).forEach((tc, j) => {
        let input: any = {};
        try { input = JSON.parse(tc.function?.arguments || "{}"); } catch {}
        blocks.push({ type: "tool_use", id: safeId(tc.id, i * 100 + j), name: tc.function?.name, input });
      });
      push("assistant", blocks);
    } else if (m.role === "tool") {
      push("user", [{ type: "tool_result", tool_use_id: safeId(m.tool_call_id, i), content: m.content ?? "" }]);
    }
  });
  // Drop orphan tool_use blocks at the end-of-history mismatch is handled by the caller.
  if (out[0]?.role === "assistant") out.unshift({ role: "user", content: "(início)" });
  return { system, messages: out };
}

/**
 * Stream a Claude call. Calls onText for each text delta.
 * Returns full text, tool_use blocks and stop_reason.
 */
export async function streamClaude(opts: {
  system?: string;
  messages: ClaudeMsg[];
  tools?: ClaudeTool[];
  maxTokens?: number;
  onText?: (t: string) => void;
}): Promise<{ text: string; toolUses: Array<{ id: string; name: string; input: any }>; stopReason: string | null }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new ClaudeError(500, "LOVABLE_API_KEY não configurada");
  const resp = await fetch(URL_MESSAGES, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages: opts.messages,
      ...(opts.tools?.length ? { tools: opts.tools } : {}),
      stream: true,
    }),
  });
  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => "");
    throw new ClaudeError(resp.status, friendlyClaudeError(resp.status, t));
  }
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let stopReason: string | null = null;
  const blocks: Record<number, { type: string; id?: string; name?: string; json: string }> = {};

  const handle = (data: string) => {
    let ev: any;
    try { ev = JSON.parse(data); } catch { return; }
    switch (ev.type) {
      case "content_block_start":
        blocks[ev.index] = { type: ev.content_block?.type, id: ev.content_block?.id, name: ev.content_block?.name, json: "" };
        break;
      case "content_block_delta":
        if (ev.delta?.type === "text_delta") {
          text += ev.delta.text;
          opts.onText?.(ev.delta.text);
        } else if (ev.delta?.type === "input_json_delta" && blocks[ev.index]) {
          blocks[ev.index].json += ev.delta.partial_json ?? "";
        }
        break;
      case "message_delta":
        if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
        break;
      case "error":
        throw new ClaudeError(500, `Falha na IA: ${ev.error?.message ?? "erro no stream"}`);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (data) handle(data);
    }
  }
  if (stopReason === "refusal") throw new ClaudeError(200, "A IA se recusou a responder a esta solicitação.");

  const toolUses = Object.values(blocks)
    .filter((b) => b.type === "tool_use")
    .map((b) => {
      let input: any = {};
      try { input = JSON.parse(b.json || "{}"); } catch {}
      return { id: b.id!, name: b.name!, input };
    });
  return { text, toolUses, stopReason };
}
