import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, RefreshCw, Trash2, AlertCircle, CheckCircle2, History, RotateCw } from "lucide-react";
import { disconnectGmailAccount, listGmailAudit } from "@/lib/gmail-audit.functions";
import { gmailIncrementalSync } from "@/server/gmail-mirror.functions";

type TokenRow = {
  email_address: string;
  expires_at: string;
  connected_at: string | null;
  last_refresh_at: string | null;
  last_refresh_error: string | null;
  refresh_error_count: number;
  scope: string | null;
};

type SyncRow = {
  owner_email: string;
  last_incremental_sync_at: string | null;
};

type AuditRow = {
  id: string;
  email_address: string;
  event: "connected" | "reconnected" | "disconnected" | "refresh_failed" | "refresh_recovered";
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor_id: string | null;
};

function fmt(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

function statusOf(t: TokenRow): { label: string; tone: "ok" | "warn" | "err" } {
  if (t.refresh_error_count >= 1 && t.last_refresh_error) return { label: "Falha no refresh", tone: "err" };
  const exp = new Date(t.expires_at).getTime();
  if (exp < Date.now()) return { label: "Token expirado (renovará no próximo uso)", tone: "warn" };
  return { label: "Ativo", tone: "ok" };
}

const EVENT_LABEL: Record<AuditRow["event"], { text: string; tone: "ok" | "warn" | "err" | "muted" }> = {
  connected: { text: "Conectada", tone: "ok" },
  reconnected: { text: "Reconectada", tone: "ok" },
  disconnected: { text: "Desconectada", tone: "muted" },
  refresh_failed: { text: "Falha no refresh", tone: "err" },
  refresh_recovered: { text: "Refresh recuperado", tone: "warn" },
};

export function GmailConnectCard() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [syncs, setSyncs] = useState<Record<string, SyncRow>>({});
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<Record<string, { ok: boolean; message: string; at: string }>>({});

  const disconnectFn = useServerFn(disconnectGmailAccount);
  const auditFn = useServerFn(listGmailAudit);
  const syncFn = useServerFn(gmailIncrementalSync);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setTokens([]); setAudit([]); setLoading(false); return; }
    const { data: tk } = await supabase
      .from("user_gmail_tokens")
      .select("email_address,expires_at,connected_at,last_refresh_at,last_refresh_error,refresh_error_count,scope")
      .eq("user_id", uid)
      .order("connected_at", { ascending: true });
    const list = (tk ?? []) as TokenRow[];
    setTokens(list);
    if (list.length) {
      const { data: ss } = await supabase
        .from("email_sync_state")
        .select("owner_email,last_incremental_sync_at")
        .in("owner_email", list.map((t) => t.email_address));
      const map: Record<string, SyncRow> = {};
      ((ss ?? []) as SyncRow[]).forEach((r) => { map[r.owner_email] = r; });
      setSyncs(map);
    } else {
      setSyncs({});
    }
    try {
      const res = await auditFn();
      setAudit((res as { entries: AuditRow[] }).entries);
    } catch (e) {
      console.error("listGmailAudit", e);
    }
    setLoading(false);
  }, [auditFn]);

  useEffect(() => { void load(); }, [load]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { toast.error("Sessão expirada — faça login novamente."); return; }
      const url = `/api/public/google/oauth/start?token=${encodeURIComponent(token)}`;
      const popup = window.open(url, "gmail-oauth", "width=520,height=640,menubar=no,toolbar=no");
      if (!popup) { toast.error("Bloqueador de pop-up impediu a janela. Permita pop-ups."); return; }
      const onMessage = (ev: MessageEvent) => {
        const msg = ev.data as { type?: string; ok?: boolean; message?: string } | undefined;
        if (!msg || msg.type !== "gmail-oauth") return;
        window.removeEventListener("message", onMessage);
        if (msg.ok) { toast.success(msg.message || "Conta conectada"); void load(); }
        else toast.error(msg.message || "Falha ao conectar");
        setConnecting(false);
      };
      window.addEventListener("message", onMessage);
      const interval = setInterval(() => {
        if (popup.closed) {
          clearInterval(interval);
          window.removeEventListener("message", onMessage);
          setConnecting(false);
          void load();
        }
      }, 800);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar OAuth");
      setConnecting(false);
    }
  }, [load]);

  const disconnect = useCallback(async (email: string) => {
    if (!confirm(`Desconectar ${email}? Os tokens serão removidos.`)) return;
    try {
      await disconnectFn({ data: { emailAddress: email } });
      toast.success(`Conta ${email} desconectada`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao desconectar");
    }
  }, [disconnectFn, load]);

  const syncNow = useCallback(async (email: string) => {
    setSyncing(email);
    try {
      const r = await syncFn() as { inserted?: number; updated?: number; owner?: string };
      const inserted = r.inserted ?? 0;
      const updated = r.updated ?? 0;
      const msg = `${inserted} novas, ${updated} atualizadas`;
      setLastSyncResult((prev) => ({ ...prev, [email]: { ok: true, message: msg, at: new Date().toISOString() } }));
      toast.success(`Sincronização concluída: ${msg}`);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao sincronizar";
      setLastSyncResult((prev) => ({ ...prev, [email]: { ok: false, message, at: new Date().toISOString() } }));
      toast.error(message);
    } finally {
      setSyncing(null);
    }
  }, [syncFn, load]);


  const alreadyConnected = tokens.length >= 1;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Mail className="h-5 w-5" /> Gmail</h2>
          <p className="text-sm text-muted-foreground">
            Cada usuário pode conectar <strong>uma</strong> conta Gmail. Para trocar de conta, desconecte a atual primeiro.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {!alreadyConnected && (
            <Button onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Conectar Gmail
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : tokens.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Nenhuma conta Gmail conectada para este usuário.
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map((t) => {
            const st = statusOf(t);
            const sync = syncs[t.email_address];
            return (
              <div key={t.email_address} className="rounded-md border p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {st.tone === "ok" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    ) : (
                      <AlertCircle className={`h-4 w-4 shrink-0 ${st.tone === "err" ? "text-destructive" : "text-amber-600"}`} />
                    )}
                    <span className="font-medium truncate">{t.email_address}</span>
                    <Badge variant={st.tone === "ok" ? "secondary" : st.tone === "err" ? "destructive" : "outline"}>
                      {st.label}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void disconnect(t.email_address)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <dt>Conectada em</dt><dd className="text-foreground">{fmt(t.connected_at)}</dd>
                  <dt>Expira em</dt><dd className="text-foreground">{fmt(t.expires_at)}</dd>
                  <dt>Último refresh OK</dt><dd className="text-foreground">{fmt(t.last_refresh_at)}</dd>
                  <dt>Última sincronização</dt><dd className="text-foreground">{fmt(sync?.last_incremental_sync_at ?? null)}</dd>
                  <dt>Falhas de refresh</dt>
                  <dd className={t.refresh_error_count > 0 ? "text-destructive font-medium" : "text-foreground"}>
                    {t.refresh_error_count}
                  </dd>
                </dl>
                {t.last_refresh_error && (
                  <div className="rounded bg-destructive/10 text-destructive text-xs p-2 break-words">
                    <strong>Último erro:</strong> {t.last_refresh_error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAudit((v) => !v)}
          className="gap-2"
        >
          <History className="h-4 w-4" />
          {showAudit ? "Ocultar" : "Mostrar"} histórico de conexões ({audit.length})
        </Button>
        {showAudit && (
          <div className="mt-3">
            {audit.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</div>
            ) : (
              <ul className="space-y-2 max-h-96 overflow-auto pr-2">
                {audit.map((a) => {
                  const cfg = EVENT_LABEL[a.event];
                  const tone =
                    cfg.tone === "ok" ? "secondary" :
                    cfg.tone === "err" ? "destructive" :
                    cfg.tone === "warn" ? "outline" : "outline";
                  return (
                    <li key={a.id} className="rounded border p-2 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant={tone as "secondary" | "destructive" | "outline"}>{cfg.text}</Badge>
                          <span className="truncate font-mono text-muted-foreground">{a.email_address}</span>
                        </div>
                        <span className="text-muted-foreground whitespace-nowrap">{fmt(a.created_at)}</span>
                      </div>
                      {a.reason && (
                        <div className="text-destructive break-words">{a.reason}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
