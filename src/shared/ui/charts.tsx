/**
 * Lightweight SVG charts (no chart dependency).
 * Animations are purely visual: lines draw left→right, areas fill after the
 * line, bars grow from the baseline. Data is never altered for animation.
 */
import { useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/shared/motion";

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * exp;
}

export interface Series {
  key: string;
  label: string;
  color: string;
  values: number[];
  area?: boolean;
  dashed?: boolean;
}

export function AreaLineChart({
  labels,
  series,
  height = 240,
  format,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  format: (n: number) => string;
}) {
  const reduced = useReducedMotion();
  const gid = useId().replace(/:/g, "");
  const plot = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const W = 1000;
  const H = height;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - (v / max) * (H - 8);
  const signature = useMemo(() => labels.join("|") + series.map((s) => s.values.reduce((a, b) => a + b, 0)).join("|"), [labels, series]);

  const linePath = (vals: number[]) =>
    vals.reduce((d, v, i) => {
      if (i === 0) return `M ${x(0)} ${y(v)}`;
      const cx = (x(i - 1) + x(i)) / 2;
      return `${d} C ${cx} ${y(vals[i - 1])}, ${cx} ${y(v)}, ${x(i)} ${y(v)}`;
    }, "");

  const tickEvery = Math.max(1, Math.ceil(n / 7));
  // Show the final label only when it isn't crowding the previous tick.
  const showLast = n > 1 && (n - 1) % tickEvery >= Math.ceil(tickEvery * 0.6);
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  const onMove = (e: MouseEvent) => {
    const r = plot.current?.getBoundingClientRect();
    if (!r || n === 0) return;
    const rel = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setHover(Math.round(rel * (n - 1)));
  };

  return (
    <div className="chart">
      <div className="chart-y" style={{ bottom: 26 }} aria-hidden="true">
        {ticks.map((t) => (
          <span key={t}>{format(max * t)}</span>
        ))}
      </div>
      <div className="chart-plot" ref={plot} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }} role="img" aria-label={series.map((s) => s.label).join(", ") + " trend"}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" style={{ stopColor: s.color, stopOpacity: 0.22 }} />
                <stop offset="100%" style={{ stopColor: s.color, stopOpacity: 0 }} />
              </linearGradient>
            ))}
          </defs>
          <g className="chart-grid">
            {ticks.map((t) => (
              <line key={t} x1="0" x2={W} y1={y(max * t)} y2={y(max * t)} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          {series.map((s, si) =>
            s.area ? (
              <motion.path
                key={`${s.key}-area-${signature}`}
                d={`${linePath(s.values)} L ${x(n - 1)} ${H} L ${x(0)} ${H} Z`}
                fill={`url(#${gid}-${s.key})`}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: reduced ? 0 : 0.75 + si * 0.1 }}
              />
            ) : null,
          )}
          {series.map((s, si) => (
            <motion.path
              key={`${s.key}-${signature}`}
              d={linePath(s.values)}
              fill="none"
              style={{ stroke: s.color }}
              strokeWidth={2.5}
              strokeDasharray={s.dashed ? "6 6" : undefined}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={reduced || s.dashed ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, delay: si * 0.12, ease: EASE }}
            />
          ))}
          {hover !== null && <line className="chart-hover-line" x1={x(hover)} x2={x(hover)} y1={0} y2={H} vectorEffect="non-scaling-stroke" />}
        </svg>
        {hover !== null && (
          <>
            {series.map((s) => (
              <span
                key={s.key}
                style={{
                  position: "absolute",
                  left: `${(x(hover) / W) * 100}%`,
                  top: `${(y(s.values[hover] ?? 0) / H) * 100}%`,
                  width: 10,
                  height: 10,
                  marginLeft: -5,
                  marginTop: -5,
                  borderRadius: "50%",
                  background: "var(--surface)",
                  border: `2.5px solid ${s.color}`,
                  pointerEvents: "none",
                }}
              />
            ))}
            <div className="chart-tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}>
              <b>{labels[hover]}</b>
              {series.map((s) => (
                <div key={s.key}>
                  <span style={{ color: s.color }}>{s.label}</span>
                  <strong className="num">{format(s.values[hover] ?? 0)}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="chart-x" style={{ position: "relative", height: 16 }} aria-hidden="true">
        {labels.map((l, i) =>
          i % tickEvery === 0 || (i === n - 1 && showLast) ? (
            <span key={i} style={{ position: "absolute", left: `${(x(i) / W) * 100}%`, transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
              {l}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

export function VBarChart({
  values,
  labels,
  color = "var(--brand-500)",
  format,
  height = 180,
}: {
  values: number[];
  labels: string[];
  color?: string;
  format: (n: number) => string;
  height?: number;
}) {
  const reduced = useReducedMotion();
  const max = Math.max(1, ...values);
  const sig = values.join(",");
  return (
    <div className="vbars" style={{ height }} role="img" aria-label="Bar chart">
      {values.map((v, i) => (
        <div className="vbar" key={i} title={`${labels[i]}: ${format(v)}`}>
          <motion.div
            key={`${sig}-${i}`}
            className="vbar-fill"
            style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: color, opacity: 0.35 + 0.65 * (v / max) }}
            initial={reduced ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.6, delay: reduced ? 0 : 0.15 + i * 0.04, ease: EASE }}
          />
          <small>{labels[i]}</small>
        </div>
      ))}
    </div>
  );
}

/* ─────────────── Hover tooltip (shared by every chart) ─────────────── */

export interface TipRow {
  label: string;
  value: string;
  color?: string;
}

export interface Tip {
  title: string;
  rows: TipRow[];
  /** One plain sentence saying what the figure means. */
  note?: string;
}

/**
 * Mouse-following tooltip in the same style as the line chart's. It sits beside
 * the pointer (right, or left near the screen edge) so it never hides the part
 * of the chart being read, and is portalled to <body> so no card can clip it.
 * Attach `ref` to the chart wrapper, call `show(e, tip, key)` on hover, `hide`
 * on leave, and render `layer` anywhere inside the chart.
 */
export function useChartTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ x: number; y: number; left: boolean; tip: Tip; key: string } | null>(null);
  const show = (e: MouseEvent, tip: Tip, key = tip.title) => {
    const left = e.clientX + 18 + 290 > window.innerWidth;
    const y = Math.min(Math.max(e.clientY, 110), window.innerHeight - 110);
    setState({ x: e.clientX, y, left, tip, key });
  };
  const hide = () => setState(null);
  const layer = state
    ? createPortal(
        <div className={`chart-tooltip is-follow ${state.left ? "is-left" : ""}`} style={{ left: state.x, top: state.y }} role="tooltip">
          <b>{state.tip.title}</b>
          {state.tip.rows.map((row) => (
            <div key={row.label}>
              <span style={row.color ? { color: row.color } : undefined}>{row.label}</span>
              <strong className="num">{row.value}</strong>
            </div>
          ))}
          {state.tip.note && <p>{state.tip.note}</p>}
        </div>,
        document.body,
      )
    : null;
  return { ref, show, hide, layer, active: state?.key ?? null };
}

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

export interface HBarItem {
  label: string;
  value: number;
  display: string;
  color?: string;
  /** Shown as the tooltip's explanation line. */
  hint?: string;
  /** Exact value for the tooltip (defaults to `display`). */
  tipValue?: string;
  /** Extra tooltip rows (replace the automatic "share of total" row). */
  tip?: TipRow[];
}

export function HBarList({ items, valueLabel = "Value", shareLabel = "Share of total" }: { items: HBarItem[]; valueLabel?: string; shareLabel?: string }) {
  const reduced = useReducedMotion();
  const tip = useChartTip();
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div className="hbar-list chart-hoverable" ref={tip.ref} onMouseLeave={tip.hide}>
      {items.map((it, i) => {
        const key = `${it.label}-${i}`;
        const rows: TipRow[] = [{ label: valueLabel, value: it.tipValue ?? it.display, color: it.color ?? "var(--brand-500)" }, ...(it.tip ?? [{ label: shareLabel, value: pct(it.value, total) }]), { label: "Rank", value: `#${i + 1} of ${items.length}` }];
        return (
          <div className={`hbar-row ${tip.active === key ? "is-hover" : ""}`} key={key} onMouseMove={(e) => tip.show(e, { title: it.label, rows, note: it.hint }, key)}>
            <span>{it.label}</span>
            <strong className="num">{it.display}</strong>
            <div className="hbar-track">
              <motion.div
                key={`${it.label}-${i}-${it.value}`}
                className="hbar-fill"
                style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? "var(--brand-500)" }}
                initial={reduced ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.7, delay: reduced ? 0 : 0.1 + i * 0.05, ease: EASE }}
              />
            </div>
          </div>
        );
      })}
      {tip.layer}
    </div>
  );
}

export interface Segment {
  label: string;
  value: number;
  color: string;
  /** Tooltip explanation line. */
  hint?: string;
  /** Extra tooltip rows after amount and share. */
  rows?: TipRow[];
}

/** Stacked horizontal bar with a hoverable legend (e.g. outstanding-balance ageing). */
export function SegmentBar({ segments, format, tipFormat, totalLabel, ariaLabel }: { segments: Segment[]; format: (n: number) => string; /** Exact figures in the tooltip (defaults to `format`). */ tipFormat?: (n: number) => string; totalLabel: string; ariaLabel: string }) {
  const tip = useChartTip();
  const total = segments.reduce((s, x) => s + x.value, 0);
  const tipOf = (s: Segment): Tip => ({ title: s.label, rows: [{ label: "Amount", value: (tipFormat ?? format)(s.value), color: s.color }, { label: `Share of ${totalLabel}`, value: pct(s.value, total) }, ...(s.rows ?? [])], note: s.hint });
  return (
    <div className="chart-hoverable" ref={tip.ref} onMouseLeave={tip.hide}>
      <div className="aging" role="img" aria-label={ariaLabel}>
        {segments.map((s) =>
          s.value > 0 ? <div key={s.label} className={tip.active && tip.active !== s.label ? "is-dim" : ""} style={{ flex: total ? s.value / total : 0, background: s.color }} onMouseMove={(e) => tip.show(e, tipOf(s), s.label)} /> : null,
        )}
      </div>
      <div className="aging-legend">
        {segments.map((s) => (
          <div key={s.label} className={tip.active === s.label ? "is-hover" : ""} onMouseMove={(e) => tip.show(e, tipOf(s), s.label)}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{format(s.value)}</b>
          </div>
        ))}
      </div>
      {tip.layer}
    </div>
  );
}

export function Donut({
  segments,
  centerLabel,
  centerValue,
  format,
  tipFormat,
  size = 156,
}: {
  segments: Segment[];
  centerLabel: string;
  centerValue: string;
  format: (n: number) => string;
  /** Exact figures in the tooltip (defaults to `format`). */
  tipFormat?: (n: number) => string;
  size?: number;
}) {
  const reduced = useReducedMotion();
  const tip = useChartTip();
  const total = segments.reduce((s, x) => s + x.value, 0);
  const stroke = 18;
  const r = (size - stroke) / 2;
  const starts: number[] = [];
  segments.reduce((acc, s) => {
    starts.push(acc);
    return acc + (total > 0 ? s.value / total : 0);
  }, 0);
  const tipOf = (s: Segment): Tip => ({
    title: s.label,
    rows: [{ label: "Amount", value: (tipFormat ?? format)(s.value), color: s.color }, { label: `Share of ${centerLabel.toLowerCase()}`, value: pct(s.value, total) }, ...(s.rows ?? [])],
    note: s.hint,
  });

  // Which segment is under the pointer: angle around the ring (clockwise from 12 o'clock).
  const onRing = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - box.left - size / 2;
    const dy = e.clientY - box.top - size / 2;
    const dist = Math.hypot(dx, dy);
    if (dist < r - stroke / 2 - 6 || dist > r + stroke / 2 + 6 || total <= 0) return tip.hide();
    const frac = ((Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
    let idx = segments.length - 1;
    for (let k = 0; k < segments.length; k++) if (frac >= starts[k] && frac < starts[k] + segments[k].value / total) idx = k;
    tip.show(e, tipOf(segments[idx]), segments[idx].label);
  };

  return (
    <div className="donut-wrap chart-hoverable" ref={tip.ref} onMouseLeave={tip.hide}>
      <div className="donut" style={{ width: size, height: size }} onMouseMove={onRing}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel} breakdown`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "var(--canvas-2)" }} strokeWidth={stroke} />
          {segments.map((s, i) => {
            const frac = total > 0 ? s.value / total : 0;
            const hot = tip.active === s.label;
            return (
              <motion.circle
                key={`${s.label}-${Math.round(s.value)}`}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                style={{ stroke: s.color, opacity: tip.active && !hot ? 0.3 : 1, transition: "opacity 0.15s" }}
                strokeWidth={hot ? stroke + 4 : stroke}
                transform={`rotate(${starts[i] * 360 - 90} ${size / 2} ${size / 2})`}
                initial={reduced ? false : { pathLength: 0 }}
                animate={{ pathLength: Math.max(0, frac - 0.004) }}
                transition={{ duration: 0.8, delay: reduced ? 0 : 0.15 + i * 0.12, ease: EASE }}
              />
            );
          })}
        </svg>
        <div className="donut-center">
          <strong className="num">{centerValue}</strong>
          <small>{centerLabel}</small>
        </div>
      </div>
      <div className="donut-legend">
        {segments.map((s) => (
          <div key={s.label} className={tip.active === s.label ? "is-hover" : ""} onMouseMove={(e) => tip.show(e, tipOf(s), s.label)}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b className="num">{format(s.value)}</b>
            <em>{total > 0 ? `${((s.value / total) * 100).toFixed(0)}%` : "—"}</em>
          </div>
        ))}
      </div>
      {tip.layer}
    </div>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const reduced = useReducedMotion();
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        key={Math.round(value)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
        initial={reduced ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, delay: reduced ? 0 : 0.2, ease: EASE }}
      />
    </div>
  );
}

export const CHART_COLORS = ["var(--brand-600)", "var(--kpi-blue)", "var(--kpi-orange)", "var(--kpi-purple)", "var(--kpi-teal)", "var(--kpi-red)"];
