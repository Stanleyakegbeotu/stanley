import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useApp } from "@/app/AppState";
import { isoDate } from "@/data/demo/generator";
import type { PeriodSelection } from "@/data/types";
import { Reveal } from "@/shared/motion";
import { formatFullDate } from "@/shared/format";
import { Button } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { DATA_START, TODAY, resolveRange } from "@/services/analytics";

const PERIODS: { key: PeriodSelection["key"]; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
];

/**
 * Theme-coloured page banner: eyebrow + title on the left; reporting-period
 * pills (incl. a custom range) and page actions on the right.
 */
export function PageHero({ eyebrow, title, actions, period = true }: { eyebrow: string; title: string; actions?: ReactNode; period?: boolean }) {
  return (
    <Reveal as="section" className="ph-hero" aria-label={title}>
      <div className="ph-copy">
        <span className="ph-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      <div className="ph-actions">
        {period && <PeriodPills />}
        {actions}
      </div>
    </Reveal>
  );
}

function PeriodPills() {
  const { period, setPeriod } = useApp();
  const [customOpen, setCustomOpen] = useState(false);
  const range = resolveRange(period);
  const [from, setFrom] = useState(isoDate(range.from));
  const [to, setTo] = useState(isoDate(range.to));

  return (
    <>
      <div className="ph-periods" role="tablist" aria-label="Reporting period">
        {PERIODS.map((p) => (
          <button key={p.key} type="button" role="tab" aria-selected={period.key === p.key} className={period.key === p.key ? "is-active" : ""} onClick={() => setPeriod({ key: p.key })}>
            {p.label}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={period.key === "custom"}
          className={period.key === "custom" ? "is-active" : ""}
          onClick={() => {
            setFrom(isoDate(range.from));
            setTo(isoDate(range.to));
            setCustomOpen(true);
          }}
        >
          <SlidersHorizontal size={15} /> Custom
        </button>
      </div>
      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Custom date range"
        description="Figures are recalculated for the selected dates."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!from || !to}
              onClick={() => {
                setPeriod({ key: "custom", from, to });
                setCustomOpen(false);
              }}
            >
              Apply range
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field">
            From
            <input type="date" value={from} min={isoDate(DATA_START)} max={isoDate(TODAY)} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            To
            <input type="date" value={to} min={isoDate(DATA_START)} max={isoDate(TODAY)} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          Records are available from {formatFullDate(DATA_START)} (demonstration data).
        </p>
      </Modal>
    </>
  );
}
