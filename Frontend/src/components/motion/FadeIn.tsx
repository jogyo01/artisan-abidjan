"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { fadeIn, motionDuration, motionEase } from "@/lib/motion/tokens";

type FadeInProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

export function FadeIn({ children, className, delay = 0 }: FadeInProps) {
  return (
    <m.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={fadeIn}
      transition={{ duration: motionDuration.base, ease: motionEase, delay }}
    >
      {children}
    </m.div>
  );
}
