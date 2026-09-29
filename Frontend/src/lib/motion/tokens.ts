export const motionEase = [0.22, 1, 0.36, 1] as const;

export const motionDuration = {
  micro: 0.18,
  fast: 0.22,
  base: 0.32,
  section: 0.55,
  hero: 0.72,
} as const;

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
} as const;

export const slideUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
} as const;

export const slideDown = {
  hidden: { opacity: 0, y: -10 },
  visible: { opacity: 1, y: 0 },
} as const;

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1 },
} as const;

export const pageEnter = {
  hidden: { opacity: 0, y: 10, scale: 0.992 },
  visible: { opacity: 1, y: 0, scale: 1 },
} as const;

export const sectionReveal = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 },
} as const;

export const heroReveal = {
  hidden: { opacity: 0, y: 18, filter: "blur(8px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
} as const;

export const cardReveal = {
  hidden: { opacity: 0, y: 12, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1 },
} as const;

export const modalEnter = {
  hidden: { opacity: 0, scale: 0.97, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0 },
} as const;

export const listStagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.04,
    },
  },
} as const;

export const heroStagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.16,
    },
  },
} as const;

export const LIST_STAGGER_CAP = 10;

export const viewportOnce = {
  once: true,
  amount: 0.16,
  margin: "0px 0px -8% 0px",
} as const;
