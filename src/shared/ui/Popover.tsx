import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useMotionPreset } from "@/shared/motion";

export type Placement = "bottom-start" | "bottom-end" | "right-start" | "right-end" | "top-end";

interface PopoverProps {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  placement?: Placement;
  offset?: number;
  /** Make the panel at least as wide as its trigger. */
  matchWidth?: boolean;
  width?: number;
  className?: string;
  role?: string;
  label?: string;
  /** Keep focus on the trigger (e.g. a search input that opens results). */
  noAutoFocus?: boolean;
  children: ReactNode;
}

/**
 * Anchored floating panel rendered in a portal (so it inherits theme tokens
 * from <html> and is never clipped by scroll containers).
 */
export function Popover({
  anchor,
  open,
  onClose,
  placement = "bottom-start",
  offset = 8,
  matchWidth = false,
  width,
  className = "",
  role = "dialog",
  label,
  noAutoFocus = false,
  children,
}: PopoverProps) {
  const m = useMotionPreset();
  const panel = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const s: CSSProperties = {};
      if (placement.startsWith("bottom")) {
        s.top = r.bottom + offset;
        if (placement === "bottom-start") s.left = Math.max(12, r.left);
        else s.right = Math.max(12, window.innerWidth - r.right);
      } else if (placement === "top-end") {
        s.bottom = window.innerHeight - r.top + offset;
        s.right = Math.max(12, window.innerWidth - r.right);
      } else {
        s.left = r.right + offset;
        if (placement === "right-start") s.top = Math.max(12, r.top);
        else s.bottom = Math.max(12, window.innerHeight - r.bottom);
      }
      if (matchWidth) s.minWidth = r.width;
      if (width) s.width = width;
      setStyle(s);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchor, placement, offset, matchWidth, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    // Capture phase + stopPropagation: Escape closes only this dropdown, not the dialog behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        anchor.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose, anchor]);

  // Move focus into the panel for keyboard users.
  useEffect(() => {
    if (!open || noAutoFocus) return;
    const id = window.requestAnimationFrame(() => {
      const first = panel.current?.querySelector<HTMLElement>("[data-autofocus], button:not(:disabled), input, a[href]");
      first?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, noAutoFocus]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panel}
          className={`popover thin-scroll ${className}`}
          style={style}
          role={role}
          aria-label={label}
          initial={m.popover.initial}
          animate={m.popover.animate}
          exit={m.popover.exit}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
