/**
 * Sidebar pop-up — the same two-section pattern as the report builder and the
 * price calculator: a theme sidebar (title, a switcher between lists, KPI
 * cards) and a white main area (toolbar + table). Used by the dashboard's
 * payment pop-ups.
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Info, X, type LucideIcon } from "lucide-react";
import { useMotionPreset } from "@/shared/motion";

export interface SideNavItem<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
  count: string;
  amount: string;
}

export interface SideKpi {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  caption: string;
  tone?: "danger";
}

export function SideModal<T extends string>({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  navLabel,
  nav,
  value,
  onChange,
  kpis,
  sideNote,
  mainEyebrow,
  mainTitle,
  description,
  onClose,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  subtitle: string;
  navLabel: string;
  nav: SideNavItem<T>[];
  value: T;
  onChange: (v: T) => void;
  kpis: SideKpi[];
  sideNote?: string;
  mainEyebrow: string;
  mainTitle: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const m = useMotionPreset();
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const layers = document.querySelectorAll(".modal-layer");
      if (e.key === "Escape" && layers[layers.length - 1] === box.current?.parentElement) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <AnimatePresence>
      <motion.div key="side-modal" className="modal-layer fd-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <motion.div ref={box} className="spm" role="dialog" aria-modal="true" aria-labelledby={titleId} initial={m.modal.initial} animate={m.modal.animate} exit={m.modal.exit}>
          {/* ── Sidebar ── */}
          <aside className="spm-side thin-scroll">
            <div className="spm-head">
              <span className="spm-head-icon" aria-hidden="true">
                <Icon size={22} />
              </span>
              <div>
                <span>{eyebrow}</span>
                <strong>{title}</strong>
                <small>{subtitle}</small>
              </div>
            </div>

            <p className="spm-label">{navLabel}</p>
            <div className="spm-nav" role="tablist" aria-label={navLabel}>
              {nav.map((n) => (
                <button key={n.value} type="button" role="tab" aria-selected={n.value === value} className={n.value === value ? "is-on" : ""} onClick={() => onChange(n.value)}>
                  <span className="spm-nav-icon" aria-hidden="true">
                    <n.icon size={17} />
                  </span>
                  <span className="spm-nav-text">
                    <b>{n.label}</b>
                    <small>{n.amount}</small>
                  </span>
                  <span className="spm-nav-count num">{n.count}</span>
                </button>
              ))}
            </div>

            <p className="spm-label">Summary</p>
            <div className="spm-kpis">
              {kpis.map((k) => (
                <div key={k.label} className={`spm-kpi ${k.tone === "danger" ? "is-danger" : ""}`}>
                  <k.icon className="cat-mark" size={64} strokeWidth={1.3} aria-hidden="true" />
                  <span className="spm-kpi-head">
                    <i aria-hidden="true">
                      <k.icon size={14} />
                    </i>
                    {k.label}
                  </span>
                  <strong className="num">{k.value}</strong>
                  <small>{k.caption}</small>
                </div>
              ))}
            </div>

            {sideNote && (
              <p className="spm-note">
                <Info size={14} /> {sideNote}
              </p>
            )}
          </aside>

          {/* ── Main ── */}
          <section className="spm-main">
            <header className="spm-main-head">
              <div>
                <span>{mainEyebrow}</span>
                <h2 id={titleId}>{mainTitle}</h2>
                <p>{description}</p>
              </div>
              <button type="button" className="fd-close" onClick={onClose} aria-label="Close" data-close>
                <X size={20} />
              </button>
            </header>
            <div className="spm-body thin-scroll">{children}</div>
          </section>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
