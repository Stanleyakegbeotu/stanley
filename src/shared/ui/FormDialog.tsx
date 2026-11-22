import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useMotionPreset } from "@/shared/motion";
import { BrandLogo, useCompanyName } from "@/shell/BrandLogo";
import { FieldError } from "./FieldError";

export interface FormStep {
  /** Id of the <FormSection> this step scrolls to. */
  id: string;
  label: string;
  /** All required fields in this section are filled. */
  done: boolean;
  /** Section has no required fields; it never blocks saving. */
  optional?: boolean;
}

/**
 * Split-layout "add" dialog used by every create flow (branch, PR agent,
 * staff, expense, patient, inventory service):
 *  • left: theme-coloured panel with the company mark, a step list that tracks
 *    which sections are complete, and an optional live preview card;
 *  • right: eyebrow, title, description, scrolling sectioned form and a fixed
 *    footer for the actions.
 */
export function FormDialog({
  open,
  onClose,
  eyebrow,
  title,
  description,
  contextLabel,
  steps,
  aside,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Short kind label, e.g. "New branch". */
  eyebrow: string;
  title: string;
  description?: ReactNode;
  /** Line under the company name in the side panel, e.g. "Adding a branch". */
  contextLabel: string;
  steps: FormStep[];
  /** Preview card at the bottom of the side panel. */
  aside?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const m = useMotionPreset();
  const companyName = useCompanyName();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done && !s.optional);
  const allDone = current === -1;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      // Only the top-most dialog layer reacts, so Escape never closes a stack at once.
      const layers = document.querySelectorAll(".modal-layer");
      if (e.key === "Escape" && layers[layers.length - 1] === box.current?.parentElement) onClose();
    };
    document.addEventListener("keydown", onKey);
    const id = window.requestAnimationFrame(() => {
      box.current?.querySelector<HTMLElement>(".fd-body input, .fd-body textarea, .fd-body button")?.focus();
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(id);
      opener.current?.focus?.();
    };
  }, [open, onClose]);

  const goTo = (id: string) => {
    const el = body.current?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (el && body.current) body.current.scrollTo({ top: el.offsetTop - 12, behavior: m.reduced ? "auto" : "smooth" });
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="modal-layer fd-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div ref={box} className="fd" role="dialog" aria-modal="true" aria-labelledby={titleId} initial={m.modal.initial} animate={m.modal.animate} exit={m.modal.exit}>
            {/* Side panel */}
            <aside className="fd-side">
              <div className="fd-brand">
                <span className="fd-logo" aria-hidden="true">
                  <BrandLogo />
                </span>
                <div>
                  <strong>{companyName}</strong>
                  <small>{contextLabel}</small>
                </div>
              </div>

              <ol className="fd-steps" aria-label="Form sections">
                {steps.map((s, i) => {
                  const state = s.done ? "is-done" : i === current ? "is-current" : s.optional ? "is-optional" : "";
                  const status = s.done ? "Complete" : i === current ? "In progress" : s.optional ? "Optional" : "Not started";
                  return (
                    <li key={s.id} className={state}>
                      <button type="button" onClick={() => goTo(s.id)}>
                        <span className="fd-step-dot" aria-hidden="true">
                          {s.done ? <Check size={15} strokeWidth={3} /> : i + 1}
                        </span>
                        <span className="fd-step-label">
                          {s.label}
                          <small>{status}</small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {aside && <div className="fd-aside">{aside}</div>}
            </aside>

            {/* Form */}
            <section className="fd-main">
              <header className="fd-head">
                <div>
                  <span className="fd-eyebrow">
                    {eyebrow} · {allDone ? "Ready to save" : `${done} of ${required.length} required sections complete`}
                  </span>
                  <h2 id={titleId}>{title}</h2>
                  {description && <p>{description}</p>}
                </div>
                <button type="button" className="fd-close" onClick={onClose} aria-label="Close dialog" data-close>
                  <X size={20} />
                </button>
              </header>
              <div className="fd-body thin-scroll" ref={body}>
                {children}
              </div>
              <footer className="fd-foot">{footer}</footer>
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** A titled group of fields; `id` links it to a step in the side panel. */
export function FormSection({ id, title, children, note }: { id: string; title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="fd-section" data-section={id}>
      <h3 className="fd-section-title">
        <span>{title}</span>
      </h3>
      <div className="fd-grid">{children}</div>
      {note && <p className="fd-note">{note}</p>}
    </section>
  );
}

/** Label + control. `full` spans both columns. */
/** A form field. `error` shows the message ON the field (red outline + message) — see FieldError. */
export function FormField({ label, hint, required, full, children, as = "label", error }: { label: string; hint?: ReactNode; required?: boolean; full?: boolean; children: ReactNode; as?: "label" | "div"; error?: string | false | null }) {
  const Tag = as;
  return (
    <Tag className={`fd-field ${full ? "full" : ""} ${error ? "is-error" : ""}`} data-field-error={error ? true : undefined} aria-invalid={error ? true : undefined}>
      <span className="fd-label">
        {label}
        {required ? <em aria-hidden="true">*</em> : <i>Optional</i>}
      </span>
      {children}
      {error ? <FieldError msg={error} /> : hint && <small className="fd-hint">{hint}</small>}
    </Tag>
  );
}

/** Two-row preview used in the side panel (e.g. generated IDs). */
export function PreviewCard({ title, rows, note }: { title: string; rows: { label: string; value: string }[]; note?: ReactNode }) {
  return (
    <div className="fd-preview">
      <span className="fd-preview-title">{title}</span>
      {rows.map((r) => (
        <div key={r.label} className="fd-preview-row">
          <span>{r.label}</span>
          {/* Monospace only for ID-like values (IKJ-P0000001, #1000001). */}
          <code className={/^[#A-Z0-9][A-Z0-9#-]*$/.test(r.value) ? "is-code" : undefined}>{r.value}</code>
        </div>
      ))}
      {note && <p>{note}</p>}
    </div>
  );
}
