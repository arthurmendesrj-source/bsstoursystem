import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Reads ?highlight=module.field from the URL and visually highlights every
 * DOM node tagged with [data-perm-field="module.field"]. Scrolls the first
 * match into view and pulses a ring so the user can confirm masking/gating.
 */
export function PermissionFieldHighlighter() {
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const path = useRouterState({ select: (s) => s.location.pathname });
  const target = typeof search?.highlight === "string" ? (search.highlight as string) : null;

  useEffect(() => {
    if (!target || typeof window === "undefined") return;
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-perm-field="${CSS.escape(target)}"]`),
      );
      if (nodes.length === 0) {
        // Retry briefly while the screen mounts/loads data
        return false;
      }
      nodes.forEach((el) => {
        el.classList.add(
          "ring-2",
          "ring-amber-500",
          "ring-offset-2",
          "ring-offset-background",
          "rounded-sm",
          "transition-all",
          "animate-pulse",
        );
        setTimeout(() => el.classList.remove("animate-pulse"), 2400);
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-amber-500", "ring-offset-2", "ring-offset-background");
        }, 8000);
      });
      nodes[0].scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    };

    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const ok = run();
      if (!ok && tries < 20) {
        tries += 1;
        setTimeout(tick, 250);
      }
    };
    tick();

    return () => { cancelled = true; };
  }, [target, path]);

  return null;
}
