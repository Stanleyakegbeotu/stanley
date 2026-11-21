/**
 * STANLEY global motion configuration.
 *
 * One place for every entrance, exit and micro-interaction so the whole
 * application wakes up the same way. Components never hard-code timings;
 * they read the preset from `useMotionPreset()`, which swaps to quick fades
 * (no blur, no stagger, no large movement) under prefers-reduced-motion.
 */
import { useReducedMotion, type Transition, type Variants } from "framer-motion";

export const EASE = [0.22, 1, 0.36, 1] as const;

export const revealTransition: Transition = { duration: 0.6, ease: EASE };

/** Page root: staggers its direct reveal children. */
export const pageContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
  exit: { opacity: 0, filter: "blur(10px)", transition: { duration: 0.25, ease: "easeOut" } },
};

/** The standard cinematic reveal: blur → sharp, small rise, slight scale. */
export const revealItem: Variants = {
  hidden: { opacity: 0, filter: "blur(12px)", y: 12, scale: 0.98 },
  visible: { opacity: 1, filter: "blur(0px)", y: 0, scale: 1, transition: revealTransition },
};

export const pageExit = {
  opacity: 0,
  filter: "blur(10px)",
  transition: { duration: 0.25, ease: "easeOut" },
} as const;

/** A reveal item that then staggers its own children (sections, card grids). */
export const revealGroup: Variants = {
  hidden: revealItem.hidden,
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    scale: 1,
    transition: { ...revealTransition, staggerChildren: 0.06, delayChildren: 0.06 },
  },
};

/** Invisible wrapper that only staggers children. */
export const staggerGroup: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

/** Table rows / list items: ~40 ms cascade. */
export const rowStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
};

export const rowItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

export const popoverMotion = {
  initial: { opacity: 0, y: -6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease: EASE } },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } },
};

export const modalMotion = {
  initial: { opacity: 0, y: 16, scale: 0.97, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { duration: 0.32, ease: EASE } },
  exit: { opacity: 0, y: 10, scale: 0.98, filter: "blur(4px)", transition: { duration: 0.18 } },
};

export const cardHover = { y: -4, transition: { duration: 0.22, ease: EASE } };
export const press = { scale: 0.97 };

/* ─────────────── Reduced-motion equivalents ─────────────── */
const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.18 } },
};

const reducedSet = {
  reduced: true,
  pageContainer: {
    hidden: {},
    visible: {},
    exit: { opacity: 0, transition: { duration: 0.12 } },
  } as Variants,
  revealItem: fade,
  revealGroup: fade,
  staggerGroup: { hidden: {}, visible: {} } as Variants,
  rowStagger: { hidden: {}, visible: {} } as Variants,
  rowItem: fade,
  popover: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.12 } },
    exit: { opacity: 0, transition: { duration: 0.08 } },
  },
  modal: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.15 } },
    exit: { opacity: 0, transition: { duration: 0.1 } },
  },
  cardHover: undefined,
  press: undefined,
};

const fullSet = {
  reduced: false,
  pageContainer,
  revealItem,
  revealGroup,
  staggerGroup,
  rowStagger,
  rowItem,
  popover: popoverMotion,
  modal: modalMotion,
  cardHover: cardHover as typeof cardHover | undefined,
  press: press as typeof press | undefined,
};

export type MotionPreset = typeof fullSet;

export function useMotionPreset(): MotionPreset {
  return useReducedMotion() ? (reducedSet as MotionPreset) : fullSet;
}
