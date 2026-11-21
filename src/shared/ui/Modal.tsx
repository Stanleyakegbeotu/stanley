import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useMotionPreset } from "@/shared/motion";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  wide?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

/** Themed dialog. Escape and backdrop click close it; focus moves inside on open. */
export function Modal({ open, onClose, title, description, wide, footer, children }: ModalProps) {
  const m = useMotionPreset();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const id = window.requestAnimationFrame(() => {
      box.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])")?.focus();
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(id);
      opener.current?.focus?.();
    };
  }, [open, onClose]);

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
            className={`modal ${wide ? "wide" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={m.modal.initial}
            animate={m.modal.animate}
            exit={m.modal.exit}
          >
            <div className="modal-head">
              <div>
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
