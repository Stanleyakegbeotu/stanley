import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Keeps a single line of text inside its box. Uses the CSS font size, and only
 * when the content is wider than the box (e.g. a very large amount) scales the
 * font down to fit — the full value is always shown, never clipped or wrapped.
 * Re-fits when the box resizes or the text changes (count-up animations).
 */
export function FitText({ children, className, minScale = 0.5 }: { children: ReactNode; className?: string; minScale?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const fit = () => {
      el.style.fontSize = "";
      const available = el.clientWidth;
      const needed = el.scrollWidth;
      if (available > 0 && needed > available) {
        const base = parseFloat(getComputedStyle(el).fontSize);
        el.style.fontSize = `${Math.max(base * minScale, base * (available / needed) * 0.98)}px`;
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    fit();
    const resize = new ResizeObserver(schedule);
    resize.observe(el);
    const mutation = new MutationObserver(schedule);
    mutation.observe(el, { subtree: true, childList: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [minScale]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
