"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { motionDuration, motionEase, slideUp } from "@/lib/motion/tokens";

type SlideUpProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

export function SlideUp({ children, className, delay = 0 }: SlideUpProps) {
  return (
    <m.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={slideUp}
      transition={{ duration: motionDuration.base, ease: motionEase, delay }}
    >
      {children}
    </m.div>
  );
}
