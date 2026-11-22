/**
 * App-wide field errors (owner rule, 2026-11-22): when a required field is
 * missing or invalid and the user tries to continue, the message appears ON
 * that field — red outline + message attached to it — and the page scrolls to
 * and focuses the first problem field. No error lists at the bottom of forms.
 *
 * Usage: give the field wrapper `fieldErrorProps(msg)` and render
 * <FieldError msg={msg} /> right after the input; call focusFirstError() when
 * a submit/continue is blocked.
 */
import { CircleAlert } from "lucide-react";

/** Message shown under the field, attached to it. */
export function FieldError({ msg }: { msg?: string | false | null }) {
  if (!msg) return null;
  return (
    <span className="field-error" role="alert">
      <CircleAlert size={14} aria-hidden="true" />
      {msg}
    </span>
  );
}

/** Props for the field wrapper: marks it invalid and findable by focusFirstError(). */
export function fieldErrorProps(msg?: string | false | null): { className: string; "data-field-error"?: true; "aria-invalid"?: true } {
  return msg ? { className: "is-error", "data-field-error": true, "aria-invalid": true } : { className: "" };
}

/** Scroll to the first invalid field (in the top-most dialog if one is open) and focus its input. */
export function focusFirstError() {
  // The field may not be on screen yet (e.g. a pop-up still opening) — retry briefly.
  let tries = 0;
  const attempt = () => {
    const layers = document.querySelectorAll<HTMLElement>(".modal-layer");
    const root: ParentNode = layers.length ? layers[layers.length - 1] : document;
    const el = root.querySelector<HTMLElement>("[data-field-error]");
    if (!el) {
      if (tries++ < 10) window.setTimeout(attempt, 60);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = el.querySelector<HTMLElement>("input:not([readonly]), textarea, select, button");
    window.setTimeout(() => {
      input?.focus({ preventScroll: true });
      // Settle the position once any opening animation has finished.
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 320);
  };
  window.requestAnimationFrame(attempt);
}
