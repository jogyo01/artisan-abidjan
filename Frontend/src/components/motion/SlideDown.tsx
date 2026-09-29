"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { motionDuration, motionEase, slideDown } from "@/lib/motion/tokens";

type SlideDownProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

export function SlideDown({ children, className, delay = 0 }: SlideDownProps) {
  return (
    <m.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={slideDown}
      transition={{ duration: motionDuration.base, ease: motionEase, delay }}
    >
      {children}
    </m.div>
  );
}
