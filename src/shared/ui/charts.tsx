/**
 * Lightweight SVG charts (no chart dependency).
 * Animations are purely visual: lines draw left→right, areas fill after the
 * line, bars grow from the baseline. Data is never altered for animation.
 */
import { useId, useMemo, useRef, useState, type MouseEvent } from "react";
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

export function HBarList({
  items,
}: {
  items: { label: string; value: number; display: string; color?: string; hint?: string }[];
}) {
  const reduced = useReducedMotion();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="hbar-list">
      {items.map((it, i) => (
        <div className="hbar-row" key={`${it.label}-${i}`}>
          <span title={it.hint}>{it.label}</span>
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
      ))}
    </div>
  );
}

export function Donut({
  segments,
  centerLabel,
  centerValue,
  format,
  size = 156,
}: {
  segments: { label: string; value: number; color: string }[];
  centerLabel: string;
  centerValue: string;
  format: (n: number) => string;
  size?: number;
}) {
  const reduced = useReducedMotion();
  const total = segments.reduce((s, x) => s + x.value, 0);
  const stroke = 18;
  const r = (size - stroke) / 2;
  let acc = 0;
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel} breakdown`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "var(--canvas-2)" }} strokeWidth={stroke} />
          {segments.map((s, i) => {
            const frac = total > 0 ? s.value / total : 0;
            const start = acc;
            acc += frac;
            return (
              <motion.circle
                key={`${s.label}-${Math.round(s.value)}`}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                style={{ stroke: s.color }}
                strokeWidth={stroke}
                transform={`rotate(${start * 360 - 90} ${size / 2} ${size / 2})`}
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
          <div key={s.label}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b className="num">{format(s.value)}</b>
            <em>{total > 0 ? `${((s.value / total) * 100).toFixed(0)}%` : "—"}</em>
          </div>
        ))}
      </div>
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
