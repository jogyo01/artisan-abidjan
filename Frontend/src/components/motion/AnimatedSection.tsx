"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { motionDuration, motionEase, slideUp } from "@/lib/motion/tokens";

type AnimatedSectionProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  id?: string;
};

export function AnimatedSection({ children, className, delay = 0, id }: AnimatedSectionProps) {
  return (
    <m.section
      id={id}
      className={className}
      initial="hidden"
      animate="visible"
      variants={slideUp}
      transition={{ duration: motionDuration.base, ease: motionEase, delay }}
    >
      {children}
    </m.section>
  );
}
