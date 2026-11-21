import type { Transition, Variants } from "framer-motion";

export const premiumEase = [0.22, 1, 0.36, 1] as const;

export const revealTransition: Transition = {
  duration: 0.6,
  ease: premiumEase,
};

export const pageVariants: Variants = {
  hidden: (reduced: boolean) => ({
    opacity: 0,
    ...(reduced ? {} : { filter: "blur(10px)", y: 8 }),
  }),
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    transition: { duration: 0.46, ease: premiumEase, delay: 0.06 },
  },
  exit: (reduced: boolean) => ({
    opacity: 0,
    ...(reduced ? {} : { filter: "blur(10px)" }),
    transition: { duration: reduced ? 0.12 : 0.25, ease: "easeOut" },
  }),
};

export const sidebarVariants: Variants = {
  hidden: (reduced: boolean) => ({
    opacity: 0,
    ...(reduced ? {} : { x: -40 }),
  }),
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.12,
      staggerChildren: 0.08,
    },
  },
};

export const wakeContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.4,
      staggerChildren: 0.08,
    },
  },
};

export const cardVariants: Variants = {
  hidden: (reduced: boolean) => ({
    opacity: 0,
    ...(reduced ? {} : { filter: "blur(12px)", y: 12, scale: 0.98 }),
  }),
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    scale: 1,
    transition: revealTransition,
  },
};

export const contentContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.15,
      staggerChildren: 0.06,
    },
  },
};

export const contentItem: Variants = {
  hidden: { opacity: 0, y: 5 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: premiumEase },
  },
};

export const barContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.2,
      staggerChildren: 0.04,
    },
  },
};

export const barVariants: Variants = {
  hidden: (reduced: boolean) => ({
    opacity: 0,
    ...(reduced ? {} : { scaleY: 0 }),
  }),
  visible: {
    opacity: 1,
    scaleY: 1,
    transition: { duration: 0.55, ease: premiumEase },
  },
};

export const popContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.25,
      staggerChildren: 0.05,
    },
  },
};

export const popItem: Variants = {
  hidden: (reduced: boolean) => ({
    opacity: 0,
    ...(reduced ? {} : { scale: 0.8 }),
  }),
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.32, ease: premiumEase },
  },
};

export const interactiveCard = {
  y: -5,
  transition: { duration: 0.2, ease: premiumEase },
};

export const tapButton = {
  scale: 0.97,
};
