"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { cardReveal, motionDuration, motionEase } from "@/lib/motion/tokens";

type AnimatedCardProps = {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
};

export function AnimatedCard({ children, className = "", interactive = true }: AnimatedCardProps) {
  return (
    <m.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={cardReveal}
      transition={{ duration: motionDuration.base, ease: motionEase }}
      whileHover={interactive ? { y: -4, scale: 1.01 } : undefined}
      whileTap={interactive ? { scale: 0.995 } : undefined}
    >
      {children}
    </m.div>
  );
}
