/**
 * Theme-coloured page banner, built to the dashboard banner's proportions so
 * no page banner is taller than the dashboard's:
 *
 *  • One row: eyebrow + title on the left; a compact reporting-period dropdown
 *    and the page's main button on the right (never wraps on desktop).
 *  • The page's own sidebar icon at the right edge, on a floating glass tile
 *    with slow orbiting rings (decorative; stills for reduced motion).
 *  • Optional live ticker strip along the bottom with the page's key figures —
 *    the same strip as the dashboard (LIVE / PAUSED, pauses on hover).
 */
import { useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, type LucideIcon } from "lucide-react";
import { useApp } from "@/app/AppState";
import { COMPANY_NAV } from "@/shell/navigation";
import { isoDate } from "@/data/demo/generator";
import type { PeriodSelection } from "@/data/types";
import { Reveal } from "@/shared/motion";
import { formatFullDate } from "@/shared/format";
import { Button, SelectMenu } from "@/shared/ui/controls";
import { Modal } from "@/shared/ui/Modal";
import { DATA_START, PERIOD_OPTIONS, TODAY, periodLabel, resolveRange } from "@/services/analytics";
import { HeroTicker, STRIP_COLORS, StripItem, rangeText } from "@/features/dashboard/WelcomeBanner";
import { useHeroStats, type HeroPage } from "./heroStats";

export interface HeroStat {
  label: string;
  value: ReactNode;
  title?: string;
}

export function PageHero({
  eyebrow,
  title,
  actions,
  period = true,
  icon,
  strip,
  stats,
  scope,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  period?: boolean;
  icon?: LucideIcon;
  /** Key figures shown in the live strip at the bottom of the banner. */
  strip?: HeroStat[];
  /** Or: show this page's standard key figures (see heroStats.ts). */
  stats?: HeroPage;
  /** Branch ids the figures cover (defaults to the dashboard context). */
  scope?: string[];
}) {
  const { route, context } = useApp();
  const pageStats = useHeroStats(stats ?? "settings", scope ?? (context === "all" ? null : [context]));
  if (stats && !strip) strip = pageStats;
  const Icon = icon ?? COMPANY_NAV.find((n) => route.path === n.path || route.path.startsWith(`${n.path}/`))?.icon;
  const hasActions = period || !!actions;
  return (
    <Reveal as="section" className={`ph-hero ${hasActions ? "has-actions" : ""} ${Icon ? "has-art" : ""} ${strip?.length ? "has-strip" : ""}`} aria-label={title}>
      <div className="ph-main">
        <div className="ph-copy">
          <span className="ph-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
        </div>
        {hasActions && (
          <div className="ph-actions">
            {period && <PeriodSelect />}
            {actions}
          </div>
        )}
        {Icon && (
          <div className="ph-art" aria-hidden="true">
            <span className="ph-art-stage">
              <span className="ph-art-glow" />
              <span className="ph-art-ring is-outer">
                <i />
              </span>
              <span className="ph-art-ring is-inner">
                <i />
              </span>
              <span className="ph-art-tile">
                <Icon size={32} strokeWidth={1.7} />
              </span>
            </span>
          </div>
        )}
      </div>
      {!!strip?.length && (
        <HeroTicker label={`${title} — key figures`}>
          {strip.map((s, i) => (
            <StripItem key={s.label} color={STRIP_COLORS[i % STRIP_COLORS.length]} label={s.label} value={s.value} title={s.title} />
          ))}
        </HeroTicker>
      )}
    </Reveal>
  );
}

/** Compact reporting-period dropdown (same choices as the dashboard), with a custom range. */
function PeriodSelect() {
  const { period, setPeriod } = useApp();
  const [customOpen, setCustomOpen] = useState(false);
  const range = resolveRange(period);
  const [from, setFrom] = useState(isoDate(range.from));
  const [to, setTo] = useState(isoDate(range.to));

  return (
    <>
      <SelectMenu
        value={period.key}
        ariaLabel={`Reporting period: ${periodLabel(period)}`}
        className="ph-period"
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
        <CalendarDays size={16} />
        <span className="ph-period-text">
          <b>{periodLabel(period)}</b>
          <small>{range.days === 1 ? range.from.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : rangeText(range)}</small>
        </span>
        <ChevronDown size={17} />
      </SelectMenu>
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
