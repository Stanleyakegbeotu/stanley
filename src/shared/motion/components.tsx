import { useEffect, useRef, type ReactNode } from "react";
import { animate, motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { EASE, useMotionPreset } from "./motion";

type Tag = "div" | "section" | "article" | "header" | "li" | "ul" | "aside";

/**
 * Wraps a routed page. Keyed by route path inside AnimatePresence
 * (mode="wait"), so every visit replays the entrance and the previous page
 * blurs out first.
 */
export function AnimatedPage({ children, className }: { children: ReactNode; className?: string }) {
  const m = useMotionPreset();
  return (
    <motion.div className={className} variants={m.pageContainer} initial="hidden" animate="visible" exit="exit">
      {children}
    </motion.div>
  );
}

type RevealProps = Omit<HTMLMotionProps<"div">, "variants"> & {
  as?: Tag;
  /** item: single reveal · group: reveal then stagger children · stagger: children only */
  mode?: "item" | "group" | "stagger";
  hover?: boolean;
};

/** A unit of the page's wake-up sequence. Inherits timing from the nearest parent. */
export function Reveal({ as = "div", mode = "item", hover = false, children, ...rest }: RevealProps) {
  const m = useMotionPreset();
  const Comp = motion[as] as typeof motion.div;
  const variants = mode === "group" ? m.revealGroup : mode === "stagger" ? m.staggerGroup : m.revealItem;
  return (
    <Comp variants={variants} whileHover={hover ? m.cardHover : undefined} {...rest}>
      {children}
    </Comp>
  );
}

/**
 * Animated number. Formatting (currency symbol, separators, decimals,
 * suffixes) is delegated to `format`, so the animation never alters how
 * values are presented — only the interpolation is visual.
 */
export function CountUp({
  value,
  format,
  duration = 1.1,
  className,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef(0);
  const formatRef = useRef(format);
  formatRef.current = format;
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      current.current = value;
      el.textContent = formatRef.current(value);
      return;
    }
    const controls = animate(current.current, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => {
        current.current = v;
        el.textContent = formatRef.current(v);
      },
    });
    return () => controls.stop();
  }, [value, reduced, duration]);

  return (
    <span className={className}>
      <span className="sr-only">{format(value)}</span>
      <span ref={ref} aria-hidden="true" className="num">
        {format(reduced ? value : current.current)}
      </span>
    </span>
  );
}
