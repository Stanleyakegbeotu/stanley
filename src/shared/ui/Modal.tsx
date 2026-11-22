import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, type LucideIcon } from "lucide-react";
import { useMotionPreset } from "@/shared/motion";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  wide?: boolean;
  /** Extra-large dialog for detailed analysis views. */
  xl?: boolean;
  /**
   * Data-view styling: a theme-tinted header band with this icon, KPI-style
   * summary tiles and a styled table (used by the dashboard "view all" pop-ups).
   */
  icon?: LucideIcon;
  footer?: ReactNode;
  children: ReactNode;
}

/** Themed dialog. Escape and backdrop click close it; focus moves inside on open. */
export function Modal({ open, onClose, title, description, wide, xl, icon: Icon, footer, children }: ModalProps) {
  const m = useMotionPreset();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Latest onClose without re-running the open effect on every render (that re-focused the first
  // control and scrolled the dialog back to the top — undoing scroll-to-error).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      // Only the top-most dialog layer reacts, so Escape never closes a stack at once.
      const layers = document.querySelectorAll(".modal-layer");
      if (e.key === "Escape" && layers[layers.length - 1] === box.current?.parentElement) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    const id = window.requestAnimationFrame(() => {
      // Focus the first control only when nothing inside is focused yet (e.g. an error field already is).
      if (!box.current?.contains(document.activeElement)) box.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])")?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(id);
      opener.current?.focus?.();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={box}
            className={`modal ${xl ? "xl" : wide ? "wide" : ""} ${Icon ? "data" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={m.modal.initial}
            animate={m.modal.animate}
            exit={m.modal.exit}
          >
            <div className="modal-head">
              {Icon && (
                <span className="modal-icon" aria-hidden="true">
                  <Icon size={21} strokeWidth={2} />
                </span>
              )}
              <div className="modal-titles">
                <h2 id={titleId}>{title}</h2>
                {description && <p>{description}</p>}
              </div>
              <button className="icon-btn" onClick={onClose} aria-label="Close dialog" data-close>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body thin-scroll">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
