import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type HTMLMotionProps } from "framer-motion";
import { Check, ChevronDown, Info, Search, Inbox } from "lucide-react";
import { Reveal, useMotionPreset } from "@/shared/motion";
import { Popover, type Placement } from "./Popover";

/* ─────────────── Button ─────────────── */
type ButtonProps = HTMLMotionProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
};

export function Button({ variant = "primary", size = "md", className = "", children, ...rest }: ButtonProps) {
  const m = useMotionPreset();
  const cls = ["btn", variant !== "primary" ? variant : "", size === "sm" ? "sm" : "", className].join(" ");
  return (
    <motion.button whileTap={m.press} className={cls} {...rest}>
      {children}
    </motion.button>
  );
}

/* ─────────────── Badge ─────────────── */
export type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "brand";

export function Badge({ tone = "neutral", dot = false, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`badge ${tone === "neutral" ? "" : tone}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function DemoChip({ label = "Demo data" }: { label?: string }) {
  return (
    <span className="demo-chip" title="Demonstration data — will be replaced by live records">
      {label}
    </span>
  );
}

/* ─────────────── Info tooltip ─────────────── */
export function InfoTip({ text, label = "More information" }: { text: string; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, left: Math.min(window.innerWidth - 296, Math.max(12, r.right - 280)) });
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="kpi-info"
        aria-label={label}
        aria-description={text}
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        onFocus={show}
        onBlur={() => setPos(null)}
      >
        <Info size={18} />
      </button>
      {createPortal(
        <AnimatePresence>
          {pos && (
            <motion.div
              className="info-tip"
              role="tooltip"
              style={pos}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {text}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/* ─────────────── Segmented control ─────────────── */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            className={active ? "is-active" : ""}
            onClick={() => onChange(o.value)}
          >
            {active && <motion.span layoutId={`seg-${id}`} className="seg-bg" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────── Tabs ─────────────── */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button key={t.value} role="tab" aria-selected={active} className={active ? "is-active" : ""} onClick={() => onChange(t.value)}>
            {t.label}
            {active && <motion.span layoutId={`tab-${id}`} className="tab-line" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────── Select menu ─────────────── */
export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
}

export function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "select-btn",
  children,
  placement = "bottom-start",
  width,
  heading,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
  className?: string;
  /** Custom trigger content; defaults to the selected label + chevron. */
  children?: ReactNode;
  placement?: Placement;
  width?: number;
  heading?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        {children ?? (
          <>
            {selected?.label}
            <ChevronDown size={16} />
          </>
        )}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement={placement} matchWidth width={width} role="listbox" label={ariaLabel}>
        {heading && <div className="menu-label">{heading}</div>}
        {options.map((o) => (
          <button
            key={o.value}
            role="option"
            aria-selected={o.value === value}
            disabled={o.disabled}
            className={`menu-item ${o.value === value ? "is-selected" : ""}`}
            onClick={() => {
              onChange(o.value);
              setOpen(false);
            }}
          >
            {o.icon && <span className="mi-icon">{o.icon}</span>}
            <span className="mi-text">
              {o.label}
              {o.description && <small>{o.description}</small>}
            </span>
            {o.value === value && <Check size={16} className="mi-check" />}
          </button>
        ))}
      </Popover>
    </>
  );
}

/* ─────────────── Search input ─────────────── */
export function SearchInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="search-input">
      <Search size={16} />
      <span className="sr-only">{placeholder}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

/* ─────────────── Headers ─────────────── */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Reveal as="header" className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </Reveal>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  demo,
  first,
  id,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  demo?: boolean;
  first?: boolean;
  id?: string;
}) {
  return (
    <Reveal as="header" className={`section-head ${first ? "first" : ""}`}>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {(actions || demo) && (
        <div className="section-head-actions">
          {demo && <DemoChip />}
          {actions}
        </div>
      )}
    </Reveal>
  );
}

/* ─────────────── Table ─────────────── */
export function Table({ headers, children, label }: { headers: (string | { label: string; align?: "right"; className?: string })[]; children: ReactNode; label?: string }) {
  const m = useMotionPreset();
  return (
    <div className="table-wrap thin-scroll">
      <table className="table" aria-label={label}>
        <thead>
          <tr>
            {headers.map((h, i) => {
              const label = typeof h === "string" ? h : h.label;
              const align = typeof h === "string" ? undefined : h.align;
              const extra = typeof h === "string" ? "" : (h.className ?? "");
              return (
                <th key={i} className={[align === "right" ? "right" : "", extra].join(" ").trim() || undefined}>
                  {label}
                </th>
              );
            })}
          </tr>
        </thead>
        <motion.tbody variants={m.rowStagger} initial="hidden" animate="visible">
          {children}
        </motion.tbody>
      </table>
    </div>
  );
}

export function Row({ children, ...rest }: HTMLMotionProps<"tr">) {
  const m = useMotionPreset();
  return (
    <motion.tr variants={m.rowItem} {...rest}>
      {children}
    </motion.tr>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={28} />
      <strong>{title}</strong>
      {children && <span>{children}</span>}
    </div>
  );
}
