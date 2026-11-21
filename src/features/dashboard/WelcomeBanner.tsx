import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useApp } from "@/app/AppState";
import { isoDate } from "@/data/demo/generator";
import type { DateRange, PeriodSelection } from "@/data/types";
import { CountUp, Reveal, useMotionPreset } from "@/shared/motion";
import { formatCount, formatFullDate, formatMoney, formatShortDate, moneyEntries } from "@/shared/format";
import { Button, SelectMenu } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { DATA_START, PERIOD_OPTIONS, TODAY, periodLabel, type Summary } from "@/services/analytics";

export function rangeText(range: DateRange): string {
  if (range.days === 1) return formatFullDate(range.from);
  const sameYear = range.from.getFullYear() === range.to.getFullYear();
  return `${formatShortDate(range.from)}${sameYear ? "" : ` ${range.from.getFullYear()}`} – ${formatShortDate(range.to)} ${range.to.getFullYear()}`;
}

function HeroDecor() {
  return (
    <svg viewBox="0 0 760 760" aria-hidden="true">
      <circle cx="380" cy="380" r="370" fill="rgba(255,255,255,0.035)" />
      {[150, 210, 270, 330].map((r) => (
        <circle key={r} cx="380" cy="380" r={r} fill="none" stroke="rgba(255,255,255,0.075)" strokeWidth="1.2" />
      ))}
      <circle cx="380" cy="380" r="110" fill="rgba(255,255,255,0.04)" />
    </svg>
  );
}

export function WelcomeBanner({
  eyebrow,
  title,
  subtitle,
  summary,
  range,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  summary: Summary;
  range: DateRange;
}) {
  const m = useMotionPreset();
  return (
    <Reveal as="section" mode="group" className="hero" aria-label="Welcome and reporting period">
      <div className="hero-decor">
        <HeroDecor />
      </div>
      <div className="hero-main">
        <motion.div className="hero-copy" variants={m.revealItem}>
          <div className="hero-eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </motion.div>
        <motion.div className="hero-period" variants={m.revealItem}>
          <PeriodControl range={range} />
        </motion.div>
      </div>
      <motion.div variants={m.revealItem}>
        <LiveStrip summary={summary} />
      </motion.div>
    </Reveal>
  );
}

function PeriodControl({ range }: { range: DateRange }) {
  const { period, setPeriod } = useApp();
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState(isoDate(range.from));
  const [to, setTo] = useState(isoDate(range.to));

  return (
    <>
      <span className="period-label">Reporting period</span>
      <SelectMenu
        value={period.key}
        ariaLabel={`Reporting period: ${periodLabel(period)}`}
        className="period-btn"
        placement="bottom-end"
        options={PERIOD_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
        onChange={(key: PeriodSelection["key"]) => {
          if (key === "custom") {
            setFrom(isoDate(range.from));
            setTo(isoDate(range.to));
            setCustomOpen(true);
          } else setPeriod({ key });
        }}
      >
        <span>{periodLabel(period)}</span>
        <ChevronDown size={19} />
      </SelectMenu>
      <span className="period-active" aria-live="polite">
        <span className="live-dot" />
        {period.key === "today" ? `Today · ${formatShortDate(range.from)}` : rangeText(range)}
      </span>

      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Custom date range"
        description="Figures are recalculated for the selected dates. Comparisons use the equally long period immediately before."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setPeriod({ key: "custom", from, to });
                setCustomOpen(false);
              }}
              disabled={!from || !to}
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
        <p className="hint">Records are available from {formatFullDate(DATA_START)} (demonstration data).</p>
      </Modal>
    </>
  );
}

function MoneyValues({ money }: { money: Summary["revenue"] }) {
  const entries = moneyEntries(money);
  if (!entries.length) return <b>—</b>;
  return (
    <span className="strip-multi">
      {entries.map(([c, v]) => (
        <b key={c}>
          <CountUp value={v} format={(n) => formatMoney(n, c, true)} />
        </b>
      ))}
    </span>
  );
}

function LiveStrip({ summary }: { summary: Summary }) {
  const count = (n: number) => formatCount(n);
  return (
    <div className="hero-strip" role="list" aria-label="Company-wide live indicators">
      <span className="live-pill" role="listitem">
        <span className="live-dot pulse" />
        LIVE
      </span>
      <span className="strip-item" role="listitem">
        <i style={{ background: "#8cc8ff" }} />
        Generated <MoneyValues money={summary.revenue} />
      </span>
      <span className="strip-item" role="listitem">
        <i style={{ background: "#ff9a8f" }} />
        Outstanding balances <MoneyValues money={summary.outstanding} />
      </span>
      <span className="strip-item" role="listitem">
        <i style={{ background: "#6fe3c6" }} />
        Payment transactions{" "}
        <b>
          <CountUp value={summary.transactions} format={count} />
        </b>
      </span>
      <span className="strip-item" role="listitem" title="Counted per day; production counts distinct patient IDs across the period">
        <i style={{ background: "#9db8ff" }} />
        Unique patients{" "}
        <b>
          <CountUp value={summary.patients} format={count} />
        </b>
      </span>
      <span className="strip-item" role="listitem">
        <i style={{ background: "#c7a8ff" }} />
        New patients{" "}
        <b>
          <CountUp value={summary.newPatients} format={count} />
        </b>
      </span>
      <span className="strip-item" role="listitem">
        <i style={{ background: "#6fe3c6" }} />
        Referrals{" "}
        <b>
          <CountUp value={summary.referrals} format={count} />
        </b>
      </span>
    </div>
  );
}
