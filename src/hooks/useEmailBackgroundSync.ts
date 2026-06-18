import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { syncFolderFn } from "@/lib/email.functions";

/**
 * Global background sync for the authenticated user's Gmail inbox.
 * Runs every 30 seconds while the browser tab is visible, regardless of route.
 * Silently swallows errors (no toasts) — this is meant to keep the DB cache fresh.
 */
export function useEmailBackgroundSync() {
  const { user } = useAuth();
  const sync = useServerFn(syncFolderFn);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        await sync({ data: { targetUserId: userId, folder: "inbox" } });
      } catch {
        // silent
      } finally {
        runningRef.current = false;
      }
    };

    // Initial tick shortly after mount.
    const initial = window.setTimeout(() => { void tick(); }, 2_000);
    const id = window.setInterval(tick, 30_000);
    const onVis = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id, sync]);
}
