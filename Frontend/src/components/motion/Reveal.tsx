"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { motionDuration, motionEase, sectionReveal, viewportOnce } from "@/lib/motion/tokens";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  delayMs?: number;
};

export function Reveal({ children, className, delay = 0, delayMs }: RevealProps) {
  const resolvedDelay = delayMs !== undefined ? delayMs / 1000 : delay;

  return (
    <m.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      variants={sectionReveal}
      transition={{ duration: motionDuration.section, ease: motionEase, delay: resolvedDelay }}
    >
      {children}
    </m.div>
  );
}
