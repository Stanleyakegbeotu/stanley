/**
 * The STANLEY Orb (owner, 2026-11-23) — the living mark of STANLEY AI.
 *
 * Built after studying how a voice-assistant orb moves, then made our own:
 *  • a glass sphere — deep, nearly black inside, tinted with the theme; a thin
 *    glowing rim whose colour sweeps slowly around it; a soft inner shadow;
 *  • soft colour clouds drifting behind, for depth;
 *  • three silk ribbons — broad three-lobed sheets whose sides breathe between
 *    bulging out and curving in, tips reaching for the rim; each is a filled
 *    sheet (brightest at the core) plus several faint strands drawn a moment
 *    apart (the silk); all added together as light, so crossings glow;
 *  • a bright core where the ribbons meet, drifting gently off-centre;
 *  • everything keeps turning and changing shape and never quite repeats.
 *
 * Colours come from the selected theme (owner rule: one theme colour) — shades
 * of its hue, never a rainbow — and follow theme changes live.
 *
 * Moods: idle (slow breathing), awake (hover — brighter, faster, reaching
 * out), thinking (STANLEY is working on an answer). Moods blend smoothly.
 * Respects "reduce motion" (one still frame) and pauses when off-screen or
 * when the window is hidden. Drawn on a small canvas — light on the computer.
 */
import { useEffect, useRef } from "react";

export type OrbMood = "idle" | "awake" | "thinking";

