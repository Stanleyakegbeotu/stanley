/**
 * Small building blocks shared by the Settings Center sections.
 */
import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, Info, Lock, ShieldAlert } from "lucide-react";
import { Button } from "@/shared/ui/controls";
import { FieldError, focusFirstError } from "@/shared/ui/FieldError";
import { Modal } from "@/shared/ui/Modal";

/** On/off switch. */
export function Toggle({ checked, onChange, label, disabled, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; hint?: ReactNode }) {
  return (
    <label className={`sc-toggle ${disabled ? "is-disabled" : ""}`}>
      <span className="sc-toggle-text">
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`sc-switch ${checked ? "is-on" : ""}`} onClick={() => onChange(!checked)}>
        <i />
      </button>
    </label>
  );
}

export type Health = "ok" | "attention" | "incomplete" | "disabled" | "info";
const HEALTH_ICON = { ok: CheckCircle2, attention: AlertTriangle, incomplete: CircleDashed, disabled: CircleSlash, info: Info };

/** Configured / Needs attention / Incomplete / Disabled / Info. */
export function StatusChip({ status, children }: { status: Health; children: ReactNode }) {
  const Icon = HEALTH_ICON[status];
  return (
    <span className={`sc-chip is-${status}`}>
      <Icon size={13} /> {children}
    </span>
  );
}

const SCOPE_LABEL = { global: "Company-wide", branch: "Branch-specific", inherited: "Inherited from company", overridden: "Branch override", admin: "Company Admin only" };
/** Where a setting applies. */
export function ScopeTag({ scope }: { scope: keyof typeof SCOPE_LABEL }) {
  return (
    <span className={`sc-scope is-${scope}`}>
      {scope === "admin" && <Lock size={11} />}
      {SCOPE_LABEL[scope]}
    </span>
  );
}

/** Not built / not connected yet — said plainly, never faked. */
export function NotConnected({ children }: { children: ReactNode }) {
  return (
    <p className="sc-notconnected">
      <Info size={14} /> {children}
    </p>
  );
}

/** Section card with a title, a short note and optional actions. */
export function Panel({ title, note, actions, children, scope }: { title: string; note?: ReactNode; actions?: ReactNode; children: ReactNode; scope?: keyof typeof SCOPE_LABEL }) {
  return (
    <section className="sc-panel">
      <header>
        <div>
          <h4>
            {title} {scope && <ScopeTag scope={scope} />}
          </h4>
          {note && <p>{note}</p>}
        </div>
        {actions && <div className="sc-panel-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * Confirmation for sensitive actions: explains the consequence, optionally
 * requires a reason (recorded in the audit log).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  consequences,
  confirmLabel,
  danger = false,
  reason = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  consequences?: string[];
  confirmLabel: string;
  danger?: boolean;
  /** Require a reason (kept in history and the audit log). */
  reason?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const close = () => {
    setText("");
    setError("");
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      icon={ShieldAlert}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              if (reason && !text.trim()) {
                setError("Give a reason — it is kept in the history and the audit log.");
                return focusFirstError();
              }
              onConfirm(text.trim());
              setText("");
              setError("");
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {consequences && consequences.length > 0 && (
        <ul className="sc-consequences">
          {consequences.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {reason && (
        <label className={`rcm-field ${error ? "is-error" : ""}`} data-field-error={error ? true : undefined}>
          <span>Reason</span>
          <textarea rows={3} value={text} maxLength={240} onChange={(e) => (setText(e.target.value), error && setError(""))} placeholder="Why is this being done?" />
          <FieldError msg={error} />
        </label>
      )}
    </Modal>
  );
}

/** Save a text file to the person's computer. */
export function downloadFile(name: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const shortDate = (iso?: string | Date | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const dateTime = (iso?: string | Date | null) => (iso ? `${shortDate(iso)} · ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "—");
