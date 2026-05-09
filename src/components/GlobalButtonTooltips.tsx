import { useEffect } from "react";

/**
 * Garante que todo botão do sistema tenha um tooltip nativo (atributo `title`)
 * descrevendo a ação. Funciona globalmente, sem precisar editar componentes
 * individualmente. Deriva o texto na seguinte ordem:
 *   1. `data-tooltip` explícito
 *   2. `aria-label`
 *   3. `title` já existente
 *   4. texto visível do botão (trim)
 *   5. nome acessível do <svg> filho (aria-label/title)
 *
 * Usa MutationObserver para cobrir conteúdo renderizado dinamicamente.
 */
export function GlobalButtonTooltips() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SELECTOR = 'button, [role="button"], a[role="button"]';

    const deriveTitle = (el: HTMLElement): string | null => {
      const explicit = el.getAttribute("data-tooltip");
      if (explicit) return explicit;
      const aria = el.getAttribute("aria-label");
      if (aria && aria.trim()) return aria.trim();
      const existing = el.getAttribute("title");
      if (existing && existing.trim()) return existing.trim();
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text) return text.length > 80 ? text.slice(0, 77) + "…" : text;
      const svg = el.querySelector("svg");
      if (svg) {
        const svgAria = svg.getAttribute("aria-label") || svg.querySelector("title")?.textContent;
        if (svgAria && svgAria.trim()) return svgAria.trim();
      }
      return null;
    };

    const apply = (root: ParentNode) => {
      const nodes = root.querySelectorAll<HTMLElement>(SELECTOR);
      nodes.forEach((el) => {
        // Não sobrescreve título já definido manualmente
        if (el.dataset.tooltipApplied === "1") return;
        const current = el.getAttribute("title");
        if (current && current.trim()) {
          el.dataset.tooltipApplied = "1";
          return;
        }
        const t = deriveTitle(el);
        if (t) {
          el.setAttribute("title", t);
          el.dataset.tooltipApplied = "1";
        }
      });
    };

    apply(document.body);

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const el = n as HTMLElement;
          if (el.matches?.(SELECTOR)) {
            // re-derive
            el.removeAttribute("data-tooltip-applied");
            apply(el.parentNode || document.body);
          } else {
            apply(el);
          }
        });
        if (m.type === "attributes" && m.target.nodeType === 1) {
          const el = m.target as HTMLElement;
          if (el.matches?.(SELECTOR)) {
            el.removeAttribute("data-tooltip-applied");
            const t = deriveTitle(el);
            if (t) {
              el.setAttribute("title", t);
              el.dataset.tooltipApplied = "1";
            }
          }
        }
      }
    });

    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "data-tooltip"],
    });

    return () => obs.disconnect();
  }, []);

  return null;
}