type HSL = [number, number, number];
const hsla = ([h, s, l]: HSL, a: number) => `hsla(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;

interface Palette {
  /** One colour per ribbon — shades of the theme's hue. */
  ribbons: HSL[];
  core: HSL;
  deep: string;
  deeper: string;
  rimA: HSL;
  rimB: HSL;
}

/* ─────────────── colour from the theme ─────────────── */

function hexToHsl(hex: string): HSL {
  const m = hex.trim().replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  if ([r, g, b].some((v) => Number.isNaN(v))) return [174, 45, 40];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const [h, s0] = hexToHsl(css.getPropertyValue("--brand-600") || "#2a746e");
  const s = Math.max(50, Math.min(90, s0 + 30));
  const hue = (d: number) => (h + d + 360) % 360;
  return {
    ribbons: [
      [hue(-32), s, 60],
      [hue(4), s, 64],
      [hue(34), s - 10, 70],
    ],
    core: [hue(0), 80, 95],
    deep: `hsl(${hue(0)}, 40%, 13%)`,
    deeper: `hsl(${hue(-8)}, 45%, 5%)`,
    rimA: [hue(40), s, 70],
    rimB: [hue(-36), s, 58],
  };
}

const MOOD: Record<OrbMood, { energy: number; speed: number; glow: number }> = {
  idle: { energy: 0.62, speed: 0.4, glow: 0.78 },
  awake: { energy: 1, speed: 0.95, glow: 1 },
  thinking: { energy: 1.1, speed: 1.8, glow: 1.15 },
};

/* ─────────────── one frame ─────────────── */

interface Live {
  t: number;
  energy: number;
  speed: number;
  glow: number;
}

const TAU = Math.PI * 2;

function draw(ctx: CanvasRenderingContext2D, px: number, pal: Palette, s: Live) {
  const W = px;
  const c = W / 2;
  const R = W * 0.44; // sphere radius (room left for the rim glow)
  const t = s.t;
  const breathe = 1 + 0.022 * Math.sin(t * 1.15) * (1.25 - s.energy * 0.5);
  ctx.clearRect(0, 0, W, W);
  ctx.save();
  ctx.translate(c, c);
  ctx.scale(breathe, breathe);

  // Sphere body — deep, nearly black, tinted with the theme.
  const body = ctx.createRadialGradient(0, 0, R * 0.05, 0, 0, R);
  body.addColorStop(0, pal.deep);
  body.addColorStop(1, pal.deeper);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fillStyle = body;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.985, 0, TAU);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";

  // Soft colour clouds drifting behind the ribbons (depth).
  for (let i = 0; i < 3; i++) {
    const a = t * (0.22 + i * 0.07) * (i % 2 ? -1 : 1) + i * 2.2;
    const x = Math.cos(a) * R * 0.42;
    const y = Math.sin(a * 1.3) * R * 0.38;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.75);
    g.addColorStop(0, hsla(pal.ribbons[i], 0.2 * s.glow));
    g.addColorStop(1, hsla(pal.ribbons[i], 0));
    ctx.fillStyle = g;
    ctx.fillRect(-R, -R, 2 * R, 2 * R);
  }

  // Where the ribbons meet — drifts a little, never sits still.
  const cx = R * 0.14 * Math.sin(t * 0.71) + R * 0.05 * Math.sin(t * 1.9);
  const cy = R * 0.12 * Math.cos(t * 0.83) + R * 0.05 * Math.cos(t * 1.37);
  const strands = W > 120 ? 14 : 7;

  for (let i = 0; i < 3; i++) {
    const dir = i % 2 ? -1 : 1;
    const baseRot = dir * t * (0.3 + i * 0.08) + i * 2.1;
    const col = pal.ribbons[i];
    for (let j = 0; j < strands; j++) {
      const lag = j * 0.032; // each strand a moment behind the last → the silk sheet
      const tt = t - lag;
      const tips: [number, number][] = [];
      for (let k = 0; k < 3; k++) {
        const a = baseRot - dir * lag * 0.5 + (k * TAU) / 3 + 0.4 * Math.sin(tt * (0.85 + k * 0.21) + i * 1.7 + k);
        const reach = 0.42 + 0.5 * s.energy * (0.5 + 0.5 * Math.sin(tt * (1.05 + 0.17 * k + 0.11 * i) + k * 2.3 + i));
        const rr = R * Math.min(0.97, reach);
        tips.push([rr * Math.cos(a), rr * Math.sin(a)]);
      }
      ctx.beginPath();
      ctx.moveTo(tips[0][0], tips[0][1]);
      for (let k = 0; k < 3; k++) {
        const [ax, ay] = tips[k];
        const [bx, by] = tips[(k + 1) % 3];
        // Each side breathes between bulging out and curving in — broad petals, not spikes.
        const pull = -0.18 + 0.62 * (0.5 + 0.5 * Math.sin(tt * 0.75 + k * 2.1 + i * 1.3));
        ctx.bezierCurveTo(ax + (cx - ax) * pull, ay + (cy - ay) * pull, bx + (cx - bx) * pull, by + (cy - by) * pull, bx, by);
      }
      ctx.closePath();
      if (j === 0) {
        // The sheet: brightest where it meets the core, fading to the tips.
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, hsla(col, 0.42 * s.glow));
        g.addColorStop(0.55, hsla(col, 0.2 * s.glow));
        g.addColorStop(1, hsla(col, 0.08 * s.glow));
        ctx.fillStyle = g;
        ctx.fill();
      }
      // The silk strands.
      ctx.lineWidth = Math.max(0.5, W / 160);
      ctx.strokeStyle = hsla([col[0], col[1], Math.min(92, col[2] + 14)], (0.24 - j * (0.2 / strands)) * s.glow);
      ctx.stroke();
    }
  }

  // The bright core where they meet.
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.2 + 0.1 * s.energy));
  core.addColorStop(0, hsla(pal.core, 0.8 * s.glow));
  core.addColorStop(0.4, hsla(pal.core, 0.25 * s.glow));
  core.addColorStop(1, hsla(pal.core, 0));
  ctx.fillStyle = core;
  ctx.fillRect(-R, -R, 2 * R, 2 * R);
  ctx.restore();

  // Glass: a soft inner shadow at the edge, then a faint glint.
  const edge = ctx.createRadialGradient(0, 0, R * 0.78, 0, 0, R);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fillStyle = edge;
  ctx.fill();
  const glint = ctx.createRadialGradient(-R * 0.4, -R * 0.52, 0, -R * 0.4, -R * 0.52, R * 0.5);
  glint.addColorStop(0, "rgba(255,255,255,0.1)");
  glint.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glint;
  ctx.fill();

  // Rim — thin, glowing, its colour sweeping slowly around the sphere.
  let rim: CanvasGradient | string = hsla(pal.rimA, 0.9);
  if (typeof ctx.createConicGradient === "function") {
    const g = ctx.createConicGradient(t * 0.45, 0, 0);
    g.addColorStop(0, hsla(pal.rimA, 0.95));
    g.addColorStop(0.28, hsla(pal.rimA, 0.12));
    g.addColorStop(0.5, hsla(pal.rimB, 0.9));
    g.addColorStop(0.78, hsla(pal.rimB, 0.12));
    g.addColorStop(1, hsla(pal.rimA, 0.95));
    rim = g;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.strokeStyle = rim;
  ctx.shadowColor = hsla(pal.rimA, 0.55 * s.glow);
  ctx.shadowBlur = W / 16;
  ctx.lineWidth = Math.max(1, W / 90);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
}

/* ─────────────── component ─────────────── */

export function StanleyOrb({ size = 42, mood = "idle", still = false, className = "" }: { size?: number; mood?: OrbMood; /** Draw one frame and stop (e.g. older chat replies). */ still?: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const px = Math.round(size * dpr);
    el.width = px;
    el.height = px;
    let pal = readPalette();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const live: Live = { t: 1.7 + Math.random() * 40, ...MOOD[moodRef.current] };
    let raf = 0;
    let last = performance.now();
    let visible = true;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = MOOD[moodRef.current];
      // Moods blend smoothly rather than jump.
      live.energy += (target.energy - live.energy) * 0.06;
      live.speed += (target.speed - live.speed) * 0.05;
      live.glow += (target.glow - live.glow) * 0.06;
      live.t += dt * live.speed;
      draw(ctx, px, pal, live);
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (reduce.matches || still) {
        Object.assign(live, MOOD[moodRef.current]);
        draw(ctx, px, pal, live);
        return;
      }
      if (!visible || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    redraw.current = start;

    // Follow the theme live.
    const mo = new MutationObserver(() => {
      pal = readPalette();
      if (reduce.matches || still) start();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style", "class"] });
    // Pause when off-screen or the window is hidden.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else cancelAnimationFrame(raf);
    });
    io.observe(el);
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    document.addEventListener("visibilitychange", onVis);
    reduce.addEventListener?.("change", start);
    start();
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      reduce.removeEventListener?.("change", start);
    };
  }, [size, still]);

  // With reduced motion, a mood change redraws the still frame.
  useEffect(() => {
    if (still || window.matchMedia("(prefers-reduced-motion: reduce)").matches) redraw.current();
  }, [mood, still]);

  return <canvas ref={canvas} className={`stanley-orb ${className}`} style={{ width: size, height: size }} aria-hidden="true" />;
}
